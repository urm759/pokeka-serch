const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),m=require('./stock_history_statistics'),view=require('../exploration-metrics');
const asOf='2026-11-04T01:00:00Z',url='https://www.hareruya2.com/products/example',dates=['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04'];
const h={dates,stocks:{x:[10,7,null,12,11]},quantityEvidence:{x:Object.fromEntries(dates.map((d,i)=>[d,[[10,7,null,12,11][i],url,d+'T00:00:00Z','same']]))}};
const r=m.summarize(h,{asOf}).cards.x,f=r.stockFlow[7];
assert.equal(f.net,-4);assert.equal(f.decrease,4);assert.equal(f.increase,0);assert.equal(f.pairs,2);assert.equal(f.days,4);assert.equal(f.segments.length,2);
assert.equal(f.windowStart,'2026-10-28');assert.equal(f.windowEnd,'2026-11-04');assert.equal(f.first,'2026-10-31');assert.equal(f.last,'2026-11-04');
assert.equal(f.excluded.missingQuantity,2);assert.equal(f.net,f.increase-f.decrease);
const restock=structuredClone(h);restock.stocks.x=[10,7,12,12,11];for(let i=0;i<dates.length;i++)restock.quantityEvidence.x[dates[i]][0]=restock.stocks.x[i];
const s=m.summarize(restock,{asOf}).cards.x;assert.equal(s.stockFlow[7].net,1);assert.equal(s.stockFlow[7].decrease,4);assert.equal(s.stockFlow[7].increase,5);
const changed=structuredClone(restock);changed.quantityEvidence.x['2026-11-02'][1]=url+'-other';
assert.equal(m.summarize(changed,{asOf}).cards.x.stockFlow[7].excluded.changedProduct,2);
const future=structuredClone(restock);future.quantityEvidence.x['2026-11-04'][2]='2026-11-04T02:00:00Z';
assert.equal(m.summarize(future,{asOf}).cards.x.stockFlow[7].excluded.invalidEvidenceTime,1);
const stale={cards:{x:{...s},gone:{...s}}};m.apply(stale,{dates,stocks:{x:restock.stocks.x}},{asOf});
assert.equal(stale.cards.x.stockFlow,null,'removed quantity evidence cannot leave a retained old flow');
assert.equal(stale.cards.gone.stockFlow,null,'partial/missing history never retains stale stock flow');
assert.equal(stale.cards.x.avg7,s.avg7);assert.equal(stale.cards.x.demand,s.demand,'display evidence does not alter existing demand arithmetic');
const input={...s,sourceId:'shop',identityVerified:true,conditionAccepted:true,inventoryObservedAt:asOf};
const v=view.stockTrend([input,input],Date.parse(asOf));assert.equal(v.periods[7].net,1);assert.equal(v.periods[7].flowStores,1);
const bad=structuredClone(input);bad.stockFlow[30]={...bad.stockFlow[30],decrease:2,increase:3,net:1};
const held=view.stockTrend([bad],Date.parse(asOf));assert.equal(held.periods[7].net,null);assert.deepEqual(held.conflictSources,['shop']);
for(let day=1;day<=31;day++){
  const ds=Array.from({length:35},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10));
  const vals=ds.map((d,i)=>i%9===0?null:20+(i*7)%13),p=Object.fromEntries(ds.map((d,i)=>[d,[vals[i],url+(i<10?'old':''),d+'T00:00:00Z','same']]));
  const x=m.summarize({dates:ds,stocks:{a:vals},quantityEvidence:{a:p}},{asOf:new Date(Date.UTC(2026,9,day,3)).toISOString()}).cards.a.stockFlow;
  if(x[7].decrease!=null&&x[30].decrease!=null){assert(x[30].decrease>=x[7].decrease);assert(x[30].increase>=x[7].increase);assert(x[30].pairs>=x[7].pairs);}
}
const app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),start=app.indexOf('function inventoryMovementMarkup('),end=app.indexOf('// Presentation only:',start);
const ctx=vm.createContext({explorationMetrics:view,fmt:new Intl.NumberFormat('ja-JP'),escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')});vm.runInContext(app.slice(start,end)+';this.render=inventoryMovementMarkup',ctx);
const html=ctx.render([['店舗',input]],Date.parse(asOf));
for(const text of ['7日間の在庫純増減 +1枚','30日間の在庫純増減','減少累計 4枚','補充累計 5枚','5観測日','4区間','集計基準日 2026-11-04','対象 2026-10-28','履歴商品'])assert(html.includes(text),text);
assert(!html.includes('売れた枚数'));assert(ctx.render([['店舗',{}]],Date.parse(asOf)).includes('減少累計 未取得'));
console.log('PASS inventory net movement: same-product paired differences, restock/decrease, missing/future observations, stale-flow removal, nested calendar windows and rendered provenance');
