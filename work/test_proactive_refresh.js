const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { plan } = require('./priority_price_queue.js');
const { lead, intervalMinimum } = require('./proactive_refresh.js');
const { due } = require('./run_priority_price_refresh.js');
const now = Date.parse('2026-10-06T00:00:00Z');
const card = {id:'test',name:'test',hareruya2Url:'https://example.test/a'};
const args = {cards:[card],sourceId:'hareruya2',catalog:[{cardId:'test',observedAt:new Date(now-4*3600000).toISOString()}],candidateRows:{test:{}},now};
assert.equal(plan(args).queue.length,1,'expires before next completion');
assert.equal(plan(args).records[0].due,false,'freshness standard unchanged');
assert.equal(plan({...args,candidateRows:{}}).queue.length,0,'do not refresh every normal card');
assert.equal(plan({...args,manualWait:{test:{url:card.hareruya2Url}}}).queue.length,0);
assert.equal(plan({...args,jobs:{test:{nextRetryAt:new Date(now+3600000).toISOString()}}}).queue.length,0);
assert.equal(plan({...args,catalog:[{cardId:'test',observedAt:new Date(now).toISOString()}]}).queue.length,0);
assert.equal(due({lastSuccessAt:new Date(now-4*3600000).toISOString(),lastAttemptAt:new Date(now-4*3600000).toISOString()},now),true);
assert.equal(due({lastSuccessAt:new Date(now-4*3600000).toISOString(),lastAttemptAt:new Date(now-60000).toISOString()},now),false);
assert.equal(lead().leadMs,10440000);
const interval=intervalMinimum([{id:'test',lastConfirmedAt:new Date(now-5*3600000).toISOString()}],['test'],now,now+2*3600000);
assert.equal(interval.minimumFreshnessPct,0); assert.equal(interval.maxOverdueHours,1);
assert.equal(intervalMinimum([],[],null,now),null);
const formalQueue=require('./formal_freshness_queue');
const HOUR=3600000,clock=new Date(now-24*HOUR).toISOString();
const targetProfiles={profiles:[{id:'formal',urlsMatched:['a','b','c'],qualifiedFacts:Object.fromEntries(['a','b','c'].map(id=>[id,{
 psa10ObservedAt:clock,psa10ClockScope:id==='c'?'card':'model-source-fallback'
}]))}]};
const formal=formalQueue.build(targetProfiles,['formal'],now).formal;
assert.equal(formal[0].dependencies[0].ageHours,24);
assert.equal(formal[0].dependencies[0].refreshAt,now);
assert.equal(formal[0].dependencies[0].at,now+6*HOUR);
assert.deepEqual(formalQueue.sharedClockWarnings(formal,now),[]);
assert.match(formalQueue.sharedClockWarnings(formal,now+1)[0].reason,/正式候補2枚の同時期限/);
const withEarlierStore={...formal[0],id:'other',earliestDeadlineAt:now+HOUR};
assert.match(formalQueue.sharedClockWarnings([...formal,withEarlierStore],now+1)[0].reason,/正式候補2枚の同時期限.*計3枚/);
const root=path.join(__dirname,'..');
const savedPlan=require('./build_camp_deadline_plan').build(root,Date.parse('2026-11-21T16:12:19.536Z'),{write:false});
assert.equal(savedPlan.cohort,144);
assert.deepEqual([savedPlan.requiredPerDay,savedPlan.headroomTargetPerDay],[576,720]);
assert.equal(savedPlan.summary.over6h,savedPlan.rows.filter(r=>r.goalDeadlineAt&&Date.parse(r.goalDeadlineAt)<Date.parse(savedPlan.at)).length);
assert.equal(savedPlan.summary.over48h,savedPlan.rows.filter(r=>r.adoptionDeadlineAt&&Date.parse(r.adoptionDeadlineAt)<Date.parse(savedPlan.at)).length);
assert(savedPlan.rows.every(r=>!r.goalDeadlineAt || Date.parse(r.goalDeadlineAt)-Date.parse(r.lastConfirmedAt)===6*HOUR));
assert(savedPlan.rows.every(r=>!r.adoptionDeadlineAt || Date.parse(r.adoptionDeadlineAt)-Date.parse(r.lastConfirmedAt)===48*HOUR));
for(const plan of [savedPlan,...Object.values(savedPlan.sources)]) {
 assert.equal(plan.summary.formal.deps,plan.formalRows.length);
 assert.equal(plan.summary.formal.planned,plan.formalRows.filter(r=>r.plannedNextCycle).length);
 assert(plan.formalRows.every(r=>Date.parse(r.refreshAt)-Date.parse(r.lastConfirmedAt)===24*HOUR));
}
const policy=require('./snkr_access_policy.js');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'snkr-policy-'));
assert.equal(policy.permitted(temporary),false);
for(const script of ['update_snkr_raw_flip.js','update_snkr_links.js','update_snkr_english_names.js','build_snkr_listing_history.js']) {
 const content=fs.readFileSync(path.join(__dirname,script),'utf8');
 assert(content.includes('snkr_access_policy.js'),script);
 const result=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,script)],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,script);
 assert.match(result.stdout,/"httpRequests":0/);
 assert.match(result.stdout,/"completionStatus":"manual-action-required"/);
}
console.log('PASS proactive refresh: time-forward, normal allocation, retry/manual holds, bulk cooldown, no permission bypass');
