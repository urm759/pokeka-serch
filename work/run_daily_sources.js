const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {atomicWrite}=require('./acquisition_retry');
const ROOT=path.join(__dirname,'..');
function run(tasks, execute, root=ROOT) {
  const result={version:1,runId:process.env.GITHUB_RUN_ID||null,startedAt:new Date().toISOString(),sources:[],llmCalls:0,codexCalls:0};
  for(const task of tasks) {
    const at=Date.now(); let child;
    try {child=execute(task);}catch(error){child={status:1,stderr:error.message};}
    const record={source:task.source,startedAt:new Date(at).toISOString(),endedAt:new Date().toISOString(),durationMs:Date.now()-at,
      status:child.status===0&&!child.error?'process-success':'failed',error:child.status===0?null:String(child.error?.message||child.stderr||'exit '+child.status).slice(-600)};
    result.sources.push(record);result.status=result.sources.some(r=>r.status==='failed')?'partial-with-failure':'process-success';
    atomicWrite(path.join(root,'data/daily-source-isolation.json'),result,0);
  }
  result.endedAt=new Date().toISOString();atomicWrite(path.join(root,'data/daily-source-isolation.json'),result,0);
  return result;
}
const tasks=[{source:'psaJapan',args:['work/run_tracked_update.js','psaJapan','work/update_psa_japan_services.js']},
  {source:'shopBuyback',args:['work/run_tracked_update.js','shopBuyback','work/update_shop_buybacks.js']},
  {source:'snkrRaw',args:['work/run_tracked_update.js','snkrRaw','work/update_snkr_raw_flip.js']},
  ...['cardrush','hareruya2'].map(source=>({source,args:['work/refresh_candidate_shops.js',source]}))];
if(require.main===module){
  if(process.argv.includes('--report-failures')) {const d=JSON.parse(fs.readFileSync(path.join(ROOT,'data/daily-source-isolation.json')));if(d.sources.some(r=>r.status==='failed')){console.error('Independent acquisition failures retained: '+d.sources.filter(r=>r.status==='failed').map(r=>r.source).join(','));process.exitCode=1;}}
  else console.log(JSON.stringify(run(tasks,task=>{const r=spawnSync(process.execPath,task.args,{cwd:ROOT,env:{...process.env,TRACKED_TIMEOUT_MS:'300000'},encoding:'utf8',timeout:330000,maxBuffer:64*1024*1024});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');return r;})));
}
module.exports={run};
