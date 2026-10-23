const assert=require('node:assert/strict'),{mergeRows}=require('./recover_saved_shop_rows');
const card={id:'fixture',name:'ピカチュウ:プロモ [S-P 208](プロモーションカード「S-P」)'},cards=new Map([[card.id,card]]);
const row={cardId:card.id,title:'【未開封】 ピカチュウ PROMO 208/S-P',detailUrl:'https://torecacamp-pokemon.com/products/fixture-pika',price:19800,
  identityVerified:true,rawCondition:'sealed-single',referenceOnly:true,conditionAccepted:false,observedAt:'2026-10-22T00:00:00Z'};
const now=Date.parse('2026-10-23T00:00:00Z');
assert.equal(mergeRows([], [row],cards,'torecacamp',now).changes[0].type,'reference-only');
assert.equal(mergeRows([{...row,observedAt:'2026-10-22T01:00:00Z'}],[row],cards,'torecacamp',now).changes.length,0);
assert.equal(mergeRows([{...row,cardMismatchSuspected:true}],[{...row,observedAt:'2026-10-22T02:00:00Z'}],cards,'torecacamp',now).changes.length,0);
for(const invalid of [{...row,observedAt:null},{...row,observedAt:'2026-10-24T00:00:00Z'},{...row,title:'未開封 ピカチュウ PROMO 001/S-P'},{...row,priceQuarantined:true}])
  assert.equal(mergeRows([],[invalid],cards,'torecacamp',now).changes.length,0);
assert.equal(mergeRows([],[{...row,detailUrl:'https://example.test/products/fixture'}],cards,'torecacamp',now).changes.length,0);
assert.equal(mergeRows([{...row,cardId:'other'}],[row],cards,'torecacamp',now).changes.length,0,'one URL cannot silently identify two cards');
assert.equal(row.conditionAccepted,false,'reference-only never becomes a purchasable state A offer');
const {reconcileLinks}=require('./recover_saved_shop_rows');
const cleanCard={id:'fixture',name:'メガゲンガーex SAR [M2a 240/193]'};
const clean={...row,referenceOnly:false,rawCondition:null,conditionAccepted:true,state:'A',title:'メガゲンガーex(SAR){悪}〈240/193〉[M2a]'};
assert.equal(reconcileLinks([cleanCard],{torecacamp:[clean]},{now}).links.length,1);
assert.equal(reconcileLinks([{...cleanCard,torecacampUrl:'https://torecacamp-pokemon.com/products/other'}],{torecacamp:[clean]},{now}).links.length,0);
assert.equal(reconcileLinks([card],{torecacamp:[row]},{now}).links.length,0,'sealed reference is not a purchasable link');
assert.equal(reconcileLinks([cleanCard],{torecacamp:[clean]},{now,holds:{torecacamp:{fixture:{url:clean.detailUrl}}}}).links.length,0);
assert.equal(reconcileLinks([cleanCard],{torecacamp:[{...clean,observedAt:'2026-10-01T00:00:00Z'}]},{now}).links.length,0);
assert.equal(reconcileLinks([cleanCard,{...cleanCard,id:'other'}],{torecacamp:[clean,{...clean,cardId:'other'}]},{now}).links.length,0,'ambiguous shared URL must not be assigned to either ID');
assert.equal(reconcileLinks([cleanCard],{torecacamp:[clean,{...clean,cardId:'other',priceQuarantined:true}]},{now}).links.length,1,'a quarantined record must not block an independently valid quote');
assert(require('node:fs').readFileSync(require('node:path').join(__dirname,'finalize_update_status.js'),'utf8').includes("require('./recover_saved_shop_rows').reconcileSavedLinks(ROOT)"),'normal finalization must reconnect verified saved rows, not only a manual recovery');
console.log('PASS saved shop recovery: individual timestamps, specification, holds, reference separation and newer data preserved');
