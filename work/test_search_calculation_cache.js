const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const builder=fs.readFileSync(path.join(__dirname,'build_purchase_limit_audit.js'),'utf8');
const prefix=builder.slice(0,builder.indexOf('const calculated = prepareCalculatedCards(state.cards);'));
const end=`
window.ReleaseYearFilter=require('../release-year-filter.js');
window.CandidateVisibility=require('../candidate-visibility.js');
window.PurchaseRatioModel=require('../purchase-ratio-model.js');
// These bindings were captured when app.js was evaluated, so inject before evaluation instead.
vm.runInContext('globalThis.cacheApi={calculatedCardsForSearch,computationKey,freshnessDeadline,cardSearchExclusions};',context);
const api=context.cacheApi;
if (!process.env.SEARCH_BENCHMARK) state.cards=state.cards.filter(c=>state.catalogCompletion.cards[c.id]?.s==='分析可能').slice(0,120);
const hash=cards=>require('node:crypto').createHash('sha256').update(JSON.stringify(cards.map(c=>[c.id,c.buyLimits?.clean,c.purchaseDecision,c.psaDecision]))).digest('hex');
const times={uncached:[],cached:[]};
for(let i=0;i<3;i++) {
  let start=performance.now();
  const direct=api.calculatedCardsForSearch(state.cards,{force:true});
  times.uncached.push(performance.now()-start);
  const expected=hash(direct);
  const ids=direct.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
  start=performance.now();
  const reused=api.calculatedCardsForSearch(state.cards);
  times.cached.push(performance.now()-start);
  assert.strictEqual(reused,direct);
  assert.equal(hash(reused),expected);
  assert.deepEqual(reused.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),ids);
  state.q='ピカチュウ';state.sort='profit-desc';state.minPrice=1000;
  assert.strictEqual(api.calculatedCardsForSearch(state.cards),direct,'search-only changes reuse calculations');
  state.q='';state.minPrice=null;
}
let priorCache=api.calculatedCardsForSearch(state.cards);
for(const key of ['fee','saleFeeRate','saleExtraCost','buybackDeductionRate']) {
  const saved=state[key];state[key]++;
  const changed=api.calculatedCardsForSearch(state.cards);
  assert.notStrictEqual(changed,priorCache,key+' invalidates');
  state[key]=saved;priorCache=api.calculatedCardsForSearch(state.cards);
}
state.cardrushStock={...state.cardrushStock};
assert.notStrictEqual(api.calculatedCardsForSearch(state.cards),priorCache,'data replacement invalidates');
const now=Date.now(),expiry=now+15000;
assert.equal(api.freshnessDeadline([{currentStoreOffer:{updatedAt:new Date(expiry-48*3600000-1).toISOString()}}],now),expiry);
assert.equal(api.freshnessDeadline([{currentStoreOffer:{updatedAt:new Date(now).toISOString(),inventoryAt:new Date(expiry-48*3600000-1).toISOString()}}],now),expiry,'inventory expires independently');
priorCache=api.calculatedCardsForSearch(state.cards,{now});
assert.notStrictEqual(api.calculatedCardsForSearch(state.cards,{now:now+61000}),priorCache,'freshness expiration invalidates');
const result={generatedAt:new Date().toISOString(),cards:state.cards.length,timingEnvironment:'Node.js production model; not browser paint',times,financialValuesAndCandidateIdsUnchanged:true};
if(process.env.SEARCH_BENCHMARK)write('data/search-performance-audit.json',result);
console.log(JSON.stringify(result));
`;
const inject="window.ReleaseYearFilter=require('../release-year-filter.js');window.CandidateVisibility=require('../candidate-visibility.js');window.PurchaseRatioModel=require('../purchase-ratio-model.js');";
new Function('require','__dirname','process','assert',prefix.replace('const source = fs.readFileSync',inject+'\nconst source = fs.readFileSync')+end)(require,__dirname,process,assert);
