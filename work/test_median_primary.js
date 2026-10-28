const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const variants=require('./search_profile_variants'),config=require('./priority-search-profiles.json');
const profiles=variants.allProfiles(config);assert.equal(profiles.length,4);
for(const p of profiles.filter(r=>r.baseId)) {
  const original=[...config.profiles,...(config.additionalProfiles||[])].find(r=>r.id===p.baseId),a=new URL(p.url),b=new URL(original.url);
  assert.equal(a.searchParams.get('effBuy'),'median');assert.equal(b.searchParams.get('effBuy'),'auto');
  a.searchParams.delete('effBuy');b.searchParams.delete('effBuy');assert.equal(a.href,b.href,'all other URL conditions remain fixed');
}
const html=fs.readFileSync('index.html','utf8');assert.match(html,/<option value="median" selected>/);
const source=fs.readFileSync('app.js','utf8'),inputs=new Map(),saved=new Map();
let medianCalls=0;
const metrics={...require('../exploration-metrics'),referenceMedian(...args){medianCalls++;return require('../exploration-metrics').referenceMedian(...args);}};
const context=vm.createContext({URL,URLSearchParams,setTimeout,clearTimeout,console,window:{PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:metrics,location:{href:'https://example.test/?effBuy=auto'}},
  document:{querySelectorAll:()=>[],getElementById:id=>{if(!inputs.has(id))inputs.set(id,{value:'',checked:false});return inputs.get(id);}},
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+'\ncurrentMarketView=c=>c.testView;globalThis.api={state,readUrl,saveQuickFilters,restoreQuickFilters,cardEfficiency,migrationKey:EFFICIENCY_BASIS_MIGRATION_KEY,pass(fn){const prior=efficiencyRenderPass;efficiencyRenderPass=new WeakMap();try{return fn()}finally{efficiencyRenderPass=prior;}}};',context);
const api=context.api;assert.equal(api.state.efficiencyBuy,'median');api.readUrl();assert.equal(inputs.get('efficiencyBuyInput').value,'auto');
api.state.efficiencyBuy='auto';api.saveQuickFilters();api.restoreQuickFilters();assert.equal(inputs.get('efficiencyBuyInput').value,'auto','explicit legacy URL is authoritative');
context.window.location.href='https://example.test/';saved.delete(api.migrationKey);api.restoreQuickFilters();
assert.equal(inputs.get('efficiencyBuyInput').value,'median','authorized saved preference migrates to explicit median, not a redefinition of auto');
assert.equal(JSON.parse(saved.get(api.migrationKey)).previous.efficiencyBuy,'auto','old saved settings retained for recovery');
api.state.efficiencyBuy='auto';api.saveQuickFilters();api.restoreQuickFilters();assert.equal(inputs.get('efficiencyBuyInput').value,'auto','a later explicit user choice is not repeatedly migrated');
api.state.efficiencyBuy='median';api.saveQuickFilters();api.restoreQuickFilters();assert.equal(inputs.get('efficiencyBuyInput').value,'median');
const now=Date.parse('2026-10-15T09:30:00Z'),at=new Date(now).toISOString(),card={priceAggregation:{value:10000,included:[{source:'shop',url:'https://www.hareruya2.com/products/a',value:10000,updatedAt:at}]},
  testView:{eligible:true,reasons:[],warnings:[],rawCap:15000,cap:15000,exitLabel:'フリマ'}};
Object.assign(api.state,{fee:1000,saleExtraCost:0,lockDays:91,exitPolicy:'marketplace',efficiencySaleDays:7,efficiencyPayoutDays:3});
api.pass(()=>{assert.strictEqual(api.cardEfficiency(card,now),api.cardEfficiency(card,now));});assert.equal(medianCalls,1,'one render does not serialize/recalculate the same efficiency repeatedly');
api.state.fee=2000;const changed=api.cardEfficiency(card,now);assert.equal(changed.investment,12000,'fees invalidate between renders');
assert.equal(api.cardEfficiency(card,now+48*3600000+1).annual,null,'render reuse does not hide expiry');
assert.equal(api.cardEfficiency({...card,priceAggregation:{value:10000,included:[{value:10000,url:'https://hareruya2.com/products/old',updatedAt:'2026-09-01T00:00:00Z'}]},
  currentStoreOffer:{value:5000,available:true,fresh:true,updatedAt:at,inventoryAt:at}},now).annual,null,'fresh actual offer does not replace an expired median');
const m=require('./profile_completion_routes');
const plan=m.prospectPlan({priceAggregation:{included:[{url:'https://torecacamp-pokemon.com/products/a',updatedAt:'2026-09-01'}]}},['referenceMedian'],{now:Date.parse('2026-10-15T00:00:00Z')});
assert.equal(plan.requirements[0].evidence[0].source,'torecacamp');assert(plan.requirements[0].automatic);
assert(!m.prospectPlan({priceAggregation:{conflicted:true,included:[]}},['referenceMedian']).allRequiredPathsAutomatic);
console.log('PASS authorized median default, explicit legacy semantics, four fixed profiles and adopted-source completion');
