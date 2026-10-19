const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=require('node:path').join(__dirname,'..'),{load}=require('./audit_search_profit_consistency');
function report(){
  const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),baseline=read('work/20261019-pop-baseline.json'),at=new Date().toISOString();
  const old=cp.execFileSync('git',['show','02c415b1:app.js'],{encoding:'utf8',maxBuffer:8e6}),current=fs.readFileSync('app.js','utf8');
  const profiles=require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json')),cache=new Map();
  const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
  const evaluate=(profile,source,phase,time,dataRef)=>{
    const api=load(source,time,{url:profile.url,...(dataRef?{dataRef}:{})}),key=phase+api.computationKey();
    if(!cache.has(key))cache.set(key,api.prepareCalculatedCards(api.state.cards));
    const rows=cache.get(key),ids=rows.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
    return {api,rows,ids,hash:hash(rows),missing:api.missingHistoricalInputs};
  };
  const result={at,baselineCommit:'02c415b1',profiles:[],delta:require('./audit_completion_outcomes').compare(baseline.completion,require('./audit_completion_outcomes').snapshot(ROOT)),
    pop:read('data/psa-pop-coverage.json'),recovery:read('data/psa-pop-recovery-audit.json'),handoff:read('data/psa-publication-handoff.json'),
    readiness:read('data/modern-high-rarity-audit.json').readiness2020,llmCalls:0,codexCalls:0};
  const sets={before:new Set(),after:new Set()};
  for(let i=0;i<profiles.length;i++){
    const p=profiles[i],before=baseline.profiles.profiles[i].urlOnly;
    const currentOld=evaluate(p,old,'new-data-old-code',at),after=evaluate(p,current,'new-data-new-code',at);
    assert.equal(currentOld.hash,after.hash,'display/recovery fixes cannot change financial calculations or GO');
    assert.deepEqual(currentOld.ids,after.ids,'same data/time/settings has identical IDs');
    const historicalNow=evaluate(p,old,'historical-now',at,'02c415b1');
    const historicalAt=baseline.profiles.generatedAt||baseline.profiles.at||baseline.at;
    const historicalThen=evaluate(p,old,'historical-then',historicalAt,'02c415b1');
    const beforeSet=new Set(before.ids),afterSet=new Set(after.ids),lost=before.ids.filter(id=>!afterSet.has(id)),gained=after.ids.filter(id=>!beforeSet.has(id));
    before.ids.forEach(id=>sets.before.add(id));after.ids.forEach(id=>sets.after.add(id));
    const values=(api,rows,id)=>{
      const c=rows.find(c=>c.id===id);if(!c)return null;const e=api.cardEfficiency(c),pop=api.state.psaPopulation[c.id];
      return {name:c.name,referencePrice:c.price,purchase:c.currentStoreOffer?.value??null,psa10:c.psa10,psa9:c.snkPsa9Price??null,
        officialAt:pop?.f||null,officialRate:pop?.rate??null,profit:e?.expectedProfit??e?.profit??null,annual:e?.annualEfficiency??e?.annual??null,
        supplyRisk:c.assessment?.supplyRisk??c.supplyRiskScore??null,verdict:c.purchaseDecision?.verdict,reasons:api.cardSearchExclusions(c),decisionReasons:c.purchaseDecision?.reasons};
    };
    const replayMatches=!historicalThen.missing.length&&JSON.stringify([...historicalThen.ids].sort())===JSON.stringify([...before.ids].sort());
    result.profiles.push({id:p.id,parameters:before.parameters,before:before.ids,after:after.ids,gained,lost,codeOnlyDifference:0,replayMatches,
      comparisonAt:at,historicalAt,historicalMissingInputs:historicalThen.missing,
      timeOnlyLost:historicalThen.ids.filter(id=>!historicalNow.ids.includes(id)),
      dataOnlyLost:historicalNow.ids.filter(id=>!after.ids.includes(id)),
      departures:lost.map(id=>({id,recordedBefore:before.inspectedRows?.[id],fixedTimeBefore:values(historicalNow.api,historicalNow.rows,id),after:values(after.api,after.rows,id)}))});
  }
  result.independent={before:sets.before.size,after:sets.after.size,gained:[...sets.after].filter(id=>!sets.before.has(id)),lost:[...sets.before].filter(id=>!sets.after.has(id))};
  result.note='4固定条件。回収実測と今朝の定期実取得済みパケットの公開回収、同日再確認、新規分析可能、初適合は別。履歴再現が不一致/不足なら原因確定に使用しない。POP回収ブランチは金融モデルへ不使用。';
  fs.writeFileSync('data/pop-resilience-outcomes.json',JSON.stringify(result));
  console.log(JSON.stringify({delta:result.delta,pop:{reasons:result.pop.reasons,periods:result.pop.periods,fresh:result.pop.fresh,stale:result.pop.stale},independent:result.independent,profiles:result.profiles.map(p=>({id:p.id,before:p.before.length,after:p.after.length,lost:p.lost,replay:p.replayMatches,codeDiff:p.codeOnlyDifference}))}));
}
if(require.main===module)report();module.exports={report};
