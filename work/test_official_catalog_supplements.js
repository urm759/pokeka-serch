const assert=require('node:assert/strict'),{apply}=require('./domestic_catalog_supplements'),{audit}=require('./audit_25th_promo');
const entries=require('./domestic-catalog-supplements.json').cards,cards=[];
assert.equal(apply(cards,entries,[],'2026-10-21T00:00:00Z').length,1);assert.equal(cards[0].price,null);assert.equal(cards[0].tv30,null);assert.equal(cards[0].priceObservedAt,null);
assert.equal(apply(cards,entries).length,0,'idempotent');
const other=[{...cards[0],id:'different-existing-id'}];assert.equal(apply(other,entries).length,0,'same official specification is not a second card');
const foreign=[{...cards[0],id:'foreign-version',language:'id'}];assert.equal(apply(foreign,entries).length,1,'foreign card is not a Japanese listing');
const report=audit(foreign,{cards:{}});assert.equal(report.listed,1);assert.equal(report.analyzable,0);assert.equal(report.missing.length,24);
const retained=[{...cards[0],price:1234,priceObservedAt:'2026-10-20T00:00:00Z'}],next=[];apply(next,entries,retained);assert.equal(next[0].price,1234);assert.equal(next[0].priceObservedAt,retained[0].priceObservedAt);
console.log('PASS official single-card supplements: no fake prices/counts, identity deduplication, language and preserved observations');
