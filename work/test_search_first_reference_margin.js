const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const api=require('./audit_search_profit_consistency').load(app,'2026-10-11T04:00:00Z');
api.state.purchaseMode='combined'; api.state.exitPolicy='marketplace';
const now=Date.parse('2026-10-11T04:00:00Z'),date='2026-10-11T03:00:00Z';
const card={id:'fixture',psa10:30000,psa10ObservedAt:date,psa9Audit:{value:20000,estimated:false,measurementType:'aggregate'},
  overallAssessment:{score:80},currentStoreOffer:{value:10000,available:true,fresh:true,updatedAt:date,inventoryAt:date},
  buyLimits:{clean:{currentBreakEvenRaw:12000,currentBreakEvenMaxPrice:12000,assumptions:{hitRate:0.8,lowerGradePrice:20000},finalMaxPrice:9000}}};
const snapshot=JSON.stringify(card);let p=api.purchaseExploration(card,now);
assert.equal(p.cap,12000);assert(Math.abs(p.headroom-20)<1e-10);assert(p.warnings.includes('参考値・PSA9日時未確認'));
assert.equal(api.purchaseBelowCurrentCapReason(card),null);
assert.equal(api.currentMarketView(card).eligible,false,'reference comparison cannot relax the current-market safety gate');
assert(api.currentMarketView(card).reasons.includes('PSA9価格の確認日時不足'));
const same={...card,currentStoreOffer:{...card.currentStoreOffer,value:12000}};
assert.equal(api.purchaseExploration(same,now).headroom,0);assert(api.purchaseBelowCurrentCapReason(same));
assert(api.purchaseExploration({...card,currentStoreOffer:{...card.currentStoreOffer,value:13000}},now).headroom<0);
for(const c of [{...card,currentStoreOffer:null},{...card,currentStoreOffer:{...card.currentStoreOffer,available:false}},
  {...card,currentStoreOffer:{...card.currentStoreOffer,updatedAt:'2026-09-01'}},
  {...card,currentStoreOffer:{...card.currentStoreOffer,inventoryAt:null}},
  {...card,buyLimits:{clean:{...card.buyLimits.clean,assumptions:{hitRate:null,lowerGradePrice:20000}}}},
  {...card,buyLimits:{clean:{...card.buyLimits.clean,currentBreakEvenRaw:-1}}},
  {...card,dataQuality:{manualReview:true}}]) assert.equal(api.purchaseExploration(c,now).headroom,null);
assert.equal(api.purchaseExploration({...card,buyLimits:{clean:{...card.buyLimits.clean,currentBreakEvenRaw:499.99}}},now).cap,0);
assert.equal(JSON.stringify(card),snapshot);
const cards=api.prepareCalculatedCards(api.state.cards);let compared=0;
for(const c of cards){const p=api.purchaseExploration(c,now);if(p.headroom!=null){
  const d=require('../limit-display-model').summarize({limit:c.buyLimits.clean,psa10Price:c.psa10});
  assert.equal(p.cap,d.currentCap);assert.equal(p.headroom,(d.currentCap/p.price-1)*100);compared++;
}}
// Live data can be newer than this frozen fixture clock. Zero fresh offers is not a calculation failure.
assert(Math.abs(api.purchaseExploration(card,now).headroom-20)<1e-10);
assert(html.indexOf('id="qInput"')<html.indexOf('<h1>'));
assert(html.indexOf('id="purchaseHeadroomMinInput"')<html.indexOf('<h1>'));
assert(html.indexOf('id="purchaseBelowCurrentCapInput"')<html.indexOf('<h1>'));
assert(html.indexOf('id="qInput"')<html.indexOf('id="updateHealthBanner"'));
assert(!app.includes('prioritizeCandidateLayout'));
for(const id of ['qInput','actualPurchaseMinInput','purchaseHeadroomMinInput','purchaseBelowCurrentCapInput'])assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1);
assert(app.includes("p.cap ?? '',p.warnings.join('／')"),'CSV shares the reference comparison cap and warnings');
console.log(`Search-first DOM, reference PSA9 date warning, safe strict gates, same-price boundary and ${compared} real margin comparisons PASS`);
