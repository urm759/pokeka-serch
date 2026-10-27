const assert=require('node:assert/strict'),m=require('../purchase-ratio-model');
const at='2026-10-27T00:00:00Z';
const input={asOf:at,guide:{eligible:true,capState:'available',cap:10000},
  psa9:{value:12000,measurementType:'aggregate',estimated:false,updatedAt:at,source:'国内集計'},
  fee:2000,extraCost:500,saleFeeRate:10,exitPolicy:'marketplace',referenceOptions:{aggregate:true,estimate:false}};
const v=m.atGuide(input);
assert.equal(v.priceRatio,120);assert.equal(v.investment,12500);
assert.equal(v.profit,-1700);assert.equal(v.roi,-1700/12500*100);
assert.equal(m.guideExclusion(v,{above:true}),null);
const equal=m.atGuide({...input,psa9:{...input.psa9,value:10000}});
assert.equal(equal.priceRatio,100);assert(m.guideExclusion(equal,{above:true}));
assert.equal(m.guideExclusion(equal,{min:100}),null);
const low=m.atGuide({...input,psa9:{...input.psa9,value:8000}});
assert.equal(low.priceRatio,80);assert.equal(m.guideExclusion(low,{min:80}),null);
assert(m.guideExclusion(low,{min:80.00000001}));
assert.equal(m.guideExclusion(m.atGuide({}),{}),null,'inactive filters never remove missing cards');
for(const cap of [null,0,-1,NaN]){const x=m.atGuide({...input,guide:{...input.guide,cap}});assert.equal(x.priceRatio,null);assert.equal(x.roi,null);assert(m.guideExclusion(x,{min:0}));}
for(const value of [null,0,NaN])assert.equal(m.atGuide({...input,psa9:{...input.psa9,value}}).priceRatio,null);
const noReference=m.atGuide({...input,referenceOptions:{aggregate:false}});
assert.equal(noReference.roi,v.roi,'display remains a labelled reference');assert(m.guideExclusion(noReference,{min:0}));
assert(m.guideExclusion(v,{min:-1}));
for(const updatedAt of ['2026-09-01',null,'2026-10-28T00:00:00Z'])assert(m.guideExclusion(m.atGuide({...input,psa9:{...input.psa9,updatedAt}}),{min:0}));
assert.equal(m.atGuide({...input,exitPolicy:'buyback'}).roi,null);
assert.equal(m.atGuide({...input,exitPolicy:'both'}).roi,null,'no marketplace fallback');
const b={grade:'PSA9',identityConfirmed:true,country:'jp',currency:'JPY',fresh:true,observedAt:at,price:13000,deductionRate:5,travelCost:200};
const store=m.atGuide({...input,exitPolicy:'buyback',psa9Buyback:b});
assert.equal(store.investment,12700);assert.equal(store.profit,13000-650-12700);
assert.equal(store.sellingFee,0,'no marketplace fee on a buyback exit');
assert.equal(m.atGuide({...input,exitPolicy:'both',psa9Buyback:b}).exitLabel,'フリマ（国内PSA9）');
for(const change of [{grade:'PSA10'},{identityConfirmed:false},{observedAt:null},{observedAt:'2026-10-20'},{quarantined:true}])
  assert.equal(m.atGuide({...input,exitPolicy:'buyback',psa9Buyback:{...b,...change}}).roi,null);
const zero=m.atGuide({...input,psa9:{...input.psa9,value:12500},saleFeeRate:0});
assert.equal(zero.roi,0);assert.equal(zero.profit,0);
assert.equal(m.atGuide({...input,repairRequired:true,repairCost:null}).roi,null);
assert.equal(m.atGuide({...input,repairRequired:true,repairCost:1000}).investment,13500);
assert.equal(m.atGuide({...input,planProblem:'費用未確認'}).roi,null);
const circular=m.atGuide({...input,referenceOptions:{estimate:true},psa9:{...input.psa9,measurementType:'estimate',source:'平均美品価格の75%推定'}});
assert(m.guideExclusion(circular,{min:0}),'existing circular-estimate prohibition remains');
assert.equal(v.noGoEffect,true);
console.log('PASS PSA9/guide: strict vs inclusive bounds, zero/missing/stale, reference policy, costs once, grade-specific exits, repair holds');
