const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const METADATA_TIMEOUT_MS=60000, ARCHIVE_TIMEOUT_MS=240000;
function trusted(run,repository='urm759/pokeka-serch'){
  return run?.name==='Priority Purchase Price Refresh' && run.event==='schedule' && run.conclusion==='failure'
    && run.head_branch==='main' && run.repository?.full_name===repository && run.head_repository?.full_name===repository;
}
function trustedMonitor(run,repository='urm759/pokeka-serch'){
  return trusted({...run,name:'Priority Purchase Price Refresh'},repository)
    &&run?.name==='Data Update Health Watchdog';
}
function latestMonitor(runs,{currentRunId,now=Date.now(),alreadyApplied=()=>false,lastAcquisitionAt=null}={}){
  const completed=Date.parse(lastAcquisitionAt)||0;
  return runs.filter(r=>trustedMonitor(r)&&String(r.id)!==String(currentRunId)
    &&Number.isFinite(Date.parse(r.updated_at))&&Date.parse(r.updated_at)<=now
    &&now-Date.parse(r.updated_at)<7*86400000&&Date.parse(r.updated_at)>completed&&!alreadyApplied(r.id))
    .sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0]||null;
}
function monitorRecoveryNeeded(jobs){
  const rows=jobs.jobs||[],catchup=rows.find(j=>j.name==='catchup'),failed=rows.filter(j=>j.conclusion==='failure');
  return !(catchup?.status==='completed'&&catchup.conclusion==='success'&&failed.length>0
    &&failed.every(j=>['publication_check','watch'].includes(j.name)));
}
async function main(){
  let id=process.env.FAILED_PRICE_RUN_ID;const token=process.env.GITHUB_TOKEN,monitor=process.argv.includes('--latest-monitor');
  if((!monitor&&!/^\d+$/.test(id||''))||!token)throw Error('Trusted failed run ID and existing Actions read token required');
  const base='https://api.github.com/repos/urm759/pokeka-serch/actions',headers={Authorization:'Bearer '+token,'User-Agent':'pokeka-checkpoint-recovery'};
  const get=async (url,timeoutMs=METADATA_TIMEOUT_MS)=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)throw Error('Recovery HTTP '+r.status);return r;};
  if(monitor){
    const runs=(await(await get(base+'/workflows/watch-data-health.yml/runs?event=schedule&per_page=5')).json()).workflow_runs||[];
    let acquisition={};try{acquisition=JSON.parse(fs.readFileSync(path.join(ROOT,'data/priority-price-execution.json')));}catch{}
    const candidate=latestMonitor(runs,{currentRunId:process.env.GITHUB_RUN_ID,lastAcquisitionAt:acquisition.startedAt,
      alreadyApplied:runId=>['recovery-applied-','recovery-inspected-'].some(prefix=>fs.existsSync(path.join(ROOT,'work/'+prefix+runId+'.json')))});
    if(!candidate)return {status:'no-unpublished-monitor-checkpoint',sourceRequests:0};id=String(candidate.id);
  }
  if(fs.existsSync(path.join(ROOT,'work/recovery-applied-'+id+'.json')))return {status:'already-restored',runId:id,sourceRequests:0};
  const run=await(await get(base+'/runs/'+id)).json();if(!(monitor?trustedMonitor(run):trusted(run)))throw Error('Untrusted recovery event');
  if(monitor){
    const jobs=await(await get(base+'/runs/'+id+'/jobs')).json();
    if(!monitorRecoveryNeeded(jobs)){
      const result={status:'observer-only-failure-no-price-recovery',runId:id,headSha:run.head_sha,checkedAt:new Date().toISOString(),sourceRequests:0,
        failedJobs:jobs.jobs.filter(j=>j.conclusion==='failure').map(j=>j.name),reason:'catchup取得/検証/保存公開は成功。監視/照合の失敗記録とartifactは保持し、独立した価格更新を止めない'};
      fs.writeFileSync(path.join(ROOT,'work/recovery-inspected-'+id+'.json'),JSON.stringify(result));return result;
    }
  }
  const artifactName=(monitor?'monitor-recovery-':'priority-price-recovery-')+id+'-'+run.run_attempt;
  const artifacts=(await(await get(base+'/runs/'+id+'/artifacts')).json()).artifacts.filter(a=>!a.expired&&a.name===artifactName);
  if(artifacts.length!==1)throw Error('One exact failure checkpoint is required');
  const artifact=artifacts[0],expected=artifact.digest?.match(/^sha256:([a-f0-9]{64})$/)?.[1];
  if(!expected||artifact.size_in_bytes>256e6)throw Error('Artifact digest/size proof missing');
  const file=path.join(ROOT,'work/recovery-'+id+'.zip'),partial=file+'.download-'+Date.now();
  if(!fs.existsSync(file)){
    const response=await get(artifact.archive_download_url,ARCHIVE_TIMEOUT_MS),stream=fs.openSync(partial,'wx');let bytes=0;
    try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>256e6)throw Error('Artifact size budget');fs.writeSync(stream,chunk);}}finally{fs.closeSync(stream);}
    if(crypto.createHash('sha256').update(fs.readFileSync(partial)).digest('hex')!==expected)throw Error('Artifact digest mismatch; saved bytes retained');
    fs.renameSync(partial,file);
  }
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Saved artifact digest mismatch');
  return require('./restore_price_artifact').restore(file,id,run.head_sha,ROOT);
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={trusted,trustedMonitor,latestMonitor,monitorRecoveryNeeded,METADATA_TIMEOUT_MS,ARCHIVE_TIMEOUT_MS};
