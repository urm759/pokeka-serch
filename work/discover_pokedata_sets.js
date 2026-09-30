const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(__dirname, "pokedata-set-discovery.json");
const PUBLIC_OUTPUT = path.join(ROOT, "data", "pokedata-set-discovery.json");
const SOURCE_URL = "https://www.pokedata.io/api/sets";
const normalizeCode = (value) => String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9+-]/g, "");
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const save = (value) => {
  const temporary = `${OUTPUT}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, OUTPUT);
  const publicSummary = { version: value.version || 1, sourceUrl: SOURCE_URL, checkedAt: value.checkedAt,
    status: value.status, stopReason: value.stopReason || null, sourceSets: value.sourceSets || 0,
    japaneseSets: value.japaneseSets || 0, eligibleSets: value.eligibleSets || 0,
    manualReviewCount: value.manualReviewCount || 0,
    reviewReasons: (value.manualReview || []).reduce((counts, row) => {
      counts[row.reason] = (counts[row.reason] || 0) + 1; return counts;
    }, {}),
    topSets: (value.eligible || []).filter((row) => !row.complete).slice(0, 10),
    note: "日本語・セットコード一意一致のみ自動候補。曖昧なセットは確認待ち。価格は国内仕入れ上限に未反映" };
  const publicTemporary = `${PUBLIC_OUTPUT}.tmp`;
  fs.writeFileSync(publicTemporary, JSON.stringify(publicSummary), "utf8");
  fs.renameSync(publicTemporary, PUBLIC_OUTPUT);
};

function discover(sourceSets, domesticCards, manifest, minSourceCount = 100) {
  if (!Array.isArray(sourceSets) || sourceSets.length < minSourceCount
    || sourceSets.some((row) => !row || typeof row !== "object")) {
    throw new Error("PokeDATAセット一覧の形式または件数が想定外。既存キューを保持して手動確認待ち");
  }
  const domestic = new Map();
  for (const card of domesticCards) {
    const code = normalizeCode(card.setCode);
    if (!code) continue;
    const group = domestic.get(code) || { count: 0, psaTrades30: 0, buybackCards: 0 };
    group.count += 1;
    group.psaTrades30 += Math.max(0, Number(card.p10tv30) || 0);
    if (Number(card.buybackShops30 || card.buybackShopCount || 0) > 0) group.buybackCards += 1;
    domestic.set(code, group);
  }
  const japanese = sourceSets.filter((row) => row.language === "JAPANESE" && row.tcg === "Pokemon" && row.live === true);
  if (japanese.length < 20) throw new Error("日本語セット件数が急減。過去の発見結果を保持して形式確認待ち");
  const byCode = new Map();
  for (const row of japanese) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(row);
  }
  const existing = new Map((manifest.sets || []).map((row) => [row.setName, row]));
  const eligible = [], manualReview = [];
  for (const row of japanese) {
    const code = normalizeCode(row.code);
    const local = domestic.get(code);
    if (!Number.isInteger(Number(row.id)) || Number(row.id) <= 0) {
      manualReview.push({ setName: row.name, setCode: code || null, reason: "新規セットIDを確認できない" });
      continue;
    }
    if (!code) {
      manualReview.push({ setName: row.name, sourceSetId: row.id, reason: "セットコード未掲載" });
      continue;
    }
    if ((byCode.get(code) || []).length !== 1) {
      manualReview.push({ setName: row.name, setCode: code, sourceSetId: row.id, reason: "日本語セットコードが複数候補" });
      continue;
    }
    if (!local) continue;
    const releaseDate = Number.isFinite(Date.parse(row.release_date)) ? new Date(row.release_date).toISOString().slice(0, 10) : null;
    const old = existing.get(row.name);
    const sourceCount = Number(old?.sourceCount) > 0 ? Number(old.sourceCount) : null;
    const completed = Number(old?.linkageCount || 0);
    const complete = sourceCount !== null && completed >= sourceCount;
    const priority = (releaseDate ? Math.max(0, 1200 - Math.floor((Date.now() - Date.parse(releaseDate)) / 86400000)) : 0)
      + Math.min(200, local.psaTrades30) + Math.min(100, local.count);
    eligible.push({ setName: row.name, setCode: code, sourceSetId: Number(row.id), releaseDate,
      domesticCards: local.count, psaTrades30: local.psaTrades30, priority,
      completed, sourceCount, complete, status: complete ? "complete" : completed > 0 ? "partial" : "waiting",
      linkageRule: "日本語・セットコード一意一致。カードは番号・仕様を再確認" });
  }
  eligible.sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""))
    || b.priority - a.priority || a.setName.localeCompare(b.setName));
  if (domestic.size > 100 && eligible.length < 10) throw new Error("一致セット件数が急減。自動巡回せず手動確認待ち");
  return { sourceSets: sourceSets.length, japaneseSets: japanese.length, eligibleSets: eligible.length,
    manualReviewCount: manualReview.length, eligible, manualReview };
}

async function fetchSets(fetcher = fetch) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetcher(SOURCE_URL, { headers: { "user-agent": "PokecaBuyingGuide/1.0 (+read-only; low-rate)" }, signal: AbortSignal.timeout(12000) });
    } catch (error) {
      if (attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error(`HTTP ${response.status}・正規アクセス確認待ち`);
      error.manual = true;
      throw error;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt)); continue; }
    }
    if (!response.ok) throw new Error(`PokeDATAセット一覧 HTTP ${response.status}`);
    try { return await response.json(); } catch {
      const error = new Error("PokeDATAセット一覧のJSON形式変更・手動確認待ち");
      error.manual = true;
      throw error;
    }
  }
  throw new Error("PokeDATAセット一覧の再試行上限");
}

async function main() {
  const previous = read(OUTPUT, {});
  try {
    const sets = await fetchSets();
    const domestic = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
    const manifest = read(path.join(ROOT, "data", "pokedata", "manifest.json"), { sets: [] });
    const result = discover(sets, domestic, manifest);
    const known = new Set((previous.eligible || []).map((row) => row.sourceSetId));
    const value = { version: 1, sourceUrl: SOURCE_URL, checkedAt: new Date().toISOString(), status: "success",
      ...result, newlyDiscovered: result.eligible.filter((row) => !known.has(row.sourceSetId)).map((row) => row.setCode),
      stopReason: null };
    save(value);
    console.log(JSON.stringify({ status: value.status, sourceSets: value.sourceSets, eligibleSets: value.eligibleSets,
      manualReview: value.manualReviewCount, newlyDiscovered: value.newlyDiscovered.length, top: value.eligible.slice(0, 3).map((row) => row.setCode) }));
  } catch (error) {
    const needsReview = error.manual || /形式|急減|確認待ち/.test(String(error.message));
    save({ ...previous, checkedAt: new Date().toISOString(), status: needsReview ? "manual-action-required" : "retry-wait",
      stopReason: String(error.message || error), lastSuccessfulAt: previous.status === "success" ? previous.checkedAt : previous.lastSuccessfulAt || null });
    console.log(JSON.stringify({ status: needsReview ? "manual-action-required" : "retry-wait", stopReason: String(error.message || error) }));
  }
}

if (require.main === module) main();
module.exports = { discover, fetchSets, normalizeCode };
