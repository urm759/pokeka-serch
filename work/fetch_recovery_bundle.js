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
  const archive=await fetch(artifacts[0].archive_download_url,{headers,signal:AbortSignal.timeout(120000)});if(!archive.ok)throw Error('Artifact download HTTP '+archive.status);
  const data=Buffer.from(await archive.arrayBuffer());if(data.length>256*1024*1024)throw Error('Recovery bundle exceeds safety budget');
  const file=path.join(root,'work',`recovery-${run}.zip`);
  fs.writeFileSync(file,data);console.log(JSON.stringify({runId:run,artifactId:artifacts[0].id,file,bytes:data.length,acquisitionRequests:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
