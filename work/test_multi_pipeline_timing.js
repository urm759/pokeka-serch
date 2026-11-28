const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {stageEvidence}=require('./refresh_cadence'),{build}=require('./multi_pipeline_timing');
const at='2026-11-13T16:11:50Z',now=Date.parse(at);
const daily={id:1,event:'schedule',status:'pending',path:'.github/workflows/daily-fast-update.yml',created_at:'2026-11-13T15:55:58Z',run_started_at:'2026-11-13T15:55:58Z'};
const pending=stageEvidence(daily,[],null,now);assert.equal(pending.jobStartedAt,null);assert.equal(pending.createdToJobStartMs,null);assert.equal(pending.pendingWithoutJobLowerBoundMs,952000);
const completed={...daily,status:'completed'},job={name:'update',created_at:'2026-11-13T16:11:38Z',started_at:'2026-11-13T16:11:40Z',steps:[]};
const measured=stageEvidence(completed,[job],null,now);assert.equal(measured.beforeJobCreationMs,940000);assert.equal(measured.jobCreatedToStartMs,2000);assert.equal(measured.createdToJobStartMs,942000);
const watch={id:2,event:'workflow_dispatch',status:'completed',path:'.github/workflows/watch-data-health.yml',created_at:'2026-11-13T15:46:20Z'};
const step=(name,start,end,conclusion='success')=>({name,started_at:start,completed_at:end,conclusion});
const jobs=[{name:'publication_check',created_at:'2026-11-13T15:46:21Z',started_at:'2026-11-13T15:46:23Z',steps:[step('Verify published acquisition independently without source requests','2026-11-13T15:46:59Z','2026-11-13T15:47:22Z')]},{name:'catchup',created_at:'2026-11-13T15:46:21Z',started_at:'2026-11-13T15:50:36Z',steps:[step('Fill missed price intervals with shared cooldown and access budgets','2026-11-13T15:51:44Z','2026-11-13T16:06:52Z'),step('Validate catchup data without changing purchase criteria','2026-11-13T16:07:01Z','2026-11-13T16:09:11Z'),step('Publish changed health state only','2026-11-13T16:09:11Z','2026-11-13T16:11:32Z')]}];
const a=build({daily:[daily],watch:[watch]},{now,jobsByRun:{1:[],2:jobs}});
assert.equal(a.stages.watch[0].jobStartedAt,'2026-11-13T15:50:36Z','independent verifier cannot hide acquisition wait');
assert.equal(a.stages.watch[0].acquisitionAndAggregationMs,908000);assert.equal(a.stages.watch[0].validationMs,130000);assert.equal(a.stages.watch[0].saveAndPushMs,141000);assert.equal(a.stages.watch[0].pagesPublishedAt,null);
const unknown=build({daily:[daily]},{now});assert.equal(unknown.stages.daily[0].pendingWithoutJob,null,'unavailable API evidence is not an empty job list');
const skipped=build({daily:[completed]},{now,jobsByRun:{1:[{...job,steps:[step('Run fast regression tests',at,at,'skipped'),step('Commit changed data only',at,at,'skipped')]}]}}).stages.daily[0];
assert.equal(skipped.validationMs,null,'skipped validation is not a zero-duration successful validation');assert.equal(skipped.saveAndPushMs,null);assert.deepEqual(skipped.validation.conclusions,['skipped'],'retain explicit skipped evidence');
for(const file of fs.readdirSync('.github/workflows').filter(f=>f.endsWith('.yml'))){const text=fs.readFileSync(path.join('.github/workflows',file),'utf8');if(text.includes('group: all-site-data-refresh')){assert(/group: all-site-data-refresh\r?\n\s+queue: max\r?\n\s+cancel-in-progress: false/.test(text),file+' must preserve pending writers without simultaneous acquisition');}}
assert(!fs.readFileSync('app.js','utf8').includes('data/workflow-stage-audit.json'),'raw stage inventory stays out of initial browser requests');
console.log('PASS real-time wait decomposition, verifier/worker isolation, pending vs unknown, publication separate from Pages, all writer queues retained');

{
  const { build: operations } = require('./price_operation_evidence');
  const sha = '1'.repeat(40);
  const ownWatch = {...watch, head_sha:sha, run_attempt:1, updated_at:at, conclusion:'failure'};
  const ownDaily = {...completed, run_attempt:1, updated_at:at};
  const startedAt = '2026-11-13T16:00:00Z';
  const actual = {script:'work/refresh_candidate_shops.js', startedAt, httpRequests:3, refreshed:2, status:'partial'};
  const execution = {runId:'2', headSha:sha, startedAt, runs:[actual,
    {...actual, script:'local-reuse', httpRequests:0, refreshed:99},
    {...actual, script:'outside-window', startedAt:'2026-11-12T16:00:00Z'},
    {script:'source-failed', startedAt, processStatus:'failed', failureClass:'source-acquisition'}]};
  const dailySources = {runId:'1', startedAt, sources:[{source:'shopBuyback', startedAt,
    shopBuyback:{acquiredCount:12, completionStatus:'partial'}}]};
  const dailyOutcomes = [
    {runId:'3', attempt:1, createdAt:startedAt, state:'recovered', publicVerifiedAt:at, originalConclusion:'failure'},
    {runId:'4', attempt:1, createdAt:startedAt, state:'acquisition-failed', originalConclusion:'failure'},
    {runId:'5', attempt:1, createdAt:startedAt, state:'pages-unverified', originalConclusion:'failure'},
  ];
  const input = {pipelines:{watch:[ownWatch],daily:[ownDaily]}, execution, dailySources, dailyOutcomes,
    sourceRecovery:{runId:'9', newHttpRequests:0, recoveredSourceFiles:4, publicationEvidence:{commit:sha,checkedAt:at}},
    inspections:[{runId:'8',runAttempt:2,checkedAt:at,status:'publication-completed-separate-failure-no-price-recovery',
      originalConclusion:'cancelled',publicationStepSucceeded:true}]};
  const report = operations(input);
  assert.deepEqual(report.freshSourceEvidence.map(r => [r.runId,r.httpRequests,r.refreshedCards,r.acquiredQuotes]),
    [['2',3,2,undefined],['1',null,undefined,12]]);
  assert.deepEqual(report.recovered.map(r => [r.runId,r.recoverySourceRequests]), [['3',0],['9',0]]);
  assert.deepEqual(report.issues.map(r => [r.runId,r.state]), [
    ['8','publication-completed-separate-failure-no-price-recovery'], ['4','acquisition-failed'],
    ['5','pages-unverified'], ['2','acquisition-failed'],
  ]);
  assert.equal(report.issues[0].originalConclusion,'cancelled');
  assert.equal(report.issues[0].pushCompletionProven,true);
  const rerun = operations({...input, pipelines:{watch:[{...ownWatch,run_attempt:2}],daily:[{...ownDaily,run_attempt:2}]}});
  assert.deepEqual(rerun.freshSourceEvidence,[],'original counts cannot be attributed to a rerun');
  assert.equal(rerun.issues.some(r => r.runId === '2'), false);
  assert.deepEqual(operations({...input,execution:{...execution,headSha:'2'.repeat(40)},dailySources:{...dailySources,runId:'999'}}).freshSourceEvidence,[]);
  assert.deepEqual(operations({}).freshSourceEvidence,[],'missing evidence stays uncounted');
  assert.equal(report.sourceRequests,0);
  console.log('PASS source requests, recovered originals and observer failures stay separate by run and attempt');
}
