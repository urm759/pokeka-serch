const assert=require('node:assert/strict'),fs=require('node:fs');
const model=require('../current-market-model'),decision=require('../decision-model');
const now=Date.parse('2026-10-12T00:00:00Z'),at=new Date(now).toISOString();
const input={now,marketUpdatedAt:at,fee:10980,extraCost:210,feeRate:8,lockDays:147,exitPolicy:'marketplace',
  assumptions:{hitRate:.8,lowerGradePrice:12000},card:{psa10:33000,overallAssessment:{score:70},
    psa9Audit:{value:12000,estimated:false,measurementType:'aggregate'},currentStoreOffer:{value:10000,available:true,fresh:true,updatedAt:at}}};
assert(model.evaluate(input,decision).reasons.includes('PSA9価格の確認日時不足'));
const reference=model.evaluateReference(input,decision);
assert.equal(reference.calculationState,'reference');assert(reference.economics);assert.equal(reference.psa9UpdatedAt,null);
assert(reference.warnings.includes('参考値・PSA9日時未確認'));
const fresh={...input,card:{...input.card,psa9Audit:{...input.card.psa9Audit,updatedAt:at}}};
assert.equal(model.evaluateReference(fresh,decision).calculationState,'calculated');
assert.deepEqual(model.evaluateReference(fresh,decision).economics,model.evaluate(fresh,decision).economics);
for (const audit of [{value:null,estimated:true},{value:12000,estimated:true},{value:12000,estimated:false,specificationMismatch:true},{value:12000,estimated:false,country:'us'},{value:12000,estimated:false,updatedAt:'2026-08-01'}]) {
  assert.equal(model.evaluateReference({...input,card:{...input.card,psa9Audit:audit}},decision).calculationState,'unavailable');
}
for (const problem of [{dataQuality:{manualReview:true}},{priceAggregation:{conflicted:true}},{psa10Audit:{confidence:'低',measured:true}},{priceAggregation:{confidence:'低'},dataQuality:{trustedPriceCount:0}}]) {
  assert.equal(model.evaluateReference({...input,card:{...input.card,...problem}},decision).calculationState,'unavailable');
}
const thin=model.evaluateReference({...input,card:{...input.card,psa10Audit:{confidence:'低',measured:false,includedCount:1}}},decision);
assert.equal(thin.calculationState,'reference');assert(thin.referenceReasons.includes('PSA10集計の取引件数・期間充足不足'));
assert.equal(model.evaluateReference({...input,exitPolicy:'both',buybackExit:{usable:false}},decision).economics,null,'no marketplace fallback');
for (const exit of [{usable:true,storeCount:1,scenarios:{current:{expectedSale:20000,netPsa10:30000}}},{usable:true,storeCount:2,scenarios:{current:{}}},{usable:true,storeCount:2,scenarios:{current:{expectedSale:Infinity,netPsa10:30000}}}]) {
  assert.equal(model.evaluateReference({...input,exitPolicy:'both',buybackExit:exit},decision).calculationState,'unavailable');
}
const stale=model.evaluateReference({...input,card:{...input.card,currentStoreOffer:{...input.card.currentStoreOffer,updatedAt:'2026-08-01'}}},decision);
assert.equal(stale.purchasePrice,null);assert.equal(stale.economics,null);
const retained=require('./retained_price_observation').retainedPriceObservations;
assert.equal(retained({},{snkPsa9Price:12000},at).psa9ObservedAt,null,'file-level date never fills PSA9 confirmation');
assert.equal(retained({snkPsa9Price:12000},{},null,at).psa9ObservedAt,at);
assert.equal(retained({},{snkPsa9Price:12000,psa9ObservedAt:'2026-09-01'},at).psa9ObservedAt,'2026-09-01');
const evidence=require('./efficiency_evidence_queue'),routes=require('./completion_routes');
assert(!evidence.requirements({snkPsa9Price:12000},null,now).psa9Evidence.ready);
assert(evidence.requirements({snkPsa9Price:12000,psa9ObservedAt:at},null,now).psa9Evidence.ready);
assert.equal(routes.ROUTES.psa9Evidence[0],'toreca');assert.equal(routes.ROUTES.buybackExitEvidence[0],'shopBuyback');
assert.equal(routes.itemState({e:[0,1]},'psa9Evidence').status,'定期再確認');
assert.equal(routes.itemState({e:[0,1]},'buybackExitEvidence').status,'取得済み');
const outcome=require('./audit_completion_outcomes');
assert.deepEqual(outcome.unpack({packed:true,rows:{test:[1,1<<4,0,0,0,0,0,0]}}).rows.test.fields,['psaOfficial'],'new routes do not shift historical bit masks');
const old={rows:{test:{analysis:true,fields:[],sources:{}}}},next={rows:{test:{analysis:true,fields:['psa9Evidence'],sources:{}}}};
assert.equal(outcome.compare(old,next).filledItems,0,'adding a tracking field is not data completion');
assert.deepEqual(outcome.unpack(outcome.pack(next)).rows.test.fields,['psa9Evidence']);
const app=fs.readFileSync('app.js','utf8'),index=fs.readFileSync('index.html','utf8');
assert(index.includes('id="efficiencyIncludeReferenceInput"'));
assert(app.includes('currentMarketView(card,true)'));assert(app.includes('effRef'));
assert(app.includes('単体資金効率・計算区分'),'CSV includes reference state');
console.log('Efficiency reference / strict GO separation, dates, identity, no fallback and completion routes PASS');
