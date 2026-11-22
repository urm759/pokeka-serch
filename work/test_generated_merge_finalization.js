const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {resolve}=require('./resolve_generated_merge');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-merge-finalization-'));
const git=(args,ok=true)=>{const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8'});if(ok)assert.equal(r.status,0,r.stderr);return r;};
try{
 fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'work'));
 for(const f of ['audit_state_a_prices','build_psa_priority_queue','measure_performance_guard','test_ui_data','test_card_catalog_completion','build_purchase_limit_audit'])fs.writeFileSync(path.join(root,'work',f+'.js'),'');
 fs.writeFileSync(path.join(root,'work/audit_acquisition_progress.js'),"require('fs').writeFileSync('work/current-outcomes.json',JSON.stringify({listed:12,analyzable:4}));");
 fs.writeFileSync(path.join(root,'work/audit_link_coverage.js'),"const fs=require('fs'),assert=require('assert/strict');const input=JSON.parse(fs.readFileSync('work/current-outcomes.json'));assert.deepEqual(input,{listed:12,analyzable:4});fs.writeFileSync('data/link-coverage.json',JSON.stringify({audit:input}));");
 fs.writeFileSync(path.join(root,'data/catalog-index.json'),JSON.stringify({ids:['a','a']}));
 fs.writeFileSync(path.join(root,'work/build_card_completion.js'),"require('fs').writeFileSync('data/catalog-index.json',JSON.stringify({ids:['a']}));");
 fs.writeFileSync(path.join(root,'work/finalize_update_status.js'),"const fs=require('fs'),out=JSON.parse(fs.readFileSync('work/current-outcomes.json'));require('assert/strict').deepEqual(JSON.parse(fs.readFileSync('data/link-coverage.json')).audit,out);fs.writeFileSync('data/completion-outcomes.json',JSON.stringify(out));fs.writeFileSync('data/update-status.json',JSON.stringify({unifiedMonitor:{outcomes:out}}));");
 // If a redundant post-finalization producer is reintroduced, the consumer
 // detects the mismatched snapshot rather than accepting inconsistent data.
 fs.writeFileSync(path.join(root,'work/audit_completion_outcomes.js'),"require('fs').writeFileSync('data/completion-outcomes.json',JSON.stringify({listed:12,analyzable:4,recomputed:true}));");
 fs.writeFileSync(path.join(root,'work/build_ui_data.js'),"const fs=require('fs'),assert=require('assert/strict');assert.deepEqual(JSON.parse(fs.readFileSync('data/update-status.json')).unifiedMonitor.outcomes,JSON.parse(fs.readFileSync('data/completion-outcomes.json')));assert.deepEqual(JSON.parse(fs.readFileSync('data/catalog-index.json')).ids,['a']);");
 const pending=['取得待ち',null,null,0,null,null],retry=['取得失敗','2026-11-21T01:00:00Z',null,2,'saved failure','2026-11-21T03:00:00Z'],acquired=['取得済み','2026-11-21T02:00:00Z','2026-11-21T02:00:00Z',0,null,null];
 const write=side=>{
   fs.writeFileSync(path.join(root,'data/update-status.json'),JSON.stringify({side}));
   fs.writeFileSync(path.join(root,'work/card-completion-queue.json'),JSON.stringify({version:3,generatedAt:side==='base'?'2026-11-21T00:00:00Z':side==='local'?'2026-11-21T01:00:00Z':'2026-11-21T02:00:00Z',itemSchema:['status','lastAttemptAt','lastSuccessAt','retryCount','failureReason','nextRetryAt'],sourceByItem:{price:'source',shop:'shop'},overseasPolicyExplanation:'中止',evidenceSchema:'fixture',cards:{card:{i:{price:side==='local'?retry:pending,shop:side==='incoming'?acquired:pending}}},queue:['card']}));
 };
 git(['init','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['config','commit.gpgsign','false']);write('base');git(['add','.']);git(['commit','-m','base']);
 git(['checkout','-b','incoming']);write('incoming');git(['commit','-am','incoming']);git(['checkout','main']);write('local');git(['commit','-am','local']);assert.notEqual(git(['merge','incoming'],false).status,0);
 assert(resolve(root));assert.equal(git(['diff','--name-only','--diff-filter=U']).stdout.trim(),'');
 const out=JSON.parse(fs.readFileSync(path.join(root,'data/completion-outcomes.json')));assert.deepEqual(out,{listed:12,analyzable:4});
 const queue=JSON.parse(fs.readFileSync(path.join(root,'work/card-completion-queue.json')));assert.deepEqual(queue.cards.card.i,{price:retry,shop:acquired});
 const stageRoot=path.join(root,'work/generated-merge-stages',git(['rev-parse','HEAD^2']).stdout.trim());
 for(const stage of [1,2,3])assert(fs.existsSync(path.join(stageRoot,String(stage),'work/card-completion-queue.json')),'every original retry/hold side is retained before regeneration');
 console.log('PASS default merge regeneration: dependencies before finalization, one coherent outcomes snapshot, mandatory consumer and final verification retained');
}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('pokeka-merge-finalization-'));fs.rmSync(root,{recursive:true,force:true});}
