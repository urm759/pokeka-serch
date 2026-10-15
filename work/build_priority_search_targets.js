const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),ROOT=path.join(__dirname,'..');
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
function evaluate(profile,at,overlay={},inspectIds=[],calculationCache=null) {
  const url=new URL(profile.url);for(const [k,v]of Object.entries(overlay))if(!url.searchParams.has(k))url.searchParams.set(k,v);
  const api=load(fs.readFileSync(path.join(ROOT,'app.js'),'utf8'),at,{url:url.href}),calculationKey=at+':'+api.computationKey();
  let cards=calculationCache?.get(calculationKey);
  if(!cards){cards=api.prepareCalculatedCards(api.state.cards);calculationCache?.set(calculationKey,cards);}
  const rows=[],reasons={},routes={};
  const completion=JSON.parse(fs.readFileSync(path.join(ROOT,'work/card-completion-queue.json'),'utf8'));
  const linkage=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT,'work/psa-linkage-all.json'),'utf8')).rows.map(r=>[r.cardId,r]));
  const shops=JSON.parse(fs.readFileSync(path.join(ROOT,'data/shop-buyback-summary.json'),'utf8')).shops;
  const psaProgress=JSON.parse(fs.readFileSync(path.join(ROOT,'work/psa-fetch-progress.json'),'utf8'));
  const inspected=new Set(inspectIds),allExclusions={},inspectedRows={};
  const scope={catalog:cards.length,unknownPriceCards:0,confirmedPriceFailures:0,identityHeld:0,qualified:0,completionProspects:0,notSelected:0};
  for(const c of cards) {
    const excluded=api.cardSearchExclusions(c),e=api.cardEfficiency(c);
    if(inspected.has(c.id))allExclusions[c.id]=excluded;
    for(const r of new Set(excluded))reasons[r]=(reasons[r]||0)+1;
    const missing=completion.cards?.[c.id]?.m||[];
    // Only known price gates screen a completion prospect. Unknown data never proves suitability.
    const p=url.searchParams,priceGates=require('./profile_discovery_gates').gates(c,p);
    const priceFail=Object.values(priceGates).includes('fail');
    if(Object.values(priceGates).includes('unknown'))scope.unknownPriceCards++;
    if(priceFail)scope.confirmedPriceFailures++;
    const fields=[...missing];
    if(inspected.has(c.id))inspectedRows[c.id]={buy:e.purchasePrice,profit:e.profit,annual:e.annual,
      purchaseConfirmed:Boolean(c.currentStoreOffer?.fresh&&c.currentStoreOffer?.available&&Number.isFinite(c.currentStoreOffer.value)),
      buybackConfirmed:!e.blockingReasons.some(r=>r.includes('買取出口'))&&require('./profile_completion_routes').prospectPlan(c,['buybackExitEvidence'],{shops,linkage,now:Date.parse(at),storeMode:p.get('buybackStores') || 'mail',selected:(p.get('selectedStores') || '').split(',')}).requirements[0].evidence.filter(r=>r.state==='usable').length>=2,
      metrics:require('./profile_candidate_evidence').cardFacts(api,c)};
    if(!c.currentStoreOffer?.fresh || !c.currentStoreOffer.available)fields.push('shopStateA');
    if(p.get('effBuy')==='median' && e.medianEvidence?.reasons.length)fields.push('referenceMedian');
    if(e.blockingReasons.some(r=>r.includes('買取出口')))fields.push('buybackExitEvidence');
    if(e.blockingReasons.some(r=>r.includes('PSA9')))fields.push('psa9Evidence');
    const hard=c.dataQuality?.manualReview||c.priceIntegrity?.disputed||c.priceAggregation?.conflicted||c.dataQuality?.dataAnomaly;
    const knownDisqualifying=excluded.filter(r=>!/(未取得|不足|算出不可|期限|古い|古値|日時不明|保留|分析|プリセット|期間|条件)/.test(r));
    const confirmedEfficiencyFail=missing.length===0&&Number.isFinite(e.annual)&&p.has('effMin')&&e.annual<Number(p.get('effMin'));
    const prospect=excluded.length>0&&!priceFail&&!hard&&!confirmedEfficiencyFail&&fields.length>0&&knownDisqualifying.length===0;
    const selected=!excluded.length;
    const support = selected || prospect ? require('../exploration-metrics').buybackSupport(api.state.buybackObservationSummary,c.id,p.get('buybackStores') || 'mail',(p.get('selectedStores')||'').split(','),Date.parse(at),c.psa10,c.identityKey) : null;
    const discoveryPriority=require('./profile_discovery_gates').priority(c,completion.cards?.[c.id],support);
    if(hard)scope.identityHeld++;
    if(selected)scope.qualified++;else if(prospect)scope.completionProspects++;else scope.notSelected++;
    if(selected||prospect)rows.push({id:c.id,name:c.name,qualified:selected,unverifiedProspect:prospect,missing:[...new Set(fields)],reasons:excluded,
      buy:e.purchasePrice,profit:e.profit,annual:e.annual,go:c.purchaseDecision?.verdict||c.purchaseDecision?.status||null,priority:discoveryPriority.score,priorityReasons:discoveryPriority.reasons,priceGates,
      metrics:require('./profile_candidate_evidence').cardFacts(api,c),
      completionPlan:prospect?require('./profile_completion_routes').prospectPlan(c,fields,{shops,linkage,psaProgress,now:Date.parse(at),storeMode:p.get('buybackStores') || 'mail',selected:(p.get('selectedStores') || '').split(',')}):null});
    if(prospect)for(const route of routeNeededFields(completion.cards?.[c.id],fields)) {
      (routes[route.source]||=[]).push({id:c.id,field:route.key,mode:route.mode,priority:discoveryPriority.score});
    }
  }
  return {id:profile.id,urlHash:hash(profile.url),parameters:Object.fromEntries([...url.searchParams].filter(([k])=>!['cap','locked','reserve','maxShare','batch'].includes(k))),
    qualified:rows.filter(r=>r.qualified).length,ids:rows.filter(r=>r.qualified).map(r=>r.id),prospects:rows.filter(r=>r.unverifiedProspect).length,reasons,rows,routes,scope,allExclusions,inspectedRows,
    explanation:'既知価格範囲を通った不足カードは未判定の補完候補。適合/GOとは数えない。原因の重複数と候補減少は別'};
}
function build(root=ROOT,at=new Date().toISOString()) {
  if(root!==ROOT)throw Error('Profile evaluator requires its own fixed data root');
  const config=JSON.parse(fs.readFileSync(path.join(root,'work/priority-search-profiles.json'),'utf8'));
  const previousFile=path.join(root,'work/search-profile-targets.json');
  const previous=fs.existsSync(previousFile)?JSON.parse(fs.readFileSync(previousFile,'utf8')):{profiles:[]};
  const inspectFor=p=>[...(previous.profiles.find(r=>r.id===p.id)?.urlsMatched||[]),...(previous.freshnessRecovery||[]).filter(r=>r.profile===p.id).map(r=>r.id)];
  const definitions=require('./search_profile_variants').allProfiles(config);
  require('./search_profile_variants').saveMedianProfiles(root,config);
  // This cache exists only within a build over the same saved files/time. Buy-basis/search changes do not change production economics.
  const calculationCache=new Map();
  const profiles=definitions.map(p=>({urlOnly:evaluate(p,at,{},inspectFor(p),calculationCache),knownSavedConditions:evaluate(p,at,config.knownSavedOverlay,[],calculationCache)}));
  const transitions=profiles.map(p=>{
    const old=previous.profiles.find(r=>r.id===p.urlOnly.id),same=old?.urlHash===p.urlOnly.urlHash;
    const seen=new Set([...(old?.seenQualified||[]),...(old?.urlsMatched||[])]);
    const gained=same?p.urlOnly.ids.filter(id=>!old.urlsMatched.includes(id)):[];
    const lost=same?old.urlsMatched.filter(id=>!p.urlOnly.ids.includes(id)):[];
    const firstQualified=gained.filter(id=>!seen.has(id));
    return {id:p.urlOnly.id,urlHash:p.urlOnly.urlHash,qualified:p.urlOnly.qualified,previous:same?old.urlsMatched.length:null,gained,lost,firstQualified,
      seenQualified:[...new Set([...seen,...p.urlOnly.ids])],comparison:same?'同一URL・前回記録との探索適合差分':'初回または条件/旧形式の変更・新規適合として数えない',
      note:'差分はGOではない。コード/取得/期限経過の原因は別監査し、価格下落と断定しない'};
  });
  const targets={version:3,at,profiles:profiles.map((p,i)=>({id:p.urlOnly.id,urlHash:p.urlOnly.urlHash,seenQualified:transitions[i].seenQualified,urlsMatched:p.urlOnly.ids,prospects:p.urlOnly.rows.filter(r=>r.unverifiedProspect)})),routes:{},readyRoutes:{},freshnessRecovery:[]};
  for(const p of profiles){
    const old=previous.profiles.find(r=>r.id===p.urlOnly.id);if(old?.urlHash!==p.urlOnly.urlHash)continue;
    for(const id of new Set([...(old.urlsMatched||[]),...(previous.freshnessRecovery||[]).filter(r=>r.profile===p.urlOnly.id).map(r=>r.id)])){
      const facts=p.urlOnly.inspectedRows[id]?.metrics;
      if(!p.urlOnly.ids.includes(id)&&require('./profile_candidate_evidence').priceOnlyRecovery(facts))targets.freshnessRecovery.push({id,profile:p.urlOnly.id,
        reason:'前回適合・購入価格の採用期限超過。適合未確定の優先再確認、GOではない'});
    }
  }
  for(const p of profiles)for(const [source,rows]of Object.entries(p.urlOnly.routes)) {
    const map=new Map((targets.routes[source]||[]).map(r=>[r.id+':'+r.field,r]));for(const r of rows)map.set(r.id+':'+r.field,r);
    targets.routes[source]=[...map.values()].sort((a,b)=>b.priority-a.priority);
  }
  for(const [source,rows]of Object.entries(targets.routes))targets.readyRoutes[source]=rows.filter(r=>profiles.some(p=>p.urlOnly.rows.some(c=>c.id===r.id&&c.completionPlan?.requirements.some(f=>f.field===r.field&&f.automatic))));
  const basisComparisons=definitions.filter(p=>p.baseId).map(p=>{
    const base=profiles.find(r=>r.urlOnly.id===p.baseId).urlOnly,next=profiles.find(r=>r.urlOnly.id===p.id).urlOnly;
    return {original:p.baseId,median:p.id,at,originalCount:base.qualified,medianCount:next.qualified,
      gainedByBasis:next.ids.filter(id=>!base.ids.includes(id)),lostByBasis:base.ids.filter(id=>!next.ids.includes(id)),
      note:'同じデータ/時刻・effBuyだけ変更。新規掲載/補完/初適合に計上しない'};
  });
  const report={version:3,at,profiles,transitions,basisComparisons,overlayStatus:config.overlayStatus,llmCalls:0,codexCalls:0,newSourceAcquisition:0,
    note:'要約・キュー生成は実取得・補完ではない。URLだけと確認済み保存追加条件の再現を分離。他の端末設定は未観測'};
  for(const [f,x]of [['work/search-profile-targets.json',targets],['data/priority-search-profile-audit.json',report]])fs.writeFileSync(path.join(root,f),JSON.stringify(x));
  console.log(JSON.stringify(profiles.map(p=>({id:p.urlOnly.id,urlOnly:p.urlOnly.qualified,withKnownSaved:p.knownSavedConditions.qualified,prospects:p.urlOnly.prospects}))));
  return report;
}
if(require.main===module)build();
module.exports={build,evaluate,routeNeededFields};
