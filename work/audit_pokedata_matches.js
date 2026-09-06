const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(ROOT, "data", "pokedata", "manifest.json");
const OUTPUT = path.join(ROOT, "data", "pokedata-match-audit.json");
const SAMPLE_SIZE = Math.max(150, Number(process.env.POKEDATA_AUDIT_SAMPLE || 300));
const MAX_MISMATCH_RATE_PCT = 2;
const AUDIT_SEED = process.env.POKEDATA_AUDIT_SEED || "pokedata-audit-v2-20260906";

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}

function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase();
}

function expectedVariant(detail) {
  const source = normalized(`${detail?.pokedata?.name || ""} ${detail?.localCardName || ""}`);
  if (/master\s*ball|マスターボール/.test(source)) return "master-ball";
  if (/poke\s*ball|pokeball|モンスターボール/.test(source)) return "poke-ball";
  if (/reverse\s*holo|ミラー/.test(source)) return "reverse-holo";
  return "standard";
}

function variantOf(value) {
  const source = normalized(value);
  if (/master\s*ball|マスターボール/.test(source)) return "master-ball";
  if (/poke\s*ball|pokeball|モンスターボール/.test(source)) return "poke-ball";
  if (/reverse\s*holo|ミラー/.test(source)) return "reverse-holo";
  return "standard";
}

function variantLabel(value) {
  return value === "master-ball" ? "マスターボールミラー"
    : value === "poke-ball" ? "モンスターボールミラー"
      : value === "reverse-holo" ? "その他ミラー" : "通常版";
}

function auditRow(row, detail) {
  const title = normalized(row.title);
  const reasons = [];
  const number = String(detail?.pokedata?.number || "").replace(/^0+/, "");
  const setCode = normalized(detail?.pokedata?.setCode || "").replace(/\s/g, "");
  const titleSetCodes = title.match(/\b(?:sv|sm|s)\s*\d+(?:[a-z]|\+)?(?=[\s:/#-])/g) || [];
  if (!title) reasons.push("商品名確認不能");
  if (number && !new RegExp(`(?:#|\\b)0*${number}(?:\\s*\\/\\s*\\d+)?\\b`, "i").test(title)) reasons.push("カード番号不一致");
  if (titleSetCodes.length && !titleSetCodes.some((code) => normalized(code).replace(/\s/g, "") === setCode)) reasons.push("セット不一致");
  if (/\b(?:korean|korea|kr)\b|한국/.test(title)) reasons.push("日本版以外");
  if (/\b(?:english|eng)\b/.test(title) && !/japanese|jpn|\bjp\b/.test(title)) reasons.push("英語版");
  if (/\b(?:bgs|beckett|cgc|tag|ace|sgc)\b/.test(title)) reasons.push("PSA以外の鑑定品");
  if (/\b(?:lot of|playset|bundle|pair|set of|x\s*[2-9]|[2-9]\s*x|[2-9]\s*cards?)\b/.test(title)) reasons.push("複数枚セット");
  if (/\b(?:booster\s*(?:box|pack)|sealed|unopened|factory\s*sealed)\b/.test(title)) reasons.push("未開封品");
  const hasMasterBall = /master\s*ball|マスターボール/.test(title);
  const hasPokeBall = /poke\s*ball|pokeball|モンスターボール/.test(title);
  const hasReverse = /reverse\s*holo|reverse|ミラー/.test(title);
  const variant = expectedVariant(detail);
  if (variant === "master-ball" && !hasMasterBall) reasons.push("マスターボール仕様未確認");
  if (variant === "poke-ball" && (!hasPokeBall || hasMasterBall)) reasons.push("モンスターボール仕様未確認");
  if (variant === "reverse-holo" && !(hasReverse || hasMasterBall || hasPokeBall)) reasons.push("ミラー仕様未確認");
  if (variant === "standard" && (hasMasterBall || hasPokeBall || hasReverse)) reasons.push("通常版とミラー不一致");
  const displayed = String(row.displayedGrade || "");
  const titleGrade = title.match(/\bpsa\s*(10|9|8|7|6)\b/)?.[1] || null;
  if (displayed === "Raw" && /\bpsa\b/.test(title)) reasons.push("RawとPSA不一致");
  if (/^\d+$/.test(displayed) && titleGrade && displayed !== titleGrade) reasons.push("PSAグレード不一致");
  return [...new Set(reasons)];
}

function cardSetCode(card) {
  return (String(card?.name || "").match(/\[\s*([A-Za-z0-9+\-]+)\s+\d/) || [])[1]?.toUpperCase() || null;
}

function packageName(card) {
  return String(card?.name || "").match(/\((?:[^「]*「)?([^」)]+)(?:」)?\)$/)?.[1] || "収録名未取得";
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function wilsonUpper95(errors, total) {
  if (!total) return null;
  const z = 1.6448536269514722;
  const p = errors / total;
  const z2 = z * z;
  const center = p + z2 / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return (center + spread) / (1 + z2 / total);
}

function rowStrata(row, detail) {
  const title = normalized(row.title);
  const variant = expectedVariant(detail);
  return [...new Set([
    variant === "standard" ? "通常版" : variant === "master-ball" ? "マスターボールミラー" : variant === "poke-ball" ? "モンスターボールミラー" : "その他ミラー",
    /\b(?:bgs|beckett|cgc|tag|ace|sgc)\b/.test(title) ? "PSA以外の鑑定品" : null,
    /\b(?:lot of|playset|bundle|pair|set of|x\s*[2-9]|[2-9]\s*x|[2-9]\s*cards?)\b/.test(title) ? "複数枚セット" : null,
    /\b(?:booster\s*(?:box|pack)|sealed|unopened|factory\s*sealed)\b/.test(title) ? "未開封品" : null,
    /\b(?:english|eng)\b/.test(title) && !/japanese|jpn|\bjp\b/.test(title) ? "英語版と日本語版" : null,
    String(detail?.pokedata?.setCode || "").toUpperCase().endsWith("-P") ? "プロモ" : null,
  ].filter(Boolean))];
}

function nextSetPriorities(cards, manifest) {
  const existing = new Set((manifest.sets || []).map((entry) => String(entry.setCode || "").toUpperCase()));
  const groups = new Map();
  for (const card of cards) {
    const code = cardSetCode(card);
    if (!code || existing.has(code)) continue;
    const group = groups.get(code) || { code, labels: new Map(), cardCount: 0, candidateCount: 0, psaTransactions30: 0, psaPrices: [] };
    group.cardCount += 1;
    const label = packageName(card);
    group.labels.set(label, (group.labels.get(label) || 0) + 1);
    const raw = Number(card.price);
    const psa10 = Number(card.snkPsa10Price);
    if (raw > 0 && psa10 > 0 && psa10 * 0.9 - raw - 13000 >= 0) group.candidateCount += 1;
    group.psaTransactions30 += Math.max(0, Number(card.p10tv30 || 0));
    if (psa10 > 0) group.psaPrices.push(psa10);
    groups.set(code, group);
  }
  return [...groups.values()].map((group) => {
    const pack = [...group.labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "収録名未取得";
    const medianPsa10 = median(group.psaPrices);
    const score = group.candidateCount * 12 + Math.min(1000, group.psaTransactions30) + Math.log10(Math.max(1, medianPsa10 || 1)) * 10;
    return {
      setCode: group.code,
      label: `${group.code} ${pack}`,
      score: Math.round(score * 10) / 10,
      domesticCardCount: group.cardCount,
      domesticCandidateCount: group.candidateCount,
      psa10Transactions30: group.psaTransactions30,
      medianPsa10Jpy: medianPsa10,
      reason: `国内候補${group.candidateCount}枚・PSA10直近30日${group.psaTransactions30}件・価格中央値¥${Number(medianPsa10 || 0).toLocaleString("ja-JP")}`,
    };
  }).sort((a, b) => b.score - a.score || b.domesticCandidateCount - a.domesticCandidateCount).slice(0, 3);
}

function main() {
  const manifest = readJson(MANIFEST, { sets: [] });
  const domesticCards = readJson(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const domesticById = new Map(domesticCards.map((card) => [card.id, card]));
  const detailById = new Map();
  const linkageVariantRows = [];
  for (const entry of manifest.sets || []) {
    const shard = readJson(path.join(ROOT, ...entry.file.split("/")), { cards: {} });
    Object.entries(shard.cards || {}).forEach(([localCardId, detail]) => detailById.set(localCardId, detail));
    if (String(entry.setCode || "").toUpperCase() === "SV2A") {
      for (const record of shard.linkageRecords || []) {
        if (!record.localCardId) continue;
        const local = domesticById.get(record.localCardId);
        const sourceVariant = variantOf(record.pokedataName);
        const localVariant = variantOf(local?.name);
        if (sourceVariant === "standard" && localVariant === "standard") continue;
        linkageVariantRows.push({
          pokedataCardId: record.pokedataCardId,
          pokedataName: record.pokedataName,
          localCardId: record.localCardId,
          localCardName: local?.name || null,
          sourceVariant,
          localVariant,
          strata: variantLabel(sourceVariant),
          mismatch: sourceVariant !== localVariant,
        });
      }
    }
  }
  const candidates = [];
  for (const [localCardId, detail] of detailById) {
    const sale = readJson(path.join(ROOT, "data", "pokedata-sales", `${localCardId}.json`), null);
    if (!sale) continue;
    for (const row of sale.rows || []) {
      if (row.reviewClass !== "auto-matched") continue;
      const randomKey = crypto.createHash("sha256").update(`${AUDIT_SEED}|${localCardId}|${row.rowId}`).digest("hex");
      candidates.push({ randomKey, localCardId, detail, row, strata: rowStrata(row, detail) });
    }
  }
  const sample = candidates.sort((a, b) => a.randomKey.localeCompare(b.randomKey)).slice(0, Math.min(SAMPLE_SIZE, candidates.length));
  const results = sample.map(({ localCardId, detail, row, strata }) => {
    const reasons = auditRow(row, detail);
    return { localCardId, localCardName: detail.localCardName, rowId: row.rowId, title: row.title, classifiedGrade: row.classifiedGrade, strata, mismatch: reasons.length > 0, reasons };
  });
  const mismatchCount = results.filter((row) => row.mismatch).length;
  const mismatchRatePct = results.length ? Math.round(mismatchCount / results.length * 10000) / 100 : null;
  const upper95Pct = results.length ? Math.round(wilsonUpper95(mismatchCount, results.length) * 10000) / 100 : null;
  const strata = [...new Set(results.flatMap((row) => row.strata || []))].map((name) => {
    const rows = results.filter((row) => row.strata?.includes(name));
    const errors = rows.filter((row) => row.mismatch).length;
    return { name, sampleSize: rows.length, mismatchCount: errors, mismatchRatePct: rows.length ? Math.round(errors / rows.length * 10000) / 100 : null, upper95Pct: rows.length ? Math.round(wilsonUpper95(errors, rows.length) * 10000) / 100 : null };
  });
  const specialVariantStrata = [...new Set(linkageVariantRows.map((row) => row.strata))].map((name) => {
    const rows = linkageVariantRows.filter((row) => row.strata === name);
    const errors = rows.filter((row) => row.mismatch).length;
    return { name, population: rows.length, audited: rows.length, mismatchCount: errors, mismatchRatePct: rows.length ? Math.round(errors / rows.length * 10000) / 100 : null, upper95Pct: rows.length ? Math.round(wilsonUpper95(errors, rows.length) * 10000) / 100 : null };
  });
  const specialVariantMismatchCount = linkageVariantRows.filter((row) => row.mismatch).length;
  const audit = {
    version: 2, updatedAt: new Date().toISOString(), seed: AUDIT_SEED,
    method: `固定シードによる自動一致行の無作為${results.length}行・仕様別の独立ルール再監査`,
    population: candidates.length, sampleSize: results.length, mismatchCount, mismatchRatePct,
    upper95Pct, precisionStatus: upper95Pct != null && upper95Pct <= MAX_MISMATCH_RATE_PCT ? "監査基準内" : "精度確認中",
    thresholdPct: MAX_MISMATCH_RATE_PCT,
    passed: mismatchRatePct != null && mismatchRatePct <= MAX_MISMATCH_RATE_PCT,
    autoAdoptionAllowed: mismatchRatePct != null && mismatchRatePct <= MAX_MISMATCH_RATE_PCT,
    strata,
    specialVariantAudit: {
      method: "SV2aの自動紐付け済み特殊ミラーを全件監査（セット・番号・言語に加えて仕様完全一致）",
      population: linkageVariantRows.length,
      audited: linkageVariantRows.length,
      mismatchCount: specialVariantMismatchCount,
      strata: specialVariantStrata,
      mismatches: linkageVariantRows.filter((row) => row.mismatch),
      passed: specialVariantMismatchCount === 0,
    },
    results,
  };
  const priorities = nextSetPriorities(domesticCards, manifest);
  manifest.qualityAudit = { ...audit, results: undefined };
  manifest.nextSetPriorities = priorities;
  writeJson(OUTPUT, audit);
  writeJson(MANIFEST, manifest);
  console.log(JSON.stringify({ qualityAudit: manifest.qualityAudit, nextSetPriorities: priorities }));
  if (!audit.passed || !audit.specialVariantAudit.passed) process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { auditRow, expectedVariant, nextSetPriorities, rowStrata, wilsonUpper95 };
