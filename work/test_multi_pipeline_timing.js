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
assert.equal(stageEvidence(completed,[{...job,steps:[step('Run fast regression tests',at,at,'skipped'),step('Commit changed data only',at,at,'skipped')]}]).validation,null,'skipped validation is not a zero-duration successful validation');
for(const file of fs.readdirSync('.github/workflows').filter(f=>f.endsWith('.yml'))){const text=fs.readFileSync(path.join('.github/workflows',file),'utf8');if(text.includes('group: all-site-data-refresh')){assert(/group: all-site-data-refresh\r?\n\s+queue: max\r?\n\s+cancel-in-progress: false/.test(text),file+' must preserve pending writers without simultaneous acquisition');}}
assert(!fs.readFileSync('app.js','utf8').includes('data/workflow-stage-audit.json'),'raw stage inventory stays out of initial browser requests');
console.log('PASS real-time wait decomposition, verifier/worker isolation, pending vs unknown, publication separate from Pages, all writer queues retained');
