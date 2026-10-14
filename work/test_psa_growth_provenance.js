const assert = require("node:assert/strict");
const {
  compactRows, reconcileHistory, appendObservation, windowChange, compactWindow, dayKey, observationTime,
} = require("./build_psa_history");

const sourceUrl = "https://www.psacard.com/pop/tcg-cards/2025/fixture/1";
const otherUrl = "https://www.psacard.com/spec/psa/2";
const identity = { set: "M2A", no: "250" };
const selected = {
  set: identity.set, no: identity.no, name: "Mega Dragonite EX | Mega Ultra Rare |",
  ten: 9108, total: 17121, url: sourceUrl, fetchedAt: "2026-10-07T05:38:55.245Z",
  captureVersion: 2, completeSnapshot: true,
};
const raw = {
  setCode: identity.set, cardNo: identity.no, cardName: selected.name,
  psa10Count: selected.ten, psaTotal: selected.total, sourceUrl,
  fetchedAt: selected.fetchedAt, captureVersion: 2, completeSnapshot: true,
};
const observe = (history, overrides = {}) => appendObservation(history, { ...selected, ...overrides });
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// A publication timestamp cannot become an observation timestamp.
const missing = compactRows({ generatedAt: "2026-10-14T10:00:00Z", rows: [{ ...raw, fetchedAt: null }] });
assert.equal(missing[0].fetchedAt, "");
assert.deepEqual(appendObservation([], missing[0]), []);
for (const value of [null, undefined, "", "invalid", "2026-10-14", "2026-10-14T08:00:00", 0]) {
  assert.equal(observationTime(value), null);
  const history = [["20261001", 100, 200]];
  assert.strictEqual(observe(history, { fetchedAt: value }), history);
}
assert.equal(observationTime("2026-10-14T17:01:16.154+09:00"), Date.parse("2026-10-14T08:01:16.154Z"));

const differentSources = compactRows({ rows: [raw, { ...raw, sourceUrl: otherUrl }] });
assert.equal(differentSources.length, 2, "same label from different sources is not deduplicated");
const newerRow = { ...raw, fetchedAt: "2026-10-14T08:01:16.154Z", psa10Count: 9344, psaTotal: 17666 };
assert.equal(compactRows({ rows: [newerRow, raw, { ...raw, fetchedAt: null }] })[0].ten, 9344);
assert.equal(compactRows({ rows: [raw, newerRow] })[0].ten, 9344);
assert.equal(compactRows({ rows: [{ ...raw, psa10Count: 0 }] })[0].ten, 0);
assert.deepEqual(compactRows({ rows: [{ ...raw, psa10Count: null }, { ...raw, psaTotal: null }, { ...raw, psaTotal: 0 }] }), []);

const store = {};
let history = reconcileHistory(store, "fixture", [], selected, identity);
history = appendObservation(history, selected, store.identities.fixture);
assert.equal(store.sources.fixture, sourceUrl);
const beforeChange = history;
history = reconcileHistory(store, "fixture", history, { ...selected, url: otherUrl }, identity);
assert.deepEqual(history, []);
assert.equal(store.quarantined.fixture[0].reason, "source-url-changed");
assert.equal(store.quarantined.fixture[0].previousSource, sourceUrl);
assert.equal(store.quarantined.fixture[0].sourceUrl, otherUrl);
assert.deepEqual(store.quarantined.fixture[0].points, beforeChange);
assert.equal(store.sources.fixture, otherUrl);
const metadataOnlyStore = { identities: { fixture: store.identities.fixture } };
assert.deepEqual(reconcileHistory(metadataOnlyStore, "fixture", beforeChange, { ...selected, url: otherUrl }, identity), [],
  "an explicitly recorded point source also protects history when the sources map is absent");
assert.deepEqual(metadataOnlyStore.quarantined.fixture[0].points, beforeChange);
history = appendObservation(history, { ...selected, url: otherUrl, ten: 20000, total: 22000 }, store.identities.fixture);
assert.equal(windowChange(history, 7), null, "a source change starts with one point, not synthetic growth");

const corrected = { ...selected, url: otherUrl, name: "Mega Dragonite EX | Mega Ultra Rare-Missing Texture |", ten: 6, total: 15 };
history = reconcileHistory(store, "fixture", history, corrected, identity);
assert.deepEqual(history, []);
history = appendObservation(history, corrected, store.identities.fixture);
assert.equal(windowChange(history, 30), null, "a specification correction is not population growth");
assert.equal(windowChange(observe([]), 7), null, "new linkage has no baseline");

// Existing arrays remain intact and unknown until independently observed points exist.
const legacy = [["20261001", 100, 200], ["20261007", 120, 240]];
const legacyStore = { identities: { fixture: store.identities.fixture } };
assert.strictEqual(reconcileHistory(legacyStore, "fixture", legacy, corrected, identity), legacy);
assert.equal(legacy[0].length, 3);
const reference = windowChange(legacy, 7, "20261007");
assert.equal(reference.d10, 20);
assert.equal(reference.days, 6);
assert.equal(reference.partial, true);
assert.equal(reference.reference, true);
assert.equal(reference.provenanceUnknown, true);
assert.deepEqual(reference.base, { date: "20261001", ten: 100, total: 200, observedAt: null, sourceUrl: null });
assert.equal(reference.monthlyExtrapolation.estimate, true);
const mixed = observe(legacy, { ten: 200, total: 300, fetchedAt: "2026-10-14T00:00:00Z" });
assert.equal(windowChange(mixed, 30).provenanceUnknown, true);
assert.deepEqual(legacy, [["20261001", 100, 200], ["20261007", 120, 240]]);
const sameLegacyDay = observe([["20261007", 100, 200]]);
assert.equal(sameLegacyDay.length, 2, "unknown legacy time cannot be overwritten as if it were older");
assert.equal(sameLegacyDay[0].length, 3);

assert.equal(dayKey(new Date("2026-10-10T19:32:01.174Z")), "20261011");
assert.equal(observe([], { fetchedAt: "2026-10-10T14:59:59Z" })[0][0], "20261010");
assert.equal(observe([], { fetchedAt: "2026-10-10T15:00:00Z" })[0][0], "20261011");
assert.equal(observe([], { fetchedAt: "2026-10-11T00:00:00+09:00" })[0][0], "20261011");

let measured = observe([]);
measured = observe(measured, { ten: 9237, total: 17437, fetchedAt: "2026-10-10T19:32:01.174Z" });
assert.equal(measured[1][0], "20261011");
const partial = windowChange(measured, 30);
const elapsed = (Date.parse("2026-10-10T19:32:01.174Z") - Date.parse(selected.fetchedAt)) / 86400000;
assert.equal(partial.d10, 129);
assert.equal(partial.dt, 316);
close(partial.days, elapsed);
assert.equal(partial.partial, true);
assert.equal(partial.reference, false);
assert.equal(partial.provenanceUnknown, false);
assert.equal(partial.base.observedAt, selected.fetchedAt);
assert.equal(partial.latest.observedAt, "2026-10-10T19:32:01.174Z");
assert.equal(partial.base.sourceUrl, sourceUrl);
close(partial.monthlyExtrapolation.d10, 129 / elapsed * 30);
assert.equal(partial.monthlyExtrapolation.estimate, true);

measured = observe(measured, { ten: 9344, total: 17666, fetchedAt: newerRow.fetchedAt });
const full7 = windowChange(measured, 7);
assert.equal(full7.d10, 236);
assert.equal(full7.dt, 545);
assert.equal(full7.partial, false);
assert.equal(windowChange(measured, 30).partial, true);
assert.equal(full7.latest.ten, 9344);
assert.equal(full7.latest.total, 17666);
const compact = compactWindow(full7);
assert.deepEqual(Object.keys(compact), ["d10", "dt", "s", "days", "partial", "reference", "provenanceUnknown"]);
assert.equal(compact.d10, full7.d10);
assert.equal(compact.days, full7.days);
assert.equal(compact.partial, full7.partial);
assert.equal(compact.reference, full7.reference);
assert.equal(compact.provenanceUnknown, full7.provenanceUnknown);
assert.equal(compactWindow(null), null);
assert(JSON.stringify(compact).length < JSON.stringify(full7).length / 2, "startup windows must not duplicate endpoint or extrapolation metadata");
assert(full7.base && full7.latest && full7.monthlyExtrapolation, "detailed helper remains available to lazy audits");
close(full7.days, (Date.parse(newerRow.fetchedAt) - Date.parse(selected.fetchedAt)) / 86400000);
const withKnownPair = observe(mixed, { ten: 210, total: 310, fetchedAt: "2026-10-17T00:00:00Z" });
assert.equal(windowChange(withKnownPair, 30).d10, 10, "unknown legacy points are not used as measured baselines");
assert.equal(windowChange(withKnownPair, 30).provenanceUnknown, false);
assert.equal(windowChange(withKnownPair, 30).partial, true);
const tomorrow = observe(mixed, { ten: 200, total: 300, fetchedAt: "2026-10-15T00:00:00Z" });
const tomorrowWindow = windowChange(tomorrow, 30);
assert.equal(tomorrowWindow.reference, true);
assert.equal(tomorrowWindow.provenanceUnknown, true);
assert.equal(tomorrowWindow.base.date, "20261001");
assert.equal(tomorrowWindow.d10, 100, "a short metadata pair must not erase retained legacy growth");
assert.equal(tomorrowWindow.s, windowChange(mixed, 30).s, "existing supply warning survives tomorrow's unchanged observation");
const underTwoDays = observe(mixed, { ten: 200, total: 300, fetchedAt: "2026-10-15T23:59:59Z" });
assert.equal(windowChange(underTwoDays, 30).reference, true);
const twoDays = observe(mixed, { ten: 200, total: 300, fetchedAt: "2026-10-16T00:00:00Z" });
assert.equal(windowChange(twoDays, 30).reference, false);
assert.equal(windowChange(twoDays, 30).days, 2);
assert.equal(windowChange(twoDays, 30).d10, 0);

const repeated = observe(observe([], { ten: 100, total: 200, fetchedAt: "2026-10-01T00:00:00Z" }),
  { ten: 100, total: 200, fetchedAt: "2026-10-08T00:00:00Z" });
assert.equal(repeated.length, 2, "unchanged counts still record a real re-observation");
assert.equal(windowChange(repeated, 7).d10, 0);
assert.equal(windowChange(repeated, 7).s, "\u6a2a\u3070\u3044");
assert.equal(windowChange(repeated, 7).monthlyExtrapolation.d10, 0);
assert.equal(windowChange(repeated, 7).latest.observedAt, "2026-10-08T00:00:00Z");
const laterSameDay = observe(repeated, { ten: 101, total: 201, fetchedAt: "2026-10-08T01:00:00Z" });
assert.equal(laterSameDay.length, 2);
assert.equal(laterSameDay.at(-1)[1], 101);
assert.strictEqual(observe(laterSameDay, { ten: 999, total: 1000, fetchedAt: "2026-10-08T00:30:00Z" }), laterSameDay);
assert.strictEqual(observe(laterSameDay, { ten: 999, total: 1000, fetchedAt: "2026-10-08T10:00:00+09:00" }), laterSameDay);
const recovered = observe(laterSameDay, { ten: 99, total: 199, fetchedAt: "2026-10-04T00:00:00Z" });
assert.equal(recovered.length, 3);
assert.deepEqual(recovered.at(-1), laterSameDay.at(-1));
assert.equal(windowChange(recovered, 7, "20261004").latest.observedAt, "2026-10-08T01:00:00Z");

const zeroBase = observe(observe([], { ten: 0, total: 100, fetchedAt: "2026-10-01T00:00:00Z" }),
  { ten: 0, total: 100, fetchedAt: "2026-10-08T00:00:00Z" });
assert.equal(windowChange(zeroBase, 7).d10, 0);
assert.equal(windowChange(zeroBase, 7).monthlyExtrapolation.d10, 0);
const growsFromZero = observe(zeroBase, { ten: 10, total: 110, fetchedAt: "2026-10-15T00:00:00Z" });
assert.equal(windowChange(growsFromZero, 7).d10, 10);
assert(Number.isFinite(windowChange(growsFromZero, 7).monthlyExtrapolation.d10));
assert.strictEqual(observe(zeroBase, { ten: null }), zeroBase);
assert.strictEqual(observe(zeroBase, { total: null }), zeroBase);
assert.strictEqual(observe(zeroBase, { ten: 0, total: 0 }), zeroBase);
assert.equal(windowChange([], 7), null);
assert.equal(windowChange([["20261001", null, 100], ["20261008", 10, 100]], 7), null);
assert.equal(windowChange(observe(observe([], { ten: 10, total: 100 }), { ten: 10, total: 100, fetchedAt: "2026-10-08T05:38:55.245Z" }), 7), null);
const decrease = observe(zeroBase, { ten: 0, total: 90, fetchedAt: "2026-10-15T00:00:00Z" });
assert.equal(windowChange(decrease, 7).dt, -10, "population corrections remain signed observations");
const crossSource = observe(measured, { url: otherUrl, fetchedAt: "2026-10-21T08:01:16.154Z" });
assert.equal(windowChange(crossSource, 7), null, "different recorded sources never form a growth comparison");

console.log("PASS: PSA growth source provenance, observed timestamps, JST days and recovery ordering");
