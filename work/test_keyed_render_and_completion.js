const assert = require('node:assert/strict');
const fs = require('node:fs');
const {create} = require('../keyed-card-renderer');
const {plan} = require('./priority_price_queue');
const {classify} = require('./build_one_item_completion_audit');
let parses = 0;
const container = {children:[],get firstElementChild(){return this.children[0] || null;},
  insertBefore(node,cursor){node.remove();const at=cursor?this.children.indexOf(cursor):this.children.length;
    this.children.splice(at,0,node);node.parentNode=this;}};
const commit = create(html=>{parses++;return {html,parentNode:null,
  get nextElementSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1] || null;},
  remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}};});
const rows = [{id:'one',html:'closed warnings preserved'},{id:'two',html:'same'}];
assert.equal(commit(container,rows).changed.length,2);
const first=container.children[0];first.listener={retained:true};
assert.equal(commit(container,rows).reused,2);
assert.equal(parses,2,'unchanged cards must not be parsed again');
assert.strictEqual(container.children[0],first);
assert(first.listener.retained);
assert.equal(commit(container,rows.slice().reverse()).reused,2);
assert.strictEqual(container.children[1],first,'sorting moves nodes without losing listeners');
assert.equal(commit(container,[{...rows[0],html:'open detail'},rows[1]]).changed.length,1);
assert.equal(parses,3,'opening one detail must not recreate the other card');
assert.deepEqual(container.children.map(n=>n.html),['open detail','same']);
assert.throws(()=>commit(container,[rows[0],rows[0]]),/Duplicate/);
assert.deepEqual(container.children.map(n=>n.html),['open detail','same']);
commit(container,[]);assert.equal(container.children.length,0);
const now=Date.parse('2026-10-10T12:00:00Z');
const cards=Array.from({length:5},(_,i)=>({id:String(i),hareruya2Url:'https://example.test/'+i}));
const selection=plan({cards,sourceId:'hareruya2',catalog:cards.map(c=>({cardId:c.id,observedAt:'2026-08-01T05:00:00Z'})),
  candidateRows:{'0':{}},fixedIds:['1','2'],now});
assert.equal(selection.records[1].important,true,'fixed group remains six-hour priority even after leaving candidates');
assert.equal(selection.records[1].due,true);
assert.equal(selection.queue[3].important,false,'ordinary share is preserved');
assert(!plan({cards,sourceId:'hareruya2',catalog:[],fixedIds:['1'],manualWait:{'1':{url:cards[1].hareruya2Url}},now}).queue.some(r=>r.card.id==='1'));
assert.match(classify({m:['psaOfficial'],i:{}},{status:'unlinked',sourceSetUrl:'https://www.psacard.com/pop/real'}),/PC正規セット/);
assert.match(classify({m:['psaOfficial'],i:{}},{status:'ambiguous'}),/曖昧/);
assert.match(classify({m:['domesticPrice'],i:{domesticPrice:['再試行待ち',null,null,1,'価格対立']}}),/店舗価格だけでは解除しない/);
const app=fs.readFileSync('app.js','utf8');
assert.match(app,/committed.changed.flatMap/);
assert.match(app,/changedCards:committed.changed.length/);
assert.doesNotMatch(app,/els.grid.innerHTML = visibleCards/);
console.log('keyed DOM identity, warnings, detail isolation, fixed cohort deadlines and field-specific routing: passed');
