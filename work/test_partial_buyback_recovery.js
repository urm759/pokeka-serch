const assert=require('node:assert/strict');
const {recover}=require('./recover_partial_buyback_history');
const card={id:'sample',name:'ピカチュウ SR [SV1 001/100]',model:'001/100',setCode:'SV1',language:'ja',identityKey:'verified-spec'};
const at='2026-10-23T06:00:00Z',day='2026-10-23';
const quote={price:10000,observedAt:at,priceDate:day,listingActive:true,quarantined:false};
const item={cardId:card.id,shopItemId:'1',name:card.name,price:10000,active:true,score:100,observedAt:at};
const before={cards:[card],summary:{cards:{sample:{shops:{store:quote}}}},catalog:{shops:{store:[item]}},history:{dates:[day],shops:{store:{sample:[10000]}}}};
const initial=()=>({cards:[card],catalog:{shops:{store:[]}},unmatched:{shops:{store:[]}},history:{dates:[day],shops:{store:{sample:[null]}}},summary:{shops:{store:{lastSuccess:'2026-10-23T12:00:00Z',coverageComplete:false}},cards:{sample:{shops:{store:{...quote,priceDate:'2026-08-25',price:15000}}}}}});
let after=initial();assert.equal(recover(before,after).restoredCards,1);
assert.equal(after.history.shops.store.sample[0],10000);
assert.deepEqual(after.summary.cards.sample.shops.store,quote);
assert.equal(recover(before,after).restoredCards,0,'recovery is idempotent');
for(const change of [
  x=>x.summary.shops.store.coverageComplete=true,
  x=>x.summary.shops.store.fullListingConfirmedAt='2026-10-23T09:00:00Z',
  x=>x.summary.shops.store.reviewStatus='access-review',
  x=>x.catalog.shops.store.push({...item,active:false}),
  x=>x.unmatched.shops.store.push({shopItemId:'1'}),
  x=>x.cards=[{...card,identityKey:'different-spec'}],
  x=>x.summary.cards.sample.shops.store.quarantined=true,
  x=>x.summary.cards.sample.shops.store.listingActive=false,
  x=>x.history.shops.store.sample[0]=8000,
]){after=initial();change(after);assert.equal(recover(before,after).restoredCards,0);}
after=initial();delete after.history.shops.store.sample;assert.equal(recover(before,after).restoredCards,1);
console.log('PASS partial saved recovery proof, original timestamp, identity, complete/withdrawn/held evidence and idempotence');
