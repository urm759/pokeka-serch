const assert=require('node:assert/strict'),{apply}=require('./domestic_catalog_supplements'),{audit}=require('./audit_25th_promo');
const allEntries=require('./domestic-catalog-supplements.json').cards,entries=allEntries.slice(0,1),cards=[];
const providerRows=require('./domestic_catalog_supplements').providerRows;
assert.equal(apply(cards,entries,[],'2026-10-21T00:00:00Z').length,1);assert.equal(cards[0].price,null);assert.equal(cards[0].tv30,null);assert.equal(cards[0].priceObservedAt,null);
assert.equal(apply(cards,entries).length,0,'idempotent');
assert.equal(providerRows(cards,entries).length,0,'a manual official supplement is not provider coverage');
assert.equal(providerRows([{...cards[0],sourceId:'pk-new-source'}],entries).length,1,'a subsequently fetched provider identity is real source coverage');
const other=[{...cards[0],id:'different-existing-id'}];assert.equal(apply(other,entries).length,0,'same official specification is not a second card');
const foreign=[{...cards[0],id:'foreign-version',language:'id'}];assert.equal(apply(foreign,entries).length,1,'foreign card is not a Japanese listing');
const report=audit(foreign,{cards:{}});assert.equal(report.listed,1);assert.equal(report.analyzable,0);assert.equal(report.missing.length,24);
const retained=[{...cards[0],price:1234,priceObservedAt:'2026-10-20T00:00:00Z'}],next=[];apply(next,entries,retained);assert.equal(next[0].price,1234);assert.equal(next[0].priceObservedAt,retained[0].priceObservedAt);
const expanded=[];assert.equal(apply(expanded,allEntries).length,allEntries.length);
for(const c of expanded){assert.equal(c.price,null);assert.equal(c.tv30,null);assert.equal(c.priceObservedAt,null);}
console.log('PASS official single-card supplements: no fake prices/counts, identity deduplication, language and preserved observations');
