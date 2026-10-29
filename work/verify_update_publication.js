const fs=require('node:fs'),path=require('node:path');
const evidence=require('./scheduled_cycle_evidence');
const API='https://api.github.com/repos/urm759/pokeka-serch',PUBLIC='https://urm759.github.io/pokeka-serch/';
async function historicalPublication({run,jobs,receipt,pages,current,getText}){
  const publication=(jobs.jobs||[]).flatMap(j=>j.steps||[]).filter(s=>s.conclusion==='success'&&/Publish validated data|Publish changed health state|Commit safe progress|Commit changed/.test(s.name)).at(-1);
  const from=Date.parse(publication?.completed_at||run.run_started_at||run.created_at)-5000;
  const candidates=pages.filter(p=>p.name==='pages build and deployment'&&p.conclusion==='success'&&/^[a-f0-9]{40}$/.test(p.head_sha||'')&&Date.parse(p.created_at)>=from&&Date.parse(p.created_at)<=from+30*60000).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)).slice(0,4);
  for(const page of candidates){
    const base='https://raw.githubusercontent.com/urm759/pokeka-serch/'+page.head_sha+'/';
    let saved;try{saved=JSON.parse(await getText(base+'data/scheduled-cycle-receipts.json'));}catch(e){if(!/HTTP 404/.test(e.message))throw e;continue;}
    const frozen=saved.pipelines?.[receipt.pipeline];
    if(String(frozen?.runId)!==String(receipt.runId)||Object.keys(frozen?.hashes||{}).length!==Object.keys(receipt.hashes||{}).length||!Object.entries(receipt.hashes||{}).every(([f,h])=>frozen.hashes[f]===h))continue;
    const texts={};for(const file of Object.keys(receipt.hashes||{}))texts[file]=evidence.observationText(frozen,file)||await getText(base+file);
    const result=evidence.verify(run,jobs,receipt,texts,page);
    if(result.publicationConfirmed)return {...result,receiptHashes:receipt.hashes,historicalPublication:true,publishedCommit:page.head_sha,currentPublicMatches:false,
      hashes:result.hashes.map(h=>({...h,historicalMatched:h.matched,currentMatched:current.hashes.find(c=>c.file===h.file)?.currentMatched===true})),
      note:'当該実行のPages配信成功コミットと原受領証・全採用hashを照合。後続の正常更新とは別の過去公開実績。現在の鮮度・価格一致を意味しない'};
  }
  return current;
}
function preserve(cycles,key,result){
  cycles.pipelines||={};cycles.history||={};
  if(result.publicationConfirmed&&!result.confirmed){cycles.nonScheduledChecks||={};cycles.nonScheduledChecks[key]=result;return cycles;}
  const prior=cycles.pipelines[key];
  if(prior?.confirmed&&(!result.confirmed||String(prior.runId)!==String(result.runId))){
    const rows=cycles.history[key]||[];
    cycles.history[key]=[...rows.filter(r=>String(r.runId)!==String(prior.runId)),prior].slice(-30);
  }
  // A later observer-only run has no new receipt. Do not erase acquired evidence.
  if(prior?.confirmed&&!result.confirmed&&(!result.receiptMatches||String(prior.runId)===String(result.runId))){cycles.lastChecks||={};cycles.lastChecks[key]=result;return cycles;}
  cycles.pipelines[key]=result;return cycles;
}
async function inspect({getJson,getText,at=Date.now(),targetRunId=null}){
  const textCache=new Map(),readText=url=>{if(!textCache.has(url))textCache.set(url,getText(url));return textCache.get(url);};
  const [receipts,deployments]=await Promise.all([getJson(PUBLIC+'data/scheduled-cycle-receipts.json?verify='+at),getJson(API+'/actions/runs?per_page=40')]);
  const cycles={version:1,checkedAt:new Date(at).toISOString(),pipelines:{},targetRunId};let pagesHistory=null;
  for(const key of ['priority','catchup','daily','safe']){
    const receipt=receipts.pipelines?.[key];if(!receipt?.runId)continue;
    if(targetRunId&&String(receipt.runId)!==String(targetRunId))continue;
    const [run,jobs]=await Promise.all([getJson(API+'/actions/runs/'+receipt.runId),getJson(API+'/actions/runs/'+receipt.runId+'/jobs')]);
    if(run.head_branch!=='main'||run.head_repository?.full_name!=='urm759/pokeka-serch')throw Error('Untrusted publication receipt origin');
    const pages=(deployments.workflow_runs||[]).find(r=>r.name==='pages build and deployment'&&r.conclusion==='success'&&Date.parse(r.created_at)>=Date.parse(run.run_started_at||run.created_at));
    const texts={};
    for(const file of Object.keys(receipt.hashes||{})){
      if(!/^data\/[a-z0-9/-]+\.json$/i.test(file))throw Error('Invalid receipt path');
      // A time-forward monitor has an exact historical copy in this receipt.
      const saved=evidence.observationText(receipt,file);texts[file]=saved||await readText(PUBLIC+file+'?verify='+at);
    }
    let result={...evidence.verify(run,jobs,receipt,texts,pages),receiptHashes:receipt.hashes};
    if(!result.publicationConfirmed&&result.hashes.some(h=>!h.matched)&&Object.values(result.stages).every(Boolean)){
      if(!pagesHistory){const id=deployments.workflow_runs?.find(r=>r.name==='pages build and deployment')?.workflow_id;
        pagesHistory=id?(await getJson(API+'/actions/workflows/'+id+'/runs?per_page=50')).workflow_runs||[]:deployments.workflow_runs||[];}
      result=await historicalPublication({run,jobs,receipt,pages:pagesHistory,current:result,getText:readText});
    }
    cycles.pipelines[key]=result;
  }
  cycles.confirmed=Object.values(cycles.pipelines).filter(r=>r.confirmed).length;
  const target=targetRunId&&Object.values(cycles.pipelines).find(r=>String(r.runId)===String(targetRunId));
  cycles.targetStatus=!targetRunId?'latest-published-receipts':target?.confirmed?'confirmed':target?.publicationConfirmed?'non-scheduled-publication-confirmed':target?'pending':'not-yet-published-or-superseded';
  if(targetRunId&&!target){
    const [run,jobs]=await Promise.all([getJson(API+'/actions/runs/'+targetRunId),getJson(API+'/actions/runs/'+targetRunId+'/jobs')]);
    if(run.head_branch!=='main'||run.head_repository?.full_name!=='urm759/pokeka-serch')throw Error('Untrusted publication receipt origin');
    const steps=(jobs.jobs||[]).flatMap(j=>j.steps||[]);
    if(run.name==='Priority Purchase Price Refresh'&&run.conclusion==='success'
      &&steps.some(s=>s.name==='Refresh due purchase prices without new-set exploration or LLM'&&s.conclusion==='success')
      &&steps.some(s=>s.name==='Publish validated data with conflict protection'&&s.conclusion==='skipped')){
      cycles.targetStatus='no-acquisition-required';cycles.targetObservation={runId:targetRunId,sourceAcquisition:false,publicationRequired:false};
    }
  }
  return cycles;
}
async function main(){
  const headers={'User-Agent':'pokeka-non-ai-publication-verifier',Accept:'application/vnd.github+json'};
  if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
  const get=async url=>{const r=await fetch(url,{headers:url.startsWith(API+'/')?headers:{'User-Agent':headers['User-Agent']},signal:AbortSignal.timeout(30000)});if(!r.ok){const e=Error('Publication verification HTTP '+r.status);e.terminal=[401,403].includes(r.status);e.retryAfterMs=Math.max(15000,Number(r.headers.get('retry-after')||15)*1000);throw e;}return r;};
  let event={};if(process.env.GITHUB_EVENT_PATH)event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
  const parent=event.workflow_run;
  const targetRunId=parent&&['Priority Purchase Price Refresh','Daily Fast Update','Safe Checkpoint Backfill'].includes(parent.name)?parent.id:null;
  const file=path.join(__dirname,'checkpoint-publication-proof.json'),started=Date.now(),attempts=[];
  fs.writeFileSync(file,JSON.stringify({startedAt:new Date(started).toISOString(),phase:'verification-started',targetRunId,llmCalls:0,codexCalls:0,sourceRequests:0}));
  let result,terminal=false,retryAfterMs=15000;
  do{
    try{result=await inspect({getJson:async u=>(await get(u)).json(),getText:async u=>(await get(u)).text(),targetRunId});attempts.push({at:new Date().toISOString(),status:result.targetStatus,confirmed:result.confirmed});}
    catch(e){attempts.push({at:new Date().toISOString(),error:e.message});terminal=!!e.terminal||/Untrusted|Invalid receipt/.test(e.message);retryAfterMs=e.retryAfterMs||15000;}
    const proof={...result,attempts,llmCalls:0,codexCalls:0,sourceRequests:0};fs.writeFileSync(file,JSON.stringify(proof));
    console.log(JSON.stringify({attempt:attempts.at(-1),sourceRequests:0}));
    if(terminal)throw Error('Publication verification held; access/schema error retained without automatic retry');
    if(result&&(!targetRunId&&result.confirmed>0||['confirmed','non-scheduled-publication-confirmed','no-acquisition-required'].includes(result.targetStatus)))return proof;
    if(Date.now()-started>=240000)throw Error('Publication confirmation pending; saved proof retained, no source reacquisition');
    await new Promise(r=>setTimeout(r,Math.min(retryAfterMs,60000)));
  }while(true);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={inspect,preserve,historicalPublication};
