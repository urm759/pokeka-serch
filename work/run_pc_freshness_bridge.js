// Launched by the EXISTING PC hourly timer, from a trusted-main worker only.
// Separate checkout/lock/raw inbox: GemRate failures cannot stop domestic work.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),retry=require('./acquisition_retry');
function git(cwd,args){const r=cp.spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:16e6});if(r.status!==0||r.error)throw Error('PC maintenance Git '+args[0]+' failed');return r.stdout.trim();}
async function run(root=path.resolve(__dirname,'..'),store=process.env.GEMRATE_PRIVATE_STORE){
 if(!store||!path.isAbsolute(store))throw Error('Existing private store must be explicit');
 const release=retry.lock(path.join(store,'.pc-freshness.lock')),at=new Date().toISOString(),stages=[];
 const result={at,origin:'existing-PC-hourly-timer',llmCalls:0,codexCalls:0};
 const phase=async(name,fn)=>{const startedAt=new Date().toISOString();try{const value=await fn();stages.push({name,startedAt,endedAt:new Date().toISOString(),status:'success'});return value;}catch(e){stages.push({name,startedAt,endedAt:new Date().toISOString(),status:'failed',reason:e.message});throw e;}};
 const worker=path.join(store,'domestic-worker'),ownership=path.join(store,'pc-domestic-owner.json');let recovering=false;
 try{
  try{result.cloud=await phase('cloud-run-creation-watch',()=>require('./pc_priority_watchdog').run({root,store}));}catch(e){result.cloud={status:'failed',reason:e.message};}
  await phase('trusted-main-checkout',()=>{
   git(root,['fetch','origin','main']);
   if(!fs.existsSync(worker))git(root,['worktree','add','--detach',worker,'origin/main']);
   if(path.dirname(fs.realpathSync(worker))!==fs.realpathSync(store)||!fs.existsSync(path.join(worker,'.git')))throw Error('Unproven isolated checkout');
   // Never discard an unpublished checkpoint or a developer change.
   const dirty=git(worker,['diff','--name-only','HEAD']).split('\n').filter(Boolean);
   const owner=fs.existsSync(ownership)?JSON.parse(fs.readFileSync(ownership)):null;
   const head=git(worker,['rev-parse','HEAD']);
   const ahead=cp.spawnSync('git',['merge-base','--is-ancestor','HEAD','origin/main'],{cwd:worker}).status!==0;
   if(dirty.length||ahead){
    if(!owner||dirty.some(f=>!allowed(f)))throw Error('Unexpected isolated changes retained for review');
    const proof=cp.spawnSync('git',['merge-base','--is-ancestor',owner.base,head],{cwd:worker});
    if(proof.status!==0)throw Error('Unproven pending checkpoint retained for review');
    const commits=git(worker,['diff','--name-only',owner.base,head]).split('\n').filter(Boolean);
    if(commits.some(f=>!allowed(f)))throw Error('Pending checkpoint changes code; review required');
    recovering=true;
   }else {
    // worktree add inherits the caller's sparse patterns. This lane finalizes
    // domestic data and therefore needs the complete trusted checkout; the
    // GemRate receiver keeps its own sparse worktree unchanged.
    git(worker,['sparse-checkout','disable']);
    git(worker,['checkout','--detach','origin/main']);
   }
   if(!recovering)retry.atomicWrite(ownership,{at,base:git(worker,['rev-parse','HEAD'])});
  });
  const context={root:worker,store};
  result.acquisition=recovering?{requests:0,adopted:0,recoveredBeforeFetch:0,status:'saved-checkpoint-before-new-requests'}
   :await phase('saved-recovery-and-PC-acquisition',()=>require(path.join(worker,'work/pc_yuyutei_maintenance')).acquire(context));
  if(!recovering&&!(result.acquisition.adopted||result.acquisition.recoveredBeforeFetch)){result.publication={status:'no-new-effective-input',published:false};return result;}
  const child=(script,args=[])=>{
   const r=cp.spawnSync(process.execPath,[path.join(worker,script),...args],{cwd:worker,encoding:'utf8',maxBuffer:64e6,timeout:900000,env:{...process.env,PRICE_EVIDENCE_FETCH_LIMIT:'0',YUYUTEI_PRODUCT_RECEIPTS_DIR:path.join(store,'pc-yuyutei-receipts')}});
   fs.appendFileSync(path.join(store,'pc-domestic-pipeline.log'),String(r.stdout||'')+String(r.stderr||''));
   if(r.status!==0||r.error)throw Error(script+' failed; acquired raw and checkpoint retained');
  };
  // Retail-only input changes do not require repeating the cloud-wide
  // pre-audit, historical comparison and then the same final purchase audit.
  // Finalization still rebuilds the formal profiles/targets from finalized data.
  await phase('price-identity-audit',()=>child('work/audit_state_a_prices.js'));
  // Retail-only changes do not redefine the required domestic/POP fields.
  // The finalizer still checks completion_price_consistency and performs a
  // complete rebuild whenever finalized price evidence makes it necessary.
  result.completionValidation='finalizer price/completion consistency guard; conditional full rebuild';
  await phase('source-observability',()=>child('work/audit_acquisition_progress.js'));
  await phase('aggregation',()=>child('work/finalize_update_status.js'));
  await phase('required-validation',()=>child('work/update_validation.js',['--required']));
  await phase('save-and-publication',()=>{
   const changed=git(worker,['diff','--name-only']).split('\n').filter(Boolean);
   if(changed.some(f=>!allowed(f)))throw Error('Unexpected non-data output retained for review');
   if(changed.length)git(worker,['add','--',...changed]);
   if(recovering&&!changed.length&&fs.existsSync(path.join(worker,'work/publish-recovery.json'))){
    require(path.join(worker,'work/publication_lineage')).verify(worker);
    require(path.join(worker,'work/enforce_overseas_publication')).verify(worker);
    // No unchecked merge or force push. A concurrent main update stays saved
    // for the regular validated merge path on the next aggregation attempt.
    git(worker,['push','origin','HEAD:main']);result.publication={status:'recovered-saved-checkpoint',published:true,commit:git(worker,['rev-parse','HEAD'])};
   }else result.publication=require(path.join(worker,'work/publish_data_checkpoint')).publish({cwd:worker,message:'Maintain proven PC product quotes without AI'});
  });
  // A Git push is not a Pages confirmation. Existing Watch/public lineage
  // verification provides the separate public receipt; do not manufacture one.
  result.publicConfirmation='awaiting-existing-cloud-public-check';
  if(result.publication?.published){
   result.publicConfirmation=await phase('public-quote-verification',async()=>{
    const saved=JSON.parse(fs.readFileSync(path.join(worker,'data/yuyutei-stock-summary.json'))).cards;
    const ids=[...new Set(result.acquisition.rows?.filter(r=>r.result==='verified-not-adopted').map(r=>r.id)||[])];
    // Recovery may publish an earlier acquisition: verify the saved receipt
    // rows, not the current attempt time or an old workflow ID.
    if(!ids.length)for(const [id,r]of Object.entries(saved))if(r.acquisitionEnvironment==='PC'&&r.receiptSha256)ids.push(id);
    for(let attempt=0;attempt<16;attempt++){
     if(attempt)await new Promise(r=>setTimeout(r,15000));
     try{
      const response=await fetch('https://urm759.github.io/pokeka-serch/data/yuyutei-stock-summary.json?pcVerification='+Date.now(),{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)continue;const live=(await response.json()).cards;
      if(ids.length&&ids.every(id=>['yuyuteiPrice','stock','observedAt','receiptSha256'].every(k=>live?.[id]?.[k]===saved[id][k])))return {status:'verified',verifiedAt:new Date().toISOString(),distinctCards:ids.length,observations:ids.map(id=>({id,at:saved[id].observedAt,receiptSha256:saved[id].receiptSha256})),basis:'実取得の元日時・価格・数量・原票SHAを公開JSONと照合。Git push/再利用を取得として数えない'};
     }catch{/* Bounded public verification only. Never refetch product pages. */}
    }
    return {status:'publication-pushed-public-confirmation-pending',distinctCards:null};
   });
  }
  return result;
 }finally{
  result.endedAt=new Date().toISOString();result.stages=stages;
  retry.atomicWrite(path.join(store,'last-pc-freshness-run.json'),result);
  fs.appendFileSync(path.join(store,'pc-freshness-history.jsonl'),JSON.stringify(result)+'\n');release();
 }
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run};
function allowed(file){return /^(data|work)\/.+\.json$/.test(file)&&!/(?:^|\/)\.private\//.test(file);}
