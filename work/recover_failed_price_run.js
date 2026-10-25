const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
function trusted(run,repository='urm759/pokeka-serch'){
  return run?.name==='Priority Purchase Price Refresh' && run.event==='schedule' && run.conclusion==='failure'
    && run.head_branch==='main' && run.repository?.full_name===repository && run.head_repository?.full_name===repository;
}
async function main(){
  const id=process.env.FAILED_PRICE_RUN_ID,token=process.env.GITHUB_TOKEN;
  if(!/^\d+$/.test(id||'')||!token)throw Error('Trusted failed run ID and existing Actions read token required');
  if(fs.existsSync(path.join(ROOT,'work/recovery-applied-'+id+'.json')))return {status:'already-restored',runId:id,sourceRequests:0};
  const base='https://api.github.com/repos/urm759/pokeka-serch/actions',headers={Authorization:'Bearer '+token,'User-Agent':'pokeka-checkpoint-recovery'};
  const get=async url=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Recovery HTTP '+r.status);return r;};
  const run=await(await get(base+'/runs/'+id)).json();if(!trusted(run))throw Error('Untrusted recovery event');
  const artifacts=(await(await get(base+'/runs/'+id+'/artifacts')).json()).artifacts.filter(a=>!a.expired&&a.name==='priority-price-recovery-'+id+'-'+run.run_attempt);
  if(artifacts.length!==1)throw Error('One exact failure checkpoint is required');
  const artifact=artifacts[0],expected=artifact.digest?.match(/^sha256:([a-f0-9]{64})$/)?.[1];
  if(!expected||artifact.size_in_bytes>256e6)throw Error('Artifact digest/size proof missing');
  const file=path.join(ROOT,'work/recovery-'+id+'.zip'),partial=file+'.download-'+Date.now();
  if(!fs.existsSync(file)){
    const response=await get(artifact.archive_download_url),stream=fs.openSync(partial,'wx');let bytes=0;
    try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>256e6)throw Error('Artifact size budget');fs.writeSync(stream,chunk);}}finally{fs.closeSync(stream);}
    if(crypto.createHash('sha256').update(fs.readFileSync(partial)).digest('hex')!==expected)throw Error('Artifact digest mismatch; saved bytes retained');
    fs.renameSync(partial,file);
  }
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Saved artifact digest mismatch');
  return require('./restore_price_artifact').restore(file,id,run.head_sha,ROOT);
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={trusted};
