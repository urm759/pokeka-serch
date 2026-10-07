const fs = require("node:fs");
const path = require("node:path");
const decisionModel = require("../decision-model.js");
const { fairBatch } = require("./fair_batch.js");
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); } catch { return fallback; } };
const normalized = (value) => String(value || "").normalize("NFKC").toUpperCase();
function groupFor(card, config) {
  const bracket = String(card.name || "").match(/\[([^\]]+)\]/)?.[1] || "";
  const set = normalized(card.setCode || bracket.trim().split(/\s+/)[0]);
  const number = normalized(card.model || bracket.match(/\d+\/\d+/)?.[0]);
  return (config.groups || []).find((g) => set === normalized(g.setCode)
    && (!g.number || number === normalized(g.number))
    && g.names.some((name) => String(card.name || "").startsWith(name))
    && (!g.rarity || new RegExp(`\\b${g.rarity}\\b`).test(normalized(card.name)))) || null;
}
function observation(value, at, now, hours, extra = {}) {
  const valid = value != null && Number.isFinite(Number(value)) && Number(value) > 0;
  const timestamp = decisionModel.observationTime(at);
  const ageHours = Number.isFinite(timestamp) && timestamp <= now ? (now - timestamp) / 3600000 : null;
  const fresh = valid && ageHours != null && ageHours <= hours;
  return { value: valid ? Number(value) : null, at: at || null, ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    valid, fresh, status: !valid ? "不足" : fresh ? "鮮度適合" : "古い・日時未確認", ...extra };
}
function build(root, now = Date.now()) {
  const config = read(root, "data/focus-monitor-config.json");
  const cards = read(root, "data/pokemon-cards.json", []);
  const psa = read(root, "data/psa-population-summary.json").cards || {};
  const meta = read(root, "data/pokemon-cards-meta.json");
  const buybacks = read(root, "data/shop-buyback-summary.json").cards || {};
  const prior = read(root, "data/focus-monitor.json");
  const prices = Object.fromEntries(["cardrush", "hareruya2", "yuyutei", "torecacamp"].map((id) => [id, read(root, `data/${id}-stock-summary.json`).cards || {}]));
  const rows = {}, totals = {}, ids = [];
  for (const card of cards) {
    const group = groupFor(card, config);
    if (!group) continue;
    ids.push(card.id);
    const pop = psa[card.id];
    const populationValid = pop?.ten != null && Number.isFinite(Number(pop.total)) && Number.isFinite(Number(pop.ten)) && Number(pop.total) > 0 && Number(pop.ten) >= 0 && Number(pop.ten) <= Number(pop.total);
    const rate = populationValid ? Number(pop.ten) / Number(pop.total) * 100 : null;
    const quotes = Object.entries(prices).flatMap(([source, entries]) => {
      const p = entries[card.id];
      const value = p?.currentPrice ?? p?.price ?? p?.hareruya2Price ?? p?.cardrushPrice ?? p?.yuyuteiPrice ?? p?.torecacampPrice;
      const inStock = p?.available === true || Number(p?.currentStock ?? p?.stock) > 0;
      if (!inStock || p?.priceQuarantined || p?.cardMismatchSuspected || p?.matchStatus === "mismatch") return [];
      const row = observation(value, decisionModel.shopObservation(p).priceAt, now, config.ttlHours, { source, url: card[`${source}Url`] || p.detailUrl || null });
      return row.valid ? [row] : [];
    });
    const bb = Object.entries(buybacks[card.id]?.shops || {}).flatMap(([source, p]) => {
      if (p.quarantined || p.listingActive === false || p.cardMismatchSuspected) return [];
      const row = observation(p.price, p.priceDate, now, config.ttlHours, { source });
      return row.valid ? [row] : [];
    });
    const best = (list) => [...list].sort((a, b) => Number(b.fresh) - Number(a.fresh) || a.value - b.value)[0];
    const priceEntries = Object.entries(prices).map(([source, entries]) => { const p = entries[card.id] || {}, at = decisionModel.shopObservation(p); return {
      source, value:p[`${source}Price`],kind:'販売価格',updatedAt:at.priceAt,inventoryAt:at.inventoryAt,
      available:p.available === true || Number(p.stock)>0, identityVerified:p.identityVerified === true || Boolean(p.identityVerifiedAt),
      conditionAccepted:p.conditionAccepted !== false,valid:!decisionModel.isSuspectedCardMismatch(p) && !p.priceQuarantined }; });
    priceEntries.push({ source: "toreca", value: card.price, valid: card.rawBacked !== false, updatedAt: meta.updatedAt || meta.generatedAt });
    const aggregation = decisionModel.aggregatePrices(priceEntries, { asOfDate: meta.updatedAt || meta.generatedAt, staleAfterDays: 14, excludeAfterDays: 45, minRatio: 0.55, maxRatio: 1.8, clusterRatio: 1.35, divergencePct: 35 });
    const items = {
      psaPopulation: observation(populationValid ? pop.total : null, pop?.f, now, config.ttlHours, { ten: populationValid ? Number(pop.ten) : null, url: pop?.u || null, source: "psaOfficial" }),
      psaRate: { ...observation(rate, pop?.f, now, config.ttlHours), value: rate, valid: populationValid, fresh: populationValid && observation(pop.total, pop.f, now, config.ttlHours).fresh,
        status: !populationValid ? "不足" : observation(pop.total, pop.f, now, config.ttlHours).fresh ? "鮮度適合" : "古い・日時未確認", source: "psaOfficial" },
      domesticRaw: observation(card.price, meta.updatedAt || meta.generatedAt, now, config.ttlHours, { source: "toreca", backed: card.rawBacked === true, saleDate: card.tLastAt || null }),
      domesticPsa10: observation(card.snkPsa10Price, meta.updatedAt || meta.generatedAt, now, config.ttlHours, { source: "toreca" }),
      buyback: best(bb) || observation(null, null, now, config.ttlHours, { source: "shopBuyback" }),
      shopStateA: best(quotes) || observation(null, null, now, config.ttlHours, { source: "hareruya2" }),
    };
    const offers = decisionModel.storeOffers(priceEntries, aggregation, {now});
    items.shopStateA.calculationEligible = items.shopStateA.valid && !aggregation.conflicted && offers.rows.some(p => p.source === items.shopStateA.source && p.purchaseEligible);
    items.shopStateA.calculationNotice = !items.shopStateA.valid ? "購入可能価格未取得" : items.shopStateA.calculationEligible ? "個別日時・状態A・在庫確認済み。GOは別判定" : "個別確認の期限・日時・仕様・在庫条件を満たさない。診断表示で確認";
    if (items.shopStateA.valid && !items.shopStateA.calculationEligible) items.shopStateA.status += "・価格監査対象外";
    const old = prior.cards?.[card.id]?.items || {};
    let newValid = 0, newlyFresh = 0;
    for (const [key, item] of Object.entries(items)) {
      totals[key] ||= { valid: 0, fresh: 0, stale: 0, missing: 0, newValid: 0, newlyFresh: 0 };
      const t = totals[key];
      if (item.valid) { t.valid++; item.fresh ? t.fresh++ : t.stale++; } else t.missing++;
      if (prior.cards && item.valid && !old[key]?.valid) { t.newValid++; newValid++; }
      if (prior.cards && item.fresh && !old[key]?.fresh) { t.newlyFresh++; newlyFresh++; }
    }
    const pending = Object.keys(items).filter((key) => !items[key].fresh);
    rows[card.id] = { id: card.id, name: card.name, group: group.id, items, pending,
      priorityReason: pending.length ? `重点監視：${pending.join("／")}の鮮度・不足補完` : !items.shopStateA.calculationEligible ? "鮮度は適合・店舗価格は既存監査の対象外。GOへ採用しない" : "重点対象・必要項目は鮮度適合（GOは別判定）",
      newValid, newlyFresh, lastProgressAt: newValid || newlyFresh ? new Date(now).toISOString() : prior.cards?.[card.id]?.lastProgressAt || null };
  }
  return { version: 1, generatedAt: new Date(now).toISOString(), maxFocusedShare: config.maxFocusedShare,
    definition: "取得日と成約日を区別。購入可能価格は在庫あり・同一仕様の状態Aだけ。純増と鮮度回復は別集計。監視による上限・GO変更なし。",
    groups: (config.groups || []).map((g) => ({ id: g.id, label: g.label, expected: g.expectedCount, matched: Object.values(rows).filter((r) => r.group === g.id).length })),
    lastProgress: Object.values(totals).some((t) => t.newValid || t.newlyFresh)
      ? { at: new Date(now).toISOString(), newValid: Object.values(totals).reduce((n, t) => n + t.newValid, 0), newlyFresh: Object.values(totals).reduce((n, t) => n + t.newlyFresh, 0) }
      : prior.lastProgress || null,
    count: ids.length, ids, totals, cards: rows, llmCalls: 0, codexCalls: 0 };
}
function write(root, now) {
  const data = build(root, now);
  fs.writeFileSync(path.join(root, "data/focus-monitor.json"), JSON.stringify(data));
  return data;
}
if (require.main === module) { const data = write(path.join(__dirname, "..")); console.log(JSON.stringify({ count: data.count, groups: data.groups, totals: data.totals })); }
module.exports = { groupFor, fairBatch, observation, build, write };
