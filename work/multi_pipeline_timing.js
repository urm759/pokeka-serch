const {stageEvidence}=require('./refresh_cadence');
const duration=r=>r&&Number.isFinite(Date.parse(r.startedAt))&&Number.isFinite(Date.parse(r.endedAt))?Math.max(0,Date.parse(r.endedAt)-Date.parse(r.startedAt)):null;
function build(pipelines,{jobsByRun={},now=Date.now(),execution=null}={}){
 const stages={},sources={};
 for(const [key,runs]of Object.entries(pipelines)){
  const scheduled=runs.filter(r=>r.event==='schedule').sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
  const gaps=scheduled.slice(1).map((r,i)=>({from:scheduled[i].created_at,to:r.created_at,ms:Date.parse(r.created_at)-Date.parse(scheduled[i].created_at),fromRun:scheduled[i].id,toRun:r.id}));
  const last=scheduled.at(-1);
  sources[key]={latestScheduledCreationAt:last?.created_at||null,creationTailMs:last?Math.max(0,now-Date.parse(last.created_at)):null,maximumCreatedGapMs:gaps.length?Math.max(...gaps.map(g=>g.ms)):null,gaps,
   note:'実行作成間隔。cron予定との一意な対応がないため、nearest枠を根拠に未作成の原因・遅延を断定しない。'};
  stages[key]=runs.filter(r=>Object.hasOwn(jobsByRun,r.id)||['pending','queued','in_progress','waiting','requested'].includes(r.status)).slice(0,4).map(r=>{
   const s=stageEvidence(r,jobsByRun[r.id]||[],execution,now,Object.hasOwn(jobsByRun,r.id));
   return {...s,acquisitionAndAggregationMs:duration(s.acquisitionAndAggregationStep),validationMs:duration(s.validation),saveAndPushMs:duration(s.saveAndPush)};
  });
 }
 return {version:1,at:new Date(now).toISOString(),sources,stages,llmCalls:0,codexCalls:0,sourceRequests:0,
  definitions:'作成前の空白・workflow枠待ち・job作成後待機・取得集計・検証・保存pushを分離。Pages到達は別の公開照合証跡。取得数不明はnull、再利用/skipを取得成功にしない。'};
}
module.exports={build,duration};
