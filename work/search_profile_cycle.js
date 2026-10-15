const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const outcomes=require('./audit_completion_outcomes'),{evaluate}=require('./build_priority_search_targets');
const read=(root,file,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return fallback;}};
const write=(root,file,value)=>require('./acquisition_retry').atomicWrite(path.join(root,file),value,0);
function profileDelta(before,after,beforeRows,afterRows) {
  const prior=new Set(before.ids),current=new Set(after.ids),seen=new Set([...(before.seenQualified||[]),...prior]);
  const gained=after.ids.filter(id=>!prior.has(id)),lost=before.ids.filter(id=>!current.has(id));
  const prospects=new Set(before.rows.filter(r=>r.unverifiedProspect).map(r=>r.id));
  const completed=[],freshnessRestored=[],linked=[];
  for(const id of prospects) {
    const b=beforeRows[id],a=afterRows[id];if(!b||!a)continue;
    const fields=a.fields.filter(f=>!b.fields.includes(f)&&!['psa9Evidence','buybackExitEvidence'].includes(f));
    if(fields.length)completed.push({id,fields,newlyAnalyzable:a.analysis&&!b.analysis});
    for(const [source,value]of Object.entries(a.sources))if(value.linked&&!b.sources[source]?.linked)linked.push({id,source});
  }
  for(const id of gained) {
    const b=beforeRows[id],a=afterRows[id];
    if(seen.has(id)&&b&&a&&Object.entries(a.sources).some(([s,v])=>v.fresh&&v.valid&&!b.sources[s]?.fresh))freshnessRestored.push(id);
  }
  const purchaseFilled=(before.rows || []).filter(r=>r.unverifiedProspect&&r.missing?.includes('shopStateA')&&r.buy==null&&after.inspectedRows?.[r.id]?.purchaseConfirmed).map(r=>r.id);
  const buybackFilled=(before.rows || []).filter(r=>r.unverifiedProspect&&r.missing?.includes('buybackExitEvidence')&&after.inspectedRows?.[r.id]?.buybackConfirmed).map(r=>r.id);
  const medianEvidenceRecovered=(before.rows || []).filter(r=>r.unverifiedProspect&&r.missing?.includes('referenceMedian')&&r.buy==null&&Number.isFinite(after.inspectedRows?.[r.id]?.buy)).map(r=>r.id);
  return {id:after.id,before:before.ids.length,after:after.ids.length,newListed:Object.keys(afterRows).filter(id=>!beforeRows[id]).length,
    purchaseFilled,buybackFilled,medianEvidenceRecovered,profileFilledCards:new Set([...completed.map(r=>r.id),...purchaseFilled,...buybackFilled,...medianEvidenceRecovered]).size,
    completedProspectOutcomes:[...new Set([...completed.map(r=>r.id),...purchaseFilled,...buybackFilled,...medianEvidenceRecovered])].map(id=>({id,name:(before.rows || []).find(r=>r.id===id)?.name || null,
      qualified:current.has(id),values:after.inspectedRows?.[id] || null,reasons:after.allExclusions?.[id] || []})),
    filledCards:completed.length,completed,newLinked:linked,firstQualified:gained.filter(id=>!seen.has(id)),freshnessRestored,
    requalified:gained.filter(id=>seen.has(id)),gained,lost,
    lostReasons:lost.map(id=>({id,reasons:after.allExclusions?.[id]||['最新条件で不合格・別監査で根拠確認'],
      before:before.rows.find(r=>r.id===id)?.metrics||null,after:after.inspectedRows?.[id]?.metrics||null,
      newlyFailed:(after.allExclusions?.[id]||[]).filter(r=>!before.rows.find(b=>b.id===id)?.reasons?.includes(r)),
      newDecisionFailures:(after.inspectedRows?.[id]?.metrics?.decision?.reasons||[]).filter(r=>!before.rows.find(b=>b.id===id)?.metrics?.decision?.reasons?.includes(r)),
      comparability:before.rows.find(r=>r.id===id)?.metrics?'個別前後値を保存済み':'旧版の個別詳細不足・原因を断定しない'})),
    remainingProspects:after.prospects,routePending:Object.fromEntries(Object.entries(after.routes).map(([s,r])=>[s,new Set(r.map(x=>x.id)).size])),
    note:'URL全項目固定、取得前後の実時刻は別。期限経過も差分要因で相場変化と断定しない。補完は必須項目復帰、URL発見/再確認とは別。鮮度復帰は初適合へ重複計上しない。探索適合は購入GOではない'};
}
function baseline(key,root=ROOT) {
  const at=new Date().toISOString(),config=read(root,'work/priority-search-profiles.json');
  if(!Array.isArray(config.profiles))return null;
  const history=read(root,'work/search-profile-targets.json');
  const calculationCache=new Map();
  const profiles=require('./search_profile_variants').allProfiles(config).map(p=>({...evaluate(p,at,{},[],calculationCache),seenQualified:history.profiles?.find(r=>r.id===p.id)?.seenQualified||[]}));
  const snapshot=outcomes.pack(outcomes.snapshot(root,Date.parse(at)));
  const psaUrls=Object.fromEntries((read(root,'work/psa-linkage-all.json').rows||[]).map(r=>[r.cardId,r.sourceSetUrl]));
  write(root,`work/search-profile-cycle-baseline-${key}.json`,{at,runId:process.env.GITHUB_RUN_ID||null,profiles,snapshot,psaUrls});
}
function record(key,root=ROOT) {
  const before=read(root,`work/search-profile-cycle-baseline-${key}.json`,null);
  if(!before||String(before.runId)!==String(process.env.GITHUB_RUN_ID||null))return null;
  const now=new Date().toISOString(),config=read(root,'work/priority-search-profiles.json');
  const calculationCache=new Map();
  const profiles=require('./search_profile_variants').allProfiles(config).filter(p=>before.profiles.some(b=>b.id===p.id)).map(p=>evaluate(p,now,{},(before.profiles.find(r=>r.id===p.id)?.rows||[]).map(r=>r.id),calculationCache));
  const afterRows=outcomes.snapshot(root,Date.parse(now)).rows,beforeRows=outcomes.unpack(before.snapshot).rows;
  const currentPsaUrls=Object.fromEntries((read(root,'work/psa-linkage-all.json').rows||[]).map(r=>[r.cardId,r.sourceSetUrl]));
  const currentPop=read(root,'data/psa-population-summary.json').cards || {};
  const inRun=at=>Date.parse(at)>=Date.parse(before.at)&&Date.parse(at)<=Date.parse(now);
  const comparisons=profiles.map(p=>{
    const b=before.profiles.find(r=>r.id===p.id);if(b?.urlHash!==p.urlHash)return {id:p.id,status:'条件変更・比較不能'};
    const delta=profileDelta(b,p,beforeRows,afterRows);
    delta.consumption={};
    for(const [source,requests]of Object.entries(b.routes)){
      const ids=new Set(requests.map(r=>r.id));
      const shopRecords=source==='domesticShops'?Object.values(read(root,'work/candidate-shop-refresh.json').sources||{}).flatMap(s=>s.records||[]):[];
      const psaRecords=source==='psaOfficial'?(read(root,'work/psa-fetch-progress.json').records||[]):[];
      const attempted=source==='psaOfficial'?[...ids].filter(id=>psaRecords.some(r=>r.url===(currentPop[id]?.u || currentPsaUrls[id] || before.psaUrls?.[id])&&inRun(r.fetchedAt)))
        :shopRecords.filter(r=>ids.has(r.id)&&inRun(r.startedAt)).map(r=>r.id);
      const sourceRecord=read(root,'work/source-update-runs.json').sources?.[source==='domesticShops'?'hareruya2':source];
      delta.consumption[source]={requestedCards:ids.size,itemAttemptedIds:[...new Set(attempted)],
        itemEvidenceCoverage:source==='psaOfficial'?'カード所属の公式セットURLの取得記録（今回の正規URL発見を含む）。カードの取得・仕様照合成功とは別':'個別記録に基づく試行数。最新実行以外は取得履歴を参照',
        bulkAttempted:sourceRecord&&inRun(sourceRecord.lastAttemptAt)?{at:sourceRecord.lastAttemptAt,status:sourceRecord.status,reason:sourceRecord.lastError||null}:null,
        note:'個別試行の証拠と一括取得の実行を分離。成功やURL発見を新規有効値と数えない'};
    }
    return delta;
  });
  const previous=read(root,'data/search-profile-cycle-progress.json',{version:1,cycles:[]});
  const uniqueOutcomes=uniqueProfileOutcomes(comparisons);
  const cycle={key,runId:before.runId,event:process.env.GITHUB_EVENT_NAME||'manual-local',baselineAt:before.at,recordedAt:now,uniqueOutcomes,
    profiles:comparisons,llmCalls:0,codexCalls:0,publication:'保存済み・公開照合は別受領証',
    note:'定期記録は取得/補完/適合を分離。正常データの公開成功はscheduled-cycle-receiptsと公開ハッシュで確認。未取得を仮定しない'};
  previous.cycles=previous.cycles.filter(r=>!(r.key===key&&r.runId===before.runId&&r.baselineAt===before.at));
  previous.cycles.push(cycle);previous.cycles=previous.cycles.slice(-90);previous.at=now;
  write(root,'data/search-profile-cycle-progress.json',previous);return cycle;
}
if(require.main===module){const key=process.argv[2]||'manual';if(process.argv.includes('--baseline'))baseline(key);else console.log(JSON.stringify(record(key)));}
function uniqueProfileOutcomes(profiles){
  const out={};
  for(const field of ['purchaseFilled','buybackFilled','medianEvidenceRecovered','firstQualified','requalified','freshnessRestored','gained','lost'])
    out[field]=[...new Set(profiles.flatMap(p=>p[field]||[]))].sort();
  out.requiredFilled=[...new Set(profiles.flatMap(p=>(p.completed||[]).map(c=>c.id)))].sort();
  out.distinctChangedCards=[...new Set(Object.values(out).flat())].sort();
  out.note='Unique IDs per outcome across original and median A/B; categories may overlap and must not be summed. Per-profile first qualification is not newly listed.';
  return out;
}
module.exports={baseline,record,profileDelta,uniqueProfileOutcomes};
