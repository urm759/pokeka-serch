const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),ROOT=path.join(__dirname,'..');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function routeNeededFields(detail,fields) {
  const next={...detail,i:{...detail?.i},e:[...(detail?.e||[])]};
  for(const key of fields) {
    if(['psa9Evidence','buybackExitEvidence'].includes(key))next.e[['psa9Evidence','buybackExitEvidence'].indexOf(key)]=0;
    else if(!require('./completion_routes').needs(next,key))next.i[key]='定期再確認';
  }
  return require('./completion_routes').routes(next).filter(r=>fields.includes(r.key));
}
function evaluate(profile,at,overlay={}) {
  const url=new URL(profile.url);for(const [k,v]of Object.entries(overlay))if(!url.searchParams.has(k))url.searchParams.set(k,v);
  const api=load(fs.readFileSync(path.join(ROOT,'app.js'),'utf8'),at,{url:url.href}),cards=api.prepareCalculatedCards(api.state.cards),rows=[],reasons={},routes={};
  const completion=JSON.parse(fs.readFileSync(path.join(ROOT,'work/card-completion-queue.json'),'utf8'));
  for(const c of cards) {
    const excluded=api.cardSearchExclusions(c),e=api.cardEfficiency(c);
    for(const r of new Set(excluded))reasons[r]=(reasons[r]||0)+1;
    const missing=completion.cards?.[c.id]?.m||[];
    // Only known price gates screen a completion prospect. Unknown data never proves suitability.
    const p=url.searchParams,knownPrice=c.price;
    const priceFail=Number.isFinite(knownPrice)&&(p.has('priceMin')&&knownPrice<Number(p.get('priceMin'))||p.has('priceMax')&&knownPrice>Number(p.get('priceMax')));
    const offer=c.currentStoreOffer,knownBuy=offer?.fresh&&offer.available?offer.value:null;
    const purchaseFail=Number.isFinite(knownBuy)&&(p.has('purchaseMin')&&knownBuy<Number(p.get('purchaseMin'))||p.has('purchaseMax')&&knownBuy>Number(p.get('purchaseMax')));
    const fields=[...missing];
    if(e.purchasePrice==null)fields.push('shopStateA');
    if(e.blockingReasons.some(r=>r.includes('買取出口')))fields.push('buybackExitEvidence');
    if(e.blockingReasons.some(r=>r.includes('PSA9')))fields.push('psa9Evidence');
    const hard=c.dataQuality?.manualReview||c.priceIntegrity?.disputed||c.priceAggregation?.conflicted||c.dataQuality?.dataAnomaly;
    const knownDisqualifying=excluded.filter(r=>!/(未取得|不足|算出不可|期限|古い|保留|分析|プリセット|期間|条件)/.test(r));
    const confirmedEfficiencyFail=missing.length===0&&Number.isFinite(e.annual)&&p.has('effMin')&&e.annual<Number(p.get('effMin'));
    const prospect=excluded.length>0&&!priceFail&&!purchaseFail&&!hard&&!confirmedEfficiencyFail&&fields.length>0&&knownDisqualifying.length===0;
    const selected=!excluded.length;
    if(selected||prospect)rows.push({id:c.id,name:c.name,qualified:selected,unverifiedProspect:prospect,missing:[...new Set(fields)],reasons:excluded,
      buy:e.purchasePrice,profit:e.profit,annual:e.annual,go:c.purchaseDecision?.status||null,priority:completion.cards?.[c.id]?.p||0});
    if(prospect)for(const route of routeNeededFields(completion.cards?.[c.id],fields)) {
      (routes[route.source]||=[]).push({id:c.id,field:route.key,mode:route.mode,priority:completion.cards?.[c.id]?.p||0});
    }
  }
  return {id:profile.id,urlHash:hash(profile.url),parameters:Object.fromEntries([...url.searchParams].filter(([k])=>!['cap','locked','reserve','maxShare','batch'].includes(k))),
    qualified:rows.filter(r=>r.qualified).length,ids:rows.filter(r=>r.qualified).map(r=>r.id),prospects:rows.filter(r=>r.unverifiedProspect).length,reasons,rows,routes,
    explanation:'既知価格範囲を通った不足カードは未判定の補完候補。適合/GOとは数えない。原因の重複数と候補減少は別'};
}
function build(root=ROOT,at=new Date().toISOString()) {
  if(root!==ROOT)throw Error('Profile evaluator requires its own fixed data root');
  const config=JSON.parse(fs.readFileSync(path.join(root,'work/priority-search-profiles.json'),'utf8'));
  const previousFile=path.join(root,'work/search-profile-targets.json');
  const previous=fs.existsSync(previousFile)?JSON.parse(fs.readFileSync(previousFile,'utf8')):{profiles:[]};
  const profiles=config.profiles.map(p=>({urlOnly:evaluate(p,at),knownSavedConditions:evaluate(p,at,config.knownSavedOverlay)}));
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
  const targets={version:2,at,profiles:profiles.map((p,i)=>({id:p.urlOnly.id,urlHash:p.urlOnly.urlHash,seenQualified:transitions[i].seenQualified,urlsMatched:p.urlOnly.ids,prospects:p.urlOnly.rows.filter(r=>r.unverifiedProspect)})),routes:{}};
  for(const p of profiles)for(const [source,rows]of Object.entries(p.urlOnly.routes)) {
    const map=new Map((targets.routes[source]||[]).map(r=>[r.id+':'+r.field,r]));for(const r of rows)map.set(r.id+':'+r.field,r);
    targets.routes[source]=[...map.values()].sort((a,b)=>b.priority-a.priority);
  }
  const report={version:2,at,profiles,transitions,overlayStatus:config.overlayStatus,llmCalls:0,codexCalls:0,newSourceAcquisition:0,
    note:'要約・キュー生成は実取得・補完ではない。URLだけと確認済み保存追加条件の再現を分離。他の端末設定は未観測'};
  for(const [f,x]of [['work/search-profile-targets.json',targets],['data/priority-search-profile-audit.json',report]])fs.writeFileSync(path.join(root,f),JSON.stringify(x));
  console.log(JSON.stringify(profiles.map(p=>({id:p.urlOnly.id,urlOnly:p.urlOnly.qualified,withKnownSaved:p.knownSavedConditions.qualified,prospects:p.urlOnly.prospects}))));
  return report;
}
if(require.main===module)build();
module.exports={build,evaluate,routeNeededFields};
