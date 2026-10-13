const assert=require('node:assert/strict'),{decision}=require('./pc_resume_gate');
const now=Date.parse('2026-10-13T08:00:00Z'),s={status:'partial',acquiredCount:10,lastSuccessAt:'2026-10-13T07:00:00Z',publishStatus:'failed'};
assert.equal(decision(s,now).allowed,false,'publication-only recovery must not acquire again');
assert.equal(decision(s,now+3600000).allowed,true,'resume checkpoint at interval boundary');
assert.equal(decision(s,now,true).allowed,true);
assert.equal(decision({...s,lastSuccessAt:'2026-10-13T09:00:00Z'},now).allowed,false);
assert.equal(decision({...s,status:'failed',acquiredCount:0},now).allowed,true,'collector owns authentication holds; do not claim recovery');
console.log('PASS partial PC acquisition cooldown, saved publication recovery, current single checkpoint batch and missing evidence');
