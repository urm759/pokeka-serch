const assert=require('node:assert/strict'),{reconcile}=require('./reconcile_saved_buyback_items');
const cards=[{id:'style',name:'イーブイ AR仕様 [MC 755/742]',model:'755/742',setCode:'MC',language:'ja',identityKey:'test'}];
const raw={shopItemId:'item',name:'イーブイ 755/742',number:'755/742',price:31000,active:true,grade:'PSA10',currency:'JPY',strictIdentity:true,conditionsConfirmed:true,observedAt:'2026-10-25T16:35:59.106Z'};
const r=reconcile([], [raw],cards);assert.equal(r.recovered.length,1);assert.equal(r.matched[0].observedAt,raw.observedAt);assert.equal(r.matched[0].price,raw.price);assert.equal(r.matched[0].score,100);
const history={dates:['2026-10-26'],shops:{}};require('./buyback_listing_refresh').refresh(history,{shop:{id:'source'},savedReplay:true,matched:r.matched},'2026-10-27');assert.equal(history.shops.source.style[0],31000);
for(const changed of [{grade:'PSA9'},{currency:'USD'},{quarantined:true},{conditionsConfirmed:false},{observedAt:null},{name:'英語版 イーブイ 755/742'}])assert.equal(reconcile([],[{...raw,...changed}],cards).recovered.length,0);
assert.equal(reconcile(r.matched,[raw],cards).recovered.length,0);assert.equal(reconcile([],[raw],[...cards,{...cards[0],id:'ambiguous'}]).recovered.length,0);
console.log('saved unmatched replay passed: identity, timestamp, grade, quarantine, duplicate and ambiguity');

const {mergeBuybackHistory}=require('./reconcile_saved_source_merge');
const base={dates:['2026-10-24'],shops:{s:{c:[100]}}},local={dates:['2026-10-24','2026-10-25'],shops:{s:{c:[100,120]}}},scheduled={dates:['2026-10-24','2026-10-25','2026-10-26'],shops:{s:{c:[100,null,130]}}};
assert.deepEqual(mergeBuybackHistory(base,local,scheduled).shops.s.c,[100,120,130]);
assert.throws(()=>mergeBuybackHistory(base,local,{...scheduled,shops:{s:{c:[100,110,130]}}}),/require review/);
console.log('calendar-aligned source merge passed');
