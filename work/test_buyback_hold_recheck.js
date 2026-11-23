// Offline integration: run the real collector and tracking CLI in an isolated fixture tree.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'buyback-review-'));
const work = path.join(root,'work'), data = path.join(root,'data');
for (const folder of [work,data]) fs.mkdirSync(folder);
const read = file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const write = (file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value));
const HOUR = 3600000, now = Date.parse('2026-11-22T12:00:00Z');
const iso = hours=>new Date(now + hours*HOUR).toISOString();
const hold = require('./buyback_hold_review');
const {due,sourceRunRecord} = require('./run_priority_price_refresh');
const daily = require('./run_daily_sources');
const bank = 'torecabank', rocket = 'bluerocket';
function fixture(mode, elapsed, count, http) {
  const shops = {[bank]:{name:'bank',fetched:20,lastSuccess:iso(-144),lastAttempt:iso(-elapsed),reviewStatus:'count-drop-review'},
    [rocket]:{fetched:2,lastSuccess:iso(-144),lastAttempt:iso(-144)}};
  if (mode === 'first') shops[bank].reviewStatus = null;
  if (mode === 'format') shops[bank].reviewStatus = 'format-review';
  if (mode === 'confirmed') shops[bank].countDropReview = {startedAt:iso(-48),lastGoodCount:20,resolvedAt:null,
    latest:{at:iso(-24),status:'count-drop-review',count:1,httpStatuses:[200]}};
  write('data/shop-buyback-summary.json',{shops,cards:{preserved:{shops:{[bank]:{price:100,listingActive:true}}}}});
  write('work/source-update-runs.json',{sources:{shopBuyback:{lastSuccessAt:iso(-144)}}});
  write('work/buyback-source-permissions.json',{sources:mode==='permission'?{[bank]:{status:'pending',reason:'fixture'}}:{}});
  // Only these two actual adapters are enabled. Replace every HTTP request at the process boundary.
  const preload = path.join(root,'offline.cjs');
  fs.writeFileSync(preload,[
    "const RealDate=Date;global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:["+now+"]))}static now(){return "+now+"}};",
    "global.fetch=async url=>{url=String(url);require('fs').appendFileSync("+JSON.stringify(path.join(root,'calls'))+",url+'\\n');",
    "if(url.includes('bluerocket'))return new Response("+JSON.stringify([1,2].map(i=>'<div data-product-id="'+i+'" data-product-name="PSA 10 test'+i+'" data-product-price="50">').join(''))+");",
    "if(!url.includes('torecabank'))throw Error('unexpected fixture URL');return new Response("+JSON.stringify(Array.from({length:count},(_,i)=>'<li class="item" data-id="'+i+'" data-max="1"><p class="name">name</p><p class="tag">PSA10</p><p class="price">100</p></li>').join(''))+",{status:"+http+"});};"
  ].join('\n'));
  fs.writeFileSync(path.join(root,'calls'),'');
  const env = {...process.env, NODE_OPTIONS:'--require '+JSON.stringify(preload), SHOP_BUYBACK_SOURCE_ONLY:bank};
  if(mode==='mixed') {
    delete env.SHOP_BUYBACK_SOURCE_ONLY;
    const permissions={};
    for(const id of ['toreca-lounge','shinsoku','torecaclub','toreca-birth-mail','kaitori-homura-mail','fukufuku-mail']) permissions[id]={status:'pending',reason:'fixture'};
    write('work/buyback-source-permissions.json',{sources:permissions});
  }
  const child = spawnSync(process.execPath,['work/run_tracked_update.js','shopBuyback','work/update_shop_buybacks.js'],{cwd:root,env,encoding:'utf8'});
  const stage = read('work/source-update-runs.json').sources.shopBuyback;
  assert.ok(stage.shopBuyback, child.stderr+child.stdout);
  return {child,stage,shop:read('data/shop-buyback-summary.json').shops[bank],calls:fs.readFileSync(path.join(root,'calls'),'utf8').trim()};
}
function printedNumberRule() {
  const rule=require('./buyback_printed_number');
  const differs=(name,card,extra={})=>rule.mismatch({name,...extra},{name:card});
  for(const [name,card] of [
    ['ピカチュウV 001/015 [S8A]','ピカチュウ [s8a 001/028]'],
    ['エテボース AR [M2 129/165]','エテボース AR [M2 092/080]'],
    ['メガシビルドンex SAR [M2a 223/193]','メガシビルドンex SAR [M2a 235/193]'],
  ])assert.equal(differs(name,card),true,'known mismatch: '+name);
  for(const [name,card] of [
    ['カード 1/28','カード [s8a 001/028]'],['カード ００１／０２８','カード [s8a 001/028]'],
    ['ミライドン [PROMO 048/SV-P]','ミライドン: プロモ [SV-P 048]'],['ピカチュウ P 206/XY-P','ピカチュウ P [XY-P 206]'],
    ['番号の無い商品','カード [M2 092/080]'],['カード 092/080','番号の無いカード'],['カード 092/080 (129/165)','カード [M2 092/080]'],
  ])assert.equal(differs(name,card),false,'spelling or missing evidence is not a mismatch: '+name);
  assert.equal(rule.mismatch({name:'カード 092/080'},{name:'カード',model:'092/080'}),false,'model is also evidence');

  const cards=[{id:'x',name:'カード [M2 092/080]'}],wrong={shopItemId:'1',name:'カード 129/165',cardId:'x',score:100,matchMethod:'confirmed-cache',price:900,active:true,observedAt:iso(0)};
  const results=[{shop:{id:bank},matched:[wrong,{...wrong,shopItemId:'2',matchMethod:'image-reviewed'},{...wrong,shopItemId:'3',verifiedCardId:'x'}],unmatched:[]}];
  assert.deepEqual([...rule.hold(results,cards)],[bank+':x']);
  assert.deepEqual(results[0].matched.map(i=>i.shopItemId),['2','3'],'reviewed evidence is not overridden');
  assert.equal(results[0].unmatched[0].cardId,undefined);
  assert.equal(results[0].unmatched[0].previousCardId,'x');
  assert.equal(results[0].unmatched[0].price,900,'the original quote is retained');
  const saved=[10,20,30],dates=['2026-11-21','2026-11-22','2026-11-23'];
  assert.equal(rule.countedValues(saved,dates),saved);
  assert.deepEqual(rule.countedValues(saved,dates,'2026-11-22'),[null,null,30]);
  assert.deepEqual(rule.countedValues(saved,dates,'2026-11-23','2026-11-23'),[null,null,30],'a same-day correct relink counts');
  assert.deepEqual(saved,[10,20,30],'saved history is never rewritten');
}
function absenceNote(market) {
  const shops={a:{name:'A',lastSuccess:iso(0)},b:{name:'B',lastSuccess:iso(0)},c:{name:'C',lastSuccess:iso(0)}};
  const row=(shopId,conservativePrice,age)=>({shopId,conservativePrice,observedAt:iso(-age)});
  const note=rows=>market.buybackExitAbsence(rows,shops);
  assert.equal(note([row('a',80000,0.01),row('b',82000,1)]),null,'this fetch is current, including its per-request time');
  const rows=[row('a',80000,0),row('b',82000,0),row('c',98000,5)],before=structuredClone(rows),one=note(rows);
  assert.deepEqual(one.absent.map(r=>[r.shopId,r.name,r.observedAt]),[['c','C',iso(-5)]]);
  assert.deepEqual([one.total,one.remaining,one.without,one.ratio],[3,2,81000,81000/82000]);
  assert.deepEqual(rows,before,'display never changes the adopted rows');
  const single=note([row('a',80000,0),row('c',98000,5)]);
  assert.deepEqual([single.without,single.ratio],[null,null],'one current store is not shown as a sale price');
  assert.equal(note([row('a',80000,0),row('b',80000,0),row('c',80000,5)]).ratio,1);
  assert.equal(market.buybackExitAbsence([row('z',1,9)],{}),null,'unknown fetch time is not called absent');
  assert.equal(market.buybackExitAbsence(undefined,shops),null);
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  assert.equal(app.split('buybackExitAbsence(').length-1,1,'absence is read only by the display note');
}
function withdrawnRule(market) {
  const startedAt='2026-11-21T02:56:59.225Z',at='2026-11-22T04:55:32.924Z';
  const base={reviewStatus:'count-drop-review',countDropReview:{startedAt,lastGoodCount:340,resolvedAt:null,
    latest:{at,status:'count-drop-review',count:1,httpStatuses:[200]}}};
  const withReview=patch=>({...base,countDropReview:{...base.countDropReview,...patch}});
  const withLatest=patch=>withReview({latest:{...base.countDropReview.latest,...patch}});
  assert.equal(market.buybackListingWithdrawn(base),true,'current saved evidence is recognized without migration');
  for(const [label,meta] of Object.entries({
    unknown:undefined, normal:{}, beforeRecheck:{reviewStatus:'count-drop-review'}, firstDrop:withLatest({at:startedAt}),
    httpError:withLatest({httpStatuses:[500]}), noResponse:withLatest({httpStatuses:[]}), noCount:withLatest({count:null}),
    notLow:withLatest({count:170}), unknownGoodCount:withReview({lastGoodCount:null}),
    succeeded:withLatest({status:null}), resolved:withReview({resolvedAt:at}),
    cleared:{...base,reviewStatus:null}, accessHold:{...base,reviewStatus:'access-review'}, formatHold:{...base,reviewStatus:'format-review'},
  }))assert.equal(market.buybackListingWithdrawn(meta),false,label+' keeps the normal expiry');

  // A confirmed store stays withdrawn through failures and is readmitted by one success.
  let shop=base;
  const attempt=(hour,patch)=>{shop={...shop,...hold.transition(shop,{at:iso(hour),count:null,pageEvidence:{httpStatuses:[200]},...patch})};return market.buybackListingWithdrawn(shop);};
  assert.equal(attempt(24,{status:'count-drop-review'}),true,'unparsed response after confirmation');
  assert.equal(attempt(48,{status:'format-review'}),true,'format hold after confirmation');
  assert.equal(attempt(72,{status:null,success:true,count:330}),false,'success after a format hold');
  assert.equal(attempt(96,{status:'count-drop-review',count:1}),false,'a new episode needs its own confirmation');

  const decision=require('../decision-model');
  const quote=(shopId,buybackPrice,meta)=>({shopId,fulfilment:'mail',...market.buybackMetrics({marketPrice:100000,buybackPrice,
    priceDate:'2026-11-21',asOfDate:'2026-11-22',listingWithdrawn:market.buybackListingWithdrawn(meta)})});
  const exit=rows=>decision.conservativeBuybackExit({rows,currentPsa10Price:100000,assumptions:{hitRate:0.8,lowerGradePrice:30000}});
  const held=quote('held',98000,base),a=quote('a',80000),b=quote('b',82000);
  assert.equal(held.valid,false);
  assert.equal(held.buybackPrice,98000,'saved quote stays visible as history');
  assert.equal(exit([a,b,held]).grossCurrent,81000,'withdrawn quote never raises the exit');
  assert.equal(exit([a,held]).usable,false,'one current store is not a confirmed exit');
  assert.equal(market.evaluateStoreDemand({rows:[a,b,held]}).best.buybackPrice,82000);
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  assert.equal(app.split('marketModel.buybackListingWithdrawn(').length-1,2,'exit rows and forecast blend share the rule');
}
function reports(result, externalFailure, expected) {
  const {child,stage} = result;
  const other={status:1,stdout:'',stderr:'fixture independent acquisition failed'};
  const runs=[sourceRunRecord('work/run_tracked_update.js',['shopBuyback'],child,now,'source')];
  const tasks=[{source:'shopBuyback'}];
  if(externalFailure) {tasks.push({source:'hareruya2'});runs.push(sourceRunRecord('work/refresh_candidate_shops.js',['hareruya2'],other,now,'source'));}
  write('data/priority-price-execution.json',{runId:'fixture',runs});
  const isolated=daily.run(tasks,t=>t.source==='shopBuyback'?child:other,root);
  assert.deepEqual(isolated.sources[0].shopBuyback,stage.shopBuyback);
  assert.deepEqual(runs[0].shopBuyback,stage.shopBuyback);
  for(const script of ['run_daily_sources.js','run_priority_price_refresh.js']){
    const report=spawnSync(process.execPath,['work/'+script,'--report-failures'],{cwd:root,env:{...process.env,GITHUB_RUN_ID:'fixture'},encoding:'utf8'});
    assert.equal(report.status,expected,report.stderr);
  }
}
try {
  for(const [from,to] of [[__dirname,work],[path.dirname(__dirname),root]]) {
    for(const name of fs.readdirSync(from).filter(n=>n.endsWith('.js')))fs.copyFileSync(path.join(from,name),path.join(to,name));
  }
  const wait=fixture('held',23,0,200);
  assert.equal(wait.calls,'');assert.equal(wait.stage.status,'no-progress');assert.equal(wait.stage.acquiredCount,0);
  assert.equal(wait.stage.lastSuccessAt,iso(-144));assert.equal(wait.shop.lastSuccess,iso(-144));reports(wait,false,0);
  const low=fixture('held',24,9,200);
  assert.equal(low.calls.split('\n').length,1);assert.equal(low.stage.status,'no-progress');assert.equal(low.shop.fetched,20);
  assert.equal(low.shop.countDropReview.lastGoodCount,20);assert.equal(low.shop.countDropReview.latest.count,9);
  assert.equal(low.shop.countDropReview.lastGoodPages,'不明（記録開始前）');assert.equal(hold.canAttempt(low.shop,now+24*HOUR-1,false),false);
  assert.equal(hold.canAttempt(low.shop,now+24*HOUR,false),true);
  const zeroFirst=fixture('first',24,0,200);
  assert.equal(zeroFirst.stage.status,'failed');
  assert.equal(zeroFirst.shop.reviewStatus,null);
  const ok=fixture('held',24,10,200);
  assert.equal(ok.shop.reviewStatus,null);assert.equal(ok.stage.acquiredCount,10);assert.equal(ok.shop.countDropReview.resolvedAt,iso(0));
  const market = require('../market-analysis');
  // Approved 2026-11-22: the collector records a confirmation that only a success clears.
  assert.equal(market.buybackListingWithdrawn(low.shop),true,'a second low listing is confirmed');
  assert.equal(low.shop.countDropReview.confirmed.count,9);
  assert.equal(market.buybackListingWithdrawn(zeroFirst.shop),false);
  assert.equal(market.buybackListingWithdrawn(ok.shop),false);
  for(const code of [403,500]){
    const failed=fixture('confirmed',24,0,code);
    assert.equal(market.buybackListingWithdrawn(failed.shop),true,'a failed recheck does not readmit withdrawn quotes: '+code);
    assert.equal(failed.shop.countDropReview.confirmed.count,1);
  }
  const recovered=fixture('confirmed',24,10,200);
  assert.equal(market.buybackListingWithdrawn(recovered.shop),false,'a successful listing readmits the store');
  assert.equal(recovered.shop.countDropReview.confirmed,undefined);
  withdrawnRule(market);
  absenceNote(market);
  printedNumberRule();
  const empty=fixture('held',24,0,200);
  assert.equal(empty.shop.countDropReview.latest.count,0);assert.deepEqual(empty.shop.countDropReview.latest.pageCounts,[0]);
  const evidence=path.join(work,'.private','buyback-failed-responses',bank);
  assert.ok(fs.readdirSync(evidence).some(dir=>fs.readFileSync(path.join(evidence,dir,'001.txt'),'utf8')===''));
  for(const http of [401,403]){const err=fixture('held',24,0,http);assert.equal(err.shop.reviewStatus,'access-review');assert.equal(err.stage.status,'failed');assert.equal(hold.canAttempt(err.shop,now+72*HOUR,false),false);}
  for(const mode of ['format','permission'])assert.equal(fixture(mode,72,10,200).calls,'');
  const failed=fixture('first',24,8,200);assert.equal(failed.stage.status,'failed');assert.equal(failed.stage.completionStatus,'partial-with-failure');
  reports(failed,false,1);assert.equal(failed.stage.acquiredCount,0);assert.equal(failed.shop.lastSuccess,iso(-144));assert.equal(failed.stage.lastSuccessAt,iso(-144));
  const mixed=fixture('mixed',1,0,200);assert.equal(mixed.stage.status,'partial');assert.equal(mixed.stage.completionStatus,'partial');
  assert.equal(mixed.stage.acquiredCount,2);assert.equal(mixed.shop.lastSuccess,iso(-144));assert.equal(mixed.stage.lastSuccessAt,iso(0));
  assert.equal(read('data/shop-buyback-summary.json').shops[rocket].lastSuccess,iso(0));reports(mixed,false,0);reports(mixed,true,1);
  for(const r of [failed,wait,mixed]){assert.equal(due(r.stage,now+HOUR,{}),false);assert.equal(due(r.stage,now+2*HOUR,{}),r!==mixed);}
  // Other source IDs retain their existing fallback and batch semantics.
  const {shopBatch}=require('./source_batch_metrics');
  assert.equal(shopBatch('hareruya2','{}'),null);
  assert.equal(shopBatch('torecacamp','{"torecacamp":{"detailFetched":7}}').acquiredCount,7);
  assert.equal(shopBatch('yuyutei','{"yuyutei":{"searched":3}}').acquiredCount,3);
  assert.equal(shopBatch('shopBuyback','missing receipt').acquiredCount,0);
  const summary={shops:{bank:{reviewStatus:'count-drop-review',lastSuccess:iso(-120),lastAttempt:iso(-24)}},cards:{}};
  for(const [i,age] of [145,125,170,50].entries()) summary.cards[i]={shops:{bank:{price:100,listingActive:true,matchConfidence:'high',observedAt:iso(-age)}}};
  const deadlines={formal:[{id:'one',dependencies:[{field:'buybackExitEvidence',shopId:'bank'}]}]};
  assert.equal(hold.warnings(summary,deadlines,now-1).length,1);
  const alerts=hold.warnings(summary,deadlines,now);
  assert.deepEqual([alerts[0].within24,alerts[0].within48,alerts[0].formalCount],[1,2,1]);
  assert.equal(alerts.length,2);assert.deepEqual(hold.warnings(summary,deadlines,now+HOUR).map(r=>r.key),alerts.map(r=>r.key));
  console.log('C1: 8 cases; C2: 4 scenarios x Watch/Daily. All collector responses are local fixtures.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
