const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8'),elements=new Map(),saved={};
const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,classList:{toggle(){}}});return elements.get(id);},querySelectorAll:()=>[]};
const context=vm.createContext({window:{location:{href:'https://example.test/'},PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:require('../exploration-metrics'),CandidateVisibility:require('../candidate-visibility'),ReleaseYearFilter:require('../release-year-filter'),PurchaseRatioModel:require('../purchase-ratio-model')},document,console,URL,URLSearchParams,setTimeout,clearTimeout,localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+'\nglobalThis.api={state,readUrl,restoreQuickFilters,saveQuickFilters,quickSearchMode,cardSearchExclusions,buildSearchAudit,searchProfitView,buildShareUrl};',context);
const a=context.api,s=a.state;
const card={id:'fixture',name:'fixture',catalogCompletion:{s:'分析可能'},price:10000,psa10:30000,psaTx30d:20,saleTx30d:20,official:{rate:80},dataQuality:{},priceAggregation:{confidence:'高'},overallAssessment:{score:20,grade:'D'},purchaseDecision:{verdict:'見送り'},psaDecision:{recommended:false},buyLimits:{clean:{finalMaxPrice:0,supplyStressAtFinal:{expectedProfit:-10000}}},forecastPeriodMismatch:true};
s.catalogCompletion={cards:{fixture:card.catalogCompletion}};
Object.assign(s,{purchaseMode:'specified',catalogScope:'analysis',minRoi:null,minExpectedProfitFilter:null,minExpectedRoiFilter:null,minStressExpectedProfitFilter:null,minStressExpectedRoiFilter:null,minPurchaseLimitRatio:null,minSaleTx:0,minPsaTx:0,efficiencyMin:null,includePeriodReference:false});
assert.deepEqual(Array.from(a.cardSearchExclusions(card)),[],'no implicit verdict, stable cap, stress, score, or horizon gates');
assert(a.cardSearchExclusions(card,{mode:'combined'}).includes('プリセット条件'));
s.minStressExpectedProfitFilter=0;assert(a.cardSearchExclusions(card).includes('利益条件'),'explicit zero stress filter remains active');s.minStressExpectedProfitFilter=null;
s.overallFilter='a';assert(a.cardSearchExclusions(card).includes('評価・予測条件'));s.overallFilter='all';
s.minSaleTx=1;assert(a.cardSearchExclusions({...card,saleTx30d:null}).includes('取引・掲載件数未取得'));s.minSaleTx=0;assert(!a.cardSearchExclusions({...card,saleTx30d:null}).includes('取引・掲載件数未取得'));
assert(a.cardSearchExclusions({...card,identityReviewRequired:true}).includes('仕様確認待ち'));
assert(a.cardSearchExclusions({...card,priceAggregation:{comparison:{conflicted:true}}}).includes('価格対立・根拠確認待ち'));
const audit=a.buildSearchAudit([card]);assert.equal(audit.analyzable,1);assert.equal(audit.presetOnly,1);assert.equal(audit.final,1);assert.equal(audit.siteCriteria,false);
for(const mode of ['combined','specified','curated','now','current-market','low-risk','turnover','bargain','aggressive','snkr-raw']) {
  context.window.location.href='https://example.test/?preset='+mode+'&roi=25&effMin=15&effBuy=auto';a.readUrl();
  assert.equal(s.purchaseMode,mode==='combined'?'combined':'specified');assert.equal(elements.get('roiInput').value,'25');assert.equal(elements.get('efficiencyMinInput').value,15);assert.equal(elements.get('efficiencyBuyInput').value,'auto');
}
context.window.location.href='https://example.test/?riskMode=low&roi=0';a.readUrl();assert.equal(s.purchaseMode,'specified');assert.equal(elements.get('roiInput').value,'0');
s.purchaseMode='specified';s.minRoi=25;a.saveQuickFilters();context.window.location.href='https://example.test/';a.restoreQuickFilters();a.readUrl();assert.equal(s.purchaseMode,'specified');
const archive=JSON.parse(saved['pokeka-quick-filter-preferences-v1:two-modes-v1']);assert(archive.some(r=>r.from==='current-market'));
const html=fs.readFileSync('index.html','utf8');assert.deepEqual([...html.matchAll(/data-preset="([^"]+)"/g)].map(m=>m[1]),['combined','specified']);
console.log('PASS two modes: no implicit gates, enabled/missing vs disabled, strict identity, migration/archive and saved mode');
const config=require('./priority-search-profiles.json'),variants=require('./search_profile_variants');
const originals=variants.allProfiles(config),modes=variants.searchModeProfiles(config);assert.equal(modes.length,8);
for(const p of originals){const variant=modes.find(r=>r.siteProfileId===p.id);assert(variant);assert.equal(new URL(variant.url).searchParams.get('preset'),'specified');}
delete saved['pokeka-quick-filter-preferences-v1'];
context.window.location.href='https://example.test/?preset=specified';a.readUrl();
Object.assign(s,{minRoi:null,minExpectedRoiFilter:null,minExpectedProfitFilter:null,minStressExpectedProfitFilter:0,minStressExpectedRoiFilter:0,minPurchaseLimitRatio:0});
assert(!a.cardSearchExclusions(card).includes('利益条件'),'untouched default stress zero is not a specified filter');
assert.equal(a.buildShareUrl().searchParams.get('filterStressProfit'),'off','implicit defaults do not become explicit on reload');
context.window.location.href='https://example.test/?preset=specified&filterStressProfit=0';a.readUrl();
assert(a.cardSearchExclusions(card).includes('利益条件'),'explicit URL zero must still exclude a negative stress result');
vm.runInContext('state.purchaseMode="combined";globalThis.siteKey=computationKey();state.purchaseMode="specified";globalThis.specifiedKey=computationKey();',context);
assert.equal(context.siteKey,context.specifiedKey,'mode-only changes reuse calculations, not screening results');
