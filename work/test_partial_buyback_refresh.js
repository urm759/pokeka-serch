const assert = require('node:assert/strict');
const { refresh, unavailable } = require('./buyback_listing_refresh');
const day='2026-10-23', at='2026-10-23T06:34:00Z';
const initial=()=>({dates:['2026-08-25',day],shops:{store:{absent:[130000,109000],seen:[9000,10000]}},observedByShop:{store:[day]}});
const item={cardId:'seen',price:8000,active:true,observedAt:at};
const result={shop:{id:'store'},items:[item],matched:[item]};
let h=initial(), links=refresh(h,result,day);
assert.deepEqual(h.shops.store.absent,[130000,109000], 'partial absence must not erase a confirmed same-day observation');
assert.equal(h.shops.store.seen[1],8000,'a real price decrease replaces the previous quote');
assert.equal(unavailable(result,links,'absent'),false);
h=initial(); links=refresh(h,{...result,fullListing:true},day);
assert.equal(h.shops.store.absent[1],null);
assert.equal(unavailable({...result,fullListing:true},links,'absent'),true);
const inactive={...item,active:false,price:0};
h=initial(); links=refresh(h,{...result,items:[inactive],matched:[inactive]},day);
assert.equal(h.shops.store.seen[1],null);
assert.equal(unavailable(result,links,'seen'),true,'explicit withdrawal is not hidden by old history');
h=initial(); const saved=JSON.stringify(h);
links=refresh(h,{...result,savedReplay:true},'2026-10-24');
assert.equal(JSON.stringify(h),saved,'replay cannot add an observation or change its timestamp');
assert.equal(links.get('seen').observedAt,at);
assert.equal(links.get('seen').date,day);
h=initial();links=refresh(h,{...result,matched:[item,{...inactive,price:20000}]},day);
assert.equal(links.get('seen').price,8000,'an inactive product does not mask another active offer');
h=initial();const uncertain={...result,fullListing:true,unmatched:[{shopItemId:'unknown'}]};
links=refresh(h,uncertain,day);
assert.equal(h.shops.store.absent[1],109000,'an unlinked product prevents proof of absence');
assert.equal(unavailable(uncertain,links,'absent'),false);
assert.equal(unavailable(uncertain,links,'absent',{listingActive:false}),true,'rebuild cannot resurrect a previously confirmed withdrawal');
assert.equal(unavailable(uncertain,links,'absent',{identityHeld:true}),true,'partial absence does not release a saved identity hold');
h=initial();const changed={...result,matched:[],items:[{shopItemId:'old-product'}],unmatched:[{shopItemId:'old-product',observedAt:at}]};
links=refresh(h,changed,day,[{shopItemId:'old-product',cardId:'absent'}]);
assert.equal(h.shops.store.absent[1],null,'a product observed with a changed/held identity does not retain its old link');
assert.equal(links.get('absent').identityHeld,true);
assert.equal(unavailable(changed,links,'absent'),true);
for (const shop of require('./update_shop_buybacks').SHOPS) {
  const history={dates:[day],shops:{[shop.id]:{absent:[109000],seen:[10000]}},observedByShop:{[shop.id]:[day]}};
  const sourceResult={shop,items:[item],matched:[item],fullListing:false};
  const linked=refresh(history,sourceResult,day);
  assert.equal(history.shops[shop.id].absent[0],109000,`${shop.id}: partial absence retains observed history`);
  assert.equal(history.shops[shop.id].seen[0],8000,`${shop.id}: observed price change is adopted`);
  assert.equal(unavailable(sourceResult,linked,'absent'),false);
}
console.log('PASS partial/full listings, actual price decline, explicit withdrawal, saved replay and duplicate products');

const unknown={...item,active:null,availabilityUnknown:true};h=initial();links=refresh(h,{...result,matched:[unknown],items:[unknown]},day);assert.equal(h.shops.store.seen[1],10000,'unknown quota retains original observation');assert(links.get('seen').availabilityHeld);assert(unavailable(result,links,'seen'));assert.equal(links.get('seen').active,null,'unknown is not a zero quota or withdrawal');
const parse=require('./update_shop_buybacks').parseTorecaBankItems;assert.equal(typeof parse,"function");{const li=(quota)=>'<li class="item" data-id="p" '+quota+'><p class="name">fixture</p><p class="tag">PSA10</p><p class="price">10000円</p></li>';assert.equal(parse(li(''))[0].active,null);assert.equal(parse(li('data-max="0"'))[0].active,false);assert.equal(parse(li('data-max="6"'))[0].active,true);}
h=initial();refresh(h,{...result,fullListing:true,matched:[unknown],items:[unknown]},day);assert.equal(h.shops.store.seen[1],10000,'a full page with unknown quota cannot erase a real observation');
