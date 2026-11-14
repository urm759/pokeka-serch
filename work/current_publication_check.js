// Capture post-acquisition verification independently; report a failure AFTER
// the observer has saved its state. Never repeat a retailer acquisition.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const FILE='work/current-publication-check.json';
function capture(root=path.join(__dirname,'..'),env=process.env,invoke=cp.spawnSync){
 const id=String(env.GITHUB_RUN_ID||''),target=env.PUBLICATION_TARGET_RUN_ID||'',file=path.join(root,FILE);
 const result={runId:id,targetRunId:target||null,startedAt:new Date().toISOString(),sourceRequests:0,llmCalls:0,codexCalls:0,status:'not-required',reason:'No newly published catchup receipt; reuse/skip is not acquisition success'};
 if(target){
  if(!/^[1-9]\d+$/.test(target)||target!==id){result.status='failed';result.reason='Current run/receipt ID mismatch; verification not attempted';}
  else{
   result.status='verification-started';fs.writeFileSync(file,JSON.stringify(result));
   let r;try{r=invoke(process.execPath,[path.join(root,'work/verify_update_publication.js')],{cwd:root,env:{...env,PUBLICATION_TARGET_RUN_ID:target},encoding:'utf8',maxBuffer:8*1024*1024,timeout:300000});}catch(error){r={status:null,error};}
   result.exitCode=r.status;result.status='failed';
   if(r.status===0){try{const proof=JSON.parse(fs.readFileSync(path.join(root,'work/checkpoint-publication-proof.json'),'utf8'));if(String(proof.targetRunId)===target&&['confirmed','non-scheduled-publication-confirmed'].includes(proof.targetStatus)){result.status='verified';result.targetStatus=proof.targetStatus;result.publicationProof=Object.fromEntries(Object.entries(proof.pipelines||{}).map(([k,p])=>[k,{runId:p.runId,publicationConfirmed:p.publicationConfirmed,confirmed:p.confirmed,workflowStillRunning:p.workflowStillRunning,receiptMatches:p.receiptMatches,hashes:p.hashes,pagesRunId:p.pagesRunId}]));}}catch{}}
   result.reason=result.status==='verified'?'Exact current receipt, required hashes and Pages verified; source requests 0':r.error?.message||'Verification incomplete; original proof and exit code retained. Report after monitor publication';
  }
 }
 result.endedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(result));return result;
}
function report(root=path.join(__dirname,'..'),env=process.env){
 const file=path.join(root,FILE);if(!fs.existsSync(file))throw Error('Current publication verification capture missing');
 const r=JSON.parse(fs.readFileSync(file,'utf8'));if(String(r.runId)!==String(env.GITHUB_RUN_ID))throw Error('Current publication verification capture is stale');
 if(r.status==='failed'||r.status==='verification-started')throw Error(r.reason||'Current publication verification incomplete');return r;
}
if(require.main===module){try{console.log(JSON.stringify(process.argv.includes('--report-failure')?report():capture()));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={capture,report,FILE};
