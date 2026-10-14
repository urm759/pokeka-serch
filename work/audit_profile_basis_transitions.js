const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const { cardIdentity, observationTime, windowChange } = require("./build_psa_history");

const ROOT = path.join(__dirname, "..");
const REFS = ["e1431005", "183e3282"];
const FOCUS_IDS = ["pk-6028", "pk-73747"];
const SHOPS = ["cardrush", "hareruya2", "torecacamp", "yuyutei"];
const HOSTS = { cardrush: "cardrush-pokemon.jp", hareruya2: "hareruya2.com", torecacamp: "torecacamp-pokemon.com", yuyutei: "yuyu-tei.jp" };
const FILES = ["data/pokemon-cards.json", "data/psa-population-summary.json", "data/psa-official-populations.json",
  ...SHOPS.map(shop => `data/${shop}-stock-summary.json`)];
const RECOVERED_POP = "work/recovery-38029937897/unpublished-recovery/38029937897-1791612994998/data/psa-official-populations.json";
const OUTPUT = "data/profile-basis-transition-audit.json";
const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const digest = text => crypto.createHash("sha256").update(text).digest("hex");
const normalizedName = value => String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
function normalizedUrl(value) {
  try { const url = new URL(value); return `${url.protocol}//${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`; }
  catch { return null; }
}
function catalogUrl(value) {
  const url = normalizedUrl(value);
  return url?.replace(/^(https:\/\/snkrdunk\.com)\/app\/apparels\//, "$1/apparels/") || null;
}
function indexCards(cards) {
  const byId = new Map(), duplicates = new Set();
  let missingId = 0;
  for (const card of cards) {
    if (!card.id) { missingId++; continue; }
    if (byId.has(card.id)) duplicates.add(card.id);
    else byId.set(card.id, card);
  }
  return { byId, duplicates, missingId };
}
function compareIdentity(before, current, duplicate = false) {
  if (!before || !current) return { status: "unpaired", changedFields: [], sameSavedIdentity: false };
  const fields = ["id", "sourceId", "identityKey", "setCode", "cardNumber", "model", "rarity", "variant", "language", "name"];
  const changedFields = fields.filter(key => (key === "name" ? normalizedName(before[key]) : before[key] ?? null)
    !== (key === "name" ? normalizedName(current[key]) : current[key] ?? null));
  if (catalogUrl(before.snkUrl) !== catalogUrl(current.snkUrl)) changedFields.push("snkUrl");
  const uncertain = duplicate || before.identityReviewRequired === true || current.identityReviewRequired === true
    || !before.identityKey || !current.identityKey || !before.name || !current.name || !catalogUrl(before.snkUrl) || !catalogUrl(current.snkUrl);
  return { status: duplicate ? "duplicate-id" : changedFields.length ? "changed-fields" : uncertain ? "unknown" : "saved-fields-consistent",
    changedFields, sameSavedIdentity: !uncertain && changedFields.length === 0,
    independentlyVerified: false };
}
function strictShopReference(card, shops) {
  const rows = SHOPS.map(shop => {
    const row = shops[shop]?.cards?.[card.id];
    const price = number(row?.[`${shop}Price`] ?? row?.price);
    const observedAt = row?.priceObservedAt || row?.observedAt || null;
    const sourceUrl = row?.detailUrl || row?.url || card[`${shop}Url`] || null;
    const reasons = [];
    if (!row) reasons.push("row-missing");
    if (!(price > 0)) reasons.push("price-unknown");
    if (row?.identityVerified !== true) reasons.push("identity-not-explicitly-verified");
    if (row?.conditionAccepted !== true) reasons.push("condition-acceptance-not-explicit");
    if (observationTime(observedAt) == null) reasons.push("price-observation-datetime-unknown");
    const url = normalizedUrl(sourceUrl), expected = normalizedUrl(card[`${shop}Url`]);
    if (!url || !expected || url !== expected || new URL(url).hostname !== HOSTS[shop]) reasons.push("source-url-unconfirmed");
    if (row?.priceQuarantined === true || row?.identityReviewRequired === true || row?.manualReview === true) reasons.push("row-held-for-review");
    return { shop, price, sourceUrl, observedAt, inventoryObservedAt: row?.inventoryObservedAt || null,
      identityVerified: row?.identityVerified === true, conditionAccepted: row?.conditionAccepted ?? null,
      available: typeof row?.available === "boolean" ? row.available : null, stock: number(row?.stock),
      included: reasons.length === 0, reasons };
  });
  const prices = rows.filter(row => row.included).map(row => row.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  return { value: prices.length ? prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2 : null,
    basis: "audit-derived median of explicitly verified, condition-accepted shop listing prices",
    applicationAggregateRecalculated: false, purchaseOffer: false, freshnessRuleReplayed: false,
    actualThirtyDayBaselineAvailability: "unknown", rows };
}
function sourceBasis(card) {
  return { price: number(card?.price), chg30: number(card?.chg30), priceObservedAt: card?.priceObservedAt || null,
    sourceUrl: card?.id ? `https://toreca-souba.com/cards/${encodeURIComponent(card.id)}` : null,
    underlyingListingUrl: card?.snkUrl || null, rawBacked: card?.rawBacked ?? null,
    rawTransactionsAllConditions: { days7: number(card?.tv7), days30: number(card?.tv30) },
    lastTransactionDate: card?.tLastAt || null,
    baseline: { availability: "unknown", price: null, observedAt: null, impliedOnly: true,
      label: "IMPLIED NOT observed", reconstructed: false },
    scope: "saved source raw aggregate; transaction condition mix is not established as state A" };
}
function windowEvidence(window) {
  if (!window) return null;
  return { saved: window, partial: typeof window.partial === "boolean" ? window.partial : null,
    reference: typeof window.reference === "boolean" ? window.reference : null,
    provenanceUnknown: typeof window.provenanceUnknown === "boolean" ? window.provenanceUnknown : true,
    provenanceFlagRecorded: typeof window.provenanceUnknown === "boolean",
    monthlyExtrapolation: window.monthlyExtrapolation || null,
    interpretation: "saved observation comparison; any monthly extrapolation is an estimate, not observed monthly supply" };
}
function populationEvidence(summary, history) {
  if (!summary) return null;
  return { sourceName: summary.n, sourceUrl: summary.u, observedAt: summary.f || null,
    ten: number(summary.ten), total: number(summary.total), method: summary.m,
    windows: Object.fromEntries(["w7", "w30", "w90"].map(key => [key, {
      ...windowEvidence(summary[key]),
      detailedFromHistory: Array.isArray(history) ? windowChange(history, Number(key.slice(1))) : null,
      detailBasis: "read-only derivation from retained history; saved summary is preserved separately",
    }])) };
}
function cardEvidence(snapshot, card) {
  if (!card) return null;
  return { id: card.id, name: card.name, identityKey: card.identityKey || null, sourceRaw: sourceBasis(card),
    shopReference: strictShopReference(card, snapshot.shops), population: populationEvidence(snapshot.summary.cards?.[card.id], snapshot.histories[card.id]) };
}
function compareSnapshots(before, current) {
  const b = indexCards(before.cards), c = indexCards(current.cards), changedTrendRows = [], priceChangeRows = [], identityRows = [];
  let common = 0, consistent = 0, unknown = 0, populationChanged = 0;
  for (const [id, card] of c.byId) {
    const old = b.byId.get(id);
    if (!old) continue;
    common++;
    const identity = compareIdentity(old, card, b.duplicates.has(id) || c.duplicates.has(id));
    if (identity.sameSavedIdentity) consistent++;
    else { if (identity.status === "unknown") unknown++; identityRows.push({ id, identity, beforeName: old.name, currentName: card.name }); }
    const oldPop = before.summary.cards?.[id], newPop = current.summary.cards?.[id];
    if (["ten", "total", "u", "n", "f"].some(key => (oldPop?.[key] ?? null) !== (newPop?.[key] ?? null))) populationChanged++;
    const oldTrend = number(old.chg30), trend = number(card.chg30);
    if (oldTrend !== trend) changedTrendRows.push({ id, name: card.name, identity,
      deltaPercentagePoints: oldTrend != null && trend != null ? trend - oldTrend : null,
      before: cardEvidence(before, old), current: cardEvidence(current, card),
      comparability: "source raw trend versus independently derived shop reference; shared observed baseline unknown" });
    if (number(old.price) !== number(card.price)) priceChangeRows.push({ id, before: number(old.price), current: number(card.price), identity });
  }
  const majorShifts = [...changedTrendRows].filter(row => row.deltaPercentagePoints != null && Math.abs(row.deltaPercentagePoints) >= 20)
    .sort((a, b) => Math.abs(b.deltaPercentagePoints) - Math.abs(a.deltaPercentagePoints));
  return { reference: before.ref, counts: { before: before.cards.length, current: current.cards.length, common,
    changedTrendRows: changedTrendRows.length, majorTrendShifts: majorShifts.length, changedRawPriceRows: priceChangeRows.length,
    populationSavedRowsChanged: populationChanged, consistentSavedIdentities: consistent, identityUnknown: unknown },
    identityConsistency: { differences: identityRows, beforeDuplicateIds: [...b.duplicates], currentDuplicateIds: [...c.duplicates],
      beforeMissingIds: b.missingId, currentMissingIds: c.missingId,
      addedIds: [...c.byId.keys()].filter(id => !b.byId.has(id)), removedIds: [...b.byId.keys()].filter(id => !c.byId.has(id)) },
    changedTrendRows, majorShiftSamples: majorShifts.slice(0, 20), changedRawPriceRows: priceChangeRows,
    majorSampleDefinition: "absolute source chg30 change >=20 percentage points; audit sampling only, no model rule" };
}
function savedPopulationProof(snapshot, card, extra = []) {
  if (!card) return null;
  const selected = snapshot.summary.cards?.[card.id], identity = cardIdentity(card);
  const matches = payload => (payload.rows || []).filter(row => identity && selected
    && String(row.setCode || "").toUpperCase() === identity.set && String(row.cardNo).replace(/^0+(?=\d)/, "") === identity.no
    && normalizedName(row.cardName) === normalizedName(selected.n) && row.sourceUrl === selected.u);
  const evidenceRow = row => ({ sourceName: row.cardName, sourceUrl: row.sourceUrl, observedAt: row.fetchedAt || null,
    ten: number(row.psa10Count), total: number(row.psaTotal), captureVersion: row.captureVersion ?? null,
    completeSnapshot: row.completeSnapshot === true });
  const rawRows = matches(snapshot.population);
  return { snapshot: snapshot.ref, summary: populationEvidence(selected, snapshot.histories[card.id]),
    exactSelectedRawRowFound: rawRows.some(row => row.fetchedAt === selected.f && row.psa10Count === selected.ten && row.psaTotal === selected.total),
    officialRawRows: rawRows.map(evidenceRow),
    recoveredSavedRows: extra.flatMap(item => matches(item.payload).map(row => ({ file: item.file, ...evidenceRow(row) }))),
    activeHistory: snapshot.histories[card.id] || [],
    note: "saved source/specification/count/date evidence; legacy day-only points remain unknown provenance" };
}
function collectorRunning(checkpoint) {
  return checkpoint?.status === "running" || (checkpoint?.startedAt && !checkpoint?.endedAt && checkpoint?.status !== "no-progress");
}
function compatibilityInspection(builder, app) {
  const location = (file, source, fragment) => ({ file, line: source.includes(fragment) ? source.slice(0, source.indexOf(fragment)).split(/\r?\n/).length : null });
  return { structuralCompatibility: "first three point columns and legacy window fields retained; extra object metadata is additive",
    chart: location("app.js", app, "const maxValue = Math.max(...rows.flatMap"),
    caveats: [
      { ...location("app.js", app, "function psaChangeBadge"), finding: "badges use partial/days but do not display reference/provenanceUnknown" },
      { ...location("app.js", app, "const growthEntry = officialFresh"), finding: "forecast uses saved growth and elapsed days without checking provenanceUnknown/reference" },
      { ...location("app.js", app, "const psaIncrease = sourceAgeDays"), finding: "lifecycle compares saved w30 delta to 30-day transactions without checking partial/provenance" },
      { ...location("work/build_psa_history.js", builder, "const measured = latestTime"), finding: "short metadata spans fall back to retained legacy reference windows; current flags do not themselves change application rules" },
    ], sourceComparisonIsNewMarketSupplyProof: false, rulesChanged: false };
}
function build(root = ROOT) {
  const currentReads = new Map();
  const read = (file, ref = null) => {
    const text = ref ? cp.execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 100e6 })
      : fs.readFileSync(path.join(root, file), "utf8");
    if (!ref) currentReads.set(file, digest(text));
    return { value: JSON.parse(text.replace(/^\uFEFF/, "")), sha256: digest(text) };
  };
  const checkpoint = read("work/psa-fetch-progress.json").value;
  if (collectorRunning(checkpoint)) throw new Error("Collector is running; report not written. Run once after the parent confirms completion.");
  const load = ref => {
    const inputs = Object.fromEntries(FILES.map(file => [file, read(file, ref)]));
    const snapshot = { ref: ref || "current-saved", cards: inputs[FILES[0]].value, summary: inputs[FILES[1]].value,
      population: inputs[FILES[2]].value, shops: Object.fromEntries(SHOPS.map(shop => [shop, inputs[`data/${shop}-stock-summary.json`].value])),
      inputHashes: Object.fromEntries(Object.entries(inputs).map(([file, item]) => [file, item.sha256])), histories: {} };
    for (let i = 0; i < 32; i++) {
      const file = `data/psa-history/${String(i).padStart(2, "0")}.json`;
      const item = read(file, ref);
      Object.assign(snapshot.histories, item.value.cards || {});
      snapshot.inputHashes[file] = item.sha256;
    }
    return snapshot;
  };
  const current = load(null), previous = REFS.map(load);
  const recovered = fs.existsSync(path.join(root, RECOVERED_POP)) ? [{ file: RECOVERED_POP, payload: read(RECOVERED_POP).value }] : [];
  const builder = fs.readFileSync(path.join(root, "work/build_psa_history.js"), "utf8"), app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const report = { version: 1, generatedAt: new Date().toISOString(), referenceOnly: true, applicationRecalculated: false,
    baselineRefs: REFS, inputHashes: Object.fromEntries([...previous, current].map(s => [s.ref, s.inputHashes])),
    collectorCheckpoint: { status: checkpoint.status, startedAt: checkpoint.startedAt, endedAt: checkpoint.endedAt },
    comparisons: previous.map(snapshot => compareSnapshots(snapshot, current)),
    focus: Object.fromEntries(FOCUS_IDS.map(id => [id, {
      snapshots: Object.fromEntries([...previous, current].map(snapshot => [snapshot.ref, cardEvidence(snapshot, snapshot.cards.find(card => card.id === id))])),
      savedPopulationProof: [...previous, current].map(snapshot => savedPopulationProof(snapshot, snapshot.cards.find(card => card.id === id), recovered)),
    }])), builderCompatibility: compatibilityInspection(builder, app),
    definitions: { baselineAvailability: "unknown; raw price/chg30 does not identify an observed 30-day baseline; implied mathematics is not reconstructed",
      transactionScope: "source tv7/tv30 are raw aggregate transactions, not state-A transactions",
      shopReference: "strict audit median only; no source raw quote, freshness/outlier/app aggregation or purchase decision recalculation",
      focusIds: "selection for audit detail only; all card comparisons use the same helpers" },
    evidenceLimits: ["Source comparisons are not proof of new market supply.",
      "Unknown baselines cannot prove incorrect data or justify score relaxation.",
      "Saved identity consistency is not independent verification of the original market listing.",
      "Population timestamps describe saved observations, not grading-event dates."],
    httpRequests: 0, modelChanges: false, ruleChanges: false };
  if (collectorRunning(JSON.parse(fs.readFileSync(path.join(root, "work/psa-fetch-progress.json"), "utf8")))) throw new Error("Collector restarted; report not written.");
  for (const [file, hash] of currentReads) if (digest(fs.readFileSync(path.join(root, file), "utf8")) !== hash) throw new Error(`Saved input changed during audit: ${file}; report not written.`);
  fs.writeFileSync(path.join(root, OUTPUT), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ output: OUTPUT, comparisons: report.comparisons.map(item => ({ ref: item.reference, ...item.counts })) }));
  return report;
}
if (require.main === module) build();
module.exports = { indexCards, compareIdentity, strictShopReference, sourceBasis, windowEvidence, populationEvidence,
  compareSnapshots, savedPopulationProof, collectorRunning, compatibilityInspection, build };
