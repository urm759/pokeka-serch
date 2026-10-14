const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
const historical=(ref,f)=>JSON.parse(cp.execFileSync('git',['show',`${ref}:${f}`],{cwd:ROOT,maxBuffer:96e6,encoding:'utf8'}));
function build(){
  const baseline='183e3282',scheduled='1b095bdb';
  const previous=historical(baseline,'data/card-catalog-completion.json').summary;
  const before=historical(scheduled,'data/card-catalog-completion.json').summary;
  const current=read('data/card-catalog-completion.json').summary;
  const oldPop=historical(scheduled,'data/psa-population-summary.json'),pop=read('data/psa-population-summary.json');
  const oldIds=new Set(Object.keys(oldPop.cards)),newlyUsable=Object.keys(pop.cards).filter(id=>!oldIds.has(id));
  const cycle=read('data/search-profile-cycle-progress.json').cycles.find(c=>c.key==='profile-followup');
  if(!cycle)throw Error('Actual acquisition baseline missing');
  const discovery=read('data/state-a-url-discovery.json'),unmatched=read('data/profile-buyback-unmatched-audit.json');
  const psa=read('work/psa-fetch-progress.json'),changes=read('data/fixed-profile-change-audit.json');
  const result={version:1,at:new Date().toISOString(),baselineCommit:baseline,scheduledDataCommit:scheduled,
    catalog:{listed:current.total,newListed:current.total-before.total,analysisBeforePublication:previous.analyzable,
      analysisBeforeManual:before.analyzable,analysisAfter:current.analyzable,
      scheduledAnalysisNet:before.analyzable-previous.analyzable,manualAnalysisNet:current.analyzable-before.analyzable},
    psa:{manual:true,startedAt:psa.startedAt,endedAt:psa.endedAt,durationMs:psa.durationMs,
      attemptedSets:psa.attemptedCount,refreshedRows:psa.refreshedCount,newRawRows:psa.newAcquiredCount,
      changedRawRows:psa.changedCount,usableBefore:oldIds.size,usableAfter:Object.keys(pop.cards).length,
      newUsableCards:newlyUsable.length,newUsableIds:newlyUsable,specificationHeld:Object.keys(pop.specificationHeld||{}).length,
      example:pop.cards['pk-1446'],nextUrl:psa.nextUrl,
      note:'POP原票の新規行と国内仕様照合後の有効枚数を分離。認証済み手動取得は修正版の定期成功ではない。'},
    profiles:cycle.profiles.map(p=>({id:p.id,beforeManual:p.before,afterManual:p.after,newListed:p.newListed,
      requiredFilled:p.completed,firstQualified:p.firstQualified,freshnessRestored:p.freshnessRestored,
      gained:p.gained,lost:p.lost,remainingProspects:p.remainingProspects,pendingBySource:p.routePending,
      completedProspectOutcomes:p.completedProspectOutcomes})),
    candidateChange:{at:changes.generatedAt,profiles:changes.profiles.map(p=>({id:p.id,mode:p.mode,
      before:p.before,after:p.after,lost:p.lost,gained:p.gained,
      phaseCounts:Object.fromEntries(Object.entries(p.phases).map(([k,v])=>[k,{lost:v.lost.length,gained:v.gained.length}]))})),
      details:'data/fixed-profile-change-audit.json',savedConditionScope:changes.savedConditionScope},
    discovery:{attempted:discovery.attempted,newLinked:discovery.newLinked,httpRequests:discovery.httpRequests,
      cacheHits:discovery.cacheHits,durationMs:discovery.durationMs,
      note:'集合変更に伴う保存商品の再照合を含む。URL発見と価格・在庫取得は別。'},
    buybackAudit:{nearbyRows:unmatched.hits.length,verified:unmatched.uniquelyVerified.length,
      details:'data/profile-buyback-unmatched-audit.json',note:'仕様・初版・セット根拠不足は採用せず。正常な未掲載と未照合を区別。'},
    completion:read('data/completion-acquisition.json').zeroTargetReason,
    oneItem:((d)=>({total:d.total,byField:d.byField,byRoute:d.byRoute}))(read('data/one-item-completion-audit.json')),
    scheduledPriority:read('work/verified-priority-38530514320.json'),
    freshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
    freshnessDefinitions:changes.freshnessDefinitions,
    residuals:{domesticPsa9IndividualSales:0,domesticStateAIndividualSales:0,
      note:'未実装・正規提供/許諾待ち。認証PokeDATA、403停止、期間別予測、最短12/1返却時検証を台帳で継続。全データ完了ではない。'},
    publication:'保存済み。Pages/公開JSON照合は別受領証。修正版の次回定期は未実証。',llmCalls:0,codexCalls:0};
  const browserFile=path.join(ROOT,'work/profile-followup-browser-raw.json');
  if(fs.existsSync(browserFile)){
    const rows=JSON.parse(fs.readFileSync(browserFile,'utf8'));
    const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
    if(rows.length!==8)throw Error('Eight fixed browser cases required');
    result.browser=rows.filter(r=>r.mode.startsWith('before')).map(b=>{
      const a=rows.find(r=>r.width===b.width&&r.mode===(b.mode==='before'?'after':'double'));
      if(!a||b.financialHash!==a.financialHash||JSON.stringify(b.ids)!==JSON.stringify(a.ids))throw Error('Browser candidate/financial mismatch');
      const timing=r=>({jsonBytes:r.initialJsonBytes,transferredBytes:r.transferredBytes,jsonParseMs:r.jsonParseMs,
        calculationMs:median(r.samples.map(s=>s.full.calculationMs)),fullDomMs:median(r.samples.map(s=>s.full.domMs)),
        conditionDomMs:median(r.samples.map(s=>s.condition.domMs)),detailDomMs:median(r.samples.map(s=>s.detail.domMs))});
      return {width:b.width,loadedCards:b.loadedCards,displayed:b.displayed,valuesAndIdsEqual:true,before:timing(b),after:timing(a)};
    });
    result.browserNote='同じPC・幅1440/390・60枚表示・各3回中央値。ローカルgzip通信、解析は各1読込。実機スマホ/paint完了とは別。フロントコードは同じで計時変動を高速化効果と断定しない。原票や対象カードを削減しない。';
  }
  fs.writeFileSync(path.join(ROOT,'data/profile-followup-outcomes.json'),JSON.stringify(result));
  console.log(JSON.stringify({catalog:result.catalog,psaUsableNet:newlyUsable.length,
    profiles:result.profiles.map(p=>({id:p.id,requiredFilled:p.requiredFilled.length,firstQualified:p.firstQualified.length}))}));
  return result;
}
if(require.main===module)build();
module.exports={build};
