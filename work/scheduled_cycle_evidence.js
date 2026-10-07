const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const hash=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
function verify(run, jobs, receipt, publicTexts, pages) {
  const steps=(jobs.jobs||[]).flatMap(j=>j.steps||[]);
  const stages={acquisition:steps.some(s=>/Refresh due purchase prices|Run deterministic delta update|Continue bounded source|Continue public PokeDATA/.test(s.name)&&s.conclusion==='success'),
    validation:steps.some(s=>/Verify safety|Check publication safety|Verify shared purchase|Regression|regression/.test(s.name)&&s.conclusion==='success'),
    savePublish:steps.some(s=>/Publish validated data|Commit safe progress|Commit discovery|Commit changed/.test(s.name)&&s.conclusion==='success')};
  const matched=receipt && String(receipt.runId)===String(run.id);
  const hashes=matched?Object.entries(receipt.hashes).map(([file,expected])=>({file,matched:typeof publicTexts[file]==='string'&&hash(publicTexts[file])===expected})):[];
  const pagesAfter=pages?.conclusion==='success' && Date.parse(pages.created_at)>=Date.parse(run.run_started_at||run.created_at);
  const confirmed=run.event==='schedule'&&run.conclusion==='success'&&Object.values(stages).every(Boolean)&&matched&&hashes.length>0&&hashes.every(r=>r.matched)&&pagesAfter;
  return {runId:run.id,headSha:run.head_sha,event:run.event,url:run.html_url,stages,receiptMatches:!!matched,
    hashes,pagesRunId:pages?.id||null,confirmed,status:confirmed?'定期処理・保存・公開照合済み（実増分は別表示）':'定期公開照合未完了',
    outcomes:matched?receipt.outcomes:null,checkpoints:matched?receipt.checkpoints:null};
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
  const file=path.join(root,'data/scheduled-cycle-receipts.json');
  const previous=fs.existsSync(file)?read('data/scheduled-cycle-receipts.json'):{version:1,pipelines:{}};
  const files=['data/card-catalog-completion.json','data/completion-outcomes.json','data/acquisition-progress-audit.json'];
  const completion=read(files[1]),progress=read(files[2]);
  if(fs.existsSync(path.join(root,'data/priority-price-monitor.json')))files.push('data/priority-price-monitor.json');
  const optional=f=>{try{return read(f);}catch{return null;}};
  const before=optional(`work/scheduled-cycle-baseline-${key}.json`);
  const delta=String(before?.runId)===String(process.env.GITHUB_RUN_ID)
    ?require('./audit_completion_outcomes').compare(before.snapshot,require('./audit_completion_outcomes').snapshot(root)):null;
  previous.pipelines[key]={runId:process.env.GITHUB_RUN_ID,event:process.env.GITHUB_EVENT_NAME||null,
    headSha:process.env.GITHUB_SHA||null,recordedAt:new Date().toISOString(),
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
