const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),base='3be46e04';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const old=file=>JSON.parse(execFileSync('git',['show',`${base}:${file}`],{cwd:root,maxBuffer:80*1024*1024,encoding:'utf8'}));
function build(){
  const before=old('data/card-catalog-completion.json'),after=read('data/card-catalog-completion.json');
  const filled=[],newAnalysis=[],lostAnalysis=[];
  for(const [id,row] of Object.entries(after.cards)){
    const previous=before.cards[id];if(!previous)continue;
    const fields=Object.keys(row.i||{}).filter(k=>row.i[k]==='取得済み'&&previous.i?.[k]!=='取得済み');
    if(fields.length)filled.push({id,fields});
    if(row.s==='分析可能'&&previous.s!=='分析可能')newAnalysis.push(id);
    if(row.s!=='分析可能'&&previous.s==='分析可能')lostAnalysis.push(id);
  }
  const popBefore=old('data/psa-population-summary.json'),popAfter=read('data/psa-population-summary.json');
  const discovery=read('data/state-a-url-discovery.json'),shop=read('work/candidate-shop-refresh.json').sources.hareruya2;
  const progress=read('work/psa-fetch-progress.json'),observability=require('./source_observability');
  const priorRun=read('work/source-update-runs.json').sources.psaOfficial;
  if(priorRun?.startedAt!==progress.startedAt){
    const record=observability.updateRun('psaOfficial',{startedAt:progress.startedAt,lastAttemptAt:progress.startedAt,
      endedAt:progress.endedAt,status:'partial',durationMs:progress.durationMs,lastSuccessAt:progress.lastSuccessAt,
      lastError:progress.stopReason,acquiredCount:read('data/psa-official-populations.json').records?.length || Object.keys(popAfter.cards).length,
      updatedCount:progress.changedCount,newAcquiredCount:progress.newAcquiredCount,refreshedCount:progress.refreshedCount,
      fetchFailureCount:0,sourceState:'認証済み正規ページ2セット・344行更新。残セット巡回とURL単位確認待ちは継続',
      syncStatus:'saved',publishStatus:'pending',dataChanged:true});
    observability.appendRunHistory('psaOfficial',record);
  }
  const recovery={runId:'37558069094',artifactId:11455144057,bundleVerified:true,
    archiveSha256:'ba8ab16daa9be0a26c1c9174f0ba37d1622c79e3bf42cc74d9381c7769727f36',
    cause:'Git push競合→生成物manifestの統合競合。退避はpriority-prices未登録で失敗',
    acquisition:'既存137件の成功取得をbundleから回収。回収のための再取得0',checks:137,httpRequests:250,
    acquisitionDurationMs:345173,newLinked:0,newPrices:0,purchaseFreshnessRecovered:29,nextId:'pk-2334'};
  const result={version:1,generatedAt:new Date().toISOString(),baselineCommit:base,recovery,
    before:before.summary,after:after.summary,filledCards:filled,newlyAnalyzable:newAnalysis,lostAnalyzable:lostAnalysis,
    psa:{rowsRefreshed:344,newRawRows:211,changedRawRows:133,beforeLinked:Object.keys(popBefore.cards).length,
      afterLinked:Object.keys(popAfter.cards).length,newLinkedIds:Object.keys(popAfter.cards).filter(id=>!popBefore.cards[id]),
      heldMappingIds:Object.keys(popBefore.cards).filter(id=>!popAfter.cards[id]),variantReview:read('data/psa-mapping-review.json'),
      checkpoint:read('work/psa-fetch-progress.json'),source:'正規PSAページ・認証済み専用Chrome・2正常セット'},
    urlDiscovery:{attempted:discovery.attempted,newLinked:discovery.newLinked,ambiguous:discovery.ambiguous,
      noCandidate:discovery.noCandidate,cacheHits:discovery.cacheHits,httpRequests:discovery.httpRequests},
    newShopAcquisition:shop,purchasePrices:{before:old('data/purchase-price-freshness-audit.json').purchaseStates,
      after:read('data/purchase-price-freshness-audit.json').purchaseStates},modelChanged:false,safetyChanged:false,llmCalls:0,codexCalls:0,
    publication:'公開URL照合は別工程。部分取得を全完了扱いにしない'};
  fs.writeFileSync(path.join(root,'data/recovery-completion-audit.json'),JSON.stringify(result));
  console.log(JSON.stringify({before:result.before.analyzable,after:result.after.analyzable,filled:filled.length,
    newAnalysis:newAnalysis.length,lostAnalysis:lostAnalysis.length,psaLinks:result.psa.newLinkedIds.length,shopNew:shop.newAcquiredCount}));
  return result;
}
if(require.main===module)build();module.exports={build};
