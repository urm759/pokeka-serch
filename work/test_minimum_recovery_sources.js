const assert=require('node:assert/strict'),{minimalMedian,prospectPlan,requestForSource}=require('./profile_completion_routes');
const now=Date.parse('2026-10-24T00:00:00Z');
const fresh={origin:'hareruya2.com',url:'https://www.hareruya2.com/products/one',fresh:true};
const old={url:'https://torecacamp-pokemon.com/products/one',observedAt:'2026-10-20T00:00:00Z',reason:'古値・日時不明・参考中央値不採用'};
assert.deepEqual(minimalMedian({rows:[fresh],omitted:[old,old]}).targets.map(t=>t.source),['torecacamp']);
assert(!minimalMedian({rows:[],omitted:[old,old]}).automatic,'one shop is not two independent sources');
assert(!minimalMedian({rows:[fresh],omitted:[{...old,reason:'仕様不一致'}]}).automatic);
assert(!minimalMedian({rows:[fresh],omitted:[{...old,url:'not-a-url'}]}).automatic);
const plan=prospectPlan({hareruya2Url:fresh.url,torecacampUrl:old.url},['shopStateA'],{repairTargets:[{field:'shopStateA',source:'torecacamp',url:old.url}]}).requirements[0];
assert.deepEqual(plan.targets.map(t=>t.source),['torecacamp']);
assert(!requestForSource({sourceTargets:plan.targets},'hareruya2'));assert(requestForSource({sourceTargets:plan.targets},'torecacamp'));
assert(!prospectPlan({},['shopStateA'],{repairTargets:[{field:'shopStateA',source:'cardrush',url:'https://www.cardrush-pokemon.jp/product/one'}]}).requirements[0].automatic,'stopped sources are not silently replaced');
const inspect=require('./profile_departure_audit').inspect,meta={settingsHash:'one',codeHash:'one',at:'2026-10-24T00:00:00Z'};
const before={purchase:{price:100,priceObservedAt:'2026-10-20T00:00:00Z',inventoryObservedAt:'2026-10-20T00:00:00Z',fresh:true,url:old.url},sourceQuotes:{torecacamp:{price:100,priceObservedAt:'2026-10-20T00:00:00Z',inventoryObservedAt:'2026-10-20T00:00:00Z'}}};
const after={...before,purchase:{price:200,fresh:true},efficiency:{annual:10},psa9:{ratio:80,reasons:[]},exclusions:['単体年換算資金効率条件']};
const audit=inspect(before,after,{before:{...meta,at:'2026-10-21T00:00:00Z'},after:meta});
assert.deepEqual(audit.repair.sourceTargets.map(r=>r.source),['torecacamp'],'an expired cheap offer must be checked at its original store');
const fallbackRatio=inspect(before,{...after,psa9:{ratio:180,reasons:[]},exclusions:['国内PSA9比率']},{before:{...meta,at:'2026-10-21T00:00:00Z'},after:meta});
assert(fallbackRatio.repair.fields.includes('shopStateA'),'PSA9 ratio based on a replacement buy price is not an independent reason to abandon the expired original offer');
assert.deepEqual(inspect({...before,sourceQuotes:{}},{...after,sourceQuotes:{}},{before:meta,after:meta}).repair.fields,[],'confirmed non-data failure is not a missing-price acquisition');
const q=require('./priority_price_queue').plan({sourceId:'hareruya2',now,cards:[{id:'one',hareruya2Url:fresh.url}],fixedIds:['one'],
 catalog:[{cardId:'one',observedAt:new Date(now-3600000).toISOString(),priceObservedAt:new Date(now-3600000).toISOString(),inventoryObservedAt:new Date(now-8*3600000).toISOString()}]});
assert(q.queue[0]?.due,'a newly confirmed price cannot hide an old inventory timestamp');
const unknown=require('./priority_price_queue').plan({sourceId:'hareruya2',now,cards:[{id:'one',hareruya2Url:fresh.url}],fixedIds:['one'],
 catalog:[{cardId:'one',observedAt:new Date(now-3600000).toISOString(),priceObservedAt:null,inventoryObservedAt:new Date(now-3600000).toISOString()}]});
assert.equal(unknown.records[0].lastSuccessAt,null);
console.log('PASS minimum independent refresh, original source routing, known failures, earliest price/stock timestamp');
