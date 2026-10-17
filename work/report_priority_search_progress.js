const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const {load}=require('./audit_search_profit_consistency'),{withEvaluationDate}=require('./measure_performance_guard');
const ROOT=path.join(__dirname,'..'),ref=process.env.SEARCH_PROFILE_BASE_REF||'e406c099',at=new Date().toISOString();
const read=(f,old=false)=>JSON.parse(old?cp.execFileSync('git',['show',ref+':'+f],{maxBuffer:96e6}):fs.readFileSync(f,'utf8'));
function build() {
  const source=fs.readFileSync('app.js','utf8'),oldSource=cp.execFileSync('git',['show',ref+':app.js'],{encoding:'utf8',maxBuffer:8e6});
  const config=read('work/priority-search-profiles.json'),profiles=[],targetAudit=read('data/priority-search-profile-audit.json');
  for(const p of config.profiles) {
    const before=load(source,at,{url:p.url,dataRef:ref}),after=load(source,at,{url:p.url}),oldCode=load(oldSource,at,{url:p.url});
    const b=before.prepareCalculatedCards(before.state.cards),a=after.prepareCalculatedCards(after.state.cards),old=oldCode.prepareCalculatedCards(oldCode.state.cards);
    const row=(api,c)=>({id:c.id,name:c.name,efficiency:api.cardEfficiency(c),profitSearch:api.searchProfitView(c),reasons:api.cardSearchExclusions(c),decision:c.purchaseDecision});
    const oldIds=old.filter(c=>!oldCode.cardSearchExclusions(c).length).map(c=>c.id),newIds=a.filter(c=>!after.cardSearchExclusions(c).length).map(c=>c.id);
    require('node:assert/strict').deepEqual(oldIds,newIds,'unselected average does not change A/B candidates');
    const bMap=new Map(b.map(c=>[c.id,c])),aMap=new Map(a.map(c=>[c.id,c]));
    const prior=b.filter(c=>!before.cardSearchExclusions(c).length).map(c=>c.id),added=newIds.filter(id=>!prior.includes(id)),lost=prior.filter(id=>!newIds.includes(id));
    const newlyListed=a.filter(c=>!bMap.has(c.id)),filled=[];
    const oldCompletion=read('data/card-catalog-completion.json',true),newCompletion=read('data/card-catalog-completion.json');
    for(const c of a) {
      const previous=oldCompletion.cards[c.id],next=newCompletion.cards[c.id];if(!previous||!next)continue;
      const fields=Object.keys(next.i||{}).filter(k=>next.i[k]==='取得済み'&&previous.i?.[k]!=='取得済み');
      const profileIds=new Set(targetAudit.profiles.find(r=>r.urlOnly.id===p.id)?.urlOnly.rows.map(r=>r.id)||[]);
      if(fields.length&&profileIds.has(c.id))filled.push({id:c.id,fields});
    }
    const restoredFresh=added.filter(id=>before.cardEfficiency(bMap.get(id)).reason?.includes('期限超過'));
    profiles.push({id:p.id,before:prior.length,after:newIds.length,ids:newIds,newListed:newlyListed.length,filled:filled.length,
      firstQualified:added.length,freshnessRestored:restoredFresh.length,lost:lost.length,
      gained:added.map(id=>({before:row(before,bMap.get(id)),after:row(after,aMap.get(id))})),
      lostRows:lost.map(id=>({before:row(before,bMap.get(id)),after:aMap.has(id)?row(after,aMap.get(id)):null})),
      codeOnlyChange:0,examples:newIds.slice(0,3).map(id=>row(after,aMap.get(id))),
      note:'同じ評価時刻・同じ指定URL。新規適合と鮮度復帰は重複しうる。購入GOとは別。端末追加条件を解除しない'});
  }
  const oldData=read('data/card-catalog-completion.json',true),newData=read('data/card-catalog-completion.json');
  const oldApi=load(oldSource,at),newApi=load(source,at),b=oldApi.prepareCalculatedCards(oldApi.state.cards),a=newApi.prepareCalculatedCards(newApi.state.cards);
  const policies={};
  for(const policy of ['marketplace','buyback','both']) {
    oldApi.state.exitPolicy=policy;newApi.state.exitPolicy=policy;
    const oldCards=oldApi.prepareCalculatedCards(oldApi.state.cards),newCards=newApi.prepareCalculatedCards(newApi.state.cards);
    for(const scenario of ['current','central','stress','obs7','obs30','obs75','obs200']) {
      oldApi.state.efficiencyScenario=scenario;newApi.state.efficiencyScenario=scenario;
      const count=(api,cards)=>cards.reduce((r,c)=>{const e=api.cardEfficiency(c);r[e.calculationState]++;if(e.reason)r.reasons[e.reason]=(r.reasons[e.reason]||0)+1;return r;},{calculated:0,reference:0,unavailable:0,reasons:{}});
      policies[policy+':'+scenario]={before:count(oldApi,oldCards),after:count(newApi,newCards)};
    }
  }
  const report={version:1,at,baseline:ref,profiles,policies,sourceNewListed:Object.keys(newData.cards).filter(id=>!oldData.cards[id]).length,
    analyzedBefore:oldData.summary.analyzable,analyzedAfter:newData.summary.analyzable,
    newAnalyzable:Object.keys(newData.cards).filter(id=>newData.cards[id].s==='分析可能'&&oldData.cards[id]?.s!=='分析可能'),
    fixedFreshnessBefore:read('data/priority-price-monitor.json',true).fixedCohortFreshness.sources.hareruya2.latest,
    fixedFreshnessAfter:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
    actualAcquisition:read('work/candidate-shop-refresh.json').sources.hareruya2,discovery:read('data/state-a-url-discovery.json'),
    supplementalRun:read('data/completion-acquisition.json'),backlog:read('data/one-item-completion-audit.json').byRoute,
    llmCalls:0,codexCalls:0,notCompleted:['新コードによる次回定期取得・保存・公開の実証','国内PSA9・状態A個別成約','認証PokeDATA','403取得元','期間別予測・返却時検証'],
    note:'保存済み買取原票の要約生成は実取得ではない。手動取得と定期運転を分離。GO/仕入れ上限の式を変更しない。完了日を更新しない'};
  fs.writeFileSync(path.join(ROOT,'data/priority-search-progress.json'),JSON.stringify(report));
  console.log(JSON.stringify({profiles:profiles.map(p=>({id:p.id,before:p.before,after:p.after,newListed:p.newListed,filled:p.filled,firstQualified:p.firstQualified,freshnessRestored:p.freshnessRestored,lost:p.lost})),newAnalyzable:report.newAnalyzable.length,analyzableNet:report.analyzedAfter-report.analyzedBefore,
    meanCalculations:policies['both:obs30'],freshness:report.fixedFreshnessAfter.fresh6hPct}));
}
withEvaluationDate(Date.parse(at),build);
