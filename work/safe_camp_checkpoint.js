// Compact valid source checkpoint, captured before Git merge can introduce conflict markers.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const FILES=['data/pokemon-cards.json','data/torecacamp-stock-summary.json','work/torecacamp_catalog.json','work/torecacamp_progress.json'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function capture(root=path.resolve(__dirname,'..'),runId=process.env.GITHUB_RUN_ID,folder=path.join(process.env.RUNNER_TEMP||os.tmpdir(),'pokeka-camp-checkpoint-'+runId)){
 if(!/^\d+$/.test(String(runId)))throw Error('Explicit source run required');
 const rows=FILES.map(file=>{const bytes=fs.readFileSync(path.join(root,file));const data=JSON.parse(bytes);
 if(require('./enforce_overseas_publication').priceLeaks(data).length)throw Error('Restricted data in compact source checkpoint');
 return {file,bytes,sha256:hash(bytes)};});
 fs.mkdirSync(folder,{recursive:true});
 for(const r of rows){const target=path.join(folder,r.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,r.bytes);}
 const manifest={version:1,source:'safe-camp-prepublication',workflowRunId:String(runId),savedAt:new Date().toISOString(),invalidJson:[],files:rows.map(r=>({file:r.file,bytes:r.bytes.length,sha256:r.sha256}))};
 fs.writeFileSync(path.join(folder,'recovery-manifest.json'),JSON.stringify(manifest));
 return {folder,files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes.length,0),sourceRequests:0};
}
function restore(archive,runId,root=path.resolve(__dirname,'..')){
 const entries=require('./restore_price_artifact').zipEntries(fs.readFileSync(archive));
 const manifests=[...entries.keys()].filter(f=>/(^|\/)recovery-manifest.json$/.test(f));if(manifests.length!==1)throw Error('One compact source manifest required');
 const m=JSON.parse(entries.get(manifests[0])()),prefix=manifests[0].slice(0,-'recovery-manifest.json'.length);
 if(String(m.workflowRunId)!==String(runId)||m.source!=='safe-camp-prepublication'||m.invalidJson?.length||m.files.length!==FILES.length||new Set(m.files.map(r=>r.file)).size!==FILES.length)throw Error('Compact source provenance mismatch');
 const selected=m.files.map(r=>{if(!FILES.includes(r.file))throw Error('Unexpected compact source');
 const raw=entries.get(prefix+r.file)?.();if(!raw||raw.length!==r.bytes||hash(raw)!==r.sha256)throw Error('Compact source hash mismatch');JSON.parse(raw);return{...r,raw};});
 const folder=path.join(root,'work/recovery-'+runId);
 for(const r of selected){const target=path.join(folder,r.file);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==r.sha256)throw Error('Conflicting retained compact source');fs.writeFileSync(target,r.raw);}
 fs.writeFileSync(path.join(folder,'recovery-manifest.json'),JSON.stringify(m));
 const result=require('./recover_saved_camp').run(folder,root);
 const receipt=path.join(root,'work/recovery-applied-'+runId+'.json');
 if(!fs.existsSync(receipt))require('./acquisition_retry').atomicWrite(receipt,{...result,restored:result.recovered,stage:'saved-source-recovered-required-rebuild-pending'});
 return result;
}
if(require.main===module){try{const r=capture();if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'folder='+r.folder+'\n');console.log(JSON.stringify(r));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={FILES,capture,restore};
