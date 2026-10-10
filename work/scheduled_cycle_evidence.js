const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const hash=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
function verify(run, jobs, receipt, publicTexts, pages) {
  const steps=(jobs.jobs||[]).flatMap(j=>j.steps||[]);
  const stages={acquisition:steps.some(s=>/Refresh due purchase prices|Fill missed price intervals|Run deterministic delta update|Continue bounded source|Continue public PokeDATA/.test(s.name)&&s.conclusion==='success'),
    validation:steps.some(s=>/Verify safety|Validate catchup data|Check publication safety|Verify shared purchase|Regression|regression/.test(s.name)&&s.conclusion==='success'),
    savePublish:steps.some(s=>/Publish validated data|Publish changed health state|Commit safe progress|Commit discovery|Commit changed/.test(s.name)&&s.conclusion==='success')};
  const matched=receipt && String(receipt.runId)===String(run.id);
  const hashes=matched?Object.entries(receipt.hashes).map(([file,expected])=>({file,matched:typeof publicTexts[file]==='string'&&hash(publicTexts[file])===expected})):[];
  const pagesAfter=pages?.conclusion==='success' && Date.parse(pages.created_at)>=Date.parse(run.run_started_at||run.created_at);
  const reportName='Report independent acquisition failures without hiding them';
  const safePartial=receipt?.sourceIsolation && String(receipt.sourceIsolation.runId)===String(run.id)
    && receipt.sourceIsolation.status==='partial-with-failure'
    && steps.filter(s=>s.conclusion==='failure').every(s=>s.name===reportName||s.name==='Report newly detected alerts')
    && steps.some(s=>s.name===reportName&&s.conclusion==='failure');
  const scheduled=run.event==='schedule'||receipt?.pipeline==='catchup'&&run.event==='workflow_run';
  const confirmed=scheduled&&(run.conclusion==='success'||safePartial)&&Object.values(stages).every(Boolean)&&matched&&hashes.length>0&&hashes.every(r=>r.matched)&&pagesAfter;
  return {runId:run.id,headSha:run.head_sha,event:run.event,url:run.html_url,stages,receiptMatches:!!matched,
    hashes,pagesRunId:pages?.id||null,confirmed,status:confirmed?'定期処理・保存・公開照合済み（実増分は別表示）':'定期公開照合未完了',
    partial:confirmed&&Boolean(safePartial),outcomes:matched?receipt.outcomes:null,checkpoints:matched?receipt.checkpoints:null};
}
function baseline(key,root=ROOT) {
  if(!process.env.GITHUB_RUN_ID)throw new Error('baseline requires a real Actions run ID');
  const snapshot=require('./audit_completion_outcomes').snapshot(root);
  const monitor=path.join(root,'data/priority-price-monitor.json');
  const fixedCohorts=fs.existsSync(monitor)?JSON.parse(fs.readFileSync(monitor,'utf8')).fixedCohortFreshness:null;
  fs.writeFileSync(path.join(root,`work/scheduled-cycle-baseline-${key}.json`),JSON.stringify({runId:process.env.GITHUB_RUN_ID,snapshot,fixedCohorts}));
}
function record(key,root=ROOT) {
  if(!process.env.GITHUB_RUN_ID) throw new Error('scheduled receipt requires a real Actions run ID');
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  if (key === 'catchup') {
    const file = path.join(root,'data/price-catchup-status.json');
    const current = fs.existsSync(file) ? read('data/price-catchup-status.json') : null;
    if (!current || String(current.runId) !== String(process.env.GITHUB_RUN_ID) || current.status !== 'acquired-saved') {
      console.log('No new catchup acquisition; previous receipt retained'); return;
    }
  }
  const file=path.join(root,'data/scheduled-cycle-receipts.json');
  const previous=fs.existsSync(file)?read('data/scheduled-cycle-receipts.json'):{version:1,pipelines:{}};
  const files=['data/card-catalog-completion.json','data/completion-outcomes.json','data/acquisition-progress-audit.json'];
  const completion=read(files[1]),progress=read(files[2]);
  if(fs.existsSync(path.join(root,'data/priority-price-monitor.json')))files.push('data/priority-price-monitor.json');
  const optional=f=>{try{return read(f);}catch{return null;}};
  const monitorSources=optional('data/priority-price-monitor.json')?.sources||{};
  const cardObservations=Object.fromEntries(Object.entries(monitorSources).map(([id,source])=>[id,
    [...new Map([...(source.fixedCards||[]),...(source.cards||[])].map(row=>[row.id,{id:row.id,at:row.lastConfirmedAt}])).values()]]));
  const observedIds=new Set(Object.values(cardObservations).flat().map(row=>row.id));
  for (const source of ['cardrush','hareruya2','yuyutei','torecacamp']) {
    const file=`data/${source}-stock-summary.json`, data=optional(file);
    if (!data) continue;
    files.push(file);
    if (!cardObservations[source]) cardObservations[source]=Object.entries(data.cards||{}).filter(([id])=>observedIds.has(id))
      .map(([id,row])=>({id,at:row.observedAt||row.updatedAt||null}));
  }
  const before=optional(`work/scheduled-cycle-baseline-${key}.json`);
  const delta=String(before?.runId)===String(process.env.GITHUB_RUN_ID)
    ?require('./audit_completion_outcomes').compare(before.snapshot,require('./audit_completion_outcomes').snapshot(root)):null;
  previous.pipelines[key]={pipeline:key,runId:process.env.GITHUB_RUN_ID,event:process.env.GITHUB_EVENT_NAME||null,
    headSha:process.env.GITHUB_SHA||null,recordedAt:new Date().toISOString(),
    sourceIsolation:key==='daily'?optional('data/daily-source-isolation.json'):(()=>{
      const execution=optional('data/priority-price-execution.json');
      if(!['priority','catchup'].includes(key)||String(execution?.runId)!==String(process.env.GITHUB_RUN_ID))return null;
      const failures=(execution.runs||[]).filter(r=>r.processStatus==='failed');
      return {runId:execution.runId,status:failures.length?'partial-with-failure':'process-success',sources:failures.map(r=>({source:r.script,status:'failed'}))};
    })(),
    cardObservations,
    hashes:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(root,f),'utf8'))])),
    outcomes:{counts:completion.counts,runDelta:delta,deltaStatus:delta?'同じ実行の取得前スナップショットから比較':'取得前記録不足・増分を推定しない',
      fixedCohortFreshness:{before:before?.fixedCohorts||null,after:optional('data/priority-price-monitor.json')?.fixedCohortFreshness||null},
      sources:Object.fromEntries(Object.entries(progress.sources||{}).map(([k,v])=>[k,{newLinked:v.newLinked,usableNet:v.usableNet,freshUsableAdded:v.freshUsableAdded,lastSuccessAt:v.lastSuccessAt}]))},
    checkpoints:{safe:optional('work/safe-backfill-progress.json'),pokedata:optional('data/pokedata-manifest.json')?.sets?.map(s=>({name:s.name,count:s.count,status:s.status})),
      priority:optional('data/priority-price-execution.json')?.runs?.map(r=>({script:r.script,status:r.status,attempted:r.attempted,changed:r.changed}))},
    llmCalls:0,codexCalls:0};
  fs.writeFileSync(file,JSON.stringify(previous));
  console.log(JSON.stringify({recorded:key,runId:process.env.GITHUB_RUN_ID,counts:completion.counts}));
}
if(require.main===module){const key=process.argv[2]||'unknown';if(!/^[a-z]+$/.test(key))throw new Error('invalid pipeline');if(process.argv.includes('--baseline'))baseline(key);else record(key);}
module.exports={hash,verify,record,baseline};
