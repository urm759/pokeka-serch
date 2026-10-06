const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../decision-model.js');
const source = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const elements=new Map();
const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false});return elements.get(id);},querySelectorAll:()=>[]};
let saved={};
const context=vm.createContext({window:{location:{href:'https://example.test/'},PurchaseDecisionModel:model,
  ReleaseYearFilter:require('../release-year-filter.js'),CandidateVisibility:require('../candidate-visibility.js'),PurchaseRatioModel:require('../purchase-ratio-model.js')},document,
  URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+ '\nglobalThis.api={state,searchProfitView,cardSearchExclusions,buildSearchAudit,presetQualifications,readUrl,buildShareUrl,saveQuickFilters,restoreQuickFilters};',context);
const api=context.api,s=api.state;
Object.assign(s,{purchaseMode:'combined',minSaleTx:0,minRoi:0,maxPsa10:null});
const econ=p=>({expectedProfit:p,expectedRoi:p/50000*100});
const card={id:'fixture',name:'テスト SAR[SV1 100/078]',price:100000,psa10:100000,psa10Net:90000,
  catalogCompletion:{s:'分析可能'},psaTx30d:30,saleTx30d:30,official:{rate:70},buybackShops:3,
  overallAssessment:{grade:'A',exitLiquidity:80,marketStability:80,supplyRisk:80},futurePriceForecast:{downsidePct:5},
  dataQuality:{},priceAggregation:{confidence:'高'},purchaseDecision:{verdict:'価格次第'},psaDecision:econ(-10000),
  purchaseAvailability:{verifiedNow:false},decisionScenarios:{market:{decision:{verdict:'価格次第'}},store:{decision:{verdict:'価格次第'}}},
  buyLimits:{clean:{finalMaxPrice:40000,ultraLowRiskMaxPrice:35000,centralAtFinal:econ(20000),supplyStressAtFinal:econ(0),economicsScenarios:{
    currentPurchase:{centralForecast:econ(-10000)},operationalLimit:{centralForecast:econ(20000),supplyStress:econ(0)},storeOffer:{centralForecast:econ(-5000)}}}}};
s.catalogCompletion={cards:{fixture:card.catalogCompletion}};
assert(api.presetQualifications(card).combined);
assert(!api.cardSearchExclusions(card).includes('利益条件'),'current loss must not exclude limit-profit waiting exploration');
s.profitSearchBasis='current';assert(api.cardSearchExclusions(card).includes('利益条件'));
s.profitSearchBasis='store';assert(api.cardSearchExclusions(card).includes('利益条件'));
s.profitSearchBasis='auto';
const underLimit={...card,currentStoreOffer:{value:35000,available:true,fresh:true},purchaseAvailability:{verifiedNow:false,offerWithinLimit:true},decisionScenarios:{...card.decisionScenarios,store:{decision:{verdict:'価格次第',reasons:['最低期待利益未達']}}}};
assert(!api.presetQualifications(underLimit).now,'price alone cannot qualify actual purchase');
const eligibleNow={...underLimit,purchaseDecision:{verdict:'GO'},purchaseAvailability:{verifiedNow:true},decisionScenarios:{...underLimit.decisionScenarios,store:{decision:{verdict:'GO'}}}};
assert(api.presetQualifications(eligibleNow).now);
assert(!api.presetQualifications({...eligibleNow,currentStoreOffer:{...underLimit.currentStoreOffer,fresh:false}}).now);
assert(!api.presetQualifications({...eligibleNow,dataQuality:{manualReview:true},purchaseDecision:{verdict:'要確認'}}).combined);
const mismatch={...eligibleNow,forecastPeriodMismatch:true,purchaseDecision:{verdict:'要確認'},decisionScenarios:{...eligibleNow.decisionScenarios,market:{decision:{verdict:'GO'}}}};
assert(api.presetQualifications(mismatch).combined);assert(!api.presetQualifications(mismatch).now);
assert(api.searchProfitView(mismatch).label.includes('期間不一致'));
assert(!api.cardSearchExclusions(mismatch).includes('期間不一致・返却時試算不可'));
s.includePeriodReference=false;assert(api.cardSearchExclusions(mismatch).includes('期間不一致・返却時試算不可'));s.includePeriodReference=true;
s.purchaseMode='now';assert.equal(api.searchProfitView(card).basis,'store');assert(api.cardSearchExclusions(mismatch).includes('期間不一致・返却時試算不可'));s.purchaseMode='combined';
s.profitSearchBasis='current';s.minRoi=-100;s.minExpectedProfitFilter=0;s.minExpectedRoiFilter=null;assert(api.cardSearchExclusions(card).includes('利益条件'));
s.minExpectedProfitFilter=null;assert(!api.cardSearchExclusions(card).includes('利益条件'),'disabled is not zero');
s.minRoi=0;s.minExpectedProfitFilter=0;s.minExpectedRoiFilter=0;s.profitSearchBasis='auto';
s.minSaleTx=10;s.maxPsa10=200000;
const audit=api.buildSearchAudit([card,{...card,saleTx30d:0,psa10:250000}]);
assert.equal(audit.presetOnly,Object.values(audit.sequential).reduce((a,b)=>a+b,0)+audit.final);
assert.equal(audit.final,[card,{...card,saleTx30d:0,psa10:250000}].filter(c=>!api.cardSearchExclusions(c).length).length);
assert(Object.values(audit.overlap).reduce((a,b)=>a+b,0)>Object.values(audit.sequential).reduce((a,b)=>a+b,0),'overlapping exclusions are not sequential counts');
assert(source.includes('querySelectorAll(".advanced-filters input, .advanced-filters select")'),'conditions remain visible after compact layout relocation');
context.window.location.href='https://example.test/?profitBasis=store&periodReference=0&filterExpProfit=off&filterExpRoi=0';api.readUrl();
assert.equal(elements.get('expectedProfitFilterInput').value,'');assert.equal(elements.get('expectedRoiFilterInput').value,'0');assert.equal(elements.get('profitSearchBasisInput').value,'store');
Object.assign(s,{profitSearchBasis:'store',includePeriodReference:false,minExpectedProfitFilter:null});
const url=api.buildShareUrl();assert.equal(url.searchParams.get('filterExpProfit'),'off');assert.equal(url.searchParams.get('profitBasis'),'store');assert.equal(url.searchParams.get('periodReference'),'0');
api.saveQuickFilters();context.window.location.href='https://example.test/';elements.get('profitSearchBasisInput').value='auto';api.restoreQuickFilters();assert.equal(elements.get('profitSearchBasisInput').value,'store');assert.equal(elements.get('expectedProfitFilterInput').value,'');
const handlers=source.slice(source.indexOf('document.querySelectorAll("[data-preset]").forEach((button) => {',source.indexOf('// Browser event bindings start here;')),source.indexOf('els.lowRiskAvailabilityInput?.addEventListener'));
for(const field of ['roiInput','purchaseLimitRatioMinInput','psaCapitalInput','exitPolicyInput','year2020Input','saleTxMinInput','fundingOnlyInput','officialOnlyInput'])assert(!handlers.includes(`els.${field}.value =`)&&!handlers.includes(`els.${field}.checked =`),`${field} must survive preset switches`);
console.log('Preset exploration, actual offers, horizon holds, zero/off, reconciled exclusions and URL/storage PASS');
