const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "pokemon-cards.json");
const POP_PATH = path.join(ROOT, "data", "psa-official-populations.json");
const ENGLISH_PATH = path.join(__dirname, "snkr_english_names.json");
const PRIORITY_ROWS_PATH = path.join(__dirname, "priority_psa_rows.json");
const SUMMARY_PATH = path.join(ROOT, "data", "psa-population-summary.json");
const HISTORY_DIR = path.join(ROOT, "data", "psa-history");
const SHARDS = 32;
const RETENTION_DAYS = Math.max(90, Number(process.env.PSA_HISTORY_DAYS || 400));

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; } }
function dayKey(date = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, ""); }
function normalizeNo(value) { const raw = String(value || "").replace(/^#/, "").trim().toUpperCase(); return raw.replace(/^0+(?=\d)/, ""); }
function shortSet(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^(?:S8A-[PG]|(?:XY|SM|S|SV|M)-P)$/.test(raw)) return raw;
  return raw.split(/[-\s]/)[0];
}
function cardIdentity(card) {
  const match = String(card.name || "").match(/\[([^\]]+)\]/);
  if (!match) return null;
  const inside = match[1].trim().toUpperCase();
  const promoSet = inside.match(/(?:^|[\s/])((?:XY|SM|S|SV|M)-P)(?:$|[\s/])/i)?.[1];
  if (promoSet) {
    const withoutSet = inside.replace(new RegExp(promoSet.replace("-", "\\-"), "i"), " ");
    const promoNo = withoutSet.match(/(?:PROMO)?\s*0*(\d+)/i)?.[1] || "";
    return { set: shortSet(promoSet), no: normalizeNo(promoNo) };
  }
  const parts = inside.split(/\s+/);
  const numberToken = parts.slice(1).find((part) => /^\d/.test(part)) || parts[1] || "";
  return { set: shortSet(parts[0]), no: normalizeNo(numberToken.split("/")[0]) };
}
function cleanName(value) {
  return String(value || "").toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/shop with affiliates/gi, " ")
    .replace(/\[[^\]]+\]|\([^)]*\)/g, " ")
    .replace(/monster ball mirror(?:\s*\/?\s*special monster ball)?/g, " reverse holo ")
    .replace(/energy mark mirror/g, " reverse holo ")
    .replace(/team rocket mark mirror/g, " team rocket reverse holo ")
    .replace(/master ball mirror/g, " master ball reverse holo ")
    .replace(/chinese (?:text )?printing error/g, " incorrect texture ")
    .replace(/\b1ed\b/g, " 1st edition ")
    .replace(/\bsar\b/g, " special art rare ").replace(/\bmur\b/g, " mega ultra rare ")
    .replace(/\bsr\b/g, " secret rare ").replace(/\bar\b/g, " art rare ")
    .replace(/\bex\b/g, " ex ").replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(value) { return new Set(cleanName(value).split(/\s+/).filter((x) => x && !["pokemon", "japanese", "card", "rare"].includes(x))); }
function similarity(a, b) {
  const aa = tokens(a), bb = tokens(b); if (!aa.size || !bb.size) return 0;
  let common = 0; for (const token of aa) if (bb.has(token)) common += 1;
  return common / Math.max(aa.size, bb.size);
}
function baseSimilarity(a, b) {
  const ignored = new Set(["old", "back", "holo", "no", "rarity", "symbol", "first", "1st", "edition", "trainer", "normal", "style"]);
  const aa = new Set([...tokens(a)].filter((x) => !ignored.has(x)));
  const bb = new Set([...tokens(b)].filter((x) => !ignored.has(x)));
  if (!aa.size || !bb.size) return 0;
  let common = 0; for (const token of aa) if (bb.has(token)) common += 1;
  return common / Math.max(aa.size, bb.size);
}
function variantOf(value) {
  const name = String(value || "").toLowerCase().replace(/&#x27;|&#39;|&apos;/g, "'");
  if (/メタモンマーク|with ditto mark/.test(name)) return "ditto";
  if (/マスターボール/.test(name)) return "master-ball";
  if (/ロケット団(?:の)?マーク.*ミラー/.test(name)) return "team-rocket-reverse";
  if (/モンスターボール|オシャボ|monster ball mirror|special monster ball/.test(name)) return "poke-ball";
  if (/エネルギーマーク|energy mark mirror/.test(name)) return "energy-mark";
  if (/中国語.*エラー|中国語.*誤植/.test(name)) return "incorrect-texture";
  if (/テクスチャ(?:抜け|なし)|加工(?:抜け|なし)/.test(name)) return "missing-texture";
  if (/master ball (mirror|reverse holo)/.test(name)) return "master-ball";
  if (/monster ball mirror|special monster ball|poke ball reverse holo/.test(name)) return "poke-ball";
  if (/team rocket mark mirror|team rocket reverse holo/.test(name)) return "team-rocket-reverse";
  if (/energy mark mirror/.test(name)) return "energy-mark";
  if (/chinese (text )?printing error|incorrect texture/.test(name)) return "incorrect-texture";
  if (/missing texture/.test(name)) return "missing-texture";
  if (/normal (style|version|specification)/.test(name)) return "base";
  if (/ミラー/.test(name)) return "reverse-holo";
  if (/\bmirror\b|\breverse holo\b/.test(name)) return "reverse-holo";
  return "base";
}
function candidateVariant(row) {
  const name = String(row?.name || "").toLowerCase();
  if (/ditto/.test(name)) return "ditto";
  if (/master ball reverse holo/.test(name)) return "master-ball";
  if (/team rocket reverse holo/.test(name)) return "team-rocket-reverse";
  if (/poke ball reverse holo/.test(name)) return "poke-ball";
  if (row?.set === "M2A" && /reverse holo/.test(name)) return "energy-mark";
  if (/^SV(?:2A|8A)$/.test(row?.set || "") && /reverse holo/.test(name)) return "poke-ball";
  if (/incorrect texture/.test(name)) return "incorrect-texture";
  if (/missing texture/.test(name)) return "missing-texture";
  if (/reverse holo|reverse foil/.test(name)) return "reverse-holo";
  return "base";
}
function suspicious(value) { return /missing texture|error|no rarity|misprint|stamp|mirror|reverse|1st edition|unlimited/i.test(String(value || "")); }
function shardFor(id) { let hash = 2166136261; for (const ch of String(id)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) % SHARDS; }
function daysBetween(a, b) { return Math.max(1, Math.round((Date.UTC(+b.slice(0,4),+b.slice(4,6)-1,+b.slice(6,8))-Date.UTC(+a.slice(0,4),+a.slice(4,6)-1,+a.slice(6,8)))/86400000)); }
function windowChange(history, days, today) {
  if (history.length < 2) return null;
  const cutoff = new Date(Date.UTC(+today.slice(0,4), +today.slice(4,6)-1, +today.slice(6,8))); cutoff.setUTCDate(cutoff.getUTCDate()-days);
  const cutoffKey = cutoff.toISOString().slice(0,10).replace(/-/g, "");
  const fullWindowBase = [...history].reverse().find((row) => row[0] <= cutoffKey);
  const base = fullWindowBase || history[0];
  const latest = history[history.length-1];
  const actualDays = daysBetween(base[0], latest[0]);
  if (actualDays < 2) return null;
  const delta10 = latest[1]-base[1], deltaTotal = latest[2]-base[2];
  const rate = base[1] > 0 ? delta10/base[1] : 0, daily = delta10/actualDays;
  let status = "横ばい";
  if (delta10 > 0 && (daily >= 10 || rate >= .1)) status = "急増化";
  else if (delta10 > 0 && (daily >= 1 || rate >= .02)) status = "増加";
  else if (delta10 > 0) status = "少ない";
  return { d10: delta10, dt: deltaTotal, s: status, days: actualDays, partial: !fullWindowBase };
}

function compactRows(payload) {
  const source = Array.isArray(payload?.rows) ? payload.rows : Object.values(payload?.byQuery || {});
  const rows = source.map((row) => ({
    set: shortSet(row.setCode || String(row.sourceSet || row.setName || "").replace(/^\d{4}\s+Pokemon Japanese\s+/i, "")),
    no: normalizeNo(row.cardNo), name: String(row.cardName || "").replace(/Shop with Affiliates/gi, "").trim(),
    ten: Number(row.psa10Count), total: Number(row.psaTotal), url: row.sourceUrl || "", fetchedAt: row.fetchedAt || payload.generatedAt || "",
  })).filter((row) => row.set && row.no && Number.isFinite(row.ten) && Number.isFinite(row.total) && row.total >= row.ten && row.ten >= 0);
  const deduped = new Map();
  for (const row of rows) {
    const key = `${row.set}|${row.no}|${cleanName(row.name)}`;
    const previous = deduped.get(key);
    if (!previous || String(row.fetchedAt) >= String(previous.fetchedAt)) deduped.set(key, row);
  }
  return [...deduped.values()];
}

function main() {
  const cards = readJson(CARDS_PATH, []), population = readJson(POP_PATH, {}), english = readJson(ENGLISH_PATH, { cards: {} }).cards || {};
  const priorityRows = readJson(PRIORITY_ROWS_PATH, { rows: [] }).rows || [];
  const sourceRows = compactRows({ ...population, rows: [...(population.rows || []), ...priorityRows] });
  const groups = new Map();
  const setGroups = new Map();
  for (const row of sourceRows) {
    const key = `${row.set}|${row.no}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
    if (!setGroups.has(row.set)) setGroups.set(row.set, []); setGroups.get(row.set).push(row);
  }
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const shards = Array.from({ length: SHARDS }, (_, i) => readJson(path.join(HISTORY_DIR, `${String(i).padStart(2,"0")}.json`), { v: 1, cards: {} }));
  const today = dayKey(), cutoff = dayKey(new Date(Date.now()-RETENTION_DAYS*86400000));
  const summary = { v: 1, updatedAt: population.generatedAt || new Date().toISOString(), date: today, matched: 0, cards: {} };
  for (const card of cards) {
    const identity = cardIdentity(card); if (!identity) continue;
    let candidates = identity.no ? (groups.get(`${identity.set}|${identity.no}`) || []) : (setGroups.get(identity.set) || []); if (!candidates.length) continue;
    const englishName = english[card.id]?.englishName || "";
    let selected = null, method = "";
    const fullName = `${englishName} ${card.name || ""}`;
    if (/メタモンマーク|with ditto mark/i.test(fullName)) {
      const ditto = candidates.filter((row) => /ditto$/i.test(cleanName(row.name).replace(/\s+/g, "")) && !/reverse/i.test(row.name));
      if (ditto.length === 1) { selected = ditto[0]; method = "set-number-edition"; }
    }
    if (!selected && candidates.some((row) => /corrected/i.test(row.name))) {
      const wantsError = /エラー版|\berror\b/i.test(fullName) && !/修正版|corrected/i.test(fullName);
      const edition = candidates.filter((row) => wantsError ? !/corrected/i.test(row.name) : /corrected/i.test(row.name));
      if (edition.length === 1) { selected = edition[0]; method = "set-number-edition"; }
    }
    if (!selected && candidates.some((row) => /missing (?:gloss|texture)/i.test(row.name))) {
      const wantsMissing = /抜け|なし|missing (?:gloss|texture)/i.test(fullName);
      const edition = candidates.filter((row) => wantsMissing ? /missing (?:gloss|texture)/i.test(row.name) : !/missing (?:gloss|texture)/i.test(row.name));
      if (edition.length === 1) { selected = edition[0]; method = "set-number-edition"; }
    }
    if (!identity.no && identity.set === "PMCG1" && englishName) {
      const noRarity = /\[PMCG1-1\]/i.test(String(card.name || ""));
      candidates = candidates.filter((row) => noRarity === /no rarity symbol/i.test(row.name));
      const ranked = candidates.map((row) => ({ row, score: baseSimilarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
      if (ranked[0]?.score >= .75 && (!ranked[1] || ranked[0].score-ranked[1].score >= .2)) {
        selected = ranked[0].row; method = "set-name-edition";
      }
    }
    if (!selected && englishName) {
      const wantedVariant = variantOf(`${englishName} ${card.name || ""}`);
      const exactVariant = candidates.filter((row) => candidateVariant(row) === wantedVariant);
      const rankedPool = exactVariant.length ? exactVariant : candidates;
      const ranked = rankedPool.map((row) => ({ row, score: similarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
      if (ranked[0]?.score >= .5 && (!ranked[1] || ranked[0].score-ranked[1].score >= .12)) { selected = ranked[0].row; method = "set-number-english"; }
      if (!selected) {
        const variantCandidates = exactVariant
          .map((row) => ({ row, score: similarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
        if (variantCandidates.length === 1) {
          selected = variantCandidates[0].row; method = "set-number-variant";
        }
      }
    }
    if (!selected && candidates.length === 1 && candidateVariant(candidates[0]) === variantOf(card.name || "")) {
      selected = candidates[0]; method = "set-number-variant";
    }
    if (!selected && candidates.length === 1 && !suspicious(candidates[0].name)) { selected = candidates[0]; method = "set-number-unique"; }
    if (!selected) continue;
    const shard = shardFor(card.id), store = shards[shard]; store.cards ||= {};
    let history = Array.isArray(store.cards[card.id]) ? store.cards[card.id].filter((row)=>row[0]>=cutoff) : [];
    const sourceDay = String(selected.fetchedAt || population.generatedAt || "").slice(0,10).replace(/-/g, "") || today;
    const point = [sourceDay, selected.ten, selected.total];
    const sameDayIndex = history.findIndex((row) => row[0] === sourceDay);
    if (sameDayIndex >= 0) history[sameDayIndex] = point;
    else if (!history.length || history.at(-1)[1] !== point[1] || history.at(-1)[2] !== point[2]) history.push(point);
    history.sort((a, b) => a[0].localeCompare(b[0]));
    store.cards[card.id] = history;
    summary.cards[card.id] = { n: selected.name, e: englishName, ten: selected.ten, total: selected.total, rate: selected.total ? selected.ten/selected.total*100 : null, u: selected.url, m: method, f: selected.fetchedAt || "", sh: String(shard).padStart(2,"0"), w7: windowChange(history,7,sourceDay), w30: windowChange(history,30,sourceDay), w90: windowChange(history,90,sourceDay) };
    summary.matched += 1;
  }
  for (let i=0;i<SHARDS;i+=1) fs.writeFileSync(path.join(HISTORY_DIR, `${String(i).padStart(2,"0")}.json`), JSON.stringify(shards[i]), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary), "utf8");
  fs.writeFileSync(POP_PATH, JSON.stringify({ v: 2, generatedAt: population.generatedAt || new Date().toISOString(), totalSets: population.totalSets || 0, totalRows: sourceRows.length, rows: sourceRows.map((row) => ({ setCode: row.set, cardNo: row.no, cardName: row.name, psa10Count: row.ten, psaTotal: row.total, sourceUrl: row.url, fetchedAt: row.fetchedAt })) }), "utf8");
  console.log(JSON.stringify({ matched: summary.matched, total: cards.length, english: Object.keys(english).length, date: today }));
}

main();
