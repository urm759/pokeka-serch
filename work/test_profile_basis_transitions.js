const assert = require("node:assert/strict");
const {
  indexCards, compareIdentity, strictShopReference, sourceBasis, windowEvidence,
  compareSnapshots, savedPopulationProof, collectorRunning,
  populationEvidence,
} = require("./audit_profile_basis_transitions");

const card = {
  id: "fixture-a", sourceId: "fixture-a", identityKey: "SM12A|188173|EeveeGX|SR|SA|ja",
  name: "Eevee GX SR SA [SM12a 188/173]", setCode: "SM12A", cardNumber: "188173", model: "188/173",
  language: "ja", snkUrl: "https://snkrdunk.com/apparels/93085", price: 64000, chg30: 36.8, tv7: 0, tv30: 15,
  hareruya2Url: "https://www.hareruya2.com/products/fixture", cardrushUrl: "https://www.cardrush-pokemon.jp/product/fixture",
};
const currentCard = { ...card, price: 31111, chg30: -58, snkUrl: "https://snkrdunk.com/app/apparels/93085" };
const shopRow = { hareruya2Price: 61000, identityVerified: true, conditionAccepted: true,
  priceObservedAt: "2026-10-14T07:49:11.844Z", available: false, stock: 0 };
const shops = { hareruya2: { cards: { "fixture-a": shopRow } } };
const snapshot = (cards, extra = {}) => ({ ref: "fixture", cards, shops, summary: { cards: {} }, population: { rows: [] }, histories: {}, ...extra });

assert.equal(compareIdentity(card, currentCard).sameSavedIdentity, true, "app URL prefix does not change the market listing ID");
assert.equal(compareIdentity(card, { ...currentCard, model: "189/173" }).status, "changed-fields");
assert.equal(compareIdentity(card, { ...currentCard, identityKey: null }).sameSavedIdentity, false);
assert.equal(compareIdentity(card, { ...currentCard, identityReviewRequired: true }).status, "unknown");
assert.equal(compareIdentity(card, currentCard, true).status, "duplicate-id");
const indexed = indexCards([card, card, {}]);
assert.deepEqual([...indexed.duplicates], [card.id]);
assert.equal(indexed.missingId, 1);

const reference = strictShopReference(currentCard, shops);
assert.equal(reference.value, 61000);
assert.equal(reference.purchaseOffer, false, "unavailable listing remains reference evidence, not a purchase offer");
assert.equal(reference.applicationAggregateRecalculated, false);
assert.equal(reference.actualThirtyDayBaselineAvailability, "unknown");
for (const replacement of [
  { identityVerified: false }, { conditionAccepted: false }, { conditionAccepted: undefined },
  { priceObservedAt: null, updatedAt: shopRow.priceObservedAt }, { priceObservedAt: "2026-10-14" },
  { detailUrl: "https://www.hareruya2.com/products/different" }, { priceQuarantined: true },
  { hareruya2Price: null }, { hareruya2Price: 0 },
]) {
  const rows = { hareruya2: { cards: { "fixture-a": { ...shopRow, ...replacement } } } };
  assert.equal(strictShopReference(currentCard, rows).value, null);
}
const raw = sourceBasis(currentCard);
assert.equal(raw.price, 31111);
assert.equal(raw.chg30, -58);
assert.equal(raw.rawTransactionsAllConditions.days7, 0);
assert.equal(raw.priceObservedAt, null);
assert.equal(raw.baseline.availability, "unknown");
assert.equal(raw.baseline.label, "IMPLIED NOT observed");
assert.equal(raw.baseline.price, null);
assert.equal(raw.baseline.observedAt, null);
assert.equal(raw.baseline.reconstructed, false, "no arithmetic can create an observed baseline");

const second = { ...card, id: "fixture-b", sourceId: "fixture-b", chg30: 0 };
const third = { ...card, id: "fixture-c", sourceId: "fixture-c", chg30: null, price: null };
const before = snapshot([card, second, third], { ref: "previous" });
const current = snapshot([currentCard, { ...second, chg30: null }, { ...third, price: 0 }, { ...card, id: "added" }]);
const comparison = compareSnapshots(before, current);
assert.equal(comparison.counts.common, 3);
assert.equal(comparison.counts.changedTrendRows, 2, "null transitions are counted without coercing null to zero");
assert.equal(comparison.changedTrendRows.length, 2);
assert.equal(comparison.counts.majorTrendShifts, 1);
assert.equal(comparison.counts.changedRawPriceRows, 2);
assert.deepEqual(comparison.identityConsistency.addedIds, ["added"]);
assert.equal(comparison.majorShiftSamples[0].id, card.id);
assert(Math.abs(comparison.majorShiftSamples[0].deltaPercentagePoints + 94.8) < 1e-9);
assert.equal(comparison.changedTrendRows[0].current.shopReference.value, 61000);
assert.equal(comparison.changedTrendRows[0].current.sourceRaw.price, 31111);
assert.equal(comparison.changedTrendRows[0].current.sourceRaw.baseline.price, null);
assert.equal(compareSnapshots(snapshot([card, card]), snapshot([currentCard])).identityConsistency.differences[0].identity.status, "duplicate-id");
assert.equal(compareSnapshots(snapshot([card]), snapshot([{ ...currentCard, identityKey: "different" }])).counts.consistentSavedIdentities, 0);

const sourceUrl = "https://www.psacard.com/pop/tcg-cards/2025/fixture/323965";
const popCard = { ...card, name: "Mega Dragonite EX MUR [M2a 250/193]" };
const saved = { n: "Mega Dragonite EX | Mega Ultra Rare |", u: sourceUrl, f: "2026-10-10T19:32:01.174Z", ten: 9237, total: 17437,
  w30: { d10: 129, dt: 316, days: 3, partial: true } };
const rawPop = { setCode: "M2A", cardNo: "250", cardName: saved.n, sourceUrl, fetchedAt: saved.f,
  psa10Count: saved.ten, psaTotal: saved.total, captureVersion: 2, completeSnapshot: true };
const points = [["20261007", 9108, 17121], ["20261010", 9237, 17437]];
const popSnapshot = snapshot([popCard], { summary: { cards: { [popCard.id]: saved } }, population: { rows: [rawPop] }, histories: { [popCard.id]: points } });
const proof = savedPopulationProof(popSnapshot, popCard, [{ file: "fixture/recovered.json", payload: {
  rows: [{ ...rawPop, fetchedAt: "2026-10-07T05:38:55.245Z", psa10Count: 9108, psaTotal: 17121 }, { ...rawPop, sourceUrl: "different-source" }],
} }]);
assert.equal(proof.exactSelectedRawRowFound, true);
assert.equal(proof.officialRawRows[0].ten, 9237);
assert.equal(proof.recoveredSavedRows.length, 1);
assert.equal(proof.recoveredSavedRows[0].observedAt, "2026-10-07T05:38:55.245Z");
assert.deepEqual(proof.activeHistory, points);
const compactSummary = { ...saved, w30: { ...saved.w30, reference: true, provenanceUnknown: true } };
const fromHistory = populationEvidence(compactSummary, points).windows.w30;
assert.equal(fromHistory.saved.base, undefined, "audit does not require detailed startup windows");
assert.equal(fromHistory.detailedFromHistory.base.ten, 9108);
assert.equal(fromHistory.detailedFromHistory.latest.ten, 9237);
assert.equal(fromHistory.detailedFromHistory.monthlyExtrapolation.estimate, true);
assert.equal(windowEvidence(saved.w30).provenanceUnknown, true);
assert.equal(windowEvidence(saved.w30).provenanceFlagRecorded, false);
const enriched = { ...saved.w30, reference: true, provenanceUnknown: true,
  monthlyExtrapolation: { d10: 1290, estimate: true } };
assert.deepEqual(windowEvidence(enriched).saved, enriched);
assert.equal(windowEvidence(enriched).reference, true);
assert.equal(windowEvidence(enriched).monthlyExtrapolation.estimate, true);
assert.equal(windowEvidence(null), null);
assert(collectorRunning({ status: "running", startedAt: "2026-10-14T13:00:00Z" }));
assert(!collectorRunning({ status: "partial", startedAt: "2026-10-14T13:00:00Z", endedAt: "2026-10-14T13:01:00Z" }));

console.log("PASS: general identity, source/shop basis separation, unknown baselines and saved POP proof");
