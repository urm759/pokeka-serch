const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),ROOT=path.join(__dirname,'..');
const departures=require('./profile_departure_audit');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function routeNeededFields(detail,fields) {
  const next={...detail,i:{...detail?.i},e:[...(detail?.e||[])]};
  for(const key of fields) {
    if(['psa9Evidence','buybackExitEvidence'].includes(key))next.e[['psa9Evidence','buybackExitEvidence'].indexOf(key)]=0;
    else if(!require('./completion_routes').needs(next,key))next.i[key]='定期再確認';
  }
  const result=require('./completion_routes').routes(next).filter(r=>fields.includes(r.key));
  if(fields.includes('referenceMedian'))result.push({key:'referenceMedian',source:'domesticShops',mode:'採用元の個別再確認・通常巡回と共有'});
  return result;
}
function efficiencySummaryKey(calculationKey,state) {
  const fields=['efficiencyBuy','efficiencyManualPrice','efficiencyScenario','efficiencySaleDays','efficiencyPayoutDays','profitSearchBasis','currentMarketManualPrice','currentMarketSearchKind','observationIncludeReference','efficiencyIncludeReference','psa9RatioAggregate','psa9RatioEstimate','psa9RatioMarket'];
  return 'efficiency-all:'+JSON.stringify([calculationKey,fields.map(key=>state[key])]);
}
function evaluatePair(input) {
  const cache=new Map();
  if(input.single)return {urlOnly:evaluate(input.profile,input.at,{},input.inspectIds,cache,input.options)};
  return {urlOnly:evaluate(input.profile,input.at,{},input.inspectIds,cache),
    knownSavedConditions:evaluate(input.profile,input.at,input.overlay,[],cache)};
}
function isolatedPair(input,execute=require('node:child_process').spawnSync) {
  // VM/model caches retain large card graphs. Release them at each profile boundary.
  const child=execute(process.execPath,['--max-old-space-size=2048',__filename,'--evaluate-worker'],{
    cwd:ROOT,input:JSON.stringify(input),encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000});
  if(child.error || child.status!==0)throw Error(`Fixed profile ${input.profile.id} failed; previous outputs retained: ${String(child.error?.message||child.stderr||child.status).slice(-1200)}`);
  const result=JSON.parse(child.stdout);
  if(result.urlOnly?.id!==input.profile.id || !input.single&&result.knownSavedConditions?.id!==input.profile.id)throw Error('Profile worker identity mismatch');
  return result;
}
function isolatedEvaluation(profile,at,inspectIds=[],options={}) {
  return isolatedPair({profile,at,inspectIds,single:true,options}).urlOnly;
}
function evaluate(profile,at,overlay={},inspectIds=[],calculationCache=null,options={}) {
  const url=new URL(profile.url);for(const [k,v]of Object.entries(overlay))if(!url.searchParams.has(k))url.searchParams.set(k,v);
  const api=load(fs.readFileSync(path.join(ROOT,'app.js'),'utf8'),at,{url:url.href,fixedModelClock:true,dataRef:options.dataRef}),calculationKey=at+':'+api.computationKey();
  let cards=calculationCache?.get(calculationKey);
  if(!cards){cards=api.prepareCalculatedCards(api.state.cards);calculationCache?.set(calculationKey,cards);}
  const summaryKey=efficiencySummaryKey(calculationKey,api.state);
  const sharedAllCatalog=calculationCache?.get(summaryKey);
  const rows=[],reasons={},routes={};
  const efficiencyAvailability={main:{calculated:0,reference:0,unavailable:0,reasons:{}},comparisons:{},scope:'現在適合または既知価格帯を満たす不足補完候補。主計算と期間比較は別。理由は重複あり'};
  efficiencyAvailability.allCatalog={main:{calculated:0,reference:0,unavailable:0,reasons:{}},comparisons:{},scope:'全掲載カードを同一条件で確認。既知条件不合格への反復取得はしない'};
  if(sharedAllCatalog)efficiencyAvailability.allCatalog=sharedAllCatalog;
  const countEfficiency=(group,value)=>{
    group[value.calculationState]++;
    const reasons=value.annual==null?[...value.blockingReasons,...(value.purchasePrice==null||!value.blockingReasons.length?String(value.reason||'').split('／'):[])]:[];
    for(const reason of new Set(reasons.filter(Boolean)))group.reasons[reason]=(group.reasons[reason]||0)+1;
  };
  const completion=JSON.parse(fs.readFileSync(path.join(ROOT,'work/card-completion-queue.json'),'utf8'));
  const linkage=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT,'work/psa-linkage-all.json'),'utf8')).rows.map(r=>[r.cardId,r]));
  const shops=JSON.parse(fs.readFileSync(path.join(ROOT,'data/shop-buyback-summary.json'),'utf8')).shops;
  const psaProgress=JSON.parse(fs.readFileSync(path.join(ROOT,'work/psa-fetch-progress.json'),'utf8'));
  const psaAccess=require('./psa_access_policy').decision(require('./psa_access_policy').read(ROOT));
  const tradeReceiptFile=path.join(ROOT,'data/domestic-trade-source-audit.json');
  const tradeReceipt=fs.existsSync(tradeReceiptFile)?JSON.parse(fs.readFileSync(tradeReceiptFile,'utf8')):null;
  const priceEvidence=JSON.parse(fs.readFileSync(path.join(ROOT,'data/state-a-price-evidence.json'),'utf8'));
  const priceAudit=JSON.parse(fs.readFileSync(path.join(ROOT,'data/state-a-price-audit.json'),'utf8'));
  const inspected=new Set(inspectIds),allExclusions={},inspectedRows={};
  const scope={catalog:cards.length,unknownPriceCards:0,confirmedPriceFailures:0,identityHeld:0,qualified:0,completionProspects:0,notSelected:0};
  for(const c of cards) {
    const excluded=api.cardSearchExclusions(c),e=api.cardEfficiency(c);
    if(!sharedAllCatalog&&options.collectAvailability!==false)countEfficiency(efficiencyAvailability.allCatalog.main,e);
    for(const days of sharedAllCatalog||options.collectAvailability===false?[]:require('../exploration-metrics').observationPeriods){
      const group=efficiencyAvailability.allCatalog.comparisons[days]||={calculated:0,reference:0,unavailable:0,reasons:{}};
      countEfficiency(group,api.cardEfficiency(c,Date.parse(at),api.state.purchaseMode,'obs'+days));
    }
    if(inspected.has(c.id))allExclusions[c.id]=excluded;
    for(const r of new Set(excluded))reasons[r]=(reasons[r]||0)+1;
    const missing=completion.cards?.[c.id]?.m||[];
    // Only known price gates screen a completion prospect. Unknown data never proves suitability.
    const p=url.searchParams,priceGates=require('./profile_discovery_gates').gates(c,p);
    const priceFail=Object.values(priceGates).includes('fail');
    if(Object.values(priceGates).includes('unknown'))scope.unknownPriceCards++;
    if(priceFail)scope.confirmedPriceFailures++;
    const fields=[...missing];
    if(inspected.has(c.id))inspectedRows[c.id]={name:c.name,priceGates,buy:e.purchasePrice,profit:e.profit,annual:e.annual,
      purchaseConfirmed:Boolean(c.currentStoreOffer?.fresh&&c.currentStoreOffer?.available&&Number.isFinite(c.currentStoreOffer.value)),
      buybackConfirmed:!e.blockingReasons.some(r=>r.includes('買取出口'))&&require('./profile_completion_routes').prospectPlan(c,['buybackExitEvidence'],{shops,linkage,now:Date.parse(at),storeMode:p.get('buybackStores') || 'mail',selected:(p.get('selectedStores') || '').split(',')}).requirements[0].evidence.filter(r=>r.state==='usable').length>=2,
      metrics:require('./profile_candidate_evidence').cardFacts(api,c)};
    if(!c.currentStoreOffer?.fresh || !c.currentStoreOffer.available)fields.push('shopStateA');
    if(p.get('effBuy')==='median' && e.medianEvidence?.reasons.length)fields.push('referenceMedian');
    if(e.blockingReasons.some(r=>r.includes('買取出口')))fields.push('buybackExitEvidence');
    if(e.blockingReasons.some(r=>r.includes('PSA9')))fields.push('psa9Evidence');
    if(e.blockingReasons.some(r=>/PSA10.*(未取得|古い|日時)/.test(r)))fields.push('psa10Price');
    if(e.blockingReasons.some(r=>/想定10率/.test(r))&&!Number.isFinite(c.buyLimits?.clean?.assumptions?.hitRate))fields.push('psaOfficial');
    const hard=c.dataQuality?.manualReview||c.priceIntegrity?.disputed||(c.priceAggregation?.comparison||c.priceAggregation)?.conflicted||c.dataQuality?.dataAnomaly;
    const knownDisqualifying=excluded.filter(r=>!/(未取得|不足|算出不可|期限|古い|古値|日時不明|保留|分析|プリセット|期間|条件)/.test(r));
    const confirmedEfficiencyFail=missing.length===0&&Number.isFinite(e.annual)&&p.has('effMin')&&e.annual<Number(p.get('effMin'));
    const prospect=excluded.length>0&&!priceFail&&!hard&&!confirmedEfficiencyFail&&fields.length>0&&knownDisqualifying.length===0;
    const selected=!excluded.length;
    if((selected||prospect)&&options.collectAvailability!==false) {
      countEfficiency(efficiencyAvailability.main,e);
      for(const days of require('../exploration-metrics').observationPeriods) {
        const group=efficiencyAvailability.comparisons[days]||={calculated:0,reference:0,unavailable:0,reasons:{}};
        countEfficiency(group,api.cardEfficiency(c,Date.parse(at),api.state.purchaseMode,'obs'+days));
      }
    }
    const support = selected || prospect ? require('../exploration-metrics').buybackSupport(api.state.buybackObservationSummary,c.id,p.get('buybackStores') || 'mail',(p.get('selectedStores')||'').split(','),Date.parse(at),c.psa10,c.identityKey) : null;
    const discoveryPriority=require('./profile_discovery_gates').priority(c,completion.cards?.[c.id],support);
    if(hard)scope.identityHeld++;
    if(selected)scope.qualified++;else if(prospect)scope.completionProspects++;else scope.notSelected++;
    const completionPlan=prospect?require('./profile_completion_routes').prospectPlan({...c,medianEvidence:e.medianEvidence},fields,{shops,linkage,psaProgress,psaAccess,tradeReceipt,priceEvidence,priceAudit,now:Date.parse(at),storeMode:p.get('buybackStores') || 'mail',selected:(p.get('selectedStores') || '').split(',')}):null;
    if(selected||prospect)rows.push({id:c.id,name:c.name,qualified:selected,unverifiedProspect:prospect,missing:[...new Set(fields)],reasons:excluded,
      buy:e.purchasePrice,profit:e.profit,annual:e.annual,go:c.purchaseDecision?.verdict||c.purchaseDecision?.status||null,priority:discoveryPriority.score,priorityReasons:discoveryPriority.reasons,priceGates,
      metrics:require('./profile_candidate_evidence').cardFacts(api,c),
      completionPlan});
    if(prospect)for(const route of routeNeededFields(completion.cards?.[c.id],fields)) {
      const requirement=completionPlan.requirements.find(r=>r.field===route.key);
      (routes[route.source]||=[]).push({id:c.id,field:route.key,mode:route.mode,priority:discoveryPriority.score,
        automatic:requirement?.automatic,sourceTargets:requirement?.targets});
    }
  }
  if(options.collectAvailability===false)efficiencyAvailability.status='not-collected-in-cycle; full diagnostic remains in priority-search-profile-audit';
  else if(!sharedAllCatalog)calculationCache?.set(summaryKey,efficiencyAvailability.allCatalog);
  return {id:profile.id,reportName:require('./search_profile_variants').reportName(profile.id),urlHash:hash(profile.url),parameters:Object.fromEntries([...url.searchParams].filter(([k])=>!['cap','locked','reserve','maxShare','batch'].includes(k))),
    qualified:rows.filter(r=>r.qualified).length,ids:rows.filter(r=>r.qualified).map(r=>r.id),prospects:rows.filter(r=>r.unverifiedProspect).length,reasons,rows,routes,scope,allExclusions,inspectedRows,efficiencyAvailability,
    explanation:'既知価格範囲を通った不足カードは未判定の補完候補。適合/GOとは数えない。原因の重複数と候補減少は別'};
}
function build(root=ROOT,at=new Date().toISOString()) {
  if(root!==ROOT)throw Error('Profile evaluator requires its own fixed data root');
  const config=JSON.parse(fs.readFileSync(path.join(root,'work/priority-search-profiles.json'),'utf8'));
  const previousFile=path.join(root,'work/search-profile-targets.json');
  const previous=fs.existsSync(previousFile)?JSON.parse(fs.readFileSync(previousFile,'utf8')):{profiles:[]};
  const cycleFile=path.join(root,'data/search-profile-cycle-progress.json');
  const seeds=previous.departureHistoryImported?[]:departures.historySeeds(fs.existsSync(cycleFile)?JSON.parse(fs.readFileSync(cycleFile,'utf8')).cycles||[]:[]);
  const priorDepartures=[...seeds,...(previous.pendingDepartures||[])];
  const completion=JSON.parse(fs.readFileSync(path.join(root,'work/card-completion-queue.json'),'utf8'));
  const rawCards=new Map(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'),'utf8')).map(c=>[c.id,c]));
  const repairContext={shops:JSON.parse(fs.readFileSync(path.join(root,'data/shop-buyback-summary.json'),'utf8')).shops,
    priceEvidence:JSON.parse(fs.readFileSync(path.join(root,'data/state-a-price-evidence.json'),'utf8')),
    priceAudit:JSON.parse(fs.readFileSync(path.join(root,'data/state-a-price-audit.json'),'utf8')),
    tradeReceipt:fs.existsSync(path.join(root,'data/domestic-trade-source-audit.json'))?JSON.parse(fs.readFileSync(path.join(root,'data/domestic-trade-source-audit.json'),'utf8')):null,
    psaAccess:require('./psa_access_policy').decision(require('./psa_access_policy').read(root)),
    linkage:Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root,'work/psa-linkage-all.json'),'utf8')).rows.map(r=>[r.cardId,r])),
    psaProgress:JSON.parse(fs.readFileSync(path.join(root,'work/psa-fetch-progress.json'),'utf8')),now:Date.parse(at)};
  const inspectFor=p=>[...(previous.profiles.find(r=>r.id===p.id)?.urlsMatched||[]),...(previous.freshnessRecovery||[]).filter(r=>r.profile===p.id).map(r=>r.id),...priorDepartures.filter(r=>r.profile===p.id).map(r=>r.id)];
  const definitions=require('./search_profile_variants').searchModeProfiles(config);
  require('./search_profile_variants').saveMedianProfiles(root,config);
  const codeHash=departures.codeHash(root);
  const profiles=definitions.map(p=>isolatedPair({profile:p,at,inspectIds:inspectFor(p),overlay:config.knownSavedOverlay}));
  const transitions=profiles.map(p=>{
    const old=previous.profiles.find(r=>r.id===p.urlOnly.id),same=old?.urlHash===p.urlOnly.urlHash;
    const seen=new Set([...(old?.seenQualified||[]),...(old?.urlsMatched||[])]);
    const gained=same?p.urlOnly.ids.filter(id=>!old.urlsMatched.includes(id)):[];
    const lost=(old?.urlsMatched||[]).filter(id=>!p.urlOnly.ids.includes(id));
    const unchangedCode=old?.evidenceMeta?.codeHash===codeHash;
    const firstQualified=unchangedCode?gained.filter(id=>!seen.has(id)):[];
    const evidenceMeta=departures.metadata(p.urlOnly,codeHash,at);
    const lostReasons=lost.map(id=>({id,name:p.urlOnly.inspectedRows[id]?.name||null,before:old.qualifiedFacts?.[id]||null,
      after:p.urlOnly.inspectedRows[id]?.metrics||null,
      departureAudit:departures.inspect(old.qualifiedFacts?.[id],p.urlOnly.inspectedRows[id]?.metrics,{before:old.evidenceMeta,after:evidenceMeta})}));
    return {id:p.urlOnly.id,urlHash:p.urlOnly.urlHash,qualified:p.urlOnly.qualified,previous:same?old.urlsMatched.length:null,gained,lost,firstQualified,lostReasons,
      codeOrAggregationReturns:!unchangedCode?gained:[],
      seenQualified:[...new Set([...seen,...p.urlOnly.ids])],comparison:same?'同一URL・前回記録との探索適合差分':'初回または条件/旧形式の変更・新規適合として数えない',
      note:'差分はGOではない。コード/取得/期限経過の原因は別監査し、価格下落と断定しない'};
  });
  const targets={version:4,at,profiles:profiles.map((p,i)=>({id:p.urlOnly.id,reportName:p.urlOnly.reportName,urlHash:p.urlOnly.urlHash,seenQualified:transitions[i].seenQualified,urlsMatched:p.urlOnly.ids,
    evidenceMeta:departures.metadata(p.urlOnly,codeHash,at),qualifiedFacts:Object.fromEntries(p.urlOnly.rows.filter(r=>r.qualified).map(r=>[r.id,r.metrics])),
    prospects:p.urlOnly.rows.filter(r=>r.unverifiedProspect)})),routes:{},readyRoutes:{},freshnessRecovery:[],pendingDepartures:[],repairRequests:[],departureHistoryImported:true};
  for(const p of profiles){
    const old=previous.profiles.find(r=>r.id===p.urlOnly.id);if(old?.urlHash!==p.urlOnly.urlHash)continue;
    for(const id of new Set([...(old.urlsMatched||[]),...priorDepartures.filter(r=>r.profile===p.urlOnly.id).map(r=>r.id),...(previous.freshnessRecovery||[]).filter(r=>r.profile===p.urlOnly.id).map(r=>r.id)])) {
      if(p.urlOnly.ids.includes(id))continue;
      const saved=priorDepartures.filter(r=>r.profile===p.urlOnly.id&&r.id===id).at(-1);
      const before=old.qualifiedFacts?.[id]||saved?.before||null,after=p.urlOnly.inspectedRows[id]?.metrics||null;
      const beforeMeta=old.qualifiedFacts?.[id]?old.evidenceMeta:saved?.beforeMeta;
      const departureAudit=departures.inspect(before,after,{before:beforeMeta,after:departures.metadata(p.urlOnly,codeHash,at)});
      if(Object.values(p.urlOnly.inspectedRows[id]?.priceGates||{}).includes('fail'))
        departureAudit.repair={...departureAudit.repair,fields:[],reason:'既知の価格帯条件で不合格。追加の反復補完はせず通常巡回を維持'};
      targets.pendingDepartures.push({id,profile:p.urlOnly.id,before,beforeMeta,after,departureAudit,firstObservedAt:saved?.firstObservedAt||at,lastCheckedAt:at});
      const card={...rawCards.get(id),medianEvidence:after?.medianEvidence,priceAggregation:{comparison:after?.priceReview,included:(after?.priceReview?.sources||[]).map(r=>({...r,updatedAt:r.at}))},
        buybackAnalysis:{rows:(after?.buyback||[]).map(r=>({...r,buybackPrice:r.price}))}};
      const params=new URL(definitions.find(d=>d.id===p.urlOnly.id).url).searchParams;
      const plan=require('./profile_completion_routes').prospectPlan(card,departureAudit.repair.fields,{...repairContext,
        storeMode:params.get('buybackStores')||'mail',selected:(params.get('selectedStores')||'').split(','),repairTargets:departureAudit.repair.sourceTargets});
      for(const route of routeNeededFields(completion.cards?.[id]||{},departureAudit.repair.fields)) {
        const requirement=plan.requirements.find(r=>r.field===route.key);
        targets.repairRequests.push({id,profile:p.urlOnly.id,field:route.key,source:route.source,mode:route.mode,
          automatic:requirement?.automatic===true,sourceTargets:requirement?.targets,stopReason:requirement?.reason||requirement?.state||null,
          reason:departureAudit.status,automaticReviewRelease:false});
      }
      if(departureAudit.repair.fields.some(f=>['shopStateA','referenceMedian'].includes(f)))targets.freshnessRecovery.push({id,profile:p.urlOnly.id,
        sourceTargets:plan.requirements.filter(r=>r.automatic&&['shopStateA','referenceMedian'].includes(r.field)).flatMap(r=>r.targets||[]),reason:'以前適合・必要な取得元だけ再確認。復帰・GOは未確定'});
    }
  }
  for(const p of profiles)for(const [source,rows]of Object.entries(p.urlOnly.routes)) {
    const map=new Map((targets.routes[source]||[]).map(r=>[r.id+':'+r.field,r]));for(const r of rows)map.set(r.id+':'+r.field,r);
    targets.routes[source]=[...map.values()].sort((a,b)=>b.priority-a.priority);
  }
  const timingAuditFile=path.join(root,'data/buyback-support-audit.json');
  const timingRechecks=fs.existsSync(timingAuditFile)?JSON.parse(fs.readFileSync(timingAuditFile,'utf8')).audit?.timing?.recheck || []:[];
  for(const request of timingRechecks)targets.repairRequests.push({...request,profile:'demand-timing',priority:0});
  for(const request of targets.repairRequests) {
    const rows=targets.routes[request.source] ||= [];
    if(!rows.some(r=>r.id===request.id&&r.field===request.field))rows.push({...request,priority:0});
  }
  for(const [source,rows]of Object.entries(targets.routes))targets.readyRoutes[source]=rows.filter(r=>r.automatic===true||profiles.some(p=>p.urlOnly.rows.some(c=>c.id===r.id&&c.completionPlan?.requirements.some(f=>f.field===r.field&&f.automatic))));
  const basisComparisons=definitions.filter(p=>p.baseId).map(p=>{
    const base=profiles.find(r=>r.urlOnly.id===p.baseId).urlOnly,next=profiles.find(r=>r.urlOnly.id===p.id).urlOnly;
    return {original:p.baseId,median:p.id,at,originalCount:base.qualified,medianCount:next.qualified,
      gainedByBasis:next.ids.filter(id=>!base.ids.includes(id)),lostByBasis:base.ids.filter(id=>!next.ids.includes(id)),
      note:'同じデータ/時刻・effBuyだけ変更。新規掲載/補完/初適合に計上しない'};
  });
  const siteProfileIds=new Set(require('./search_profile_variants').allProfiles(config).map(p=>p.id));
  const siteCandidateIds=new Set(profiles.filter(p=>siteProfileIds.has(p.urlOnly.id)).flatMap(p=>p.urlOnly.ids));
  const modeOnlyCandidates=[...new Set(profiles.flatMap(p=>p.urlOnly.ids))].filter(id=>!siteCandidateIds.has(id));
  const report={version:4,at,profiles,transitions,basisComparisons,modeOnlyCandidates,overlayStatus:config.overlayStatus,llmCalls:0,codexCalls:0,newSourceAcquisition:0,
    departureSummary:departures.summarize(targets.pendingDepartures),
    pendingDepartures:targets.pendingDepartures,repairRequests:targets.repairRequests,
    independentCandidates:departures.independentCandidates((previous.profiles||[]).filter(p=>siteProfileIds.has(p.id)).map(p=>p.urlsMatched||[]),profiles.filter(p=>siteProfileIds.has(p.urlOnly.id)).map(p=>p.urlOnly.ids)),
    allModeIndependentCount:new Set(profiles.flatMap(p=>p.urlOnly.ids)).size,
    note:'指定条件モードの派生URLはpresetだけ変更し既存の補完/価格更新キューへ接続。modeOnlyCandidatesはモード差分であり実補完・独立初適合ではない。元A/Bと中央値版の数値は保持。要約生成は実取得ではない。URLだけと確認済み保存追加条件を分離。他の端末は未観測'};
  for(const [f,x]of [['work/search-profile-targets.json',targets],['data/priority-search-profile-audit.json',report]])require('./acquisition_retry').atomicWrite(path.join(root,f),x,0);
  console.log(JSON.stringify(profiles.map(p=>({id:p.urlOnly.id,urlOnly:p.urlOnly.qualified,withKnownSaved:p.knownSavedConditions.qualified,prospects:p.urlOnly.prospects}))));
  return report;
}
if(require.main===module) {
  if(process.argv.includes('--evaluate-worker'))process.stdout.write(JSON.stringify(evaluatePair(JSON.parse(fs.readFileSync(0,'utf8')))));
  else build();
}
module.exports={build,evaluate,evaluatePair,isolatedPair,isolatedEvaluation,routeNeededFields,efficiencySummaryKey};
