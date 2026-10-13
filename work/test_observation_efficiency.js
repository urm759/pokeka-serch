const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const metrics=require('../exploration-metrics');
const now=Date.parse('2026-10-13T09:00:00Z');
const summary={asOf:'2026-10-13',minimumObservationDays:{7:5,30:15,90:45,200:200},staleObservationDays:2,
  cards:{fixture:[40000,7,41000,20,0,44000,43,0,0,45000,43,0,0]}};
const view={assumedRate:.8,lowerGradePrice:15000,eligible:true,rawCap:21200,capState:'available',cap:21000,
  reasons:[],referenceReasons:[],warnings:[],exitLabel:'フリマ',calculationState:'calculated'};
const card={id:'fixture',psa10:35000,testView:view,currentStoreOffer:{value:10000,available:true,fresh:true,updatedAt:new Date(now).toISOString(),inventoryAt:new Date(now).toISOString()}};
const result=metrics.observationEconomics(summary,card,view,7,'marketplace',8,210,now);
assert.equal(result.expectedSale,31990);
assert(metrics.observationEconomics(summary,card,view,30,'marketplace',8,210,now).observed.reference,'missing calendar days remain reference even above the old minimum');
assert(result.warnings.some(w=>w.includes('楽観的')));
const uncertain={...summary,cards:{fixture:[...summary.cards.fixture.slice(0,12),20]}};
assert(metrics.observationEconomics(uncertain,card,view,7,'marketplace',8,210,now).observed.reference,'old summary with no per-period proof is reference, not complete');
const proven={...uncertain,observationEvidenceIndices:{7:13},cards:{fixture:[...uncertain.cards.fixture,0]}};
assert.equal(metrics.observationEconomics(proven,card,view,7,'marketplace',8,210,now).observed.reference,false,'old uncertainty outside selected period does not invalidate proven selected days');
assert.equal(metrics.efficiency(result,10000,10980,210,147,7,3).profit,11010);
for(const policy of ['buyback','both']) assert.equal(metrics.observationEconomics(summary,card,view,7,policy,8,210,now).expectedSale,null,'market mean is not a buyback mean');
for(const grade of [null,NaN,Infinity,0]) assert.equal(metrics.observationEconomics(summary,card,{...view,lowerGradePrice:grade},7,'marketplace',8,210,now).expectedSale,null);
assert.equal(metrics.observationEconomics(summary,{...card,id:'new'},view,200,'marketplace',8,210,now).expectedSale,null);
assert.equal(metrics.observationEconomics(summary,card,view,7,'marketplace',8,210,now+3*86400000).expectedSale,null,'clock passage invalidates stale mean');
const source=fs.readFileSync('app.js','utf8'),inputs=new Map(),storage=new Map();
const context=vm.createContext({window:{PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:metrics,location:{href:'https://test.local/?effScenario=obs200'}},
  document:{getElementById:id=>{if(!inputs.has(id))inputs.set(id,{value:'',checked:false});return inputs.get(id);},querySelectorAll:()=>[]},
  URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+'\ncurrentMarketView=c=>c.testView;globalThis.api={state,cardEfficiency,efficiencySearchValue,readUrl,buildShareUrl,saveQuickFilters,restoreQuickFilters,computationKey};',context);
const api=context.api,s=api.state;
Object.assign(s,{psa10PeriodSummary:summary,fee:10980,saleExtraCost:210,saleFeeRate:8,lockDays:147,exitPolicy:'marketplace',efficiencyBuy:'auto',efficiencySaleDays:7,efficiencyPayoutDays:3,efficiencyScenario:'obs7',purchaseMode:'current-market',profitSearchBasis:'auto'});
let e=api.cardEfficiency(card,now);assert.equal(e.profit,11010);assert.equal(e.purchasePrice,10000);assert.equal(e.days,157);assert.equal(e.calculationState,'calculated');
card.currentStoreOffer.value=9000;assert.equal(api.cardEfficiency(card,now).profit,12010,'in-place offer updates invalidate efficiency cache');card.currentStoreOffer.value=10000;
assert.match(e.scenario,/混合仮定/);const oldKey=api.computationKey();s.efficiencyScenario='obs200';assert.equal(api.computationKey(),oldKey,'no full prediction/limit recalculation for mean choice');
e=api.cardEfficiency(card,now);assert.equal(e.calculationState,'reference');assert.equal(e.observation.count,43);
s.efficiencyIncludeReference=false;assert.equal(api.efficiencySearchValue(e),null);
s.efficiencyIncludeReference=true;s.observationIncludeReference=false;assert.equal(api.efficiencySearchValue(e),null,'saved reference-average OFF cannot be bypassed by efficiency reference ON');s.observationIncludeReference=true;assert.equal(api.efficiencySearchValue(e),e.annual);
s.observation7Min=1000;s.observationIncludeReference=false;
api.saveQuickFilters();context.window.location.href='https://test.local/';api.restoreQuickFilters();assert.equal(inputs.get('efficiencyScenarioInput').value,'obs200');assert.equal(inputs.get('observation7MinInput').value,1000);assert.equal(inputs.get('observationIncludeReferenceInput').checked,false);
assert.equal(api.buildShareUrl().searchParams.get('effScenario'),'obs200');context.window.location.href='https://test.local/?effScenario=obs200';api.readUrl();assert.equal(inputs.get('efficiencyScenarioInput').value,'obs200');
s.efficiencyScenario='obs7';const before=api.cardEfficiency(card,now).annual;
s.psa10PeriodSummary={...summary,cards:{fixture:[39000,...summary.cards.fixture.slice(1)]}};
assert(api.cardEfficiency(card,now).annual<before,'summary update invalidates efficiency cache');
s.fee=12000;assert.equal(api.cardEfficiency(card,now).profit,9254,'changed grading fee only once');
s.lockDays=42;assert.equal(api.cardEfficiency(card,now).days,52,'average period does not mechanically change with plan');
s.exitPolicy='both';assert.equal(api.cardEfficiency(card,now).annual,null);assert.match(api.cardEfficiency(card,now).reason,/買取出口/);assert(!api.cardEfficiency(card,now).exitLabel.includes('フリマ（両出口の保守側）'),'unavailable both-exit average is not labelled a marketplace fallback');
s.exitPolicy='marketplace';assert.equal(api.cardEfficiency(card,now+3*86400000).annual,null);
assert(source.includes('data-efficiency-comparison'),'comparison is lazy');
console.log('Observation expected efficiency: fees, mixed grades, exits, gaps, staleness, plans, URL/storage and cache PASS');
