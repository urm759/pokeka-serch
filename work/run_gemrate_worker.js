// Isolated, sparse checkout of trusted main. Personal development/staging never blocks
// receipt processing or gets committed. Only already received private CSV is processed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),STORE=path.resolve(ROOT,'../private-research/gemrate');
function git(cwd,args){const r=cp.spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:8e6});if(r.status!==0||r.error)throw Error('Private GemRate worker Git '+args[0]+' failed');return r.stdout.trim();}
function run(root=ROOT,store=STORE){
 const worker=path.join(store,'worker'),release=require('./acquisition_retry').lock(path.join(store,'.worker.lock'));
 try{
 if(!require('./gemrate_private_store').outside(fs.realpathSync(root),fs.realpathSync(store)))throw Error('Private worker must remain outside public repository');
 git(root,['fetch','origin','main']);
 const created=!fs.existsSync(worker);
 if(created){git(root,['worktree','add','--detach','--no-checkout',worker,'origin/main']);}
 if(!fs.existsSync(path.join(worker,'.git'))||path.relative(fs.realpathSync(store),fs.realpathSync(worker)).startsWith('..'))throw Error('Unproven private worker directory');
 const dirty=created?[]:git(worker,['diff','--name-only','HEAD']).split('\n').filter(Boolean),allowed=require('./gemrate_reference_checkpoint').FILES;
 if(dirty.some(f=>!allowed.includes(f)))throw Error('Unexpected private worker changes retained for review');
 if(dirty.length){
  const backup=path.join(store,'worker-projections',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup,{recursive:true});
  for(const f of dirty)fs.copyFileSync(path.join(worker,f),path.join(backup,path.basename(f)));
  // These are this worker's compact outputs only; original CSV/backups/outbox are untouched.
  git(worker,['restore','--source=HEAD','--staged','--worktree','--',...dirty]);
 }
 const patterns=['/*.js','/work/*.js','/work/psa-name-aliases.json','/work/snkr_english_names.json','/work/gemrate-reviewed-additions.json','/work/gemrate-reviewed-sets.json','/work/gemrate-legacy-reference-ids.json','/work/gemrate-confirmed-reference-registry.json','/work/gemrate-received-scope.json','/data/pokemon-cards.json','/data/gemrate-reference-summary.json'];
 patterns.push('/work/gemrate-collection-sets.json','/work/gemrate-collector-extension/core.js');
 git(worker,['sparse-checkout','set','--no-cone',...patterns]);
 git(worker,['checkout','--detach','origin/main']);
 const head=git(worker,['rev-parse','HEAD']),script=path.join(worker,'work/run_gemrate_reference_pipeline.js');
 if(!fs.existsSync(script))throw Error('Received-reference pipeline is not released on trusted main yet');
 const r=cp.spawnSync(process.execPath,[script,'--push'],{cwd:worker,env:{...process.env,GEMRATE_PRIVATE_STORE:store},encoding:'utf8',maxBuffer:8e6});
 if(r.stdout)process.stdout.write(r.stdout);
 if(r.stderr)fs.writeFileSync(path.join(store,'last-pipeline-stderr.log'),r.stderr);
 if(r.status!==0||r.error)throw Error('Received-reference pipeline failed; outbox and raw originals retained');
 const result={at:new Date().toISOString(),head,isolatedMain:true,sourceAcquisitions:0,llmCalls:0,codexCalls:0};
 require('./acquisition_retry').atomicWrite(path.join(store,'last-worker-run.json'),result);return result;
 }catch(e){require('./acquisition_retry').atomicWrite(path.join(store,'last-worker-failure.json'),{at:new Date().toISOString(),reason:e.message,sourceAcquisitions:0});throw e;}finally{release();}
}
if(require.main===module){
 try{console.log(JSON.stringify(run()));}catch(e){console.error(e.message);process.exitCode=1;}
 // Independent domestic maintenance after receipt processing, including when
 // GemRate fails. Execute released code only, never a development working copy.
 const bridge=path.join(STORE,'worker/work/run_pc_freshness_bridge.js');
 if(fs.existsSync(bridge)){
  const r=cp.spawnSync(process.execPath,[bridge],{cwd:path.join(STORE,'worker'),env:{...process.env,GEMRATE_PRIVATE_STORE:STORE},encoding:'utf8',maxBuffer:8e6,timeout:1200000});
  if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
  if(r.status!==0||r.error)process.exitCode=1;
 }
}module.exports={run};
