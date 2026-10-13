const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency');
const at=new Date().toISOString(),ref=process.env.OBSERVATION_BASE_REF || 'ffdf2ac0';
const current=fs.readFileSync('app.js','utf8'),previous=cp.execFileSync('git',['show',ref+':app.js'],{encoding:'utf8',maxBuffer:8000000});
const old=load(previous,at),next=load(current,at);
const oldCards=old.prepareCalculatedCards(old.state.cards),cards=next.prepareCalculatedCards(next.state.cards);
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const finances=x=>x.map(c=>[c.id,c.buyLimits,c.purchaseDecision]);
assert.equal(digest(finances(oldCards)),digest(finances(cards)));
const ids=(api,x)=>x.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
assert.deepEqual(ids(old,oldCards),ids(next,cards));
assert.equal(digest(oldCards.map(c=>old.cardEfficiency(c))),digest(cards.map(c=>{const r=next.cardEfficiency(c);const {observation,...legacy}=r;return legacy;})),'default efficiency unchanged');
const sharedUrl=require('./audit_efficiency_thresholds').userUrl(),sharedOld=load(previous,at,{url:sharedUrl}),sharedNew=load(current,at,{url:sharedUrl});
const sharedCards=sharedNew.prepareCalculatedCards(sharedNew.state.cards),sharedIds=ids(sharedNew,sharedCards);
assert.deepEqual(ids(sharedOld,sharedCards),sharedIds,'latest shared URL keeps IDs when mean basis is unselected');
const counts={};
for(const policy of ['marketplace','buyback','both']) {
  next.state.exitPolicy=policy;
  const policyCards=next.prepareCalculatedCards(next.state.cards);
  for(const scenario of ['current','obs7','obs30','obs90','obs200']) {
    next.state.efficiencyScenario=scenario;
    const states={calculated:0,reference:0,unavailable:0};
    for(const c of policyCards) states[next.cardEfficiency(c).calculationState]++;
    counts[policy+':'+scenario]=states;
  }
}
next.state.exitPolicy='marketplace';next.state.efficiencyScenario='current';
const examples=next.prepareCalculatedCards(next.state.cards).filter(c=>/グレイシアV SR.*SA|ニンフィアV SR.*SA|リーリエのピッピex SAR/.test(c.name)).slice(0,6).map(c=>({id:c.id,name:c.name,scenarios:Object.fromEntries(['current','obs7','obs30','obs90','obs200'].map(s=>{next.state.efficiencyScenario=s;const e=next.cardEfficiency(c);return[s,e];}))}));
const report={at,referenceCommit:ref,sameData:true,financialHash:digest(finances(cards)),defaultCandidateIds:ids(old,oldCards),sharedCandidateIds:sharedIds,defaultCalculationsAndGoUnchanged:true,
  counts,examples,newAcquired:0,newLinked:0,newAnalyzable:0,notes:['売却先を明示変更した比較だけを集計。公開・ユーザー設定は変更しない','PSA10日次平均／非10現在PSA9の混合基準。PSA8以下未評価','買取履歴は保持。店舗・仕様・減額を揃えた出口平均要約は未整備。両出口をフリマへ自動切替しない','期間は手動選択。返却期間との対応・平均回帰は未検証','この集計は取得・日次観測増加の成果ではない'],llmCalls:0,codexCalls:0};
fs.writeFileSync('data/observation-efficiency-validation.json',JSON.stringify(report));
console.log(JSON.stringify({at,defaultCandidateCount:report.defaultCandidateIds.length,defaultCalculationsAndGoUnchanged:true,counts,examples:examples.map(e=>({id:e.id,values:Object.fromEntries(Object.entries(e.scenarios).map(([k,v])=>[k,{profit:v.profit,annual:v.annual,observed:v.observation?.count,state:v.calculationState}]))}))}));
