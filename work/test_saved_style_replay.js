const assert=require('node:assert/strict'),{refresh}=require('./buyback_listing_refresh'),{capture}=require('./build_buyback_observation_summary');
const at='2026-10-24T16:08:16.000Z',day='2026-10-25';
const item={cardId:'x',verifiedCardId:'x',identityEvidence:{catalogIdentity:'spec'},score:100,observedAt:at,active:true,price:10000};
const history=()=>({dates:['2026-10-24',day,'2026-10-26'],shops:{s:{}},observedByShop:{s:[day]}});
const result=i=>({shop:{id:'s'},savedReplay:true,items:[i],matched:[i],unmatched:[]});
let h=history();refresh(h,result(item),'2026-10-26');assert.deepEqual(h.shops.s.x,[null,10000,null]);
refresh(h,result({...item,price:12000}),'2026-10-26');assert.equal(h.shops.s.x[1],10000,'no replacement of conflicting saved value');
for(const change of [{observedAt:null},{verifiedCardId:null},{score:undefined},{quarantined:true},{identityEvidence:null},{observedAt:'2026-10-20'}]){
  h=history();refresh(h,result({...item,...change}),'2026-10-26');assert.deepEqual(h.shops.s,{},'missing proof is not a new observation');
}
const card={id:'x',name:'イーブイ AR仕様 [MC 755/742]',model:'755/742',language:'ja',setCode:'MC',identityKey:'spec'};
const raw={name:'イーブイ 755/742',number:'755/742',cardId:'x',active:true,price:10000,observedAt:at};
const source={shops:{s:{refreshed:false,lastAttempt:at,lastSuccess:at}},cards:{x:{shops:{s:{price:10000,priceDate:day,listingActive:true,matchConfidence:'high'}}}}};
const recovered=capture({shops:{}},{updatedAt:'2026-10-26',shops:{s:[raw]}},source,[card]);
assert.equal(recovered.saved.shops.s.x[day].observedAt,at,'JSON regeneration date and daily skip cannot discard saved individual proof');
assert.deepEqual(Object.keys(recovered.saved.shops.s.x),[day]);
console.log('PASS saved style replay: actual past day only, no replay-day invention, conflict/identity/score guards, skipped-source capture');
