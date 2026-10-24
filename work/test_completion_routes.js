const assert = require("node:assert/strict");
const fs = require("node:fs");
const { eligibleForHareru } = require("./consume_completion_queue.js");
const { routes, failureState } = require("./completion_routes.js");
for(const status of ['取得元にデータなし','再試行待ち']) {
  const r=routes({i:{domesticPrice:[status]}},{psaAllowed:false,overseasAllowed:false}).find(r=>r.key==='domesticPrice');
  assert.equal(r.mode,'通常一括差分で再確認・価格根拠待ち');
  assert.equal(r.normalBulkRecheck,true);assert.equal(r.networkRequired,false);
}
const { compare, pack, unpack } = require("./audit_completion_outcomes.js");
const { merge } = require("./recover_saved_psa.js");
const { psaIdentity, makeQueue } = require("./build_psa_linkage_queue.js");
const now = Date.parse("2026-10-06T04:00:00Z");
const rows = [{ card: { id: "psaOnly", hareruya2Url: "https://shop.example/1" }, detail: { m: ["psaOfficial"], i: { shopStateA: ["取得済み"], psaOfficial: ["取得待ち"] } } },
  { card: { id: "shopMissing", hareruya2Url: "https://shop.example/2" }, detail: { m: [], i: { shopStateA: ["取得待ち"] } } }];
assert.deepEqual(eligibleForHareru(rows, [], now).map((r) => r.card.id), ["shopMissing"]);
const cached = { cardId: 'shopMissing', detailUrl: rows[1].card.hareruya2Url, price: 1000, observedAt: new Date(now - 1000).toISOString() };
assert.equal(eligibleForHareru(rows, [cached], now).length, 0, 'valid fresh prices do not consume the missing-data budget again');
assert.equal(eligibleForHareru(rows, [{...cached, cardMismatchSuspected:true}], now).length, 1, 'quarantined prices are not valid cache hits');
assert.equal(eligibleForHareru(rows, [{...cached, priceQuarantined:true}], now).length, 1);
assert.equal(eligibleForHareru(rows, [{...cached, detailUrl:'https://old.example/1'}], now).length, 1, 'a different saved URL does not prove this URL was verified');
assert.equal(eligibleForHareru(rows, [], now, new Set(), {sourceBlocked:'HTTP 403'}).length, 0);
const plans=require('./consume_completion_queue').profilePlans({profiles:[
  {id:'A',prospects:[{id:'a',missing:['shopStateA','psaOfficial'],completionPlan:{requirements:[{field:'shopStateA',automatic:true},{field:'psaOfficial',automatic:false}]}}]},
  {id:'A-median',prospects:[{id:'a',missing:['referenceMedian'],completionPlan:{requirements:[{field:'referenceMedian',automatic:true}]}}]}
]});
assert.equal(plans.size,1);assert.equal(plans.get('a').automatic,true);assert.deepEqual(plans.get('a').profiles,['A','A-median']);
assert.deepEqual(plans.get('a').missing,['referenceMedian'],'keep the executable shortest completion path without merging different profile requirements');
assert(routes(rows[0].detail).some((r) => r.key === "psaOfficial" && r.source === "psaOfficial"));
assert(!routes(rows[0].detail).some((r) => r.key === "shopStateA"));
const permitted = {psaAllowed:true,overseasAllowed:true};
assert.equal(routes({pk:"unexpanded-set", i:{pokedata:["取得待ち"]}},permitted).find(r=>r.key==="pokedata").mode, "自動巡回中");
assert.equal(routes({pk:"unsupported-or-unconfirmed", i:{pokedata:["取得不能"]}},permitted).find(r=>r.key==="pokedata").mode, "取得不能・存在未確認／照合待ち");
const stopped = routes({i:{pokedata:['取得待ち',null,null,1,'未照合','2026-10-07'],psaOfficial:['取得待ち']}},{psaAllowed:false,overseasAllowed:false});
for (const r of stopped.filter(r=>['pokedata','pokedataAuthenticated','psaOfficial'].includes(r.source))) {
  assert.equal(r.mode,'許諾待ち');assert.equal(r.nextRetryAt,null);assert.equal(r.acquisitionStatus,'permission-wait');
}
assert.equal(stopped.find(r=>r.key==='pokedata').status,'取得待ち','permission wait does not relabel missing data as nonexistent');
assert.equal(stopped.find(r=>r.key==='domesticPrice').mode,'自動巡回中','independent domestic routes continue');
const first = failureState({}, { status: "failed", error: "HTTP 503", startedAt: new Date(now).toISOString() }, now);
assert(!first.held);
assert(!failureState(first, { status: "failed", error: "HTTP 503" }, now).held);
assert(failureState({}, { status: "failed", error: "HTTP 403" }, now).held);
const before = { at: "2026-10-05T00:00:00Z", schemaVersion: 2, rows: { one: { analysis: false, fields: ["domesticPrice"], sources: { psaOfficial: { linked: false, valid: false, fresh: false } } } } };
assert.deepEqual(unpack(pack(before)), { at: before.at, schemaVersion: 2, fieldKeys:Object.keys(require('./completion_routes').ROUTES), rows: { one: { ...before.rows.one, sources: Object.fromEntries(["cardrush", "hareruya2", "yuyutei", "torecacamp", "psaOfficial", "pokedata"].map((s) => [s, { linked: false, valid: false, fresh: false }])) } } });
const after = { at: new Date(now).toISOString(), rows: { one: { analysis: true, fields: ["domesticPrice", "psaOfficial"], sources: { psaOfficial: { linked: true, valid: true, fresh: true } } } } };
const diff = compare(before, after);
assert.equal(diff.newlyAnalyzable, 1); assert.equal(diff.filledCards, 1); assert.equal(diff.sources.psaOfficial.usableNet, 1);
assert.equal(diff.sources.cardrush.usableNet, 0); assert(!JSON.stringify(diff).includes("null"));
assert.equal(compare(after, after).filledCards, 0);
const evidenceBefore={...before,fieldKeys:Object.keys(require('./completion_routes').ROUTES)};
const evidenceAfter={...after,rows:{one:{...before.rows.one,fields:['domesticPrice','buybackExitEvidence']}}};
assert.equal(compare(evidenceBefore,evidenceAfter).filledCards,0,'reference freshness at date boundary is not newly acquired missing data');
assert.equal(compare(evidenceBefore,evidenceAfter).referenceEvidenceRecovered.buybackExitEvidence,1);
const pop = { setCode: "SV9", cardNo: "126", cardName: "Clefairy", sourceUrl: "https://www.psacard.com/pop/tcg-cards/2025/verified/292980", fetchedAt: "2026-10-05T00:00:00Z", psa10Count: 100, psaTotal: 120 };
assert.equal(merge([], [pop], now).audit.added, 1);
assert.equal(merge([pop], [{ ...pop, fetchedAt: "2026-10-04" }], now).rows[0].fetchedAt, pop.fetchedAt);
assert.equal(merge([], [{ ...pop, psa10Count: 121 }], now).audit.rejected, 1);
assert.deepEqual(psaIdentity({ name: "ピカチュウ [323 S-P]" }), { setCode: "S-P", cardNumber: "323" });
assert.deepEqual(psaIdentity({ name: "ルザミーネ [SM4+ 120/114]" }), { setCode: "SM4+", cardNumber: "120" });
const q = makeQueue({ cards: [{ id: "promo", name: "ピカチュウ [323 S-P]" }], population: {}, buybacks: {}, setDates: {}, setUrls: [{ setCode: "S-P", url: "a" }, { setCode: "S-P", url: "b" }], analysisIds: new Set(), now: new Date(now).toISOString() });
assert.equal(q.rows[0].status, "ambiguous"); assert.equal(q.rows[0].sourceSetUrl, null);
const published = JSON.parse(fs.readFileSync("data/completion-outcomes.json", "utf8"));
const status = JSON.parse(fs.readFileSync("data/update-status.json", "utf8"));
const completion = JSON.parse(fs.readFileSync("data/card-catalog-completion.json", "utf8"));
const savedMonitor = require('./source_monitor.js').build(process.cwd(), status.sources || {}, status.unifiedMonitor || {}, Date.now(), { savedOutcomes: true });
assert.deepEqual(savedMonitor.outcomes, published, 'read-only monitoring must preserve saved acquisition deltas');
assert.deepEqual(status.unifiedMonitor.outcomes, published, "screen and downloadable audit must have identical counts");
assert.equal(published.counts.listed, completion.summary.total);
assert.equal(published.counts.analyzable, completion.summary.analyzable);
assert.equal(published.domesticPsa9IndividualCards, 0, "overseas PSA9 is not domestic completed acquisition");
if(require('./overseas_access_policy').cancelled(process.cwd()))assert.equal(published.sources.pokedata,undefined,'cancelled scope is not an active completion source');
else assert.equal(published.sources.pokedata.valid, published.overseasAcquisition.usablePsa10MedianCards);
assert(!JSON.stringify(published).match(/NaN|Infinity/));
console.log("completion routes, same-cause hold, outcome deltas, saved PSA recovery, promo ambiguity: passed");
