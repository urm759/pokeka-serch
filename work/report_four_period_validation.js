const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),{withEvaluationDate}=require('./measure_performance_guard');
const at=new Date().toISOString(),baseline='1deb77c9';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),old=f=>JSON.parse(cp.execFileSync('git',['show',baseline+':'+f],{maxBuffer:96e6}));
const samples=read('work/four-period-browser-raw.json'),median=xs=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)],pairs=[];
assert.equal(samples.length,8);
for(const width of [1440,390])for(const double of [false,true]){
  const b=samples.find(r=>r.width===width&&r.mode===(double?'before-double':'before'));
  const a=samples.find(r=>r.width===width&&r.mode===(double?'double':'after'));
  assert.equal(a.financialHash,b.financialHash);assert.deepEqual(a.ids,b.ids);assert.equal(a.displayed,60);
  const measure=r=>({fullCalculationMs:median(r.samples.map(s=>s.full.calculationMs)),conditionDomMs:median(r.samples.map(s=>s.condition.domMs)),detailDomMs:median(r.samples.map(s=>s.detail.domMs)),initialJsonBytes:r.initialJsonBytes,jsonParseMs:r.jsonParseMs,transferredBytes:r.transferredBytes,lazyHistoryRequests:r.lazyHistoryRequests});
  pairs.push({width,double,loaded:a.loadedCards,before:measure(b),after:measure(a),idsEqual:true,financialHash:a.financialHash});
}
const completion=require('./audit_completion_outcomes'),saved=read('work/search-profile-cycle-baseline-manual.json');
const delta=completion.compare(completion.unpack(saved.snapshot),completion.snapshot(process.cwd()));
const previousRows=completion.unpack(saved.snapshot).rows,currentRows=completion.snapshot(process.cwd()).rows,required=require('./completion_routes').REQUIRED;
delta.requiredFilledCards=0;delta.requiredFields={};
for(const [id,row]of Object.entries(currentRows)){
  const prior=previousRows[id];if(!prior)continue;
  const fields=row.fields.filter(f=>required.includes(f)&&!prior.fields.includes(f));
  if(fields.length)delta.requiredFilledCards++;
  for(const field of fields)delta.requiredFields[field]=(delta.requiredFields[field]||0)+1;
}
const profiles=[];withEvaluationDate(Date.parse(at),()=>{
  const beforeSource=cp.execFileSync('git',['show',baseline+':app.js'],{encoding:'utf8',maxBuffer:8e6}),source=fs.readFileSync('app.js','utf8');
  for(const p of read('work/priority-search-profiles.json').profiles){
    const b=load(beforeSource,at,{url:p.url}),a=load(source,at,{url:p.url}),bc=b.prepareCalculatedCards(b.state.cards),ac=a.prepareCalculatedCards(a.state.cards);
    const financial=cards=>crypto.createHash('sha256').update(JSON.stringify(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
    assert.equal(financial(bc),financial(ac),'same-data financial hash must match');
    const ids=(api,cards)=>cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
    const qualified=ids(a,ac),qualifiedSet=new Set(qualified);
    assert.deepEqual(ids(b,bc),qualified);assert.equal(b.buildShareUrl().href,a.buildShareUrl().href);
    profiles.push({id:p.id,count:qualified.length,ids:qualified,go:ac.filter(c=>qualifiedSet.has(c.id)&&c.purchaseDecision?.verdict==='GO').length,codeOnlyCandidateChange:0,financialEqual:true,urlEqual:true});
  }
});
const marketBefore=old('data/psa10-period-summary.json'),marketAfter=read('data/psa10-period-summary.json');
const periods={};for(const [days,index]of [[7,1],[30,3],[90,6],[200,10]]){
  const common=Object.keys(marketBefore.cards).filter(id=>marketAfter.cards[id]);
  periods[days]={cardsWithMoreDays:common.filter(id=>marketAfter.cards[id][index]>marketBefore.cards[id][index]).length,
    additionalCardDays:common.reduce((n,id)=>n+Math.max(0,(marketAfter.cards[id][index]||0)-(marketBefore.cards[id][index]||0)),0),
    newHistoryCards:Object.keys(marketAfter.cards).filter(id=>!marketBefore.cards[id]).length};
}
const shopCount=history=>Object.values(history.shops||{}).flatMap(cards=>Object.values(cards)).reduce((n,dates)=>n+Object.keys(dates).length,0);
const report={version:1,at,baseline,evaluationAt:'2026-10-14T02:12:00Z',profiles,delta,periods,
  buybackCardDays:{before:shopCount(old('work/buyback-price-observations.json')),after:shopCount(read('work/buyback-price-observations.json'))},
  pairs,cycle:read('data/search-profile-cycle-progress.json').cycles.at(-1),freshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
  note:'3回中央値、60枚、同じPCの1440/390幅。原票初期読込なし。解析/通信は1読込、計算/DOMは3回。paint・実機スマホ・定期維持成功とは別。実データ差分は定期処理を含む。',
  nextScheduledVerification:'新コードの次回定期取得・保存・公開照合は未実証。非AI受領証で継続',llmCalls:0,codexCalls:0};
fs.writeFileSync('data/four-period-efficiency-validation.json',JSON.stringify(report));
console.log(JSON.stringify({profiles,delta,periods,buybackCardDays:report.buybackCardDays,pairs}));
