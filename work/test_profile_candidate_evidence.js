const assert=require('node:assert/strict'),{transition,cardFacts}=require('./profile_candidate_evidence');
const {priceOnlyRecovery}=require('./profile_candidate_evidence');
const {psaAuthenticationRequired,taskStageFields}=require('./source_observability');
assert(!psaAuthenticationRequired({sourceState:'PC認証済みChrome・手動実取得',lastError:null}));
assert(!psaAuthenticationRequired({sourceState:'login confirmed',lastError:null}));
assert(psaAuthenticationRequired({sourceState:'login required'}));
assert(psaAuthenticationRequired({lastError:'PSA HTTP 403'}));
assert(psaAuthenticationRequired({sourceState:'認証対応待ち'}));
assert(!psaAuthenticationRequired({lastError:'個別セットの表が見つからない'}));
assert.deepEqual(taskStageFields({syncStatus:'saved',syncError:null,publishStatus:'success',publishError:null}),
  {syncStatus:'saved',syncError:null,publishStatus:'success',publishError:null});
assert.equal(taskStageFields({}).publishStatus,null,'new acquisition must not inherit old publication failure');
assert(priceOnlyRecovery({efficiency:{blockingReasons:['期限超過・再確認待ち']}}));
assert(!priceOnlyRecovery({efficiency:{blockingReasons:['期限超過・再確認待ち','買取出口データ不足']}}));
assert(!priceOnlyRecovery({dataQuality:{manualReview:true},efficiency:{blockingReasons:['期限超過・再確認待ち']}}));
assert(!priceOnlyRecovery({efficiency:{blockingReasons:[]}}));
const b={ids:['kept','lost'],facts:{lost:{name:'fixture',metrics:{exclusions:['既存不足'],purchase:{price:1000}}}}};
const a={ids:['kept','added'],facts:{lost:{name:'fixture',metrics:{exclusions:['既存不足','価格条件'],purchase:{price:1500}}}}};
const p=transition(b,a);assert.deepEqual(p.lost,['lost']);assert.deepEqual(p.gained,['added']);assert.deepEqual(p.rows[0].newlyFailed,['価格条件']);assert.equal(p.rows[0].before.purchase.price,1000);
assert.equal(transition({ids:['lost'],facts:{}},a).rows[0].comparability,'前後の詳細記録不足・原因は未確定');
assert.deepEqual(transition({ids:['x'],facts:{x:{metrics:{decision:{reasons:['既存の期間不一致']}}}}},
  {ids:[],facts:{x:{metrics:{decision:{reasons:['既存の期間不一致','新規供給リスク未達']}}}}}).rows[0].newDecisionFailures,['新規供給リスク未達']);
const api={state:{hareruya2Stock:{x:{hareruya2Price:1000,observedAt:'2026-09-01T00:00:00Z'}},psaSpecificationHeld:{}},
  cardEfficiency:()=>({profit:0,roi:0,annual:0,purchasePrice:0}),purchasePsa9Ratio:()=>({ratio:0,psa9Price:1000}),presetQualifications:()=>({now:false}),cardSearchExclusions:()=>[]};
const facts=cardFacts(api,{id:'x',price:0,psa10:0,currentStoreOffer:{value:0,available:false,fresh:false}});
assert.equal(facts.purchase.price,0);assert.equal(facts.efficiency.annual,0);assert.equal(facts.psa9.ratio,0);assert.equal(facts.sourceQuotes.hareruya2.priceObservedAt,'2026-09-01T00:00:00Z');
assert.equal(cardFacts(api,{id:'y',price:null,psa10:null}).purchase,null);
console.log('PASS profile evidence: actual purchase, null vs zero, original timestamps, overlapping/new failures, unavailable comparison');
