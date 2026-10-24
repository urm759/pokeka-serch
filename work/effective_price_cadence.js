const fs=require('node:fs'),path=require('node:path'),{atomicWrite}=require('./acquisition_retry');
function distribution(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:a.length,medianMs:a.length?a[Math.floor(a.length/2)]:null,maxMs:a.length?a.at(-1):null};}
function observe(previous={runs:[]},cycles,receipts,now=Date.now(),context={}) {
  const runs=[...(previous.runs||[])];
  for(const [key,proof] of Object.entries(cycles.pipelines||{})) {
    const receipt=receipts.pipelines?.[key];
    if(!proof.confirmed || String(proof.runId)!==String(receipt?.runId) || runs.some(r=>String(r.runId)===String(proof.runId)))continue;
    const failed=new Set(receipt.sourceIsolation?.sources?.filter(s=>s.status==='failed').map(s=>s.source)||[]);
    const observations=Object.fromEntries(Object.entries(receipt.cardObservations||{}).filter(([id])=>!failed.has(id)));
    runs.push({runId:proof.runId,key,startedAt:proof.startedAt||null,publicationStepCompletedAt:proof.publicationStepCompletedAt||null,
      recordedAt:receipt.recordedAt,verifiedAt:proof.publicVerifiedAt||new Date(now).toISOString(),url:proof.url,observations,
      fixedCohortFreshness:receipt.outcomes?.fixedCohortFreshness||null});
  }
  runs.sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt));
  for(const r of runs){
    const audit=(context.audit?.runs||[]).find(a=>String(a.id)===String(r.runId));
    const job=audit?.jobs?.find(j=>j.publication?.published);
    const step=job?.steps?.filter(s=>s.status==='success'&&/Publish validated data|Publish changed health state|Commit safe progress|Commit changed/.test(s.name)).at(-1);
    r.startedAt ||= job?.startedAt||null;r.publicationStepCompletedAt ||= step?.completedAt||null;
  }
  const sources={};
  for(const r of runs)for(const [source,rows] of Object.entries(r.observations)) {
    const s=sources[source] ||= {cards:{},intervals:[],freshnessRecoveries:0,publicationDelays:[]};
    for(const row of rows) {
      const at=Date.parse(row.at||''); if(!Number.isFinite(at)||at>now)continue;
      const old=s.cards[row.id],oldAt=Date.parse(old?.at||'');
      if(Number.isFinite(oldAt)&&at<=oldAt)continue;
      if(Number.isFinite(oldAt))s.intervals.push({id:row.id,from:old.at,to:row.at,ms:at-oldAt,route:r.key,runId:r.runId});
      const started=Date.parse(r.startedAt||''),published=Date.parse(r.publicationStepCompletedAt||''),verified=Date.parse(r.verifiedAt||'');
      if(Number.isFinite(started)&&at>=started&&at<=Date.parse(r.recordedAt))s.publicationDelays.push({id:row.id,runId:r.runId,
        savedMs:Date.parse(r.recordedAt)-at,publishedMs:Number.isFinite(published)&&published>=at?published-at:null,
        verifiedMs:Number.isFinite(verified)&&verified>=at?verified-at:null});
      s.cards[row.id]={at:row.at,runId:r.runId,route:r.key};
    }
  }
  const summary=Object.fromEntries(Object.entries(sources).map(([id,s])=>[id,{verifiedCards:Object.keys(s.cards).length,
    intervalSamples:s.intervals.length,medianIntervalMs:s.intervals.length?[...s.intervals].sort((a,b)=>a.ms-b.ms)[Math.floor(s.intervals.length/2)].ms:null,
    maximumIntervalMs:s.intervals.length?Math.max(...s.intervals.map(r=>r.ms)):null,
    fresh6h:Object.values(s.cards).filter(r=>now-Date.parse(r.at)<=6*3600000).length,
    byRoute:Object.fromEntries(['priority','catchup','daily'].map(k=>[k,Object.values(s.cards).filter(r=>r.route===k).length]))}]));
  const profileCohort=previous.profileCohort||{at:new Date(now).toISOString(),ids:[...new Set(context.profileIds||[])].sort()};
  const groups={fixed192:new Set(context.fixedIds||[]),profileBaseline:new Set(profileCohort.ids)};
  const recoveryLatency=Object.fromEntries(Object.entries(groups).map(([name,ids])=>[name,{cohort:ids.size,
    sources:Object.fromEntries(Object.entries(sources).map(([source,s])=>{const intervals=s.intervals.filter(r=>ids.has(r.id)),delays=s.publicationDelays.filter(r=>ids.has(r.id));
      return [source,{interval:distribution(intervals.map(r=>r.ms)),over6h:distribution(intervals.filter(r=>r.ms>6*3600000).map(r=>r.ms-6*3600000)),
        over48h:distribution(intervals.filter(r=>r.ms>48*3600000).map(r=>r.ms-48*3600000)),reconfirmationToReceipt:distribution(delays.map(r=>r.savedMs)),
        reconfirmationToPublicationStep:distribution(delays.map(r=>r.publishedMs)),reconfirmationToPublicVerification:distribution(delays.map(r=>r.verifiedMs))}];}))}]));
  const departed=(context.targets?.pendingDepartures||[]).filter(r=>r.departureAudit?.comparable&&r.departureAudit.roots.some(x=>x.code==='expired-price'));
  recoveryLatency.departures={confirmedExpiredCards:new Set(departed.map(r=>r.id)).size,
    withIndependentFailure:new Set(departed.filter(r=>r.departureAudit.repair?.independentFailures?.length).map(r=>r.id)).size,
    unknownCauseCards:new Set((context.targets?.pendingDepartures||[]).filter(r=>!r.departureAudit?.comparable).map(r=>r.id)).size};
  return {version:1,generatedAt:new Date(now).toISOString(),runs,sources:summary,profileCohort,recoveryLatency,
    latencyBasis:'6時間目標超過と48時間採用期限超過は別。間隔超過件数は候補離脱枚数ではない。公開工程完了はGitHub stepの実時刻、公開確認は初ハッシュ照合時刻（到達時間の上限）。根拠不足はnull。固定の検索候補群は後から縮小しない。',
    basis:'取得・必須検証・保存push・公開JSON照合が揃った実行だけ。同じカードの個別確認日時の前進を計数。通常ジョブ間隔と別。未観測期間は推定しない。',llmCalls:0};
}
function build(root=path.join(__dirname,'..')) {
  const read=f=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));}catch{return {};}};
  const targets=read('work/search-profile-targets.json'),fixed=read('work/priority-freshness-history.json');
  const history=observe(read('work/verified-price-cadence-history.json'),read('data/scheduled-cycle-verification.json'),read('data/scheduled-cycle-receipts.json'),Date.now(),
    {audit:read('data/scheduled-execution-audit.json'),targets,profileIds:(targets.profiles||[]).flatMap(p=>p.urlsMatched||[]),fixedIds:fixed.sources?.hareruya2?.cohort||[]});
  atomicWrite(path.join(root,'work/verified-price-cadence-history.json'),history,0);
  const value={...history,runs:history.runs.map(({observations,...r})=>r)};
  atomicWrite(path.join(root,'data/effective-price-cadence.json'),value,0);return value;
}
module.exports={observe,build};
if(require.main===module)console.log(JSON.stringify(build().sources));
