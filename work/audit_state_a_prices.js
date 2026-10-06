const fs = require("fs");
const path = require("path");
const integrity = require("../price-integrity.js");
const decisionModel = require("../decision-model.js");

const root = path.join(__dirname, "..");
const read = (name, fallback) => {
  const file = path.join(root, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
};
const write = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data), "utf8");
const cards = read("data/pokemon-cards.json", []);
const sources = [
  ["カードラッシュ", "cardrush", "cardrushPrice"],
  ["晴れる屋2", "hareruya2", "hareruya2Price"],
  ["遊々亭", "yuyutei", "yuyuteiPrice"],
  ["トレカキャンプ", "torecacamp", "torecacampPrice"],
].map(([label, key, field]) => ({ label, field, data: read(`data/${key}-stock-summary.json`, { cards: {} }) }));
const previous = read("data/state-a-price-evidence.json", { cards: {} });
const evidence = { version: 1, updatedAt: new Date().toISOString(), cards: { ...previous.cards } };
const completion = read("data/card-catalog-completion.json", { cards: {} }).cards || {};
const asOfDate = String(read("data/pokemon-cards-meta.json", {}).updatedAt || new Date().toISOString()).slice(0, 10);
const suspects = [];
for (const card of cards) {
  const entries = sources.map((source) => {
    const row = source.data.cards?.[card.id] || {};
    return {
      source: source.label,
      kind: "販売価格",
      value: row[source.field],
      updatedAt: decisionModel.shopObservation(row).priceAt,
      valid: row.priceQuarantined !== true && !decisionModel.isSuspectedCardMismatch(row),
      conditionAccepted: row.conditionAccepted !== false,
    };
  });
  const result = integrity.audit(card.price, entries, { asOfDate });
  if (!result.disputed) continue;
  suspects.push({
    id: card.id, name: card.name, sourcePrice: result.sourcePrice,
    shopMedian: result.shopMedian, ratio: Number(result.ratio.toFixed(4)),
    shops: result.corroboratingShops, evidence: evidence.cards[card.id]?.status || "unknown",
    url: `https://toreca-souba.com/cards/${encodeURIComponent(card.id)}`,
  });
}
const cardsById = new Map(cards.map((card) => [card.id, card]));
const priority = (row) => {
  const card = cardsById.get(row.id);
  const currentCandidate = Number(card?.snkPsa10Price) > 0 && Number(card?.tv30) >= 30
    && Number(card.snkPsa10Price) * 0.92 - Number(card.price) - 12980 >= 0;
  return currentCandidate ? 0 : completion[row.id]?.a === 1 ? 1 : 2;
};
suspects.sort((a, b) => priority(a) - priority(b) || Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));

async function fetchEvidence(row) {
  const old = evidence.cards[row.id];
  if (old?.checkedAt && Date.now() - Date.parse(old.checkedAt) < 7 * 86400000) return false;
  try {
    const timeoutMs = Math.max(2000, Number(process.env.PRICE_EVIDENCE_TIMEOUT_MS || 10000));
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(row.url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "PokemonCardPriceAudit/1.0" } });
      if (response.status !== 429 && response.status < 500 || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
    if (response.status === 404) {
      evidence.cards[row.id] = { status: "source-page-missing", checkedAt: new Date().toISOString(), url: row.url, httpStatus: 404 };
      return { success: true, unavailable: true };
    }
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.httpStatus = response.status;
      throw error;
    }
    const html = await response.text();
    evidence.cards[row.id] = { status: integrity.classifyReference(html), checkedAt: new Date().toISOString(), url: row.url, httpStatus: response.status };
    return { success: true };
  } catch (error) {
    evidence.cards[row.id] = { ...old, status: old?.status || "unknown", lastAttemptAt: new Date().toISOString(), error: String(error.message || error) };
    return { success: false, httpStatus: error.httpStatus || null, reason: String(error.message || error) };
  }
}

async function main() {
  const limit = Math.max(0, Math.min(100, Number(process.env.PRICE_EVIDENCE_FETCH_LIMIT ?? 8)));
  const deadline = Date.now() + Math.max(1000, Number(process.env.PRICE_EVIDENCE_MAX_RUNTIME_MS ?? 90000));
  const intervalMs = Math.max(700, Number(process.env.PRICE_EVIDENCE_INTERVAL_MS || 1100));
  const maxFailures = Math.max(1, Number(process.env.PRICE_EVIDENCE_MAX_FAILURES || 3));
  let fetched = 0;
  let failed = 0;
  let stopReason = null;
  let resumeCardId = null;
  for (const row of suspects) {
    if (fetched >= limit || Date.now() >= deadline) break;
    if (evidence.cards[row.id]?.checkedAt && Date.now() - Date.parse(evidence.cards[row.id].checkedAt) < 7 * 86400000) continue;
    if (evidence.cards[row.id]?.lastAttemptAt && Date.now() - Date.parse(evidence.cards[row.id].lastAttemptAt) < 3600000) continue;
    const result = await fetchEvidence(row);
    fetched += 1;
    write("data/state-a-price-evidence.json", evidence);
    if (!result.success) {
      failed += 1;
      if ([401, 403].includes(result.httpStatus) || failed >= maxFailures) {
        stopReason = result.httpStatus ? `HTTP ${result.httpStatus}` : result.reason;
        resumeCardId = row.id;
        break;
      }
    }
    if (fetched < limit) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  write("data/state-a-price-evidence.json", evidence);
  for (const row of suspects) row.evidence = evidence.cards[row.id]?.status || "unknown";
  const completedRows = suspects.filter((row) => Boolean(evidence.cards[row.id]?.checkedAt));
  const unavailableCount = completedRows.filter((row) => evidence.cards[row.id]?.status === "source-page-missing").length;
  const inspectedCount = completedRows.length - unavailableCount;
  const audit = {
    version: 1, asOfDate, totalCards: cards.length, disputedCount: suspects.length,
    inspectedSourcePages: inspectedCount,
    unavailableSourcePages: unavailableCount,
    unbackedCount: suspects.filter((row) => row.evidence === "unbacked").length,
    lastRun: { attempted: fetched, failed, stopReason, resumeCardId, remaining: suspects.length - completedRows.length,
      completed: completedRows.length === suspects.length, meaning: "元ページ確認終了。実売根拠の取得完了ではない" },
    definition: "みんトレ参考価格と、35%以内で近接する状態A店舗価格2件以上の中央値が4倍以上乖離。安値・高値とも自動採用せずGO保留。店舗価格は成約ではない。",
    cards: suspects,
  };
  write("data/state-a-price-audit.json", audit);
  console.log(JSON.stringify({ totalCards: cards.length, disputed: suspects.length, attempted: fetched, inspected: inspectedCount, unavailable: unavailableCount, failed, stopReason, resumeCardId, unbacked: audit.unbackedCount, mew: suspects.find((row) => row.id === "pk-22204") }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
