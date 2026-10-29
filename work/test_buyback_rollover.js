const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const b=require('./build_buyback_support'),m=require('../exploration-metrics'),e=require('./psa10_observation_evidence');
const card={id:'test',identityKey:'S6A|077069|same|SR||ja',language:'ja',snkPsa10Price:10000};
const oldAt='2026-10-29T14:50:00Z',quoteAt='2026-10-29T15:20:00Z',newAt='2026-10-29T17:30:00Z',now=Date.parse(newAt)+60000;
const point=(date,at)=>[date,1000,10000,null,null,null,null,null,null,null,[at,e.identity(card)]];
const quote=(at,date,price=11000)=>({identity:card.identityKey,identityAuditVersion:3,grade:'PSA10',currency:'JPY',title:'test',price,observedAt:at,priceDate:date});
const saved={shops:{a:{test:{'2026-10-29':quote(oldAt,'2026-10-29'),'2026-10-30':quote(quoteAt,'2026-10-30')}}}};
const source={shops:{a:{name:'A',merchantId:'a',fulfilment:'mail'}},cards:{test:{shops:{a:{price:11000,listingActive:true,matchConfidence:'high',priceDate:'2026-10-30',observedAt:quoteAt}}}}};
const history={cards:{test:[point('2026-10-29',oldAt)]}},original=JSON.stringify({saved,history});
const wrap=h=>({cards:{test:{a:{identity:card.identityKey}}},support:b.aggregate(b.joined(saved,h,[card],source,now).rows,source,[card],now).summary});
const read=(packet=wrap(history),s=source,mode='all',selected=[])=>m.buybackSupport(packet,'test',mode,selected,now,10000,card.identityKey,s);
let value=read();assert.equal(value.highestQuote,null);assert.equal(value.rows[0].reasonCode,'market-day');assert.equal(value.recentReference.date,'2026-10-29');assert.equal(value.recentReference.highestQuote.ratio,1.1);
const complete={cards:{test:[...history.cards.test,point('2026-10-30',newAt)]}},ready=wrap(complete);
const unknownSaved=structuredClone(saved);delete unknownSaved.shops.a.test['2026-10-30'].priceDate;
const laterDatedSource=structuredClone(source);laterDatedSource.cards.test.shops.a.observedAt='2026-10-29T17:00:00Z';
const notRetimed=b.joined(unknownSaved,complete,[card],laterDatedSource,now).rows.find(r=>r.date==='2026-10-30');
assert.equal(notRetimed.priceDate,null,'a later same-price quote cannot supply the missing date of an older observation');
value=read(ready);assert.equal(value.highestQuote.ratio,1.1);assert.equal(value.highestQuote.at,quoteAt);assert.equal(value.highestQuote.marketAt,newAt,'actual confirmations are not replaced by publication time');
assert.equal(JSON.stringify({saved,history}),original,'no invented day or source timestamp');
const later=structuredClone(source);later.cards.test.shops.a.observedAt='2026-10-29T17:00:00Z';assert.equal(read(ready,later).rows[0].reasonCode,'summary-pending','same price recheck requires real matching aggregation');
for(const [change,reason]of [[{price:10500},'quote-changed'],[{listingActive:false},'ended'],[{maxQuantity:0},'ended'],[{priceDate:null},'quote-date'],[{quarantined:true},'spec-held'],[{campaign:true},'conditional']]){
 const s=structuredClone(source);Object.assign(s.cards.test.shops.a,change);const result=read(ready,s);assert.equal(result.highestQuote,null);assert.equal(result.rows[0].reasonCode,reason);assert(result.recentReference,'historical reference remains, never a current replacement');
}
const delayed=structuredClone(ready);delayed.support.cards.test.a.current[4]='2026-10-29T23:30:00Z';assert.equal(read(delayed).highestQuote,null,'future/over-skew market observation cannot be current');
assert.equal(read(ready,source,'selected',['unknown']).recentReference,null,'reference follows the same shop selection');
const identityHold=structuredClone(ready);identityHold.support.cards={};identityHold.captureHolds={test:{a:true}};
assert.equal(read(identityHold).reason,'買取原票の名称・仕様照合保留','a saved identity hold is not missing historical observations');
assert.equal(read(identityHold,source,'selected',['unknown']).reason,'対応する比較履歴未取得','unselected shops do not supply the cause');
const slim=require('./build_ui_data').project('buyback-observation-summary',ready);assert.equal(read(slim).highestQuote.ratio,read(ready).highestQuote.ratio);assert.deepEqual(read(slim).recentReference,read(ready).recentReference);
const receipt={version:1,payloadHash:'proof',observedAt:oldAt,cards:{test:[e.identity(card),10000]}},gate=require('./price_payload_gate'),plan=require('./buyback_pair_refresh').plan;
assert.equal(gate.due(receipt,now),false);assert.equal(gate.due(receipt,now,{requiredDay:'2026-10-30'}),true,'calendar request reaches actual payload, not only HTML');
assert.equal(gate.due(receipt,Date.parse('2026-10-29T15:30:00Z'),{requiredDay:'2026-10-30'}),false,'two-hour spacing preserved');
assert.equal(gate.due(receipt,now,{requiredDay:'2026-10-31'}),false,'unrelated/future calendar request rejected');
assert.equal(plan([card],source,receipt,{lastAttemptAt:'2026-10-29T17:00:00Z'},now).requiredDay,null);
assert.equal(plan([card],source,receipt,{lastAttemptAt:oldAt},now).requiredDay,'2026-10-30');
assert.equal(plan([{...card,snkPsa10Price:null}],source,receipt,{},now).pendingCards,0,'unprovided PSA10 price is not an endless recheck');
assert.equal(plan([card],source,{...receipt,observedAt:newAt},{},now).pendingCards,0,'already acquired market payload is reaggregated, not reacquired');
const app=fs.readFileSync(require('path').join(__dirname,'../app.js'),'utf8'),context=vm.createContext({Date:class extends Date{static now(){return now;}},Map,WeakMap,JSON,explorationMetrics:m,fmt:new Intl.NumberFormat('ja-JP'),escapeHtml:s=>String(s),formatJstTimestamp:s=>s});
vm.runInContext('const state={buybackObservationSummary:'+JSON.stringify(wrap(history))+',shopBuybacks:'+JSON.stringify(source.cards)+',buybackStoreMode:"all",selectedBuybackStores:[],buybackHighestMin:1};'+app.slice(app.indexOf('const buybackSupportCache ='),app.indexOf('async function loadBuybackSupportDetail'))+';globalThis.api={state,cardBuybackSupport,buybackSupportHtml,buybackSupportCsvFields,buybackHighestExclusion};',context);
const c={...card,psa10:10000},api=context.api;assert(api.buybackHighestExclusion(c),'past reference never satisfies current highest filter');let csv=api.buybackSupportCsvFields(c);assert.equal(csv[0],'');assert.equal(csv[23],1.1);assert.equal(csv[25],'2026-10-29');
const html=api.buybackSupportHtml(c);assert(html.includes('直近比較成立時の参考'));assert(html.includes('相場再確認待ち'));assert.equal((html.match(/比較不可/g)||[]).length,0);
api.state.buybackObservationSummary=ready;assert.equal(api.buybackHighestExclusion(c),null);csv=api.buybackSupportCsvFields(c);assert.equal(csv[0],1.1);api.state.shopBuybacks.test.shops.a.price=10500;assert(api.buybackHighestExclusion(c),'price changes invalidate cached current ratio even with unchanged timestamps');
console.log('PASS real midnight pairing, retained reference only, identical-price recheck, changed price/end/zero/date/selection, payload gate spacing, summary/detail/CSV/filter/cache');
const fast=fs.readFileSync(require('path').join(__dirname,'daily_fast_update.js'),'utf8');
const recordFunction=fast.slice(fast.indexOf('function recordSource('),fast.indexOf('\nfunction finalize('));
for(const env of [{GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'real-run',GITHUB_EVENT_NAME:'schedule'},{}]) {
 const captured=[];vm.runInNewContext(recordFunction+';recordSource("toreca",{lastSuccessAt:"actual-confirmation"});',
   {process:{env},ROOT:'fixture',updateRun:(id,row)=>captured.push(row),appendRunHistory:(id,row)=>captured.push(row)});
 for(const row of captured){assert.equal(row.workflowTrigger,env.GITHUB_EVENT_NAME||'manual-local');assert.equal(row.lastSuccessAt,'actual-confirmation');}
}
console.log('PASS new source runs replace inherited trigger labels without changing confirmation timestamps');
