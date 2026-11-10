const assert=require('assert/strict'),{project}=require('./previous_qualified_reference');
const row={id:'a',profile:'V',before:{purchase:{price:10000,priceObservedAt:'2026-11-01T00:00:00Z'}},beforeMeta:{at:'2026-11-01T01:00:00Z'},departureAudit:{roots:[{code:'expired-price'}],repair:{fields:['shopStateA']}}};
let p=project({at:'2026-11-04T00:00:00Z',profiles:[],pendingDepartures:[row]});assert.equal(p.rows[0].category,'鮮度切れ・再確認待ち');assert.equal(p.rows[0].lastQualifiedAt,row.beforeMeta.at);assert.equal(p.rows[0].lastPriceAt,row.before.purchase.priceObservedAt);
assert.equal(project({profiles:[{id:'V',urlsMatched:['a']}]},p).rows.length,0);
assert.equal(project({profiles:[{id:'new-V',urlsMatched:[]}]},p).rows.length,1,'old condition evidence retained across explicit buy-basis migration');
assert.equal(project({pendingDepartures:[{...row,beforeMeta:null}]}).rows[0].lastQualifiedAt,null,'no invented last-qualified date');
console.log('PASS previous-qualified reference dates, expiry classification, return removal and legacy profile preservation');
