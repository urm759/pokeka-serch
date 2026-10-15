const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function build(){
  const at=new Date().toISOString(),cycle=read('data/search-profile-cycle-progress.json').cycles.find(r=>r.key==='eevee-stores-20261015');
  const original=cp.execFileSync('git',['show','b2cd2af9:app.js'],{encoding:'utf8',maxBuffer:16e6}),current=fs.readFileSync('app.js','utf8');
  const {load}=require('./audit_search_profit_consistency');
  const codeComparisons=require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json')).map(p=>{
    const values=[original,current].map(source=>{const api=load(source,at,{url:p.url}),cards=api.prepareCalculatedCards(api.state.cards);
      return {ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id).sort(),hash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))};});
    assert.deepEqual(values[0],values[1],p.id+' changed financial results');return {profile:p.id,equal:true,count:values[1].ids.length,hash:values[1].hash};
  });
  const outcomes=require('./audit_completion_outcomes'),before=outcomes.unpack(read('work/search-profile-cycle-baseline-eevee-stores-20261015.json').snapshot);
  const cards=read('data/pokemon-cards.json'),status=read('data/update-status.json');
  const discovery=read('data/state-a-url-discovery.json'),completion=read('data/completion-acquisition.json');
  const summary=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value[k]]));
  const report={version:1,at,base:'b2cd2af9',cycle,codeComparisons,
    globalDataChanges:outcomes.compare(before,outcomes.snapshot(process.cwd(),Date.parse(at))),
    qualifiedNames:cycle.uniqueOutcomes.firstQualified.map(id=>({id,name:cards.find(c=>c.id===id)?.name})),
    sourceProgress:{discovery:summary(discovery,['startedAt','endedAt','attempted','newLinked','httpRequests','cacheHits','status']),
      completion:summary(completion,['startedAt','endedAt','attempted','acquired','newAcquired','newLinked','failures','durationMs','stopReason']),camp:read('work/torecacamp_progress.json').lastRun},
    yuyutei:{lastSuccess:status.sources.yuyutei.lastSuccessAt,lastAttempt:status.sources.yuyutei.lastAttemptAt,state:status.sources.yuyutei.sourceState,
      stopped:status.sources.yuyutei.acquisitionStopped,next:status.sources.yuyutei.nextScheduledAt,checkpoint:status.sources.yuyutei.diagnostics?.resumePosition,reason:status.sources.yuyutei.lastError},
    fixedFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
    validation:read('data/supply-demand-validation-summary.json'),scheduled:read('data/scheduled-cycle-verification.json').pipelines.daily,
    shops:read('data/additional-shop-access-audit.json'),newListing:0,purchaseGoRulesChanged:false,financialFormulaChanged:false,
    llmCalls:0,codexCalls:0,note:'Manual completion and a verified earlier scheduled cycle are separate. Reference median recovery is not required analysis completion. Unique per-card counts are not summed across four conditions. No new merchant authorized or enabled.'};
  fs.writeFileSync('data/eevee-operations-outcomes.json',JSON.stringify(report));
  const eevee=read('data/eevee-comparison-audit.json'),a=eevee.profiles.find(p=>p.id==='A-median');
  const number=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ja-JP'):'算出不可';
  const lines=['# イーブイヒーローズ V・SR SA 8種 比較監査','',`評価日時 ${eevee.at}。条件A中央値版を表に掲載。全4条件の根拠は data/eevee-comparison-audit.json。通常SR/VMAXは対象外。`,
    '', '買値は新鮮な参考中央値。実店舗の購入価格とは別で、購入GOではない。PSA9は国内集計値・個別実成約未取得、非10をPSA9へ仮置きしPSA8以下は未評価。',
    '', '|カード|店舗価格|中央値|PSA10|PSA9集計|採用10率|期待利益|単純年効率|主な除外理由|','|---|---:|---:|---:|---:|---:|---:|---:|---|'];
  for(const c of a.cards)lines.push(`|${c.name.split('[')[0]} ${c.cardNumber}|${number(c.store?.value)}|${number(c.median)}|${number(c.psa10)}|${number(c.psa9)}|${Number.isFinite(c.assumedRate)?(c.assumedRate*100).toFixed(1)+'%':'未取得'}|${number(c.selectedEfficiency.profit)}|${Number.isFinite(c.selectedEfficiency.annual)?c.selectedEfficiency.annual.toFixed(2)+'%':'算出不可'}|${c.exclusions.join('／')||'条件適合・GOとは別'}|`);
  lines.push('', '売却先・費用・採用元/独立店舗数・個別確認日時・前後値・実購入価格での別採算はJSONに保持。算出不可を0へ置換しない。', '',
    '取得停止：遊々亭403、ドラゴンスター通常HTTP403、カーナベル現行規約の自動化禁止は回避しない。正常な他店舗は継続。');
  fs.writeFileSync('docs/EEVEE_COMPARISON.md',lines.join('\n')+'\n');
  console.log(JSON.stringify({comparisons:codeComparisons.map(p=>({profile:p.profile,count:p.count,equal:p.equal})),unique:cycle.uniqueOutcomes,global:report.globalDataChanges}));
}
if(require.main===module)build();module.exports={build};
