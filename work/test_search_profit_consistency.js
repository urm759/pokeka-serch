const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const elements=new Map();
const context=vm.createContext({window:{location:{href:'https://example.test/'},PurchaseDecisionModel:require('../decision-model'),
  ReleaseYearFilter:require('../release-year-filter'),CandidateVisibility:require('../candidate-visibility'),PurchaseRatioModel:require('../purchase-ratio-model')},
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false});return elements.get(id)},querySelectorAll:()=>[]},
  URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem:()=>{}}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+`\ncurrentMarketView=card=>card.testView||{eligible:false};
  globalThis.api={state,searchProfitView,searchProfitPanel,purchaseBelowCurrentCapReason,sorters,readUrl,buildShareUrl,saveQuickFilters};`,context);
const {state:s,searchProfitView:view,sorters}=context.api;
Object.assign(s,{fee:10980,saleFeeRate:8,saleExtraCost:0,profitSearchBasis:'limit',purchaseMode:'combined'});
const card={price:19000,psa10:33000,psa10Net:30360,buyLimits:{clean:{finalMaxPrice:9000,exitPolicy:{adoptedPolicy:'marketplace'},economicsScenarios:{}}}};
let v=view(card);assert(Math.abs(v.psa10Roi-51.951951951951955)<1e-8);assert.equal(v.purchasePrice,9000);assert.equal(v.psa10Profit,10380);
s.profitSearchBasis='current';v=view(card);assert(Math.abs(v.psa10Roi-1.267511674449633)<1e-8);assert.equal(v.psa10Profit,380);
assert(context.api.searchProfitPanel(v).includes('1.27%'));
s.profitSearchBasis='store';assert.equal(view(card).psa10Roi,null,'missing actual purchase is not reference price');
const shop={expectedSale:22000,expectedProfit:2020,expectedRoi:10.11},market={expectedSale:25000,expectedProfit:5020,expectedRoi:25.13};
card.buyLimits.clean.economicsScenarios.operationalLimit={centralForecast:market,supplyStress:market};
card.buyLimits.clean.buybackEconomics={operationalLimit:{centralForecast:shop,supplyStress:shop}};
card.buyLimits.clean.buybackExit={scenarios:{current:{netPsa10:27000}}};
s.profitSearchBasis='limit';
for(const policy of ['buyback','both']) {card.buyLimits.clean.exitPolicy.adoptedPolicy=policy;v=view(card);assert.equal(v.psa10Net,27000);assert.equal(v.psa10Profit,7020);assert.equal(v.economics,shop);}
s.saleFeeRate=15;assert.equal(view(card).psa10Net,27000,'no second marketplace fee after buyback deduction');
card.buyLimits.clean.exitPolicy.adoptedPolicy='marketplace';assert.equal(view(card).psa10Net,30360,'use already computed marketplace net');
const higher={...card,buyLimits:{clean:{...card.buyLimits.clean,finalMaxPrice:5000}}};
assert(sorters['roi-desc'](higher,card)<0);assert(sorters['profit-desc'](higher,card)<0);
const offer={value:9999,updatedAt:new Date().toISOString(),fresh:true,available:true};
const compare={currentStoreOffer:offer,testView:{eligible:true,capState:'available',cap:10000}};
assert.equal(context.api.purchaseBelowCurrentCapReason(compare),null);
assert(context.api.purchaseBelowCurrentCapReason({...compare,currentStoreOffer:{...offer,value:10000}}).includes('同額'));
assert(context.api.purchaseBelowCurrentCapReason({...compare,currentStoreOffer:{...offer,updatedAt:null}}).includes('日時不明'));
assert(context.api.purchaseBelowCurrentCapReason({...compare,currentStoreOffer:{...offer,updatedAt:'2020-01-01'}}).includes('期限超過'));
assert(context.api.purchaseBelowCurrentCapReason({...compare,currentStoreOffer:{...offer,available:false}}).includes('在庫なし'));
assert(context.api.purchaseBelowCurrentCapReason({...compare,currentStoreOffer:null,price:1}).includes('未取得'));
assert(context.api.purchaseBelowCurrentCapReason({...compare,testView:{eligible:false}}).includes('算出不可'));
assert(context.api.purchaseBelowCurrentCapReason({...compare,testView:{eligible:true,capState:'loss-at-zero',cap:0}}).includes('算出不可'));
context.window.location.href='https://example.test/?buyBelowCap=1';context.api.readUrl();assert(elements.get('purchaseBelowCurrentCapInput').checked);
s.purchaseBelowCurrentCap=true;assert.equal(context.api.buildShareUrl().searchParams.get('buyBelowCap'),'1');
assert(source.includes('searchProfitPanel(chosenProfit)')&&source.includes('chosenProfit.psa10Roi.toFixed(2)'),'list/detail use same search calculation');
console.log('Search/display/sort purchase basis, exit costs, strict actual-offer comparison and URL PASS');
