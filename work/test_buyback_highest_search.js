const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8'),m=require('../exploration-metrics');
const at='2026-10-20T00:00:00Z',now=Date.parse(at);
const source={support:{shops:{store:{name:'A店頭',merchantId:'a',fulfilment:'store'},mail:{name:'A郵送',merchantId:'a',fulfilment:'mail'}},cards:{test:{
  store:{current:[1.05,10500,10000,at,at,'2026-10-20',true],glance:[.9,12,false,20]},
  mail:{current:[.9,9000,10000,at,at,'2026-10-20',true],glance:[.8,12,false,50]}}}},cards:{test:{store:{identity:'spec'},mail:{identity:'spec'}}}};
const c=vm.createContext({Date:class extends Date{static now(){return now;}},Map,WeakMap,JSON,explorationMetrics:m});
vm.runInContext('const state={buybackObservationSummary:'+JSON.stringify(source)+',buybackStoreMode:"all",selectedBuybackStores:[],buybackHighestMin:null};'
  +app.slice(app.indexOf('const buybackSupportCache ='),app.indexOf('async function loadBuybackSupportDetail'))
  +'globalThis.api={state,cardBuybackSupport,buybackHighestExclusion,buybackSupportCsvFields};',c);
const a=c.api,card={id:'test',psa10:10000,identityKey:'spec'};
assert.equal(a.buybackHighestExclusion(card),null);
a.state.buybackHighestMin=1.05;assert.equal(a.buybackHighestExclusion(card),null,'inclusive exact boundary');
assert.equal(a.cardBuybackSupport(card).max,.9,'search must not use conservative merchant minimum');
assert.equal(a.buybackSupportCsvFields(card)[0],1.05,'CSV and search use the displayed highest quote');
assert.equal(a.buybackSupportCsvFields(card)[10],1.05,'CSV uses the displayed across-shop mean, deduplicating store/mail');
assert.equal(a.buybackSupportCsvFields(card)[11],1,'one physical shop is one mean observation');
a.state.buybackHighestMin=1.0500000001;assert(a.buybackHighestExclusion(card)?.includes('下限未達'),'no displayed rounding');
a.state.buybackStoreMode='mail';a.state.buybackHighestMin=1;assert(a.buybackHighestExclusion(card)?.includes('下限未達'));
a.state.buybackStoreMode='selected';a.state.selectedBuybackStores=['store'];assert.equal(a.buybackHighestExclusion(card),null);
for(const bad of [{...card,identityKey:'wrong'},{...card,psa10:null},{...card,psa10:11000},{...card,id:'missing'}])assert(a.buybackHighestExclusion(bad)?.includes('未取得／古値'));
a.state.buybackHighestMin=0;assert.equal(a.buybackHighestExclusion(card),null);assert(a.buybackHighestExclusion({...card,id:'missing'}));
a.state.buybackHighestMin=null;assert.equal(a.buybackHighestExclusion({...card,id:'missing'}),null,'blank does not exclude missing data');
a.state.buybackHighestMin=-1;assert(a.buybackHighestExclusion(card)?.includes('入力'));
assert.equal(a.cardBuybackSupport(card,now+48*3600000+1).highestQuote,null,'exact expiry invalidates cache');
const controls=require('../search-controls');assert(controls.active({id:'buybackHighestMinInput',type:'number',value:'0'}));
assert(controls.removable('buybackHighestMinInput'));assert(controls.applicable('buybackHighestMinInput',{purchaseMode:'snkr-raw'}));
const {load}=require('./audit_search_profit_consistency'),base='https://urm759.github.io/pokeka-serch/?buybackMaxMin=1.05';
const api=load(app,at,{url:base});assert.equal(api.state.buybackHighestMin,1.05);assert.equal(api.buildShareUrl().searchParams.get('buybackMaxMin'),'1.05');
const key=api.computationKey();api.state.buybackHighestMin=1.1;assert.equal(api.computationKey(),key,'filter-only edits reuse financial calculations');
api.state.buybackHighestMin=0;assert.equal(api.buildShareUrl().searchParams.get('buybackMaxMin'),'0');
api.state.buybackHighestMin=null;assert(!api.buildShareUrl().searchParams.has('buybackMaxMin'));
assert(app.includes('rows[index+1].push(...buybackSupportCsvFields(card))'));
const almostExpired=new Date(now-48*3600000+1000).toISOString();
const deadlineContext=vm.createContext({Date,Math,Object,Number,decisionModel:require('../decision-model'),state:{sourceUpdates:{},
  buybackObservationSummary:{support:{cards:new Proxy({test:{a:{current:[1,100,100,almostExpired,almostExpired]}}},{ownKeys(){throw Error('per-card freshness must not scan every other card');}})}}}});
vm.runInContext(app.slice(app.indexOf('function freshnessDeadline('),app.indexOf('function calculatedCardsForSearch('))+'globalThis.deadline=freshnessDeadline;',deadlineContext);
assert.equal(deadlineContext.deadline([{id:'test'}],now),now+1001,'exact quote expiry, without an all-catalog scan per card');
console.log('PASS highest gross quote filter: inclusive/unrounded boundaries, outlet selection, null/zero, stale/spec holds, URL, CSV, cache expiry; no finance changes');
