const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const metrics=require('../exploration-metrics'),now=Date.parse('2026-10-15T04:30:00Z'),at=new Date(now).toISOString();
const item=(url,value=10000)=>({source:url,url,value,updatedAt:at,kind:'状態A販売価格'});
const card={id:'fixture',priceAggregation:{value:10000,included:[item('https://www.hareruya2.com/products/a')],conflicted:false},
  currentStoreOffer:{value:12000,available:true,fresh:true,updatedAt:at,inventoryAt:at},
  testView:{eligible:true,reasons:[],warnings:[],rawCap:15000,cap:15000,exitLabel:'フリマ'}};
let e=metrics.referenceMedian(card,now);assert.equal(e.value,10000);assert.equal(e.independent,1);assert(e.warnings.includes('単一ソース参考'));
assert.equal(metrics.referenceMedian(card,now+48*3600000+1).value,null);
assert.equal(metrics.referenceMedian({...card,priceAggregation:{value:10000,included:[{...item('x'),updatedAt:'2026-10-15'}]}},now).value,null,'file/day-only value is not individual freshness');
const retained=require('./retained_price_observation').retainedPriceObservations;
assert.equal(retained({price:10000},{},null,at).priceObservedAt,at);
assert.equal(retained({}, {price:10000,priceObservedAt:'2026-09-01'},at,at).priceObservedAt,'2026-09-01','missing response field never becomes fresh');
for(const r of [{...card.priceAggregation,included:[{...item('x'),updatedAt:null}]},{...card.priceAggregation,conflicted:true},
  {...card.priceAggregation,included:[item('https://www.hareruya2.com/products/a'),item('https://hareruya2.com/products/b')]}])assert.equal(metrics.referenceMedian({...card,priceAggregation:r},now).value,null);
e=metrics.referenceMedian({...card,priceAggregation:{value:10000,included:[item('https://toreca-souba.com/cards')]}},now);assert.equal(e.independent,0);assert.equal(e.unknown,1);
const inputs=new Map(),saved=new Map(),context=vm.createContext({window:{PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:metrics,location:{href:'https://example.test/?effBuy=median'}},document:{getElementById:id=>{if(!inputs.has(id))inputs.set(id,{value:'',checked:false});return inputs.get(id);},querySelectorAll:()=>[]},URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});
vm.runInContext(fs.readFileSync('app.js','utf8').split('// Browser event bindings start here;')[0]+'\ncurrentMarketView=c=>c.testView;globalThis.api={state,cardEfficiency,efficiencySearchValue,buildShareUrl,readUrl,saveQuickFilters,restoreQuickFilters,medianEfficiencyComparison};',context);
const a=context.api;Object.assign(a.state,{efficiencyBuy:'median',efficiencyScenario:'current',fee:1000,saleExtraCost:0,lockDays:91,exitPolicy:'marketplace',efficiencySaleDays:7,efficiencyPayoutDays:3});
const m=a.cardEfficiency(card,now),s=a.cardEfficiency(card,now,'normal','current','store');assert.equal(m.purchasePrice,10000);assert.equal(s.purchasePrice,12000);assert.equal(m.profit-s.profit,2000);assert.equal(m.days,s.days);assert.equal(m.calculationState,'reference');
card.identityReviewRequired=true;assert.equal(a.cardEfficiency(card,now).annual,null,'identity hold invalidates median cache');card.identityReviewRequired=false;
assert.equal(a.efficiencySearchValue(m),null);a.state.efficiencyIncludeReference=true;assert.equal(a.efficiencySearchValue(m),m.annual);
assert.equal(a.cardEfficiency({...card,currentStoreOffer:null},now).purchasePrice,10000,'median explicit: not a store fallback');
a.state.efficiencyBuy='store';assert.equal(a.cardEfficiency({...card,currentStoreOffer:null},now).annual,null,'explicit store never substitutes median');
a.state.efficiencyBuy='median';assert.equal(a.cardEfficiency(card,now+48*3600000+1).annual,null,'cache expires at individual source deadline');
assert.equal(a.buildShareUrl().searchParams.get('effBuy'),'median');a.readUrl();assert.equal(inputs.get('efficiencyBuyInput').value,'median');a.saveQuickFilters();context.window.location.href='https://example.test/';inputs.get('efficiencyBuyInput').value='auto';a.restoreQuickFilters();assert.equal(inputs.get('efficiencyBuyInput').value,'median');
const psa=require('./build_psa_history');assert(psa.namesCompatible('Pokemon Center&#x27;s Big sister: PROMO[S-P 069]',{name:'Full Art/Pokemon Center Lady | Infinity Zone Booster Box |'}));
const merge=require('./merge_expanded_daily_checkpoint').retainKnownPriceTime;
const old={identityKey:'same',price:10000,priceObservedAt:at};
assert.equal(merge({identityKey:'same',price:10000},[old]).priceObservedAt,at,'old collector must not erase a proven individual time');
assert.equal(merge({identityKey:'same',price:11000},[old]).priceObservedAt,undefined,'different price is not a reconfirmation');
assert.equal(merge({identityKey:'other',price:10000},[old]).priceObservedAt,undefined,'different specification never borrows a timestamp');
assert.equal(merge({identityKey:'same',price:10000,priceObservedAt:null},[old]).priceObservedAt,null,'explicit unknown is retained');
const daily=require('./psa10_trade_statistics').dailyObservations;
const d=['2026-10-15','identity',3,10,at,'source'],later=[...d];later[4]='2026-10-15T05:00:00Z';later[3]=12;
assert.deepEqual(daily([d,later,d]),[later],'concurrent same-day observations are not summed or double weighted');
assert(!psa.namesCompatible('Pokemon Center Lady',{name:'Full Art/Pokemon Lady Other'}));assert(!psa.variantsCompatible('マスターボールミラー','Pokemon Center Lady',{name:'Full Art/Pokemon Center Lady'}));
console.log('PASS median basis, source independence, per-source expiry, no fallback, cache, URL/save and verified translation (not print identity)');
