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
console.log('PASS saved shop recovery: individual timestamps, specification, holds, reference separation and newer data preserved');
