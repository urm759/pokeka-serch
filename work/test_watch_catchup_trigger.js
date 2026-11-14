const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=fs.readFileSync(path.join(__dirname,'../.github/workflows/watch-data-health.yml'),'utf8').replace(/\r\n/g,'\n');
const {jobProperty}=require('./workflow_structure');
const expression=jobProperty(file,'catchup','if');
assert(expression,'catchup job must have an explicit trigger condition');
const run={name:'Deep Resolve Unmatched Cards',event:'schedule',conclusion:'success',head_branch:'main',head_repository:{full_name:'owner/repo'}};
const allowed=(event,r=run)=>vm.runInNewContext('Boolean('+expression+')',{github:{event_name:event,repository:'owner/repo',event:{workflow_run:r}}},{timeout:1000});
assert(allowed('schedule'));assert(allowed('workflow_dispatch'));
assert(allowed('workflow_run'));
assert(allowed('workflow_run',{...run,name:'Priority Purchase Price Refresh',conclusion:'failure'}),'trusted failed price jobs recover saved inputs before considering new acquisition');
for(const name of ['Daily Fast Update','Safe Checkpoint Backfill']) {
  assert(allowed('workflow_run',{...run,name}),'trusted scheduled cloud completion may fill missed price intervals');
  assert(allowed('workflow_run',{...run,name,conclusion:'failure'}),'trusted Daily/Safe publication failure can recover saved source inputs');
  for(const changed of [{event:'workflow_dispatch'},{head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])
    assert(!allowed('workflow_run',{...run,name,...changed}));
}
for(const changed of [{name:'Priority Purchase Price Refresh'},{event:'pull_request'},
  {conclusion:'failure'},{head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])assert(!allowed('workflow_run',{...run,...changed}));
for(const changed of [{event:'workflow_dispatch'},{head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])
  assert(!allowed('workflow_run',{...run,name:'Priority Purchase Price Refresh',conclusion:'failure',...changed}));
assert.equal(jobProperty(file,'watch','needs'),'[catchup, publication_check]','record confirmed receipts after Pages verification');
assert.equal(jobProperty(file,'watch','if'),'always()','monitoring still follows acquisition/verification failures');
assert.equal(jobProperty(file,'publication_check','needs'),null,'Pages verification must remain independent of acquisition');
assert(file.includes('group: all-site-data-refresh'));
assert(file.includes("steps.catchup_plan.outputs.mode == 'acquire'"));
assert(file.includes('node work/run_priority_price_refresh.js --catchup'));
assert(!file.includes('actions: write'),'no new workflow dispatch permissions');
console.log('PASS scheduled trusted-main resolver completion may check missed price updates; ordinary monitor events do not recursively acquire');
