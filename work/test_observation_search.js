const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const m = require('../exploration-metrics'), controls = require('../search-controls');
const summary = {asOf:'2026-10-13',minimumObservationDays:{7:5,30:15,90:45,200:200},
  cards:{fixture:[100,7,100,30,0,100,90,0,0,100,200,0,0]}};
const card = {id:'fixture',psa10:80};
const filter = s=>m.observationExclusions(summary,card,s);
assert.deepEqual(filter({}),[]);
assert.deepEqual(filter({observation7Min:-20,observation7Max:0}),[]);
assert.deepEqual(filter({observation7Min:-19.999999999,observation7Max:0}),['7日観測乖離率条件']);
assert.deepEqual(filter({observation7Min:-20,observation30Min:0}),['30日観測乖離率条件']);
assert.match(filter({observation200Min:1,observation200Max:0})[0],/下限＞上限/);
assert.deepEqual(m.observationExclusions(summary,{...card,psa10:100},{observation200Min:0,observation200Max:0}),[]);
assert(m.observation(summary,card.id,120,7).delta > 0);
assert.equal(m.observation(summary,card.id,0,7).delta,null);
assert.equal(m.observation(null,card.id,100,7).delta,null);
const sparse = {...summary,cards:{fixture:[100,2,null,null,null,null,null,null,null,100,3,4,1]}};
assert.equal(m.observation(sparse,card.id,80,200).reference,true);
assert.equal(m.observation(sparse,card.id,80,200).stale,true);
assert.deepEqual(m.observationExclusions(sparse,card,{observation200Max:0,observationIncludeReference:true}),[]);
assert.match(m.observationExclusions(sparse,card,{observation200Max:0,observationIncludeReference:false})[0],/参考値を対象外/);
assert.deepEqual(m.observationExclusions(sparse,card,{observation7Max:0}),[],'missing disabled periods do not exclude');
assert.match(m.observationExclusions(sparse,card,{observation30Max:0})[0],/未取得/);
for (const id of ['observation7MinInput','observation200MaxInput']) {
  const el={id,type:'number',value:'0'};assert(controls.active(el));assert(controls.clear(el));assert.equal(el.value,'');
  assert(controls.applicable(id,{purchaseMode:'current-market'}));
}
assert(controls.active({id:'observationIncludeReferenceInput',checked:false,type:'checkbox'}));
assert(!controls.clear({id:'observationIncludeReferenceInput',checked:false,type:'checkbox'}),'bulk additional clear preserves reference adoption');
const source=fs.readFileSync('app.js','utf8'),elements=new Map(),storage=new Map();
const context=vm.createContext({window:{PurchaseDecisionModel:require('../decision-model'),ExplorationMetrics:m,location:{href:'https://example.test/?obs7Min=-20&obs7Max=0&obsRef=0'}},
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false});return elements.get(id)},querySelectorAll:()=>[]},
  URL,URLSearchParams,console,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
vm.runInContext(source.split('// Browser event bindings start here;')[0]+'\nglobalThis.api={state,readUrl,buildShareUrl,saveQuickFilters,restoreQuickFilters,psa10PeriodCompact};',context);
const api=context.api;api.readUrl();
assert.equal(elements.get('observation7MinInput').value,-20);assert.equal(elements.get('observation7MaxInput').value,0);
assert.equal(elements.get('observationIncludeReferenceInput').checked,false);
Object.assign(api.state,{observation7Min:-20,observation7Max:0,observationIncludeReference:false,psa10PeriodSummary:sparse});
let url=api.buildShareUrl();assert.equal(url.searchParams.get('obs7Min'),'-20');assert.equal(url.searchParams.get('obs7Max'),'0');assert.equal(url.searchParams.get('obsRef'),'0');
api.state.observation7Max=null;assert.equal(api.buildShareUrl().searchParams.get('obs7Max'),'off','explicit clearing must override another browser saved value');api.state.observation7Max=0;
api.saveQuickFilters();context.window.location.href='https://example.test/';elements.get('observation7MinInput').value='';api.restoreQuickFilters();
assert.equal(elements.get('observation7MinInput').value,-20);assert.equal(elements.get('observationIncludeReferenceInput').checked,false);
assert.match(api.psa10PeriodCompact(card),/参考・観測不足/);assert.match(api.psa10PeriodCompact(card),/古い観測/);
assert(source.indexOf('${psa10PeriodCompact(card)}') < source.indexOf('class="card-details-body"'),'summary is visible outside deferred details');
assert.match(source,/rows\[index\+1\]\.push\(o.mean \?\? '',o.delta/,'CSV uses the same unrounded metrics');
console.log('PASS observation display/search/CSV, inclusive zero/sign/AND/null/reference, invalid bounds and saved URL');
