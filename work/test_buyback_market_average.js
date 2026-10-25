const assert=require('node:assert/strict'),m=require('../exploration-metrics');
const now=Date.parse('2026-10-25T12:00:00Z'),at=new Date(now).toISOString(),date='2026-10-25';
const packet=offers=>({cards:{card:Object.fromEntries(offers.map(o=>[o.id,{identity:'ja-print'}]))},
  support:{timingPolicy:{maxSkewHours:6},shops:Object.fromEntries(offers.map(o=>[o.id,{name:o.id,fulfilment:o.method||'mail',merchantId:o.merchant||o.id,stopped:o.stopped,permission:o.permission}])),
    cards:{card:Object.fromEntries(offers.map(o=>[o.id,{current:[o.price/10000,o.price,10000,o.at||at,at,date,true,date,0]}]))}}});
const calc=(offers,mode='all',selected=[])=>m.buybackSupport(packet(offers),'card',mode,selected,now,10000,'ja-print');
let value=calc([{id:'a',price:9000},{id:'b',price:11000}]);
assert.equal(value.highestQuote.ratio,1.1);assert.equal(value.mean,1);assert.equal(value.meanCount,2);assert(!value.meanReference);
value=calc([{id:'a-store',merchant:'a',method:'store',price:11000},{id:'a-mail',merchant:'a',price:9000},{id:'b',price:10000}]);
assert.equal(value.mean,1.05);assert.equal(value.meanCount,2);assert.equal(value.highestQuote.ratio,1.1);
assert.equal(value.median,.95,'the existing conservative merchant median is retained for old evaluation/sorting');
assert.equal(calc([{id:'a-store',merchant:'a',method:'store',price:11000},{id:'a-mail',merchant:'a',price:9000}],'mail').mean,.9);
value=calc([{id:'a',price:11000},{id:'b',price:9000}],'selected',['a']);
assert.equal(value.mean,1.1);assert.equal(value.meanCount,1);assert(value.meanReference);
value=calc([{id:'a',price:20000},{id:'b',price:10000}]);assert.equal(value.mean,1.5,'a high verified offer is not trimmed');
value=calc([{id:'a',price:9000,at:'2026-10-22T12:00:00Z'},{id:'b',price:11000,stopped:true},{id:'c',price:12000,permission:'retired'},{id:'d',price:0}]);
assert.equal(value.mean,null);assert.equal(value.meanCount,0);assert(value.rows.every(r=>r.reason));
const wrong=packet([{id:'a',price:10000}]);wrong.cards.card.a.identity='different-print';
assert.equal(m.buybackSupport(wrong,'card','all',[],now,10000,'ja-print').mean,null);
assert.match(m.buybackSupport(wrong,'card','all',[],now,10000,'ja-print').rows[0].reason,/仕様/);
const skew=packet([{id:'a',price:10000}]);skew.support.cards.card.a.current[4]='2026-10-25T05:00:00Z';
assert.equal(m.buybackSupport(skew,'card','all',[],now,10000,'ja-print').mean,null);
assert.equal(calc([]).mean,null);
console.log('PASS highest / across-shop arithmetic mean: channels, merchant dedupe, raw offers, single/null/stale/held, no outlier trimming or finance changes');
