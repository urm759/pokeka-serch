const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const m = require('../exploration-metrics');
const close = (a,b) => assert(Math.abs(a-b) < 1e-8,`${a} != ${b}`);
const example = m.efficiency({expectedSale:27758},10000,10980,210,147,7,3);
assert.equal(example.profit,6778); assert.equal(example.investment,21190); assert.equal(example.days,157);
close(example.annual,6778/21190*100*365/157);
for (const value of [null,NaN,Infinity,-1]) assert.equal(m.efficiency({expectedSale:100},value,10,0,91,7,3).annual,null);
assert.equal(m.efficiency({expectedSale:100},0,100,0,91,0,0).annual,0,'exact zero is valid');
assert(m.efficiency({expectedSale:100},100,100,0,91,0,0).annual<0);
assert.equal(m.efficiency({expectedSale:Infinity},100,100,0,91,0,0).annual,null);
assert.equal(m.efficiency({expectedSale:100},0,100,0,91,null,0).annual,null);
assert.equal(m.efficiency({expectedSale:1e308},1e308,1e308,0,91,0,0).annual,null,'finite input overflow never renders Infinity/NaN');
assert(!m.inRange(null,0,null)); assert(m.inRange(0,0,null)); assert(!m.inRange(-1,0,null));
const source = fs.readFileSync('app.js','utf8'), inputs=new Map(), storage=new Map();
const now=Date.now(), date=new Date(now).toISOString();
const context = vm.createContext({window:{PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:m,location:{href:'https://example.test/?effMin=0&effManual=10000&effBuy=manual&effScenario=current&sellDays=0&payoutDays=3'}},
  document:{getElementById:id=>{if(!inputs.has(id))inputs.set(id,{value:'',checked:false});return inputs.get(id);},querySelectorAll:()=>[]},
  URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+`\ncurrentMarketView=c=>c.testView;globalThis.api={state,cardEfficiency,cardEfficiencyPanel,readUrl,buildShareUrl,saveQuickFilters,restoreQuickFilters,computationKey};`,context);
const api=context.api,s=api.state;
Object.assign(s,{fee:10980,saleExtraCost:210,storeTravelCost:1000,lockDays:147,exitPolicy:'marketplace',efficiencyBuy:'auto',efficiencyScenario:'current',efficiencySaleDays:7,efficiencyPayoutDays:3,profitSearchBasis:'auto'});
const card={id:'fixture',price:19000,currentStoreOffer:{value:10000,available:true,fresh:true,updatedAt:date,inventoryAt:date},
  testView:{eligible:true,reasons:[],warnings:['PSA9推定値'],rawCap:16778,capState:'available',cap:16500,exitLabel:'フリマ'},
  buyLimits:{clean:{buybackExit:{scenarios:{current:{expectedSale:25000,travelCost:1000}}}}}};
let e=api.cardEfficiency(card,now);assert.equal(e.purchasePrice,10000);assert.equal(e.profit,6778);assert.equal(e.investment,21190);close(e.annual,example.annual);
const key=api.computationKey();s.efficiencyMin=50;s.efficiencySaleDays=14;
assert.equal(api.computationKey(),key,'search/wait settings never trigger full-card prediction/limit recalculation');
e=api.cardEfficiency(card,now);assert.equal(e.days,164);
s.psaCapital=0;s.lockedCapital=5000000;assert.equal(api.cardEfficiency(card,now).annual,e.annual,'personal capital is not used');
for(const o of [{...card.currentStoreOffer,updatedAt:null},{...card.currentStoreOffer,updatedAt:'2026-09-01'},{...card.currentStoreOffer,inventoryAt:null},{...card.currentStoreOffer,available:false}]) {
  const value=api.cardEfficiency({...card,currentStoreOffer:o},now);assert.equal(value.purchasePrice,null);assert.equal(value.annual,null,'no silent reference/limit fallback');
}
s.efficiencyBuy='manual';s.efficiencyManualPrice=12000;
assert.equal(api.cardEfficiency(card,now).purchasePrice,12000,'manual wins over available store price');
s.efficiencyBuy='current-cap';e=api.cardEfficiency(card,now);assert.equal(e.profit,278);assert.equal(e.purchasePrice,16500);
assert(api.cardEfficiencyPanel(card).includes('ほぼ0'));
s.efficiencyBuy='auto';s.efficiencyScenario='central';assert.equal(api.cardEfficiency(card,now).annual,null,'147-day return cannot use91-day profit');
s.purchaseMode='current-market';e=api.cardEfficiency(card,now);assert.equal(e.profit,6778);assert.equal(e.scenario,'現在出口相場が続く仮定','current exploration never mixes91-day forecast');
s.exitPolicy='both';e=api.cardEfficiency(card,now);assert.equal(e.investment,21190,'marketplace conservative exit does not add buyback travel');
s.exitPolicy='buyback';card.testView.rawCap=14020;e=api.cardEfficiency({...card},now);assert.equal(e.investment,22190);assert.equal(e.profit,4020,'travel already deducted from expected sale; not twice');
api.readUrl();assert.equal(inputs.get('efficiencyMinInput').value,0);assert.equal(inputs.get('efficiencySaleDaysInput').value,0);
s.efficiencyMin=0;s.efficiencyManualPrice=10000;s.efficiencySaleDays=0;s.efficiencyBuy='manual';s.efficiencyScenario='current';
let url=api.buildShareUrl();assert.equal(url.searchParams.get('effMin'),'0');assert.equal(url.searchParams.get('sellDays'),'0');
s.efficiencyMin=null;assert.equal(api.buildShareUrl().searchParams.get('effMin'),'off','blank roundtrip does not become zero');
api.saveQuickFilters();context.window.location.href='https://example.test/';inputs.get('efficiencyManualPriceInput').value='';api.restoreQuickFilters();assert.equal(inputs.get('efficiencyManualPriceInput').value,10000);assert.equal(inputs.get('efficiencyMinInput').value,'');
const loader = require('./audit_search_profit_consistency').load;
// Daily runners can use a shallow checkout: do not depend on old Git objects.
// The release audit separately compares against the previous published source.
const before=loader(source,date),after=loader(source,date);
Object.assign(after.state,{efficiencyBuy:'manual',efficiencyManualPrice:17000,efficiencySaleDays:21,efficiencyPayoutDays:5});
const oldCards=before.prepareCalculatedCards(before.state.cards),newCards=after.prepareCalculatedCards(after.state.cards);
const hash=cards=>crypto.createHash('sha256').update(JSON.stringify(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
assert.equal(hash(oldCards),hash(newCards),'all existing limits/GO unchanged');
assert.deepEqual(oldCards.filter(c=>!before.cardSearchExclusions(c).length).map(c=>c.id),newCards.filter(c=>!after.cardSearchExclusions(c).length).map(c=>c.id),'disabled new filter preserves candidate IDs');
after.state.efficiencyMin=0;
for(const c of newCards) if(!after.cardSearchExclusions(c).length) assert(after.cardEfficiency(c).annual>=0,'filter/display shared, unavailable excluded');
console.log(JSON.stringify({test:'Card efficiency PASS',example,financialHash:hash(newCards),cards:newCards.length}));
require('./test_efficiency_reference');
