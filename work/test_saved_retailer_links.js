const assert=require('node:assert/strict'),{reconcile}=require('./reconcile_saved_retailer_links');
const card={id:'fixture',name:'ナゾノクサ C [SM10 001/095]',price:100,priceObservedAt:'2026-10-01T00:00:00Z'};
const row={name:'ナゾノクサ【C】{001/095} [SM10]',state:'A',detailUrl:'https://www.cardrush-pokemon.jp/product/123',price:200,stock:3,observedAt:'2026-08-29'};
const options={now:Date.parse('2026-11-04T00:00:00Z')};
const first=reconcile([card],[row],options);assert.equal(first.links.length,1);assert.equal(first.pricesRecovered,0);
assert.equal(first.cards[0].price,100);assert.equal(first.cards[0].priceObservedAt,card.priceObservedAt);
assert.equal(first.cards[0].cardrushLinkEvidence.sourceObservedAt,row.observedAt);
assert.equal(reconcile(first.cards,[row],options).links.length,0,'persistent mapping is reused, not recreated');
for(const patch of [{state:'A-'},{name:row.name+' 英語版'},{name:row.name.replace('001/095','002/095')},
  {name:row.name.replace('SM10','SM11')},{name:row.name+' マスターボールミラー'},{name:row.name+' SA'},
  {name:row.name+' PSA9'},{name:row.name+' 未開封'},{identityVerified:false},{priceQuarantined:true},
  {referenceOnly:true},{conditionAccepted:false},{language:'en'},{observedAt:null},{observedAt:'2026-11-05'},{cardId:'other'},
  {detailUrl:'https://untrusted.invalid/product/123'},{detailUrl:row.detailUrl+'?search=1'}])assert.equal(reconcile([card],[{...row,...patch}],options).links.length,0,JSON.stringify(patch));
assert.equal(reconcile([card,{...card,id:'duplicate'}],[row],options).links.length,0);
assert.equal(reconcile([card,{id:'other',cardrushUrl:row.detailUrl}],[row],options).links.length,0);
assert.equal(reconcile([card],[row,{...row,detailUrl:row.detailUrl.replace('123','456')}],options).links.length,0);
assert.equal(reconcile([card],[row],{...options,invalidUrls:[row.detailUrl]}).links.length,0);
assert.equal(reconcile([card],[row],{...options,holds:{fixture:{reason:'manual'}}}).links.length,0);
assert.equal(reconcile([{...card,identityReviewRequired:true}],[row],options).links.length,0);
const changed=reconcile(first.cards,[{...row,name:row.name.replace('001/095','002/095')}],options);
assert(!changed.cards[0].cardrushUrl);assert(changed.cards[0].cardrushLinkEvidence.reviewRequired);
assert.equal(reconcile(changed.cards,[row],options).links.length,0,'manual identity hold is not automatically cleared');
assert.equal(reconcile(first.cards,[],options).cards[0].cardrushUrl,row.detailUrl,'partial catalog omission is not a contradiction');
console.log('PASS retained retailer exact identity: persistent mapping only, old source dates/prices unchanged, ownership, state, language, finish, ambiguity and holds');
