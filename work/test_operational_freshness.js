const assert=require('node:assert/strict'),{evaluate}=require('./operational_freshness_audit');
const now=Date.parse('2026-10-16T00:00:00Z');
const source={cards:[{id:'a',lastConfirmedAt:new Date(now-7*3600000).toISOString(),status:'期限超過・取得待ち'},
  {id:'b',lastConfirmedAt:new Date(now-8*3600000).toISOString(),status:'アクセス確認待ち・正常値保持'},
  {id:'c',status:'手動確認待ち'}, {id:'d',status:'再試行待ち'}]};
const history=[{endedAt:new Date(now).toISOString(),records:[{id:'a',status:'verified',confirmedAt:new Date(now-8*3600000).toISOString()},
  {id:'a',status:'failed',confirmedAt:new Date(now-6*3600000).toISOString()},{id:'b',status:'verified'}]},
  {records:[{id:'a',status:'verified',confirmedAt:new Date(now-7*3600000).toISOString()}]}];
const r=evaluate(source,['a','b','c','d','missing'],history,now);
assert.equal(r.summary.cohort,5);assert.deepEqual(r.summary.buckets,{'automatic-overdue':1,'access-stopped':1,'manual-review':1,'retry-wait':1,'url-discovery':1});
assert.equal(r.rows[0].lastConfirmedIntervalMs,3600000);assert.equal(r.rows[0].targetOverdueHours,1);
assert.equal(r.rows[1].confirmedIntervalSamples,0,'missing card datetime is not replaced by file/run time');
assert.equal(r.rows.at(-1).lastConfirmedAt,null);
console.log('PASS fixed denominator, card-confirmed intervals, source/manual/retry/unlinked separation and no timestamp invention');
