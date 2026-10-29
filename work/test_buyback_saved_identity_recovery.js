const assert=require('node:assert/strict');
const {canonicalIdentity}=require('./card_identity');
const {number}=require('./cardshop151');
const {resolveSavedItem,capture,aggregate}=require('./build_buyback_observation_summary');

// Self-contained saved-source fixtures: no build/recover, production writes or fetches.
const card=(id,name,model,setCode,extra={})=>{
  const c={id,name,model,setCode,language:'ja',identityReviewRequired:false,...extra};
  return {...c,identityKey:canonicalIdentity(c).key};
};
const mew=card('pk-43864','ミュウex SAR[SV2a 205/165](強化拡張パック「ポケモンカード151」)','205/165','SV2A');
const eevee=card('x-122054','イーブイ: プロモ [SV-P 062](「YU NAGABA×ポケモンカードゲーム」プロモーションカード「SV-P」)','SV-P 062','SVP');
const foreign=card('foreign','ミュウex HR [MEW EN 205/165]【英語版】(151)','205/165','MEW',{language:'en'});
const metal=card('foreign-metal',foreign.name+' メタルカード','205/165','MEW',{language:'en',variant:'metal'});
const cards=[mew,eevee,foreign,metal];
const index=list=>{
  const result=new Map();
  for(const c of list){const key=number(c.model||c.name);if(!result.has(key))result.set(key,[]);result.get(key).push(c);}
  return result;
};
const match=(name,list=cards,extra={})=>resolveSavedItem({name,...extra},list);
const held=(name,list=cards,extra={})=>assert.equal(match(name,list,extra).cardId,undefined,name);
const titles=[
  [mew,'ミュウex SAR [SV2a 205/165]'],
  [mew,'ミュウex SAR 205/165'],
  [mew,'ミュウex SAR(151) 205/165'],
  [eevee,'イーブイ(NAGABA)  [SV-P 062/SV-P]'],
  [eevee,'イーブイ(YU NAGABA) P 062/SV-P'],
  [eevee,'イーブイ 062/SV-P [SV-P]'],
  [eevee,'イーブイ(YU NAGABA) 062/SV-P'],
  [eevee,'イーブイ: プロモ [SV-P 062]'],
  [eevee,'イーブイ PROMO [SV 062/SV-P]'],
  [eevee,'イーブイ PR 062/SV-P'],
  [eevee,'イーブイ Ｐ ０６２／ＳＶ－Ｐ'],
];
for(const [c,name] of titles){
  assert.equal(match(name).cardId,c.id,name);
  assert.equal(resolveSavedItem({name},cards,index(cards)).cardId,c.id,'indexed and full scans agree');
}
assert.equal(match(titles[0][1]).evidence.sourceSetExplicit,true);
assert.equal(match(titles[1][1]).evidence.sourceSetExplicit,false);
assert.equal(match(titles[0][1]).evidence.sourceRarityExplicit,true);
assert.equal(match(titles[3][1]).evidence.name,titles[3][1],'source evidence retains the original label');

// The target ID, a cached confidence, and catalogue order never break a tie.
const duplicate={...mew,id:'duplicate'};
held(titles[0][1],[...cards,duplicate],{cardId:mew.id,verifiedCardId:mew.id,matchConfidence:'high'});
held(titles[0][1],[duplicate,...cards]);
held(titles[3][1],[...cards,{...eevee,id:'promo-duplicate'}]);
const otherSet=card('other-set','ミュウex SAR [SV9 205/165]','205/165','SV9');
const labelledPromo=card('labelled-promo',eevee.name.replace(': プロモ [',': プロモ P ['),eevee.model,eevee.setCode);
assert.equal(match('イーブイ P 062/SV-P',[labelledPromo]).cardId,labelledPromo.id,'canonical promo label followed by P is not part of the card name');
assert.equal(match('イーブイ PROMO [SV-P 062]',[labelledPromo]).cardId,labelledPromo.id);
held('イーブイ P 063/SV-P',[labelledPromo]);
held('イーブイ 英語版 P 062/SV-P',[labelledPromo]);
held('イーブイ ミラー P 062/SV-P',[labelledPromo]);
held('イーブイ P 062/SV-P',[labelledPromo,{...labelledPromo,id:'same-print-duplicate'}]);
held(titles[1][1],[mew,otherSet]);
assert.equal(match(titles[0][1],[mew,otherSet]).cardId,mew.id);
const otherPrint=card('other-print','ミュウex SAR [SV2a 205/166]','205/166','SV2A');
assert.equal(match(titles[0][1],[mew,otherPrint]).cardId,mew.id,'full denominator is decisive');
held('ミュウex SAR [SV2a 205]',[mew,otherPrint]);
held('イーブイ 062',[eevee]);
held('イーブイ 062/S-P',[eevee]);
held('イーブイ(YU NAGABA) P 063/SV-P',[eevee]);
held('イーブイ(別配布) P 062/SV-P',[eevee]);
held('ミュウex SAR(別仕様) 205/165',[mew]);
const reprint=card('different-distribution','イーブイ: プロモ [SV-P 062](別配布)','SV-P 062','SVP');
held('イーブイ 062/SV-P',[eevee,reprint]);
assert.equal(match('イーブイ(YU NAGABA) 062/SV-P',[eevee,reprint]).cardId,eevee.id,'distribution annotation must be present in the actual label');
const olderPromo=card('older-promo','イーブイ: YU NAGABAプロモ[SV-P 062/SV-P]','062/SV-P','062SVP');
assert.equal(match('イーブイ(YU NAGABA) 062/SV-P',[olderPromo]).cardId,olderPromo.id,'full promo print also proves a legacy derived setCode');
held('イーブイ(YU NAGABA) 062/SV-P',[eevee,olderPromo]);
held('イーブイ 062/SV-P',[{...olderPromo,setCode:'063SVP'}]);
assert.equal(match('イーブイ 062/SV-P',[{...eevee,variant:'promo'}]).cardId,eevee.id,'promo is a distribution class, not a physical finish');
for(const name of ['ミュウex HR 205/165','ミュウex 英語 SAR 205/165','ミュウex SAR [SV3 205/165]',
  'ミュウex SAR [SV2a 205/165] 205/166','ミュウex SAR 1205/165','ミュウex SAR 205/1650',
  'ミュウex メタルカード SAR 205/165','ミュウex マスターボールミラー SAR 205/165'])held(name);
for(const extra of [{number:'205/166'},{number:'205'},{setCode:'SV3'},{rarity:'HR'},{language:'en'}])held(titles[0][1],cards,extra);
held(titles[0][1],[{...mew,language:'en'}]);
held(titles[0][1],[{...mew,name:mew.name+' 英語版'}]);
held(titles[0][1],[{...mew,identityReviewRequired:true}]);
held(titles[0][1],[{...mew,model:'205/166'}]);
held(titles[0][1],[{...mew,setCode:'SV3'}]);
held(titles[0][1],[{...mew,rarity:'HR'}]);
held(titles[0][1],[{...mew,variant:'metal'}]);
held(titles[0][1],[mew,{...mew,id:'unproven-finish',variant:'metal'}]);
const japaneseMetal=card('ja-metal','ミュウex メタルカード SAR [SV2a 205/165]','205/165','SV2A',{variant:'metal'});
assert.equal(match('ミュウex メタルカード SAR 205/165',[mew,japaneseMetal]).cardId,japaneseMetal.id);
const mirror=card('mirror','ミュウex マスターボールミラー SAR [SV2a 205/165]','205/165','SV2A',{variant:'master-ball-mirror'});
assert.equal(match('ミュウex マスターボールミラー SAR 205/165',[mew,mirror]).cardId,mirror.id);

// Existing SA omission is restricted to unique secret SR/SSR; SRC needs a set.
const glaceon=card('sa','グレイシアV SR [S6a 077/069]','077/069','S6A',{rarity:'SR'});
const sa='グレイシアV(SA) SR 077/069';
assert.equal(match(sa,[glaceon]).method,'unique-secret-number-name-ja-sa-label-omitted');
held(sa,[glaceon,{...glaceon,id:'second-art'}]);
held(sa,[{...glaceon,name:glaceon.name.replace('SR','RR'),rarity:'RR'}]);
held('グレイシアV(SA) SR 007/069',[{...glaceon,model:'007/069',name:'グレイシアV SR [S6a 007/069]'}]);
held(sa,[{...glaceon,name:glaceon.name+' ミラー'}]);
const src='グレイシアV SRC [S6a 077/069]';
assert.equal(match(src,[glaceon]).method,'explicit-set-number-name-spec-ja-source-label');
const blue=card('metal-set-name','ブルーの探索 SR[SM9b 061/054](強化拡張パック「フルメタルウォール」)','061/054','SM9B');
assert.equal(match('ブルーの探索 SRC [SM9b 061/054]',[blue]).cardId,blue.id,'a set title containing metal is not a metal finish');
for(const name of ['グレイシアV SRC 077/069','グレイシアV SRC [S7R 077/069]','ニンフィアV SRC [S6a 077/069]',
  'グレイシアV 英語 SRC [S6a 077/069]','グレイシアV マスターボールミラー SRC [S6a 077/069]'])held(name,[glaceon]);
held(src,[glaceon,{...glaceon,id:'second-src'}]);

// Rematching is insufficient without a successful, matching original quote.
const at='2026-10-13T03:04:05.000Z',date='2026-10-13',price=30000;
const fixture=(c,name)=>({
  catalog:{updatedAt:date,shops:{shop:[{cardId:c.id,name,price,active:true,observedAt:at}]}},
  source:{shops:{shop:{refreshed:true,lastAttempt:at,lastSuccess:at,url:'https://example.invalid/buyback'}},
    cards:{[c.id]:{shops:{shop:{price,priceDate:date,listingActive:true,matchConfidence:'high'}}}}},
});
const run=(f,list=cards,saved=null)=>capture(saved,f.catalog,f.source,list);
for(const [c,name] of titles){
  const f=fixture(c,name),before=structuredClone(f),result=run(f);
  assert.equal(result.audit.accepted,1,name);
  const record=result.saved.shops.shop[c.id][date];
  assert.equal(record.observedAt,at);assert.equal(record.priceDate,date);assert.equal(record.title,name);
  assert.equal(record.identity,c.identityKey);assert.equal(record.timestampBasis,'individual-fetch');
  assert.deepEqual(f,before,'input source evidence stays unchanged');
  assert.deepEqual(run(f,cards,result.saved).saved,result.saved,'same-day replay is idempotent');
}
const mutations=[
  f=>delete f.source.shops.shop,
  f=>f.source.shops.shop.acquisitionPermission='pending',
  f=>f.source.shops.shop.acquisitionPermission='retired',
  f=>f.source.shops.shop.lastAttempt='2026-10-14T03:04:05Z',
  f=>f.source.shops.shop.lastSuccess=null,
  f=>delete f.source.cards[mew.id].shops.shop,
  f=>delete f.source.cards[mew.id].shops.shop.priceDate,
  f=>f.source.cards[mew.id].shops.shop.priceDate='2026-10-12',
  f=>f.source.cards[mew.id].shops.shop.price=price+1,
  f=>f.source.cards[mew.id].shops.shop.matchConfidence='medium',
  f=>f.source.cards[mew.id].shops.shop.listingActive=false,
  f=>f.source.cards[mew.id].shops.shop.quarantined=true,
  f=>f.catalog.shops.shop[0].active=false,
  f=>f.catalog.shops.shop[0].observedAt='2026-10-12T03:04:05Z',
  f=>f.catalog.shops.shop[0].observedAt='2026-10-13T03:06:06Z',
  f=>f.catalog.shops.shop[0].language='en',
  f=>f.catalog.shops.shop[0].currency='USD',
  f=>f.catalog.shops.shop[0].grade=9,
  f=>f.catalog.shops.shop[0].gradingCompany='CGC',
];
const good=run(fixture(mew,titles[0][1])).saved;
for(const mutate of mutations){
  const f=fixture(mew,titles[0][1]);mutate(f);
  const result=run(f,cards,good);
  assert.equal(result.audit.accepted,0,mutate.toString());
  assert.deepEqual(result.saved,good,'rejected evidence preserves saved proof');
}
const fallback=fixture(mew,titles[0][1]);delete fallback.catalog.shops.shop[0].observedAt;
const fallbackRecord=run(fallback).saved.shops.shop[mew.id][date];
assert.equal(fallbackRecord.observedAt,at,'only the matching original success record may supply a missing item time');
assert.equal(fallbackRecord.timestampBasis,'matching-successful-source-record');
const wrongId=fixture(mew,titles[0][1]);wrongId.catalog.shops.shop[0].name=titles[3][1];
assert.equal(run(wrongId).audit.accepted,0,'unique rematch must still agree with the original quote cardId');
const missingIdentity=run(fixture(mew,titles[0][1]),[{...mew,identityKey:null}]);
assert.equal(missingIdentity.audit.accepted,0);
for(const flag of [{campaign:true},{quantityLimited:true},{conditionsConfirmed:false}]){
  const f=fixture(mew,titles[0][1]);Object.assign(f.catalog.shops.shop[0],flag);
  const result=run(f);
  assert.equal(result.audit.accepted,1,'conditional source proof may be retained');
  assert.equal(aggregate(result.saved,f.source,cards,Date.parse(at)).cards[mew.id],undefined,'conditional offers remain excluded from means');
}
const revalidated=run(fixture(mew,titles[0][1]));
const heldPrice=revalidated.saved.shops.shop[mew.id][date].price;
revalidated.saved.shops.shop[mew.id][date].title='ミュウex 英語版 SAR 205/165';
assert.equal(aggregate(revalidated.saved,fixture(mew,titles[0][1]).source,cards,Date.parse(at)).cards[mew.id],undefined,
  'previously accepted history is revalidated by the common identity rules');
assert.equal(revalidated.saved.shops.shop[mew.id][date].price,heldPrice,'held original history remains intact');
assert.equal(revalidated.saved.shops.shop[mew.id][date].quarantined,true,'the same held history is excluded by downstream buyback-support consumers');
assert.equal(revalidated.saved.shops.shop[mew.id][date].observedAt,at,'quarantine never updates the original confirmation');
revalidated.saved.shops.shop[mew.id][date].title=titles[0][1];
assert(aggregate(revalidated.saved,fixture(mew,titles[0][1]).source,cards,Date.parse(at)).cards[mew.id],
  'only the known identity hold may clear after a verifiable same-print correction');
assert.equal(revalidated.saved.shops.shop[mew.id][date].quarantined,undefined);
Object.assign(revalidated.saved.shops.shop[mew.id][date],{quarantined:true,quarantineKind:'price-conflict'});
assert.equal(aggregate(revalidated.saved,fixture(mew,titles[0][1]).source,cards,Date.parse(at)).cards[mew.id],undefined,
  'an identity match cannot clear a separate price-conflict hold');
assert.equal(revalidated.saved.shops.shop[mew.id][date].quarantineKind,'price-conflict');
console.log('PASS saved buyback identity recovery: language, sets, full prints, rarity, finishes, promo evidence, unique mapping, SA/SRC and original source proof');
