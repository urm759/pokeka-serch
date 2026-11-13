const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {resolve}=require('./resolve_generated_merge');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-merge-finalization-'));
const git=(args,ok=true)=>{const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8'});if(ok)assert.equal(r.status,0,r.stderr);return r;};
try{
 fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'work'));
 for(const f of ['audit_state_a_prices','build_psa_priority_queue','measure_performance_guard','test_ui_data','test_card_catalog_completion','build_purchase_limit_audit'])fs.writeFileSync(path.join(root,'work',f+'.js'),'');
 fs.writeFileSync(path.join(root,'work/audit_acquisition_progress.js'),"require('fs').writeFileSync('work/current-outcomes.json',JSON.stringify({listed:12,analyzable:4}));");
 fs.writeFileSync(path.join(root,'work/finalize_update_status.js'),"const fs=require('fs'),out=JSON.parse(fs.readFileSync('work/current-outcomes.json'));fs.writeFileSync('data/completion-outcomes.json',JSON.stringify(out));fs.writeFileSync('data/update-status.json',JSON.stringify({unifiedMonitor:{outcomes:out}}));");
 // If a redundant post-finalization producer is reintroduced, the consumer
 // detects the mismatched snapshot rather than accepting inconsistent data.
 fs.writeFileSync(path.join(root,'work/audit_completion_outcomes.js'),"require('fs').writeFileSync('data/completion-outcomes.json',JSON.stringify({listed:12,analyzable:4,recomputed:true}));");
 fs.writeFileSync(path.join(root,'work/build_ui_data.js'),"const fs=require('fs'),assert=require('assert/strict');assert.deepEqual(JSON.parse(fs.readFileSync('data/update-status.json')).unifiedMonitor.outcomes,JSON.parse(fs.readFileSync('data/completion-outcomes.json')));");
 const write=side=>fs.writeFileSync(path.join(root,'data/update-status.json'),JSON.stringify({side}));
 git(['init','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['config','commit.gpgsign','false']);write('base');git(['add','.']);git(['commit','-m','base']);
 git(['checkout','-b','incoming']);write('incoming');git(['commit','-am','incoming']);git(['checkout','main']);write('local');git(['commit','-am','local']);assert.notEqual(git(['merge','incoming'],false).status,0);
 assert(resolve(root));assert.equal(git(['diff','--name-only','--diff-filter=U']).stdout.trim(),'');
 const out=JSON.parse(fs.readFileSync(path.join(root,'data/completion-outcomes.json')));assert.deepEqual(out,{listed:12,analyzable:4});
 console.log('PASS default merge regeneration: dependencies before finalization, one coherent outcomes snapshot, mandatory consumer and final verification retained');
}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('pokeka-merge-finalization-'));fs.rmSync(root,{recursive:true,force:true});}
