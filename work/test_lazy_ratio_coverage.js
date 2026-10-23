const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const moduleSource=source.slice(source.indexOf('function auditIsOpen('),source.indexOf('\nconst state ='));
const contains=function(element){for(let p=element;p;p=p.parentElement)if(p===this)return true;return false;};
const outer={tagName:'DETAILS',open:false,parentElement:null,contains};
const inner={...outer,parentElement:outer};
let toggle;
const document={addEventListener(event,fn,capture){assert.equal(event,'toggle');assert.equal(capture,true);toggle=fn;}};
const output={parentElement:inner,textContent:''},els={psa9RatioCoverage:output};
const cards=['eligible','data-missing','reference-disabled','circular-estimate'].map((reason,i)=>({id:String(i),name:'test',model:'001',reason}));
const state={q:'',cards,year2020Only:false,includeUnknownYear:false};
let scans=0,calculations=0,cache={audits:new Map()},clock=0;
const normalize=value=>String(value).toLowerCase(), compactSearch=value=>normalize(value).replace(/\s/g,'');
const run=new Function('els','state','searchMemoFor','getCache','normalize','compactSearch','releaseYearFilter','searchIndexModel','psa9RatioOptions','purchaseRatioModel','purchasePsa9Ratio','fmt','calculatedCardsForSearch','document',
  'let searchMemoCache;'+moduleSource.replace('  searchMemoFor(cards);','  searchMemoFor(cards); searchMemoCache=getCache();')+';return {renderPsa9RatioCoverage,bindPsa9RatioCoverage};')(
    els,state,()=>{if(clock) {cache={audits:new Map()};clock=0;}},()=>cache,normalize,compactSearch,
    {matches:()=>true},{matchesCard:card=>state.q==='alias'&&card.id==='0'},()=>({}),
    {eligibility:row=>row.reason},card=>{scans++;return card;},new Intl.NumberFormat('ja-JP'),()=>{calculations++;return state.cards;},document);
run.bindPsa9RatioCoverage();
run.renderPsa9RatioCoverage(cards);assert.equal(scans,0,'hidden coverage never scans cards');
inner.open=true;toggle({target:inner});assert.equal(scans,0,'closed outer disclosure still hides the audit');
outer.open=true;toggle({target:outer});
assert.equal(scans,4);assert.equal(calculations,1);assert.match(output.textContent,/条件内 4枚：比率検索対象 1枚/);
for(const label of ['データ不足・対立・古値','参考値OFF','素体由来推定'])assert.ok(output.textContent.includes(label+' 1枚'));
run.renderPsa9RatioCoverage(cards);assert.equal(scans,4,'unchanged open audit reuses search-scoped counts');
clock=1;run.renderPsa9RatioCoverage(cards);assert.equal(scans,8,'freshness/cache invalidation rebuilds coverage');
state.q='no-match';clock=1;run.renderPsa9RatioCoverage(cards);assert.match(output.textContent,/条件内 0枚：比率検索対象 0枚/);
state.q='alias';clock=1;run.renderPsa9RatioCoverage(cards);assert.match(output.textContent,/条件内 1枚：比率検索対象 1枚/);
outer.open=false;toggle({target:inner});assert.equal(calculations,1,'closing disclosures does not recalculate financial data');
const organizedParent={...outer,open:false};outer.parentElement=organizedParent;outer.open=true;
state.q='no-match';clock=1;organizedParent.open=true;toggle({target:organizedParent});
assert.match(output.textContent,/条件内 0枚/,'parents inserted after event binding refresh with current conditions');
const previousCalculations=calculations;toggle({target:{tagName:'DETAILS',contains:()=>false}});
assert.equal(calculations,previousCalculations,'unrelated disclosures do not calculate');
assert.match(source,/renderPsa9RatioCoverage\(calculated\);/);
assert.match(source,/bindPsa9RatioCoverage\(\);/);
assert.ok(!source.slice(source.indexOf('function renderContent()'),source.indexOf('const enriched = calculated')).includes('for (const card of calculated)'));
const renderModule=source.slice(source.indexOf('let renderMemo = null;'),source.indexOf('let favoriteCalculationCache'));
let now=100;
const memoState={q:'',favorites:new Set(),gradeObservations:{},actualResults:{},openCardDetails:new Set(),sort:'name',sources:{}};
const memo=new Function('state','Date','let calculatedCardCache={expires:1000};'+renderModule+';return {begin:searchMemoFor,cache:()=>searchMemoCache};')(
  memoState,class extends Date {static now(){return now;}});
memo.begin(cards);let saved=memo.cache();saved.audits.set('psa9-ratio-coverage',{total:4});
memoState.openCardDetails=new Set(['0']);memoState.sort='price';memo.begin(cards);
assert.strictEqual(memo.cache(),saved,'detail/sort only changes preserve counts');
memoState.q='new query';memo.begin(cards);assert.notStrictEqual(memo.cache(),saved,'query changes rebuild counts');
saved=memo.cache();memoState.sources={};memo.begin(cards);assert.notStrictEqual(memo.cache(),saved,'source revisions rebuild counts');
saved=memo.cache();now=1000;memo.begin(cards);assert.notStrictEqual(memo.cache(),saved,'exact freshness expiry rebuilds counts');
console.log('PASS lazy nested PSA9 coverage, exact reason counts, cache invalidation, alias/empty search and no hidden calculation');
