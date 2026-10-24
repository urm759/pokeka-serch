const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {decide}=require('./catchup_validation_mode'),p=require('./publication_lineage');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-reuse-'));
function write(f,x){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),JSON.stringify(x));}
try{
 const now=Date.parse('2026-10-24T00:00:00Z'),outcomes={counts:{listed:1,analyzable:1}};
 write('data/card-catalog-completion.json',{summary:{total:1,analyzable:1}});write('data/completion-outcomes.json',outcomes);
 write('data/update-status.json',{unifiedMonitor:{outcomes}});write('data/pokemon-cards.json',[{id:'one'}]);
 write('data/priority-price-execution.json',{startedAt:new Date(now-3600000).toISOString()});p.seal(root,p.snapshot(root));
 assert.equal(decide(root,now).mode,'reuse');
 assert.equal(decide(root,now+2*3600000).mode,'acquire');
 fs.writeFileSync(path.join(root,'model.js'),'// changed calculation');assert.equal(decide(root,now).mode,'rebuild');
 p.seal(root,p.snapshot(root));assert.equal(decide(root,now).mode,'reuse');
 write('data/psa-japan-services.json',{fee:100});assert.equal(decide(root,now).mode,'rebuild','fees cannot reuse stale calculations');
 p.seal(root,p.snapshot(root));assert.equal(decide(root,now).mode,'reuse');
 write('data/pokemon-cards.json',[{id:'one',price:200}]);assert.equal(decide(root,now).mode,'rebuild','saved acquisition must be recovered before new HTTP');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/watch-data-health.yml'),'utf8');
 assert(workflow.includes("if: github.event_name != 'workflow_run'"));assert(workflow.includes('group: site-data-health-observation'));
 assert(workflow.indexOf('id: catchup_plan')<workflow.indexOf('scheduled_cycle_evidence.js catchup --baseline'));
 console.log('PASS no-op catchup reuse, code/source invalidation, recovery-first and independent observer concurrency');
}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('pokeka-reuse-'));fs.rmSync(root,{recursive:true,force:true});}
