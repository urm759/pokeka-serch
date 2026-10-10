const fs=require('node:fs'),path=require('node:path'),{atomicWrite}=require('./acquisition_retry');
function observe(previous={runs:[]},cycles,receipts,now=Date.now()) {
  const runs=[...(previous.runs||[])];
  for(const [key,proof] of Object.entries(cycles.pipelines||{})) {
    const receipt=receipts.pipelines?.[key];
    if(!proof.confirmed || String(proof.runId)!==String(receipt?.runId) || runs.some(r=>String(r.runId)===String(proof.runId)))continue;
    const failed=new Set(receipt.sourceIsolation?.sources?.filter(s=>s.status==='failed').map(s=>s.source)||[]);
    const observations=Object.fromEntries(Object.entries(receipt.cardObservations||{}).filter(([id])=>!failed.has(id)));
    runs.push({runId:proof.runId,key,recordedAt:receipt.recordedAt,verifiedAt:new Date(now).toISOString(),url:proof.url,observations,
      fixedCohortFreshness:receipt.outcomes?.fixedCohortFreshness||null});
  }
  runs.sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt));
  const sources={};
  for(const r of runs)for(const [source,rows] of Object.entries(r.observations)) {
    const s=sources[source] ||= {cards:{},intervals:[],freshnessRecoveries:0};
    for(const row of rows) {
      const at=Date.parse(row.at||''); if(!Number.isFinite(at)||at>now)continue;
      const old=s.cards[row.id],oldAt=Date.parse(old?.at||'');
      if(Number.isFinite(oldAt)&&at<=oldAt)continue;
      if(Number.isFinite(oldAt))s.intervals.push({id:row.id,from:old.at,to:row.at,ms:at-oldAt,route:r.key,runId:r.runId});
      s.cards[row.id]={at:row.at,runId:r.runId,route:r.key};
    }
  }
  const summary=Object.fromEntries(Object.entries(sources).map(([id,s])=>[id,{verifiedCards:Object.keys(s.cards).length,
    intervalSamples:s.intervals.length,medianIntervalMs:s.intervals.length?[...s.intervals].sort((a,b)=>a.ms-b.ms)[Math.floor(s.intervals.length/2)].ms:null,
    maximumIntervalMs:s.intervals.length?Math.max(...s.intervals.map(r=>r.ms)):null,
    fresh6h:Object.values(s.cards).filter(r=>now-Date.parse(r.at)<=6*3600000).length,
    byRoute:Object.fromEntries(['priority','catchup','daily'].map(k=>[k,Object.values(s.cards).filter(r=>r.route===k).length]))}]));
  return {version:1,generatedAt:new Date(now).toISOString(),runs,sources:summary,
    basis:'取得・必須検証・保存push・公開JSON照合が揃った実行だけ。同じカードの個別確認日時の前進を計数。通常ジョブ間隔と別。未観測期間は推定しない。',llmCalls:0};
}
function build(root=path.join(__dirname,'..')) {
  const read=f=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));}catch{return {};}};
  const history=observe(read('work/verified-price-cadence-history.json'),read('data/scheduled-cycle-verification.json'),read('data/scheduled-cycle-receipts.json'));
  atomicWrite(path.join(root,'work/verified-price-cadence-history.json'),history,0);
  const value={...history,runs:history.runs.map(({observations,...r})=>r)};
  atomicWrite(path.join(root,'data/effective-price-cadence.json'),value,0);return value;
}
module.exports={observe,build};
if(require.main===module)console.log(JSON.stringify(build().sources));
