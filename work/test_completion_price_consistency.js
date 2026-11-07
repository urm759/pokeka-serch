const assert=require('node:assert/strict'),{mismatches}=require('./completion_price_consistency');
const cards=[{id:'disputed',price:5800},{id:'normal',price:1000},{id:'missing',price:0},{id:'unbacked',price:2000}];
const ready={i:{domesticPrice:'取得済み'}},wait={i:{domesticPrice:'再試行待ち'}},none={i:{domesticPrice:'取得元にデータなし'}};
const completion={cards:{disputed:ready,normal:ready,missing:none,unbacked:wait}},audit={cards:[{id:'disputed'}]},evidence={cards:{unbacked:{status:'unbacked'}}};
assert.deepEqual(mismatches(cards,completion,audit,evidence),['disputed'],'a newer audit must not leave an older ready classification');
completion.cards.disputed=wait;assert.deepEqual(mismatches(cards,completion,audit,evidence),[]);
assert.deepEqual(mismatches(cards,completion,{cards:[]},evidence),['disputed'],'a genuinely resolved audit also needs reclassification');
assert.deepEqual(mismatches([{id:'new',price:100}],completion,audit,evidence),['new']);
console.log('PASS source/price-audit/completion consistency, zero vs valid price, unbacked hold, and both directions of audit change');
