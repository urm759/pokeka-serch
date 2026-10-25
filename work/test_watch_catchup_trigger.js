const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=fs.readFileSync(path.join(__dirname,'../.github/workflows/watch-data-health.yml'),'utf8');
const expression=file.match(/  catchup:\r?\n    if: >-\r?\n([\s\S]*?)    concurrency:/)[1].trim();
const run={name:'Deep Resolve Unmatched Cards',event:'schedule',conclusion:'success',head_branch:'main',head_repository:{full_name:'owner/repo'}};
const allowed=(event,r=run)=>vm.runInNewContext('Boolean('+expression+')',{github:{event_name:event,repository:'owner/repo',event:{workflow_run:r}}},{timeout:1000});
assert(allowed('schedule'));assert(allowed('workflow_dispatch'));
assert(allowed('workflow_run'));
assert(allowed('workflow_run',{...run,name:'Priority Purchase Price Refresh',conclusion:'failure'}),'trusted failed price jobs recover saved inputs before considering new acquisition');
for(const changed of [{name:'Priority Purchase Price Refresh'},{name:'Daily Fast Update'},{event:'pull_request'},
  {conclusion:'failure'},{head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])assert(!allowed('workflow_run',{...run,...changed}));
for(const changed of [{event:'workflow_dispatch'},{head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])
  assert(!allowed('workflow_run',{...run,name:'Priority Purchase Price Refresh',conclusion:'failure',...changed}));
assert(file.includes('needs: catchup\n    if: always()'),'independent monitoring must still follow a failed acquisition');
assert(file.includes('group: all-site-data-refresh'));
assert(file.includes("steps.catchup_plan.outputs.mode == 'acquire'"));
assert(file.includes('node work/run_priority_price_refresh.js --catchup'));
assert(!file.includes('actions: write'),'no new workflow dispatch permissions');
console.log('PASS scheduled trusted-main resolver completion may check missed price updates; ordinary monitor events do not recursively acquire');
