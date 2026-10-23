const fs=require('node:fs'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency');
const source=fs.readFileSync('app.js','utf8'),at='2026-10-22T00:00:00.000Z';
function replay(time){
  const api=load(source,time,{fixedModelClock:true});
  const card=api.state.cards.find(c=>api.state.snkrRawFlipSummary[c.id]);
  assert.ok(card,'stored raw evidence is required by this regression fixture');
  return api.prepareCalculatedCards([card])[0].snkrRawFlip.fetchedAgeHours;
}
const first=replay(at),second=replay(at),next=replay('2026-10-23T00:00:00.000Z');
assert.ok(Number.isFinite(first));
assert.equal(first,second,'historical replay must not use wall-clock acquisition age');
assert.equal(next-first,24,'stored timestamp is retained; only the explicit evaluation clock advances');
console.log('PASS historical replay fixes raw-evidence clock without changing production calculations or source dates');
