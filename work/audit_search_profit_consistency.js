const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const specifiedUrl = 'https://urm759.github.io/pokeka-serch/?fee=10980&tx=0&tx7=0&psaTx=0&psaTx7=0&roi=20&psaMin=10000&psaMax=200000&sort=expectedProfit-desc&priceMax=25000&guide=70&cap=5000000&lock=147&expProfit=0&expRoi=10&annual=40&maxShare=120000&batch=10&reserve=1000000&sellFee=8&extraCost=0&psaPlan=standard&bb7=0&bb30=0&bb90=0&bbShops=0&locked=3500000&priceMin=0&buyLimitRatio=0&buybackDeduction=5&preset=combined&psa9RatioMin=70&psa9Aggregate=1&psa9Estimate=0&psa9Market=1&exitPolicy=both&buybackStores=all&selectedStores=&storeTravel=0&snkrFee=7&snkrShip=210&snkrOther=0&snkrTx7=0&snkrTx30=3&snkrProfit=0&snkrRoi=0&snkrAge=48&year2020=0&includeUnknownYear=0&profitBasis=auto&periodReference=1&psa9RatioMax=120&filterExpRoi=10&marketSearch=cap&marketCapMin=0&filterStressRoi=0&filterStressProfit=0';
function inputs() {
  const map = new Map();
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const attr = (text, key) => text.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
  for (const match of html.matchAll(/<input\b([^>]*)>|<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const tag = match[1] || match[2], id = attr(tag, 'id'); if (!id) continue;
    const options = [...(match[3] || '').matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];
    const selected = options.find(m => /\bselected\b/.test(m[1])) || options[0];
    map.set(id, {value:match[1] != null ? attr(tag, 'value') || '' : attr(selected?.[1] || '', 'value') || '',
      checked:/\bchecked\b/.test(tag), classList:{toggle(){}}, textContent:'',innerHTML:'',dataset:{}});
  }
  return map;
}
function load(appSource, at) {
  const inputElements = inputs();
  const NativeDate = Date;
  class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [at])); } static now() { return NativeDate.parse(at); } }
  let prefix = fs.readFileSync(path.join(__dirname, 'build_purchase_limit_audit.js'), 'utf8').split('const calculated = prepareCalculatedCards(state.cards);')[0];
  prefix = prefix.replace('const source = fs.readFileSync(path.join(root, "app.js"), "utf8");', `window.location={href:specifiedUrl};
    window.ReleaseYearFilter=require('../release-year-filter.js');window.CandidateVisibility=require('../candidate-visibility.js');window.PurchaseRatioModel=require('../purchase-ratio-model.js');
    const source=appSource;`);
  prefix = prefix.replace('getElementById: () => null', "getElementById: id => {if(!inputElements.has(id)) inputElements.set(id,{value:'',checked:false,classList:{toggle(){}},dataset:{}});return inputElements.get(id);}");
  prefix = prefix.replace(/  console,\r?\n/, '  Date:FixedDate,\n  console,\n');
  const tail = `vm.runInContext("render=()=>{};updateUrl=()=>{};saveQuickFilters=()=>{};scheduleCatalogQueryLoad=()=>{};readUrl();syncFromUI();globalThis.searchApi={state,prepareCalculatedCards,searchProfitView,cardSearchExclusions,presetQualifications,searchProfitPanel:typeof searchProfitPanel==='function'?searchProfitPanel:null,purchaseBelowCurrentCapReason:typeof purchaseBelowCurrentCapReason==='function'?purchaseBelowCurrentCapReason:null,sorters,buildSearchAudit};",context);
    return context.searchApi;`;
  return new Function('require','__dirname','appSource','specifiedUrl','inputElements','FixedDate','process', prefix + tail)(require,__dirname,appSource,specifiedUrl,inputElements,FixedDate,{env:{}});
}
function build() {
  const at = new Date().toISOString();
  const beforeSource = execFileSync('git', ['show','7efb1da4:app.js'], {cwd:ROOT,encoding:'utf8',maxBuffer:10000000});
  const afterSource = fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  const before=load(beforeSource,at),after=load(afterSource,at);
  for(const api of [before,after]) {
    assert.equal(api.state.fee,10980);assert.equal(api.state.saleFeeRate,8);assert.equal(api.state.buybackDeductionRate,5);
    assert.equal(api.state.exitPolicy,'both');assert.equal(api.state.lockDays,147);assert.equal(api.state.minRoi,20);
  }
  const oldCards=before.prepareCalculatedCards(before.state.cards),newCards=after.prepareCalculatedCards(after.state.cards);
  const digest = cards => crypto.createHash('sha256').update(JSON.stringify(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
  assert.equal(digest(oldCards),digest(newCards),'limits/GO must not change under the same data/settings/time');
  const final = (api,cards) => cards.filter(c=>!api.cardSearchExclusions(c).length);
  const oldFinal=final(before,oldCards),newFinal=final(after,newCards);
  for(const card of newFinal) assert(after.searchProfitView(card).psa10Roi >= 20,'20% filter and result must agree');
  const example = newCards.find(c=>c.id==='pk-17457');
  const oldExample=oldCards.find(c=>c.id===example.id);
  const variants={};
  for(const basis of ['limit','store','current']) {after.state.profitSearchBasis=basis;variants[basis]=after.searchProfitView(example);}
  after.state.profitSearchBasis='auto';
  const plainCalculation = price => ({purchasePrice:price,psa10Price:33000,net:30360,fee:10980,
    profit:30360-price-10980,psa10Roi:(30360-price-10980)/(price+10980)*100});
  const privateFields=new Set(['cap','locked','reserve','maxShare','batch']);
  const report={version:1,referenceCommit:'7efb1da4',at,checkedUrlHash:crypto.createHash('sha256').update(specifiedUrl).digest('hex'),
    parameters:Object.fromEntries([...new URL(specifiedUrl).searchParams].filter(([key])=>!privateFields.has(key))),
    privacyNote:'指定URLをそのまま検証。資金設定の数値は公開監査に転載せず、検証URLのハッシュだけ保存。',
    calculationUnchanged:true,calculationHash:digest(newCards),catalog:newCards.length,
    before:{final:oldFinal.length,ids:oldFinal.map(c=>c.id)},after:{final:newFinal.length,ids:newFinal.map(c=>c.id)},
    gained:newFinal.filter(c=>!oldFinal.some(o=>o.id===c.id)).map(c=>c.id),lost:oldFinal.filter(c=>!newFinal.some(o=>o.id===c.id)).map(c=>c.id),
    example:{id:example.id,name:example.name,oldFilter:before.searchProfitView(oldExample),oldDetail:{purchasePrice:oldExample.price,psa10Roi:oldExample.roi},
      unified:variants,exclusions:after.cardSearchExclusions(example)},
    marketplaceExample:[plainCalculation(9000),plainCalculation(19000)],
    audit:after.buildSearchAudit(newCards),browserVerification:'未実施・Computer Useが現在URLを確認できず停止',
    newSourceAcquisitionCards:0,newlyAnalyzableCards:0};
  fs.writeFileSync(path.join(ROOT,'data/search-profit-consistency-audit.json'),JSON.stringify(report));
  console.log(JSON.stringify({catalog:report.catalog,before:report.before.final,after:report.after.final,limitsUnchanged:true,
    example:report.example,marketplaceExample:report.marketplaceExample}));
  return report;
}
if(require.main===module)build();
module.exports={load,build,specifiedUrl};
