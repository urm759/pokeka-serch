const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const app=fs.readFileSync('app.js','utf8').split('// Browser event bindings start here;')[0],elements=new Map(),saved=new Map();
const ctx=vm.createContext({window:{location:{href:'https://example.test/'},PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:require('../exploration-metrics'),LimitDisplayModel:require('../limit-display-model'),PurchaseRatioModel:require('../purchase-ratio-model')},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,classList:{toggle(){}}});return elements.get(id);},querySelectorAll:()=>[]},URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});
vm.runInContext(app+';globalThis.api={state,normalizeGuideMode,guideConfig,readUrl,buildShareUrl,restoreQuickFilters,calculationBuyBasis,calculationBasisCsvFields,stockTrend:explorationMetrics.stockTrend};globalThis.key=QUICK_FILTER_STORAGE_KEY;',ctx);
assert.equal(ctx.api.state.guideMode,'80');assert.equal(ctx.api.guideConfig().hitRate,.8);
for(const [input,expected]of [['70','80'],['80','80'],['50','50']]){ctx.window.location.href='https://example.test/?guide='+input;ctx.api.readUrl();assert.equal(ctx.api.state.guideMode,expected);assert.equal(ctx.api.buildShareUrl().searchParams.get('guide'),expected);}
ctx.window.location.href='https://example.test/';saved.set(ctx.key,JSON.stringify({guideMode:'50'}));ctx.api.restoreQuickFilters();assert.equal(ctx.api.state.guideMode,'50');
saved.set(ctx.key,JSON.stringify({guideMode:'70'}));ctx.api.restoreQuickFilters();assert.equal(ctx.api.state.guideMode,'80');assert(saved.has(ctx.key+':guide70-before80'));
assert.equal(ctx.api.calculationBuyBasis({referenceBuyKind:'current-target'}),'仕入れ目安・仮定');assert.equal(ctx.api.calculationBuyBasis({referenceBuyKind:'store'}),'状態A価格');assert.equal(ctx.api.calculationBuyBasis({referenceBuyKind:'median'}),'中央値・参考価格');
const csv=ctx.api.calculationBasisCsvFields({buyLimits:{clean:{assumptions:{hitRate:.67,hitRateSource:'公式'}}}},{purchasePrice:11800,referenceBuyKind:'store'});assert.equal(csv[0],11800);assert.equal(csv[2],67);assert.equal(csv[4],80);assert(csv[5].includes('利用者申告値'));
console.log('PASS default80, legacy70 migration/archive, fixed50 URL/save, explicit shared calculation-buy source and actual adopted rate CSV');

const model=require('../decision-model');
assert.deepEqual(model.gradeAssumptions({officialRate:67,fallbackRate:.5}),model.gradeAssumptions({officialRate:67,fallbackRate:.8}),'official rate unaffected by reference guide');
assert.equal(model.gradeAssumptions({fallbackRate:.5}).hitRate,.5);assert.equal(model.gradeAssumptions({fallbackRate:.8}).hitRate,.8);

assert.equal(ctx.api.calculationBuyBasis({referenceBuyKind:'guide'}),'仕入れ目安・仮定');
