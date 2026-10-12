const assert=require('node:assert/strict');
const {planSets,selectBatch}=require('./psa_pending_sets');
const pending=Array.from({length:12},(_,i)=>({url:'u'+i,setCode:i<4?'SAME':'OTHER'}));
const priority={maxFocusedShare:0.4,focusSetUrls:['u0','u1'],rows:[
  {sourceSetUrl:'u3',analysisCompletionTarget:true,priority:200},
  {sourceSetUrl:'u4',analysisCompletionTarget:true,priority:100},
  {sourceSetUrl:'u5',analysisCompletionTarget:true,priority:90},
  {sourceSetUrl:'u6',analysisCompletionTarget:true,priority:80},
  {sourceSetUrl:'u7',analysisCompletionTarget:true,priority:1000,specificationHeld:true}]};
const batch=selectBatch(pending,8,priority);
assert.equal(batch.selected.length,8);assert.equal(new Set(batch.selected.map(r=>r.url)).size,8);
assert.deepEqual(batch.lanes.filter(r=>r.lane==='analysis-completion').map(r=>r.url),['u3','u4','u5','u6']);
assert.equal(batch.lanes.filter(r=>r.lane==='ordinary').length,2);
assert.equal(batch.lanes.filter(r=>r.lane==='focused').length,2);
assert.equal(batch.completionTargets,4);
assert.equal(selectBatch(pending,0,priority).selected.length,0);
const now=Date.parse('2026-10-13T00:00:00Z');
const plan=planSets({manifest:pending,completed:['u3','u4'],priority,now,
  rows:[{sourceUrl:'u3',fetchedAt:'2026-10-12T23:00:00Z'},{sourceUrl:'u4',fetchedAt:'2026-10-11T00:00:00Z'}],
  retries:{u5:{status:'manual-wait'},u6:{status:'retry-wait',nextRetryAt:'2026-10-14T00:00:00Z'}}});
assert(!plan.pending.some(r=>['u3','u5','u6'].includes(r.url)));
assert(plan.pending.some(r=>r.url==='u4'));
assert(!selectBatch(plan.pending,8,priority).selected.some(r=>['u3','u5','u6'].includes(r.url)));
const {classify}=require('./build_one_item_completion_audit');
assert.match(classify({m:['psaOfficial'],i:{psaOfficial:['再照合待ち']}},{status:'unlinked',sourceSetUrl:'u3'}),/仕様不一致で保留/);
assert.match(classify({m:['psaOfficial'],i:{psaOfficial:['取得待ち']}},{status:'unlinked',sourceSetUrl:'u3'}),/実取得待ち/);
const {releaseAuthenticationHolds}=require('./psa_pending_sets');
const retries={a:{kind:'authentication',scope:'source',lastAttemptAt:'2026-10-12T22:00:00Z'},
  b:{kind:'missing-page',scope:'url'},c:{kind:'access',scope:'source'}};
assert.deepEqual(releaseAuthenticationHolds(retries,{verified:false,checkedAt:'2026-10-12T23:00:00Z'},now),[]);
assert.deepEqual(releaseAuthenticationHolds(retries,{verified:true,checkedAt:'2026-10-12T00:00:00Z'},now),[]);
assert.deepEqual(releaseAuthenticationHolds(retries,{verified:true,checkedAt:'2026-10-12T23:00:00Z'},now),['a']);
assert(retries.b && retries.c,'URL defects and 403 access holds must not be released');
console.log('PSA exact-URL completion priority, ordinary quota, holds and freshness preserved');
