const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const METADATA_TIMEOUT_MS=60000, ARCHIVE_TIMEOUT_MS=240000;
function ensureTrustedBase(root,sha,execute=cp.spawnSync){
  if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Exact trusted source commit required');
  const has=()=>execute('git',['cat-file','-e',sha+'^{commit}'],{cwd:root,encoding:'utf8'}).status===0;
  if(has())return {fetched:false};
  const r=execute('git',['fetch','--no-tags','--depth=1','origin',sha],{cwd:root,encoding:'utf8',timeout:60000});
  if(r.status!==0||r.error||!has())throw Error('Trusted source base unavailable; saved archive retained');
  return {fetched:true};
}
function trusted(run,repository='urm759/pokeka-serch'){
  return run?.name==='Priority Purchase Price Refresh' && run.event==='schedule' && run.conclusion==='failure'
    && run.head_branch==='main' && run.repository?.full_name===repository && run.head_repository?.full_name===repository;
}
function trustedMonitor(run,repository='urm759/pokeka-serch'){
  return trusted({...run,name:'Priority Purchase Price Refresh'},repository)
    &&run?.name==='Data Update Health Watchdog';
}
// Recovery eligibility is separate from natural-schedule success accounting.
// Default-main followups/owner dispatches additionally require job-stage proof.
function monitorCheckpointOrigin(run,repository='urm759/pokeka-serch'){
 return ['workflow_run','workflow_dispatch'].includes(run?.event)
  &&run.path==='.github/workflows/watch-data-health.yml'
  &&(run.event!=='workflow_dispatch'||run.actor?.login===repository.split('/')[0])
  &&trusted({...run,name:'Priority Purchase Price Refresh',event:'schedule'},repository)
  &&run.name==='Data Update Health Watchdog';
}
function trustedMonitorCheckpoint(run,jobs){
 if(!monitorCheckpointOrigin(run))return false;
 const selected=(jobs.jobs||[]).filter(j=>j.name==='catchup');if(selected.length!==1)return false;
 const job=selected[0],steps=job.steps||[];
 return job.status==='completed'&&job.conclusion==='failure'
  &&steps.some(s=>s.name==='Fill missed price intervals with shared cooldown and access budgets'&&s.conclusion==='success')
  &&steps.some(s=>s.name==='Validate catchup data without changing purchase criteria'&&s.conclusion==='success')
  &&steps.some(s=>s.name==='Publish changed health state only'&&s.conclusion==='failure');
}
function trustedSafe(run,repository='urm759/pokeka-serch'){
  return trusted({...run,name:'Priority Purchase Price Refresh'},repository)&&run?.name==='Safe Checkpoint Backfill';
}
function trustedDaily(run,repository='urm759/pokeka-serch'){
  return trusted({...run,name:'Priority Purchase Price Refresh'},repository)&&run?.name==='Daily Fast Update';
}
function latestDaily(runs,options={}){
  const eligible=runs.filter(r=>trustedDaily(r));
  const selected=latestMonitor(eligible.map(r=>({...r,name:'Data Update Health Watchdog'})),options);
  return selected?eligible.find(r=>r.id===selected.id):null;
}
function latestMonitor(runs,{currentRunId,now=Date.now(),alreadyApplied=()=>false,lastAcquisitionAt=null,isTrusted=trustedMonitor}={}){
  const completed=Date.parse(lastAcquisitionAt)||0;
  return runs.filter(r=>isTrusted(r)&&String(r.id)!==String(currentRunId)
    &&Number.isFinite(Date.parse(r.updated_at))&&Date.parse(r.updated_at)<=now
    &&now-Date.parse(r.updated_at)<7*86400000&&Date.parse(r.updated_at)>completed&&!alreadyApplied(r.id,r))
    .sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0]||null;
}
function inspectedForRun(root,run){
  try{const r=JSON.parse(fs.readFileSync(path.join(root,'work/recovery-inspected-'+run.id+'.json')));return Number(r.runAttempt)===Number(run.run_attempt)&&r.headSha===run.head_sha;}catch{return false;}
}
function activeSourceHolds(root=ROOT){
  const work=path.join(root,'work');if(!fs.existsSync(work))return [];
  return fs.readdirSync(work).filter(f=>/^recovery-inspected-\d+\.json$/.test(f)).flatMap(f=>{
    const r=JSON.parse(fs.readFileSync(path.join(work,f)));
    return r.status==='source-merge-review-required'&&!fs.existsSync(path.join(work,'recovery-applied-'+r.runId+'.json'))?[r]:[];
  });
}
function recoveryArchiveName(runId,artifactId){
  if(!/^\d+$/.test(String(runId))||!/^\d+$/.test(String(artifactId)))throw Error('Exact recovery run/artifact identity required');
  return 'work/recovery-'+runId+'-'+artifactId+'.zip';
}
function retainSourceHold(root,run,artifact,error){
  if(error.code!=='SOURCE_RECOVERY_MERGE_REQUIRED')throw error;
  const result={status:'source-merge-review-required',runId:String(run.id),runAttempt:run.run_attempt,headSha:run.head_sha,checkedAt:new Date().toISOString(),
    artifactId:artifact.id,artifactDigest:artifact.digest,archive:recoveryArchiveName(run.id,artifact.id),files:error.files,reason:error.message,
    recoveryApplied:false,normalUpdatesMayContinue:true,sourceRequests:0,originalRetained:true};
  fs.writeFileSync(path.join(root,'work/recovery-inspected-'+run.id+'.json'),JSON.stringify(result));
  console.warn('::warning::取得済み原票は同時更新の照合保留。元archiveと失敗記録を保持し、正常な価格更新は継続: '+run.id);
  return result;
}
function lastSuccessfulAcquisition(root){
  let prior={},runs={};
  try{prior=JSON.parse(fs.readFileSync(path.join(root,'data/priority-price-execution.json')));}catch{}
  try{runs=JSON.parse(fs.readFileSync(path.join(root,'work/source-update-runs.json'))).sources||{};}catch{}
  // Daily recovery restores genuine source success times, not necessarily the
  // Priority gate. Never restore an older monitor over these recovered inputs.
  const times=[prior.startedAt,...['toreca','hareruya2','torecacamp','shopBuyback'].map(id=>runs[id]?.lastSuccessAt)].map(Date.parse).filter(Number.isFinite);
  return times.length?new Date(Math.max(...times)).toISOString():null;
}
function monitorRecoveryNeeded(jobs){
  const rows=jobs.jobs||[],catchup=rows.find(j=>j.name==='catchup'),failed=rows.filter(j=>j.conclusion==='failure');
  return !(catchup?.status==='completed'&&catchup.conclusion==='success'&&failed.length>0
    &&failed.every(j=>['publication_check','watch'].includes(j.name)));
}
function selectRecoveryArtifacts(artifacts,run,{safe=false,daily=false,monitor=false}={}){
  const suffix=run.id+'-'+run.run_attempt;
  // Prefer the existing valid source snapshot captured before publication. The
  // failure dump also contains a Git bundle and potentially conflicted JSON.
  // ZIP/hash/schema limits remain strict; do not enlarge them for unused data.
  const names=daily?['daily-prevalidation-'+suffix,'daily-recovery-'+suffix]
    :monitor?['monitor-prevalidation-'+suffix,'monitor-recovery-'+suffix]
    :[(safe?'safe-camp-checkpoint-':'priority-price-recovery-')+suffix];
  for(const name of names){const rows=artifacts.filter(a=>!a.expired&&a.name===name);if(rows.length){if(rows.length!==1)throw Error('One exact failure checkpoint is required');return rows;}}
  return [];
}
async function main(){
  let id=process.env.FAILED_PRICE_RUN_ID;const token=process.env.GITHUB_TOKEN,monitor=process.argv.includes('--latest-monitor'),dailyScan=process.argv.includes('--latest-daily');
  if((!monitor&&!dailyScan&&!/^\d+$/.test(id||''))||!token||monitor&&dailyScan)throw Error('Trusted failed run ID and existing Actions read token required');
  const base='https://api.github.com/repos/urm759/pokeka-serch/actions',headers={Authorization:'Bearer '+token,'User-Agent':'pokeka-checkpoint-recovery'};
  const get=async (url,timeoutMs=METADATA_TIMEOUT_MS)=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)throw Error('Recovery HTTP '+r.status);return r;};
  if(monitor||dailyScan){
    const runs=(await(await get(base+'/workflows/'+(dailyScan?'daily-fast-update.yml':'watch-data-health.yml')+'/runs?'+(dailyScan?'event=schedule&':'')+'per_page=10')).json()).workflow_runs||[];
    const candidate=(dailyScan?latestDaily:latestMonitor)(runs,{currentRunId:process.env.GITHUB_RUN_ID,lastAcquisitionAt:dailyScan?null:lastSuccessfulAcquisition(ROOT),
      ...(!dailyScan?{isTrusted:r=>trustedMonitor(r)||monitorCheckpointOrigin(r)}:{}),
      alreadyApplied:(runId,run)=>fs.existsSync(path.join(ROOT,'work/recovery-applied-'+runId+'.json'))||inspectedForRun(ROOT,run)});
    if(!candidate)return {status:dailyScan?'no-unpublished-daily-checkpoint':'no-unpublished-monitor-checkpoint',sourceRequests:0};id=String(candidate.id);
  }
  if(fs.existsSync(path.join(ROOT,'work/recovery-applied-'+id+'.json')))return {status:'already-restored',runId:id,sourceRequests:0};
  const run=await(await get(base+'/runs/'+id)).json(),safe=!monitor&&!dailyScan&&trustedSafe(run),daily=!monitor&&trustedDaily(run);if(!(monitor?trustedMonitor(run)||monitorCheckpointOrigin(run):dailyScan?daily:trusted(run)||safe||daily))throw Error('Untrusted recovery event');
  if(monitor){
    const jobs=await(await get(base+'/runs/'+id+'/jobs')).json();
    if(!monitorRecoveryNeeded(jobs)){
      const result={status:'observer-only-failure-no-price-recovery',runId:id,runAttempt:run.run_attempt,headSha:run.head_sha,checkedAt:new Date().toISOString(),sourceRequests:0,
        failedJobs:jobs.jobs.filter(j=>j.conclusion==='failure').map(j=>j.name),reason:'catchup取得/検証/保存公開は成功。監視/照合の失敗記録とartifactは保持し、独立した価格更新を止めない'};
      fs.writeFileSync(path.join(ROOT,'work/recovery-inspected-'+id+'.json'),JSON.stringify(result));return result;
    }
    if(!trustedMonitor(run)&&!trustedMonitorCheckpoint(run,jobs))throw Error('Followup recovery requires completed acquisition/validation and failed publication evidence');
  }
  const artifacts=selectRecoveryArtifacts((await(await get(base+'/runs/'+id+'/artifacts')).json()).artifacts,run,{safe,daily,monitor});
  if(daily&&artifacts.length===0){
    const result={status:'daily-source-checkpoint-unavailable',runId:id,runAttempt:run.run_attempt,headSha:run.head_sha,checkedAt:new Date().toISOString(),sourceRequests:0,
      reason:'Daily失敗は保持。回収可能な原票artifactなし。正常な他取得元の更新は継続'};
    fs.writeFileSync(path.join(ROOT,'work/recovery-inspected-'+id+'.json'),JSON.stringify(result));return result;
  }
  if(safe&&artifacts.length===0)return {status:'legacy-safe-compact-checkpoint-unavailable',runId:id,sourceRequests:0,reason:'既存の全量artifactは保持。正常取得の先送りや同じ取得元への再要求はしない'};
  if(artifacts.length!==1)throw Error('One exact failure checkpoint is required');
  const artifact=artifacts[0],expected=artifact.digest?.match(/^sha256:([a-f0-9]{64})$/)?.[1];
  if(!expected||artifact.size_in_bytes>(safe?32e6:256e6))throw Error('Artifact digest/size proof missing');
  const file=path.join(ROOT,recoveryArchiveName(id,artifact.id)),partial=file+'.download-'+Date.now();
  if(!fs.existsSync(file)){
    const response=await get(artifact.archive_download_url,ARCHIVE_TIMEOUT_MS),stream=fs.openSync(partial,'wx');let bytes=0;
    try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>256e6)throw Error('Artifact size budget');fs.writeSync(stream,chunk);}}finally{fs.closeSync(stream);}
    if(crypto.createHash('sha256').update(fs.readFileSync(partial)).digest('hex')!==expected)throw Error('Artifact digest mismatch; saved bytes retained');
    fs.renameSync(partial,file);
  }
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Saved artifact digest mismatch');
  if(!safe)ensureTrustedBase(ROOT,run.head_sha);
  try{return safe?require('./safe_camp_checkpoint').restore(file,id,ROOT):require('./restore_price_artifact').restore(file,id,run.head_sha,ROOT);}
  catch(error){return retainSourceHold(ROOT,run,artifact,error);}
}
if(require.main===module){
  if(process.argv.includes('--hold-status')){
    const rows=activeSourceHolds();if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'pending='+Boolean(rows.length)+'\n');
    if(rows.length)console.warn('::warning::原票照合保留 '+rows.length+'実行。回収完了・新規分析可能には数えません。');
    console.log(JSON.stringify({pending:Boolean(rows.length),runIds:rows.map(r=>r.runId),recoveryApplied:false}));
  }else main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={trusted,trustedMonitor,trustedSafe,trustedDaily,latestDaily,latestMonitor,monitorRecoveryNeeded,selectRecoveryArtifacts,recoveryArchiveName,inspectedForRun,lastSuccessfulAcquisition,ensureTrustedBase,activeSourceHolds,retainSourceHold,METADATA_TIMEOUT_MS,ARCHIVE_TIMEOUT_MS,monitorCheckpointOrigin,trustedMonitorCheckpoint};
