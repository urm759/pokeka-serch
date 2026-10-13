const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const m=require('../current-market-model'),d=require('../decision-model');
const at='2026-10-13T01:00:00Z';
const input={now:Date.parse(at),marketUpdatedAt:at,fee:10980,feeRate:8,extraCost:210,exitPolicy:'marketplace',
  assumptions:{hitRate:.8,lowerGradePrice:20000},card:{psa10:33000,overallAssessment:{score:80},psa9Audit:{estimated:true}}};
const source=m.evaluate(input,d),opts={fee:10980,minProfit:1000,minRoi:10,rawMarket:19000};
const g=m.targetGuide(source,opts);
assert(g.cap>=0);assert(g.cap<=source.cap);assert(g.economics.expectedProfit>=1000);
assert(g.economics.expectedRoi>=10);assert(g.economicsAt(g.cap+500).expectedProfit<1000||g.economicsAt(g.cap+500).expectedRoi<10);
assert.equal(g.practicalPrice,13300);assert.equal(g.belowPractical,g.cap<13300);
assert(m.targetGuide(source,{...opts,rawMarket:1000000}).belowPractical);
assert.equal(g.economics.investment,g.cap+10980+210);
assert.equal(g.economics.expectedProfit,source.rawCap-g.cap,'selling costs are deducted once');
assert.equal(m.targetGuide(source,{...opts,minProfit:0,minRoi:0}).cap,source.cap);
assert(m.targetGuide(source,{...opts,minProfit:0,minRoi:0}).noProfitMargin);
assert.equal(m.targetGuide(source,{...opts,minProfit:source.rawCap+1}).cap,null);
assert.equal(m.targetGuide({...source,eligible:false},opts).cap,null);
assert.equal(m.targetGuide(source,{...opts,rawMarket:1000000}).cap,g.cap,'70% never raises or caps the guide');
for(const v of [null,NaN,Infinity,-1]) assert.equal(m.targetGuide(source,{...opts,minRoi:v}).cap,null);
for(const rawCap of [-1,0,499,500]) {
  const v=m.targetGuide({...source,rawCap},{...opts,minProfit:0,minRoi:0});
  assert.equal(v.cap,rawCap<0?null:Math.floor(rawCap/500)*500);
}
const store={usable:true,storeCount:2,scenarios:{current:{expectedSale:23000,netPsa10:26000,travelCost:500,deductionRate:3}}};
const s=m.evaluate({...input,exitPolicy:'buyback',buybackExit:store},d);
assert.equal(s.investmentExtra,710);
const gs=m.targetGuide(s,opts);
assert.equal(gs.economics.expectedProfit,23000-10980-gs.cap);
assert.equal(m.targetGuide(m.evaluate({...input,feeRate:20,exitPolicy:'buyback',buybackExit:store},d),opts).cap,gs.cap,'no marketplace fee on shop PSA10');
assert.equal(m.targetGuide(m.evaluate({...input,exitPolicy:'buyback'},d),opts).cap,null,'no silent exit fallback');
const app=fs.readFileSync('app.js','utf8'),elements=new Map(),saved=new Map();
const context=vm.createContext({window:{PurchaseDecisionModel:d,CurrentMarketModel:m,ExplorationMetrics:require('../exploration-metrics'),ReleaseYearFilter:require('../release-year-filter'),CandidateVisibility:require('../candidate-visibility'),location:{href:'https://example.test/?profitBasis=current-target'}},
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false});return elements.get(id)},querySelectorAll:()=>[]},
  URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});
vm.runInContext(app.split('// Browser event bindings start here;')[0]+'\nglobalThis.api={state,cardSearchExclusions,readUrl,buildShareUrl,saveQuickFilters,restoreQuickFilters};',context);
const api=context.api;api.readUrl();assert.equal(elements.get('profitSearchBasisInput').value,'current-target');
api.state.profitSearchBasis='current-target';assert.equal(api.buildShareUrl().searchParams.get('profitBasis'),'current-target');
api.saveQuickFilters();context.window.location.href='https://example.test/';elements.get('profitSearchBasisInput').value='';api.restoreQuickFilters();assert.equal(elements.get('profitSearchBasisInput').value,'current-target');
vm.runInContext("searchProfitView=()=>({});cardEfficiency=()=>({annual:null,reason:'未取得'});",context);
Object.assign(api.state,{q:'fixture',diagnosticSearch:true,efficiencyMin:10000,year2020Only:true,observation7Min:1,observation30Max:0,observationIncludeReference:false});
const fixture={id:'fixture',name:'fixture',psa10:100};
assert.equal(api.cardSearchExclusions(fixture).length,0,'diagnostic name match ignores all search failures');
assert(api.cardSearchExclusions(fixture,{diagnostic:false}).length>=3,'normal reasons remain available');
for(const annual of [0,9999,null])for(const row of [null,[100,2,null,null,null,null,null,null,null], [100,7,100,30,0,100,90,0,0]]) {
  vm.runInContext(`cardEfficiency=()=>({annual:${annual},reason:'未取得'});`,context);
  api.state.psa10PeriodSummary={asOf:'2026-10-13',minimumObservationDays:{7:5,30:15},cards:row?{fixture:row}:{}};
  assert.equal(api.cardSearchExclusions(fixture).length,0);
  const reasons=api.cardSearchExclusions(fixture,{diagnostic:false});
  assert(reasons.some(r=>r.includes('資金効率')));
  assert(reasons.some(r=>r.includes('観測')),'missing/insufficient/out-of-range observations remain diagnosis reasons');
}
assert(api.cardSearchExclusions({...fixture,id:'other',name:'other'}).includes('名称検索'));
api.state.q='';assert(api.cardSearchExclusions(fixture).length>=3,'empty query does not bypass filters');
api.state.q='fixture';api.state.diagnosticSearch=false;assert(api.cardSearchExclusions(fixture).length>=3);
assert.equal(api.state.efficiencyMin,10000);assert.equal(api.state.observation7Min,1,'saved conditions are not cleared');
console.log('PASS independent current-market target guide, investment/costs/zero/null, exit separation, saved basis and diagnostic exclusions');
