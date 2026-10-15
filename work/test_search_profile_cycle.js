const assert=require('node:assert/strict'),{profileDelta}=require('./search_profile_cycle');
const before={ids:['old','leaving'],seenQualified:['returned'],rows:[{id:'pending',unverifiedProspect:true}]};
const after={id:'A',ids:['old','pending','returned','new'],prospects:2,routes:{psaOfficial:[{id:'x'},{id:'x'}]},allExclusions:{leaving:['購入価格・期限超過']}};
const record=(fields=[],analysis=false,sources={})=>({fields,analysis,sources});
const b={old:record(),leaving:record(),pending:record(['price'],false,{psaOfficial:{linked:false}}),returned:record([],false,{hareruya2:{fresh:false}})};
const a={old:record(),leaving:record(),pending:record(['price','psaOfficial','buybackExitEvidence'],true,{psaOfficial:{linked:true}}),returned:record([],false,{hareruya2:{fresh:true,valid:true}}),new:record()};
const delta=profileDelta(before,after,b,a);
assert.equal(delta.newListed,1);assert.equal(delta.filledCards,1);assert.deepEqual(delta.completed[0].fields,['psaOfficial']);assert.equal(delta.completed[0].newlyAnalyzable,true);
assert.deepEqual(delta.firstQualified,['pending','new'],'known historical candidate returning is not first qualification');assert.deepEqual(delta.freshnessRestored,['returned']);assert.equal(delta.newLinked.length,1);assert.deepEqual(delta.lost,['leaving']);assert.equal(delta.routePending.psaOfficial,1);
assert(delta.lostReasons[0].reasons.includes('購入価格・期限超過'));
const priceOnly=profileDelta({...before,rows:[{id:'pending',unverifiedProspect:true,missing:['shopStateA'],buy:null}]},
  {...after,inspectedRows:{pending:{purchaseConfirmed:true}}},b,b);
assert.deepEqual(priceOnly.purchaseFilled,['pending'],'new fresh in-stock price is completed even when a reference field was previously acquired');
assert.equal(priceOnly.profileFilledCards,1);
const medianOnly=profileDelta({...before,rows:[{id:'pending',unverifiedProspect:true,missing:['referenceMedian'],buy:null}]},
  {...after,inspectedRows:{pending:{buy:10000,purchaseConfirmed:false}}},b,b);
assert.deepEqual(medianOnly.medianEvidenceRecovered,['pending']);assert.deepEqual(medianOnly.purchaseFilled,[],'reference recovery is not an actual purchasable price');
const freshFirst=profileDelta({ids:[],seenQualified:[],rows:[]},{...after,ids:['new']},
  {new:record([],false,{torecacamp:{fresh:false}})},{new:record([],false,{torecacamp:{fresh:true,valid:true}})});
assert.deepEqual(freshFirst.firstQualified,['new']);assert.deepEqual(freshFirst.freshnessRestored,[],'first ever qualification is not a historical candidate return');
const {eligibleForHareru}=require('./consume_completion_queue');
const pending=[{card:{id:'url-found',hareruya2Url:'https://www.hareruya2.com/products/fixture'},detail:{i:{shopStateA:'取得済み'}}}];
assert.equal(eligibleForHareru(pending,[],Date.now(),new Set(['url-found'])).length,1,'new exact URL must reach real price acquisition even when a reference field was already present');
assert.equal(eligibleForHareru(pending,[{cardId:'url-found',price:100,observedAt:new Date().toISOString()}],Date.now(),new Set(['url-found'])).length,0,'fresh saved purchase price keeps the existing cooldown');
assert.equal(eligibleForHareru(pending,[],Date.now(),new Set(['url-found']),{manualWait:{'url-found':{url:pending[0].card.hareruya2Url}}}).length,0,'manual-held URL is not repeatedly dispatched');
assert.equal(eligibleForHareru(pending,[],Date.now(),new Set(['url-found']),{sourceBlocked:'HTTP 403'}).length,0);
assert.equal(eligibleForHareru(pending,[],Date.now(),new Set(['url-found']),{jobs:{'url-found':{url:pending[0].card.hareruya2Url,nextRetryAt:new Date(Date.now()+3600000).toISOString()}}}).length,0);
console.log('PASS fixed search-profile cycle: actual fields, new listing, first qualification, returning freshness, reasons and overlapping route counts');
