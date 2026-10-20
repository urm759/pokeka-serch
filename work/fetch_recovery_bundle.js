const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),run=process.argv[2];
if(!/^\d+$/.test(run||''))throw Error('Explicit Actions run ID required');
const c=cp.spawnSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\npath=urm759/pokeka-serch.git\n\n',encoding:'utf8'});
const fields=Object.fromEntries(c.stdout.trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const headers={Authorization:`Bearer ${fields.password}`,'User-Agent':'pokeka-saved-data-recovery'};
(async()=>{
  const base='https://api.github.com/repos/urm759/pokeka-serch/actions';
  const response=await fetch(`${base}/runs/${run}/artifacts`,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Artifact listing HTTP '+response.status);
  const artifacts=(await response.json()).artifacts.filter(a=>!a.expired&&/recovery/.test(a.name));
  if(artifacts.length!==1)throw Error('Expected exactly one recoverable bundle, found '+artifacts.length);
  console.log(JSON.stringify({stage:'bundle-download',artifactId:artifacts[0].id,compressedBytes:artifacts[0].size_in_bytes}));
  const file=path.join(root,'work',`recovery-${run}.zip`);
  const timeoutMs=Math.min(300000,Math.max(10000,Number(process.env.RECOVERY_DOWNLOAD_TIMEOUT_MS || 120000)));
  if(!Number.isFinite(timeoutMs))throw Error('Invalid recovery download budget');
  if(fs.existsSync(file))throw Error('Saved recovery archive already exists; validate and reuse without downloading');
  const partial=file+'.part',checkpoint=path.join(root,'work',`recovery-download-${run}.json`);
  if(fs.existsSync(partial))fs.renameSync(partial,partial+'.retained-'+Date.now());
  let bytes=0,fd;
  const save=(status,error=null)=>require('./acquisition_retry').atomicWrite(checkpoint,{runId:run,artifactId:artifacts[0].id,
    at:new Date().toISOString(),status,bytes,timeoutMs,partial:require('node:path').relative(root,partial),error,acquisitionRequests:0},0);
  try{
    const archive=await fetch(artifacts[0].archive_download_url,{headers,signal:AbortSignal.timeout(timeoutMs)});
    if(!archive.ok)throw Error('Artifact download HTTP '+archive.status);
    fd=fs.openSync(partial,'wx');save('downloading');
    for await(const chunk of archive.body){
      bytes+=chunk.length;if(bytes>256*1024*1024)throw Error('Recovery bundle exceeds safety budget');
      fs.writeSync(fd,chunk);save('downloading');
    }
    fs.closeSync(fd);fd=undefined;
    const length=Number(archive.headers.get('content-length'));
    if(length>0&&length!==bytes)throw Error('Incomplete recovery download');
    fs.renameSync(partial,file);save('downloaded-not-yet-validated');
    console.log(JSON.stringify({runId:run,artifactId:artifacts[0].id,file,bytes,acquisitionRequests:0}));
  }catch(error){if(fd!==undefined)fs.closeSync(fd);save('download-failed-partial-retained',error.message);throw error;}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
