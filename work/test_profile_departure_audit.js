const assert=require('node:assert/strict');
const {inspect,summarize,metadata}=require('./profile_departure_audit');
const meta={settingsHash:'settings',codeHash:'code',at:'2026-10-16T00:00:00Z'};
const context={before:meta,after:meta};
const before={purchase:{price:10000,available:true,fresh:true},sourceQuotes:{shop:{price:10000,stock:1,priceObservedAt:'2026-10-14T00:00:00Z'}},
  psa9:{price:20000,ratio:50},efficiency:{annual:30},exclusions:[]};
const expired={...before,purchase:null,psa9:{price:20000,ratio:null},efficiency:{annual:null,blockingReasons:['期限超過・再確認待ち']},exclusions:['資金効率算出不可','PSA9比率算出不可']};
const time=inspect(before,expired,context);
assert(time.temporalOnly);assert(time.roots.some(r=>r.code==='expired-price'));
assert.equal(time.derived.length,2);assert.deepEqual(time.repair.fields,['shopStateA']);
assert(!inspect(before,expired,{}).comparable,'old missing metadata cannot prove the cause');
assert(!inspect(before,{...expired,sourceQuotes:{shop:{price:9000,stock:1}}},context).temporalOnly,'new input is not time only');
assert(inspect(before,{...expired,sourceQuotes:{shop:{price:10000,stock:1,sourceFailure:'HTTP 403'}}},context).roots.some(r=>r.code==='acquisition-failure'));
const held=inspect(before,{...expired,specificationHeld:true,priceReview:{conflicted:true}},context);
assert(held.repair.held);assert.deepEqual(held.repair.fields,[]);assert.equal(held.repair.automaticReviewRelease,false);
assert(held.roots.some(r=>r.code==='identity-or-specification-hold'));assert(held.roots.some(r=>r.code==='price-conflict-or-evidence-hold'));
const numericRatio=inspect(before,{...expired,specificationHeld:true,psa9:{price:20000,ratio:50},exclusions:['国内PSA9比率']},context);
assert(numericRatio.directFailures.includes('国内PSA9比率'));assert(!numericRatio.derived.some(r=>r.reason==='国内PSA9比率'),'a known ratio must not be labelled unavailable because a different gate is held');
assert(inspect(before,{...expired,priceReview:{manualReview:true},dataQuality:{manualReviewReasons:['未知の要確認']}},context).repair.held);
assert(!inspect(before,{...expired,priceReview:{manualReview:true},dataQuality:{manualReviewReasons:['古値だけの価格乖離・再確認待ち']}},context).repair.held);
assert(inspect(before,{...expired,priceReview:{manualReview:true},dataQuality:{manualReviewReasons:['PSA10買取価格が複数グループに分かれて対立']}},context).repair.held);
assert(!inspect(before,{...expired,exclusions:['単体資金効率算出不可・価格対立・誤紐付け・手動確認']},context).roots.some(r=>r.code==='identity-or-specification-hold'),
  'a generic list of possible failures is not proof of a specification mismatch');
const stock=inspect(before,{...before,purchase:null,sourceQuotes:{shop:{price:10000,stock:0,available:false,inventoryObservedAt:meta.at}},exclusions:['在庫なし']},context);
assert(stock.roots.some(r=>r.code==='out-of-stock'));assert.deepEqual(stock.repair.fields,[]);
assert(!inspect(before,{...before,purchase:null,sourceQuotes:{shop:{stock:0,inventoryObservedAt:'2026-09-01T00:00:00Z'}}},context).roots.some(r=>r.code==='out-of-stock'),'old stock cannot establish a current stock-out');
const missing=inspect(before,{...before,purchase:null,sourceQuotes:{},efficiency:{blockingReasons:['買取出口データ不足','PSA9価格の確認日時不足']},exclusions:['資金効率算出不可']},context);
assert(missing.repair.fields.includes('buybackExitEvidence'));assert(missing.repair.fields.includes('psa9Evidence'));
const changed=inspect(before,expired,{before:meta,after:{settingsHash:'new',codeHash:'new'}});
assert(changed.settingsChanged&&changed.codeChanged&&!changed.temporalOnly);
const previousMissing=inspect({...before,exclusions:['以前からの不足']},{...expired,exclusions:['以前からの不足','資金効率算出不可']},context);
assert.deepEqual(previousMissing.existingFailures,['以前からの不足']);assert.deepEqual(previousMissing.newFailures,['資金効率算出不可']);
assert.equal(summarize([{id:'x',departureAudit:held},{id:'x',departureAudit:time}]).uniqueDeparted,1);
assert.equal(summarize([{id:'x',departureAudit:held},{id:'x',departureAudit:held}]).overlappingRootCounts['price-conflict-or-evidence-hold'],1);
assert.notEqual(metadata({urlHash:'a',parameters:{}},'c','date').settingsHash,metadata({urlHash:'b',parameters:{}},'c','date').settingsHash);
const routes=require('./profile_completion_routes');
assert.equal(routes.prospectPlan({priceAggregation:{conflicted:true,comparison:{conflicted:false},included:[{url:'https://www.hareruya2.com/products/x',updatedAt:'2026-01-01T00:00:00Z'}]}},['referenceMedian']).requirements[0].automatic,true,
  'a stale legacy cluster must not override the shared fresh comparison decision');
assert.equal(routes.prospectPlan({priceAggregation:{conflicted:false,comparison:{conflicted:true},included:[{url:'https://www.hareruya2.com/products/x'}]}},['referenceMedian']).requirements[0].automatic,false);
const {independentCandidates,profileDelta}=require('./search_profile_cycle');
const seeds=require('./profile_departure_audit').historySeeds([
  {recordedAt:'2026-10-14',profiles:[{id:'A',lost:['x','y'],lostReasons:[{id:'x',before}]}]},
  {recordedAt:'2026-10-15',profiles:[{id:'A',gained:['y']}]}]);
assert.deepEqual(seeds.map(r=>r.id),['x']);assert.equal(seeds[0].beforeMeta,null,'old missing metadata must not be invented');
assert.deepEqual(independentCandidates([['a'],['b']],[['a','b'],[]]).gained,[],'movement between profiles is not an independent candidate');
const codeReturn=profileDelta({ids:[],rows:[],evidenceMeta:{codeHash:'old'}},{id:'A',ids:['x'],routes:{},evidenceMeta:{codeHash:'new'}},{},{});
assert.deepEqual(codeReturn.firstQualified,[]);assert.deepEqual(codeReturn.codeOrAggregationReturns,['x']);
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'profile-recovery-'));
const write=(f,v)=>{const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v));};
const cards=['returning','ordinary1','ordinary2'].map(id=>({id,name:id,hareruya2Url:'https://www.hareruya2.com/products/'+id}));
write('data/pokemon-cards.json',cards);
write('work/search-profile-targets.json',{freshnessRecovery:[{id:'returning',profile:'A'}]});
const queue=require('./priority_price_queue').load('hareruya2',root,Date.parse('2026-10-16T00:00:00Z'));
assert(queue.queue.some(r=>r.card.id==='returning'&&r.important));assert(queue.queue.some(r=>r.card.id==='ordinary1'&&!r.important));
write('work/candidate-shop-refresh.json',{checkpoints:{hareruya2:{manualWait:{returning:{url:cards[0].hareruya2Url}}}}});
assert(!require('./priority_price_queue').load('hareruya2',root).queue.some(r=>r.card.id==='returning'),'recovery cannot override a held URL');
for(const file of ['daily-fast-update.yml','priority-price-refresh.yml','safe-checkpoint-backfill.yml','refresh-all-site-data.yml','update-pokemon-site.yml','watch-data-health.yml','backfill-data.yml'])
  assert(fs.readFileSync(path.join(__dirname,'../.github/workflows',file),'utf8').includes('node work/test_profile_departure_audit.js'));
console.log('PASS departure roots vs derivatives, temporal expiry, source failures, stock, field routing, settings/code, overlap and shared review holds');
