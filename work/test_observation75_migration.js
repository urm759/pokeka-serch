const assert=require('node:assert/strict'),m=require('../exploration-metrics');
const {statistics}=require('./build_psa10_period_statistics');
const end='2026-10-18',day=i=>new Date(Date.parse(end)-i*86400000).toISOString().slice(0,10);
const rows=Array.from({length:91},(_,i)=>[day(i),null,i<75?100:1000]);
assert.equal(statistics(rows,end,75,0,2).mean,100);
assert.equal(statistics(rows,end,75,0,2).count,75);
assert(statistics(rows,end,90,0,2).mean>100,'75 days are recomputed, not relabelled or prorated');
let x=m.migrateObservationSettings({obs90Min:0,obs90Max:-2,effScenario:'obs90',bb90:9,lock:91},true);
assert.deepEqual(x.value,{obs75Min:0,obs75Max:-2,effScenario:'obs75',bb90:9,lock:91});
assert.equal(x.previous.obs90Min,0);assert.equal(x.value.obs75Min>x.value.obs75Max,true,'invalid interval is preserved for error reporting');
assert.equal(m.migrateObservationSettings({obs90Min:5,obs75Min:'off'},true).value.obs75Min,'off','new explicit clear wins');
assert.equal(m.migrateObservationSettings({observation90Min:null,observation7Min:1000,observationIncludeReference:false}).value.observation7Min,1000);
const old={asOf:end,cards:{x:[100,7,100,30,0,100,75,0,0]}};
assert.equal(m.observation(old,'x',100,75).mean,null,'old compact 90-day slot must not be consumed as 75');
assert.equal(m.observation({...old,periods:[7,30,75,200]},'x',100,75).delta,0);
assert.equal(m.tradeDemand({tradeDemand:{cards:{x:[1,3,0,null,null,99]},times:[end]}},'x',75).count,null,'native/legacy 90-day counts are not 75-day counts');
const tradeCard={id:'proof',identityKey:'proof-spec',language:'ja',snkPsa10Count:3};
const receipt={version:1,payloadHash:'saved-response',sourceUrl:'https://source.example/card/proof',observedAt:end+'T00:00:00Z',
  cards:{proof:[require('./psa10_observation_evidence').identity(tradeCard),9500,null,null]}};
assert.deepEqual(require('./psa10_trade_statistics').aggregate(tradeCard,receipt,Date.parse(end+'T01:00:00Z')).counts,{7:null,30:null},'null period counts must not become UI-default zero or undated sample count 3');
const {summarize}=require('./build_high_rarity_readiness');
const cards=[{id:'known',name:'テスト SR [S4 100/100]',setCode:'S4',language:'ja'},{id:'unknown',name:'テスト SR [UNKNOWN 001/100]',setCode:'UNKNOWN',language:'ja'},{id:'ar',name:'テスト AR [S4 101/100]',setCode:'S4',language:'ja'}];
const coverage=summarize(cards,cards,{cards:{known:{s:'分析可能'}}},['SR']);
assert.equal(coverage.srFamily.sourceTarget,1);assert.equal(coverage.srFamily.unknown,1);assert.equal(coverage.srFamily.conservativeAnalysisPct,50);assert.equal(coverage.arChr.sourceTarget,1);
const {project}=require('./build_overseas_price_glance');
const record={localCardId:'c',linkStatus:'auto-confirmed',sourceUrl:'https://www.pokedata.io/card/set/name',pokedata:{setCode:'S4',printedNumber:'100/100',language:'JAPANESE'},markets:{ebayPsa10:{grade:'PSA10',priceSource:'actual-sale',usableIndividualMedian:true,medianJpy:12000,adoptedCount:3}}};
const card={id:'c',identityKey:'same-spec',name:'テスト SR [S4 100/100]',setCode:'S4'};
record.localCardName=card.name;
assert.equal(project(record,card).psa10.jpy,12000);
assert.equal(project({...record,pokedata:{...record.pokedata,language:'ENGLISH'}},card),null);
assert.equal(project({...record,markets:{ebayPsa10:{...record.markets.ebayPsa10,priceSource:'estimate'}}},card),null);
assert.equal(project({...record,sourceUrl:'javascript:bad'},card),null);
assert.equal(project({...record,markets:{ebayPsa10:{...record.markets.ebayPsa10,grade:'PSA9'}}},card),null);
assert.equal(project({...record,localCardName:'テスト SR:SA [S4 100/100]'},card),null);
const fs=require('node:fs'),vm=require('node:vm'),storage=new Map(),inputs=new Map();
const context=vm.createContext({window:{PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:m,
  location:{href:'https://test.local/?obs90Min=0&obs90Max=10&effScenario=obs90&effBuy=auto&lock=91'}},
  document:{getElementById:id=>{if(!inputs.has(id))inputs.set(id,{value:'',checked:false,classList:{toggle(){}}});return inputs.get(id);},querySelectorAll:()=>[]},
  URL,URLSearchParams,console,setTimeout,clearTimeout,TextEncoder,performance:{now:()=>0,getEntriesByName:()=>[]},
  fetch:async()=>({ok:true,url:'https://test.local/data.json',text:async()=>'{}'}),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(fs.readFileSync('app.js','utf8').split('// Browser event bindings start here;')[0]+
  '\nglobalThis.api={readUrl,restoreQuickFilters,fetchJsonMaybe,revision:()=>loadedDataRevision,state,storageKey:QUICK_FILTER_STORAGE_KEY};',context);
context.api.readUrl();
assert.equal(inputs.get('observation75MinInput').value,0);assert.equal(inputs.get('efficiencyScenarioInput').value,'obs75');
assert([...storage.keys()].some(k=>k.endsWith(':observation-90-to-75-v1')),'legacy URL is archived before use');
const saved={observation90Min:0,observation7Min:1000,observationIncludeReference:false,efficiencyScenario:'obs90'};
storage.set(context.api.storageKey,JSON.stringify(saved));context.window.location.href='https://test.local/?effBuy=auto';
context.api.restoreQuickFilters();
const migrated=JSON.parse(storage.get(context.api.storageKey));
assert.equal(migrated.observation75Min,0);assert(!Object.hasOwn(migrated,'observation90Min'));
assert.equal(inputs.get('observation7MinInput').value,1000);assert.equal(inputs.get('observationIncludeReferenceInput').checked,false);
context.window.location.href='https://test.local/?obs75Min=off&obs90Min=123';context.api.readUrl();
assert.equal(inputs.get('observation75MinInput').value,'','explicit new clear wins over legacy bound');
(async()=>{
  const before=context.api.revision();
  await context.api.fetchJsonMaybe('./data/overseas-glance/0.json',{detail:true,affectsCalculation:false});
  assert.equal(context.api.revision(),before,'display-only foreign data cannot trigger full financial recalculation');
  await context.api.fetchJsonMaybe('./data/hareruya2-stock-summary.json');
  assert.equal(context.api.revision(),before+1,'real calculation input fetch still invalidates calculations');
  await context.api.fetchJsonMaybe('./data/psa-population-summary.json',{affectsCalculation:false});
  assert.equal(context.api.revision(),before+2,'the display-only exception is restricted to foreign glance summaries');
  console.log('PASS 75 calendar boundaries, migration/backup/zero, native stats separation, unknown denominator and display-only cache isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
