const fs=require('node:fs'),path=require('node:path'),{acquisitionRows}=require('./effective_price_cadence');
const HOUR=3600000,DAY=24*HOUR;
const validTime=(at,now)=>/T\d{2}:/.test(String(at))&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=now;
const dist=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:a.length,medianMs:a.length?a[Math.floor((a.length-1)*.5)]:null,p90Ms:a.length?a[Math.floor((a.length-1)*.9)]:null,p95Ms:a.length?a[Math.floor((a.length-1)*.95)]:null,maxMs:a.at(-1)??null};};
function coverage(inventory,cards,completion,pop,now=Date.now()) {
  const sourceIds=new Set((inventory.cards||[]).map(r=>r.id)),site=new Map(cards.map(c=>[c.id,c])),listed=[...sourceIds].filter(id=>site.has(id));
  const structural=cards.filter(c=>completion.cards?.[c.id]?.s==='分析可能');
  const counts={};for(const r of Object.values(completion.cards||{}))for(const item of r.m||[])counts[item]=(counts[item]||0)+1;
  const popBlocked=structural.filter(c=>!pop.cards?.[c.id]||pop.cards[c.id].stale!==false);
  return {scope:'既知取得元の保存済みカード集合。全ポケカの網羅率ではない。',sourceCards:sourceIds.size,currentSourceResponse:inventory.currentResponseTotal??null,retainedSourceCards:inventory.retainedHistoricalTotal??null,siteCards:cards.length,sourceListed:listed.length,listingPct:sourceIds.size?listed.length/sourceIds.size*100:null,
    supplements:cards.filter(c=>!sourceIds.has(c.id)).length,structural:structural.length,structuralPct:cards.length?structural.length/cards.length*100:null,goalPct:95,maintenanceFloorPct:90,goalCount:Math.ceil(cards.length*.95),maintenanceFloorCount:Math.ceil(cards.length*.9),additionalToGoal:Math.max(0,Math.ceil(cards.length*.95)-structural.length),
    freshAllRequiredConfirmed:popBlocked.length===structural.length?0:null,freshnessUnverified:structural.length-popBlocked.length,popFreshnessBlocked:popBlocked.length,
    freshnessNote:'必須POPの実確認36時間期限を満たさないものは鮮度込み分析可能に数えない。他の必須入力の鮮度根拠まで揃わない場合は未確定。構造的分析可能の定義・検索・GOは変更しない。',
    missingRequired:counts,unknownYear:Object.values(completion.cards||{}).filter(r=>!r.ry).length,unknownRarity:cards.filter(c=>!require('./build_high_rarity_readiness').rarity(c)).length,at:new Date(now).toISOString()};
}
function capacity(history,targetRows,now=Date.now(),targetHours=6,adoptionHours=48) {
  const sources={};
  for(const [source,rows]of Object.entries(targetRows)){
    const target=new Map(rows.map(r=>[r.id,r])),events=new Map();
    for(const run of history.runs||[])for(const row of acquisitionRows(run.observations?.[source]||[],run.observationScope)){if(target.has(row.id)&&validTime(row.at,now)){
      const key=row.id+'|'+row.at;
      if(!events.has(key))events.set(key,{...row,atMs:Date.parse(row.at),route:run.key,origin:run.publicationKind||'legacy-confirmed-unclassified'});
    }}
    const byCard=new Map();for(const e of events.values()){if(!byCard.has(e.id))byCard.set(e.id,[]);byCard.get(e.id).push(e);}
    const intervals=[],publish=[];
    for(const v of byCard.values()){v.sort((a,b)=>a.atMs-b.atMs);for(let i=1;i<v.length;i++)intervals.push(v[i].atMs-v[i-1].atMs);}
    for(const run of history.runs||[])for(const row of acquisitionRows(run.observations?.[source]||[],run.observationScope)){const at=Date.parse(row.at),p=Date.parse(run.publicationStepCompletedAt);if(target.has(row.id)&&validTime(row.at,now)&&at>=Date.parse(run.startedAt)&&Number.isFinite(p)&&p>=at)publish.push(p-at);}
    const recent=[...events.values()].filter(e=>e.atMs>=now-DAY),week=[...events.values()].filter(e=>e.atMs>=now-7*DAY),need=target.size*24/targetHours;
    const current=[...target.values()].map(r=>validTime(r.at,now)?now-Date.parse(r.at):null);
    const origins=['verified-natural-schedule','verified-non-scheduled-publication','legacy-confirmed-unclassified'];
    sources[source]={targets:target.size,targetHours,adoptionHours,requiredConfirmationsPerDay:need,requiredToAvoidAdoptionExpiryPerDay:target.size*24/adoptionHours,capacityWith25PctHeadroom:Math.ceil(need*1.25),verifiedCohort24h:recent.length,verifiedCohort7d:week.length,verifiedCohortDaily7d:week.length/7,verifiedDistinctCards24h:new Set(recent.map(r=>r.id)).size,verifiedDistinctCards7d:new Set(week.map(r=>r.id)).size,
      verifiedCohort24hByOrigin:Object.fromEntries(origins.map(k=>[k,recent.filter(r=>r.origin===k).length])),
      verifiedCohort7dByOrigin:Object.fromEntries(origins.map(k=>[k,week.filter(r=>r.origin===k).length])),
      originNote:'実際に公開照合した更新能力。GitHubの自然定期とworkflow_dispatch等を分離。外部Cronの起源はprovider証跡が必要。旧履歴の未分類を自然定期へ推定しない。同じID/元確認日時は最初の証拠1件だけ。',
      actualConfirmations24h:null,measurementStatus:'partial-confirmed-lower-bound',measurementNote:'確認済み受領証と原票回収分だけ。未計測の取得が残るため、実際の全確認数は未確定。0件と断定せず、要約の異なる確認カード数とも別。',
      coverageOfDailyRequirement:need?recent.length/need:null,targetExceeded:current.filter(age=>age!=null&&age>targetHours*HOUR).length,adoptionExpired:current.filter(age=>age!=null&&age>adoptionHours*HOUR).length,confirmationTimeUnknown:current.filter(age=>age==null).length,
      latestObservationCards24h:current.filter(age=>age!=null&&age<=DAY).length,
      latestObservationCards7d:current.filter(age=>age!=null&&age<=7*DAY).length,
      latestObservationNote:'公開用の現行要約に残る個別実確認日時による異なるカード数。同日の反復確認回数ではなく下限。固定群receiptの全取得元能力への外挿、ファイル生成日時による補完はしない。',
      intervals:dist(intervals),confirmationToPublicationStep:dist(publish),
      sampleNote:'実取得・公開照合済みreceipt中の対象カード。個別実確認日時の前進を重複除外。取得元全体の実績能力とは異なる下限値。未観測間隔を補完しない。'};
  }return sources;
}
function build(root=path.join(__dirname,'..'),now=Date.now()){
 const read=(p,f={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));}catch{return f;}};
 const cards=read('data/pokemon-cards.json',[]),completion=read('data/card-catalog-completion.json'),history=read('work/verified-price-cadence-history.json'),fixed=new Set(read('work/priority-freshness-history.json').sources?.hareruya2?.cohort||[]),profiles=new Set((read('work/search-profile-targets.json').profiles||[]).flatMap(p=>p.urlsMatched||[]));
 const focusProfiles=new Set(read('work/priority-search-profiles.json').popFocusProfileIds||[]);
 const exactFocus=new Set((read('work/search-profile-targets.json').profiles||[]).filter(p=>focusProfiles.has(p.id)).flatMap(p=>p.urlsMatched||[]));
 const all={},selected={},profile={},focus={};for(const id of ['hareruya2','torecacamp','cardrush','yuyutei']){const summary=read('data/'+id+'-stock-summary.json');all[id]=Object.entries(summary.cards||{}).map(([id,r])=>({id,at:r.priceObservedAt||r.observedAt}));selected[id]=all[id].filter(r=>fixed.has(r.id));profile[id]=all[id].filter(r=>profiles.has(r.id));focus[id]=all[id].filter(r=>exactFocus.has(r.id));}
 const context={linkage:Object.fromEntries((read('work/psa-linkage-all.json').rows||[]).map(r=>[r.cardId,r])),psaProgress:read('work/psa-fetch-progress.json'),psaAccess:require('./psa_access_policy').decision(require('./psa_access_policy').read(root)),tradeReceipt:read('data/domestic-trade-source-audit.json'),priceEvidence:read('data/state-a-price-evidence.json'),priceAudit:read('data/state-a-price-audit.json'),now};
 const plans=cards.filter(c=>completion.cards?.[c.id]?.m?.length).map(c=>({id:c.id,missing:completion.cards[c.id].m,...require('./profile_completion_routes').prospectPlan(c,completion.cards[c.id].m,context)}));
 const completionRoutes=require('./build_high_rarity_readiness').feasibility(plans,cards.length,completion.summary?.analyzable||0);
 completionRoutes.target95Cards=Math.ceil(cards.length*.95);completionRoutes.shortfallTo95AfterCurrentRoutes=Math.max(0,completionRoutes.target95Cards-completionRoutes.conditionalCurrentRouteTotal);
 completionRoutes.automaticCandidates=plans.filter(p=>p.requirements.length&&p.requirements.every(r=>r.automatic)).map(p=>({id:p.id,missing:p.missing,next:p.requirements.map(r=>({field:r.field,source:r.source,nextAction:r.nextAction}))}));
 const routeDefinitions={};for(const p of plans)for(const r of p.requirements){const k=r.source+':'+r.state;const t=routeDefinitions[k]||={cards:new Set(),nextAction:r.nextAction,resumeCondition:r.resumeCondition};t.cards.add(p.id);}
 completionRoutes.routes=Object.fromEntries(Object.entries(routeDefinitions).map(([key,{cards,...r}])=>[key,{...r,cards:cards.size}]));
 const report={version:1,at:new Date(now).toISOString(),wholeCatalogue:{...coverage(read('work/toreca-source-inventory.json'),cards,completion,read('data/psa-pop-coverage.json'),now),completionRoutes},updateCapacity:{knownLinked:capacity(history,all,now),fixed192:capacity(history,selected,now),conditionCandidates:capacity(history,profile,now),exactFocusCandidates:capacity(history,focus,now),exactFocusScope:{profileIds:[...focusProfiles],cards:exactFocus.size,note:'指定2URLだけ。中央値・指定条件モード・旧条件を含むconditionCandidatesとは別。対象取得元に保存行がないカードは確認能力の分母へ水増ししない。'}},llmCalls:0,codexCalls:0};
 const pops=read('data/psa-population-summary.json').cards||{},receipt=read('data/psa10-observation-receipt.json');
 const identities=new Map(cards.map(c=>[c.id,require('./psa10_observation_evidence').identity(c)]));
 const psaRows=Object.entries(receipt.cards||{}).filter(([id,v])=>identities.get(id)===v[0]).map(([id])=>({id,at:receipt.observedAt}));
 report.updateCapacity.domesticReference=capacity(history,{toreca:cards.filter(c=>c.price>0).map(c=>({id:c.id,at:c.priceObservedAt}))},now,6,30).toreca;
 report.updateCapacity.psa10Market=capacity(history,{psa10Market:psaRows},now,6,30).psa10Market;
 report.updateCapacity.psa10Market.note='PSA10個別確認専用の計測。旧素体価格の固定群確認をPSA10確認数へ代用しない。未計測の実数はnull。';
 report.updateCapacity.officialPop={...capacity(history,{psaOfficial:Object.entries(pops).map(([id,r])=>({id,at:r.f}))},now,24,36).psaOfficial,
   distinctSetUrls:new Set(Object.values(pops).map(r=>r.u).filter(Boolean)).size,acquisitionStopped:read('data/update-status.json').sources?.psaOfficial?.acquisitionStopped===true,
   note:'必要カード確認数とHTTP数は別。セット単位取得を前提としても、許諾・経路停止を速度や実行回数だけで解消しない。'};
 const status=read('data/update-status.json').sources||{};
 report.updateCapacity.sourceStates=Object.fromEntries(['hareruya2','torecacamp','cardrush','yuyutei','toreca','shopBuyback','psaOfficial'].map(id=>[id,{status:status[id]?.status||null,stopped:status[id]?.acquisitionStopped===true,lastAttemptAt:status[id]?.lastAttemptAt||null,lastSuccessAt:status[id]?.lastSuccessAt||null,reason:status[id]?.stopReason||status[id]?.lastError||status[id]?.sourceState||null}]));
 const audit=read('data/acquisition-progress-audit.json');Object.assign(audit,{wholeCatalogue:report.wholeCatalogue,updateCapacity:report.updateCapacity,capacityAt:report.at});fs.writeFileSync(path.join(root,'data/acquisition-progress-audit.json'),JSON.stringify(audit));return report;
}
module.exports={coverage,capacity,dist,build};if(require.main===module)console.log(JSON.stringify(build()));
