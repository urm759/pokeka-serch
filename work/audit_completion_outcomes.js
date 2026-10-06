const fs = require("node:fs"), path = require("node:path");
const { routes } = require("./completion_routes.js");
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; } };
const shops = ["cardrush", "hareruya2", "yuyutei", "torecacamp"];
const sourceKeys = [...shops, "psaOfficial", "pokedata"];
const fieldKeys = Object.keys(require("./completion_routes.js").ROUTES);
function pack(value) {
  return { at: value.at, schemaVersion: value.schemaVersion || 1, packed: true, rows: Object.fromEntries(Object.entries(value.rows).map(([id, r]) => [id,
    [Number(r.analysis), r.fields.reduce((mask, f) => mask | 1 << fieldKeys.indexOf(f), 0), ...sourceKeys.map((s) => Number(Boolean(r.sources[s]?.linked)) + 2 * Number(Boolean(r.sources[s]?.valid)) + 4 * Number(Boolean(r.sources[s]?.fresh)))]])) };
}
function unpack(value) {
  if (!value?.packed) return value;
  return { at: value.at, schemaVersion: value.schemaVersion || 1, rows: Object.fromEntries(Object.entries(value.rows).map(([id, r]) => [id, { analysis: Boolean(r[0]), fields: fieldKeys.filter((_, i) => r[1] & 1 << i), sources: Object.fromEntries(sourceKeys.map((s, i) => [s, { linked: Boolean(r[i + 2] & 1), valid: Boolean(r[i + 2] & 2), fresh: Boolean(r[i + 2] & 4) }])) }])) };
}
function snapshot(root, now = Date.now()) {
  const completion = read(root, "data/card-catalog-completion.json"), psa = read(root, "data/psa-population-summary.json").cards || {};
  const poke = read(root, "data/pokedata/manifest.json"), cards = read(root, "data/pokemon-cards.json", []), ids = cards.map((c) => c.id);
  const cardrushIds = new Map(cards.filter((c) => c.cardrushUrl).map((c) => [c.cardrushUrl, c.id]));
  const catalogs = Object.fromEntries(shops.map((s) => [s, read(root, `work/${s}_catalog.json`, [])]));
  const rows = {};
  const fresh = (date) => Number.isFinite(Date.parse(date)) && Date.parse(date) <= now && now - Date.parse(date) <= 48 * 3600000;
  for (const id of ids) rows[id] = { analysis: completion.cards?.[id]?.s === "分析可能", fields: Object.entries(completion.cards?.[id]?.i || {}).filter(([, s]) => s === "取得済み").map(([k]) => k), sources: {} };
  for (const s of shops) for (const row of catalogs[s]) {
    const id = row.cardId || (s === "cardrush" ? cardrushIds.get(row.detailUrl) : null);
    if (!rows[id]) continue;
    const v = Number(row.price) > 0 && !row.priceQuarantined;
    const old = rows[id].sources[s];
    rows[id].sources[s] = { linked: true, valid: Boolean(v || old?.valid), fresh: Boolean(v && fresh(row.observedAt) || old?.fresh) };
  }
  for (const [id, row] of Object.entries(psa)) if (rows[id]) rows[id].sources.psaOfficial = { linked: true, valid: Number.isFinite(row.rate) && row.total > 0, fresh: fresh(row.f) };
  for (const set of poke.sets || []) for (const id of Array.isArray(set.localCardIds) ? set.localCardIds : String(set.localCardIds || "").split(/\s+/)) if (rows[id]) rows[id].sources.pokedata = { linked: true, valid: false, fresh: false };
  for (const file of fs.existsSync(path.join(root, "data/pokedata-sales")) ? fs.readdirSync(path.join(root, "data/pokedata-sales")) : []) {
    const sale = read(root, `data/pokedata-sales/${file}`), id = sale.localCardId;
    if (rows[id]?.sources.pokedata) rows[id].sources.pokedata.valid = sale.summaries?.psa10?.adoptedCount >= 3;
  }
  return { at: new Date(now).toISOString(), schemaVersion: 2, rows };
}
function compare(before, after) {
  if (!before) return null;
  const out = { baselineAt: before.at, commonCards: 0, addedCards: 0, removedCards: 0, newlyAnalyzable: 0, lostAnalyzable: 0, filledCards: 0, filledItems: 0, sources: {} };
  for (const [id, row] of Object.entries(after.rows)) {
    const old = before.rows[id];
    if (!old) { out.addedCards++; continue; }
    out.commonCards++;
    out.newlyAnalyzable += Number(row.analysis && !old.analysis); out.lostAnalyzable += Number(!row.analysis && old.analysis);
    const filled = row.fields.filter((f) => !old.fields.includes(f)); out.filledItems += filled.length; out.filledCards += Number(filled.length > 0);
    for (const s of [...shops, "psaOfficial", "pokedata"]) {
      const a = row.sources[s] || {}, b = old.sources[s] || {};
      out.sources[s] ||= { newLinked: 0, validAdded: 0, validLost: 0, usableNet: 0, freshnessRecovered: 0 };
      if (s === "cardrush" && (before.schemaVersion || 1) < 2) { out.nonComparableSources = ["cardrush: 初回のURL照合集計修正。実取得の増加には数えない"]; continue; }
      const r = out.sources[s]; r.newLinked += Number(Boolean(a.linked && !b.linked)); r.validAdded += Number(Boolean(a.valid && !b.valid)); r.validLost += Number(Boolean(!a.valid && b.valid)); r.usableNet = r.validAdded - r.validLost;
      r.freshnessRecovered += Number(Boolean(a.fresh && a.valid && (!b.fresh || !b.valid)));
    }
  }
  out.removedCards = Object.keys(before.rows).filter((id) => !after.rows[id]).length;
  return out;
}
function build(root, now = Date.now()) {
  const current = snapshot(root, now), completion = read(root, "data/card-catalog-completion.json"), queue = read(root, "work/card-completion-queue.json");
  const last = unpack(read(root, "work/completion-outcomes-last.json", null)), baseline = unpack(read(root, "work/completion-outcomes-baseline.json", last));
  const dir = path.join(root, "work/completion-outcome-history"); fs.mkdirSync(dir, { recursive: true });
  const history = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => unpack(read(root, `work/completion-outcome-history/${f}`)));
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(now));
  const aggregate = {}, routed = {}, oneAway = {};
  for (const [id, row] of Object.entries(current.rows)) {
    for (const [s, value] of Object.entries(row.sources)) {
      aggregate[s] ||= { linked: 0, valid: 0, fresh: 0 };
      for (const [k, flag] of Object.entries(value)) if (flag) aggregate[s][k === "fresh" ? "fresh" : k]++;
    }
    const detail = queue.cards?.[id] || {};
    if (detail.m?.length === 1) oneAway[detail.m[0]] = (oneAway[detail.m[0]] || 0) + 1;
    for (const r of routes(detail)) {
      const key = `${r.key}:${r.mode}:${r.status}`;
      routed[key] ||= { ...r, count: 0, oneAway: 0 };
      routed[key].count++; routed[key].oneAway += Number(detail.m?.length === 1 && r.required);
    }
  }
  const window = (days) => {
    const cutoff = now - days * 86400000;
    const candidates = history.filter((d) => Date.parse(d.at) <= cutoff).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return candidates.length ? compare(candidates[0], current) : { status: "蓄積中", requiredDays: days, observedDays: history.length };
  };
  const before = baseline || current;
  const result = { version: 1, generatedAt: current.at, counts: { listed: Object.keys(current.rows).length, analyzable: completion.summary?.analyzable, pending: completion.summary?.priorityQueueRemaining, oneAway: completion.summary?.completableAfterNext }, sources: aggregate, oneAway, routes: Object.values(routed), sinceBaseline: compare(before, current), previousObservation: compare(last, current), sevenDays: window(7), thirtyDays: window(30),
    definitions: "紐付けはカタログ掲載IDへの対応、有効保存値は価格/POP検査済み、鮮度は48時間以内で分離（仕入れ基準の期限とは別）。PokeDATAはID対応と成約精査済み詳細を区別し、PSA10採用3件以上の参考中央値だけ有効値に数える。PSAのみ不足は店舗へ送らない。海外PSA9/Raw成約は国内PSA9/状態A成約と別。7/30日は同一ID群と項目の過去観測のみ比較・履歴不足は蓄積中。候補生成・再確認は新規補完に数えない。", domesticPsa9IndividualCards: 0,
    overseasAcquisition: read(root, "data/pokedata/manifest.json").acquisition || null };
  fs.writeFileSync(path.join(root, "data/completion-outcomes.json"), JSON.stringify(result));
  if (!baseline) fs.writeFileSync(path.join(root, "work/completion-outcomes-baseline.json"), JSON.stringify(pack(current)));
  // Preserve the first observation of each day; a second update never replaces it.
  const dailyFile = path.join(dir, `${day}.json`);
  if (!fs.existsSync(dailyFile)) fs.writeFileSync(dailyFile, JSON.stringify(pack(current)));
  fs.writeFileSync(path.join(root, "work/completion-outcomes-last.json"), JSON.stringify(pack(current)));
  return result;
}
if (require.main === module) console.log(JSON.stringify(build(path.join(__dirname, "..")).counts));
module.exports = { snapshot, compare, build, pack, unpack };
