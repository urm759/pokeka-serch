const assert=require('node:assert/strict'),m=require('../exploration-metrics');
const now=Date.parse('2026-10-25T15:00:00Z'),at=new Date(now).toISOString(),date='2026-10-26';
const shops={a:{name:'A',merchantId:'a',fulfilment:'store'},am:{name:'A郵送',merchantId:'a',fulfilment:'mail'},
  b:{name:'B',fulfilment:'mail'},c:{name:'C',fulfilment:'mail'},d:{name:'D',stopped:true},e:{name:'撤廃',permission:'retired'}};
const point=(ratio,stamp=at)=>({current:[ratio,ratio*10000,10000,stamp,at,date,true,date,0]});
const summary={cards:{x:{a:{identity:'ja'},am:{identity:'ja'},b:{identity:'ja'}}},support:{shops,cards:{x:{a:point(1.1),am:point(.9),b:point(1)}}}};
const source={cards:{x:{shops:{a:{listingActive:true,observedAt:at},am:{listingActive:true,observedAt:at},b:{listingActive:true,observedAt:at},c:{listingActive:true,observedAt:at}}}}};
for(const [shop,q]of Object.entries(source.cards.x.shops)){q.priceDate=date;if(summary.support.cards.x[shop])q.price=summary.support.cards.x[shop].current[1];}
const run=(mode='all',selected=[],s=summary,t=now)=>m.buybackSupport(s,'x',mode,selected,t,10000,'ja',source);
let x=run();assert.equal(x.coverage.target,4);assert.equal(x.coverage.comparable,2);assert.equal(x.coverage.above,2);
assert.equal(x.coverage.listed,3,'fresh listing can exist without aligned ratio evidence');assert.equal(x.mean,1.05);
assert(x.coverage.rows.find(r=>r.merchant==='c').channels[0].reason.includes('掲載確認済み'));
assert(x.coverage.rows.find(r=>r.merchant==='d').channels[0].reason.includes('停止'));
x=run('mail');assert.equal(x.coverage.target,4);assert.equal(x.coverage.above,1);assert.equal(x.mean,.95);
x=run('selected',['a','am']);assert.equal(x.coverage.target,1);assert.equal(x.coverage.comparable,1);assert.equal(x.mean,1.1);
const stale=structuredClone(summary);stale.support.cards.x.b=point(1,'2026-10-22T00:00:00Z');
x=run('all',[],stale);assert.equal(x.coverage.comparable,1);assert.equal(x.coverage.target,4);assert.equal(x.mean,1.1,'unusable quotes do not become zero');
x=run('all',[],summary,now+48*3600000+1);assert.equal(x.coverage.comparable,0);assert.equal(x.coverage.listed,0);assert.equal(x.mean,null);
assert.equal(m.buybackSupport(null,'x','all').coverage.target,null,'load failure is not zero target stores');
for(const [ratio,tone]of [[null,'unknown'],[0,'unknown'],[.899999,'low-strong'],[.9,'low'],[.9799999,'low'],[.98,'neutral'],[1,'neutral'],[1.02,'neutral'],[1.02000001,'high'],[1.099999,'high'],[1.1,'high-strong']])
  assert.equal(m.buybackRatioTone(ratio).className,'ratio-'+tone,'unrounded shared colour boundary '+ratio);
console.log('PASS store denominator / listing versus ratio / merchant selection / expiry / unknown / common unrounded colour boundaries');
