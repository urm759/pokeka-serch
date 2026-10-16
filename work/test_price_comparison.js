const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const model=require('../decision-model'),metrics=require('../exploration-metrics'),integrity=require('../price-integrity');
const now=Date.parse('2026-10-16T02:44:00Z'),date=new Date(now).toISOString();
const row=(host,value,extra={})=>({source:host,url:'https://'+host+'/item',kind:'販売価格',value,updatedAt:date,valid:true,conditionAccepted:true,...extra});
const input=[row('hareruya2.com',21000),row('torecacamp-pokemon.com',24800),
  row('yuyu-tei.jp',29800,{updatedAt:'2026-09-06'}),row('toreca-souba.com',15000,{kind:'参考価格'})];
const agg=model.aggregatePrices(input,{asOfDate:date});
const legacy=JSON.stringify(agg);agg.comparison=model.comparablePriceEvidence(agg,{now});
assert.equal(agg.comparison.included.length,2);assert.equal(agg.comparison.conflicted,false);
assert(Math.abs(agg.comparison.spreadPct-3800/22900*100)<1e-8);
assert(agg.comparison.excluded.some(r=>r.comparisonReasons.some(s=>s.includes('古値'))));
assert(agg.comparison.excluded.some(r=>r.comparisonReasons.some(s=>s.includes('実売根拠'))));
const {comparison,...untouched}=agg;assert.equal(JSON.stringify(untouched),legacy,'historical aggregate and arithmetic are retained');
assert.equal(metrics.referenceMedian({priceAggregation:agg},now).value,22900);
for(const extra of [{updatedAt:null},{updatedAt:'2026-10-16'},{updatedAt:'2026-09-01'},{valid:false},{conditionAccepted:false},{languageAccepted:false},{quarantined:true}]) {
  const a={included:[row('hareruya2.com',10000),row('torecacamp-pokemon.com',30000,extra)]};
  const e=model.comparablePriceEvidence(a,{now});assert.equal(e.conflicted,false);assert.equal(e.excluded.length,1);
}
const conflict={included:[row('hareruya2.com',10000),row('torecacamp-pokemon.com',25000)]};
conflict.comparison=model.comparablePriceEvidence(conflict,{now});
assert.equal(conflict.comparison.conflicted,true,'genuine fresh disagreement is held on both sides');
assert.equal(metrics.referenceMedian({priceAggregation:conflict},now).value,null);
const single={included:[row('hareruya2.com',10000)],excluded:[row('empty.test',null)]};
single.comparison=model.comparablePriceEvidence(single,{now});
assert.equal(metrics.referenceMedian({priceAggregation:single},now).value,10000,'invalid empty sources do not turn the existing single-source reference policy into a new two-source requirement');
const dup=model.comparablePriceEvidence({included:[row('hareruya2.com',10000),row('www.hareruya2.com',50000)]},{now});
assert.equal(dup.included.length,1,'same shop is not independent corroboration');
const future=model.comparablePriceEvidence({included:[row('a.test',10000,{updatedAt:new Date(now+1).toISOString()})]},{now});assert.equal(future.included.length,0);
assert.equal(integrity.audit(1000,[row('a.test',10000),row('b.test',11000)],{now}).disputed,true,'extreme unverified reference remains a separate safety hold');
assert.equal(integrity.audit(1000,[row('a.test',10000),row('b.test',11000,{updatedAt:'2026-09-06'})],{now}).disputed,false);
const c=vm.createContext({window:{PurchaseDecisionModel:model},document:{getElementById:()=>null,querySelectorAll:()=>[]},console,URL,URLSearchParams,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('app.js','utf8').split('// Browser event bindings start here;')[0]+'\nglobalThis.api={numericTone,signedExpectedMoney};',c);
for(const [v,tone]of [[1,'positive'],[-1,'negative'],[0,'neutral'],[null,'value-unavailable'],[NaN,'value-unavailable']])assert.equal(c.api.numericTone(v),tone);
assert(c.api.signedExpectedMoney(1).text.startsWith('+'));assert(c.api.signedExpectedMoney(-1).text.startsWith('-'));
const luminance=hex=>{const rgb=hex.match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const css=fs.readFileSync('styles.css','utf8'),bg=luminance('10182e');
for(const [,name,hex]of css.matchAll(/--(value-[a-z]+):#([0-9a-f]{6})/g))assert((luminance(hex)+.05)/(bg+.05)>=4.5,name+' has readable dark-background contrast');
console.log('PASS fresh comparison vs stale/reference/identity, no arithmetic mutation, independent sources, real disagreement, zero/unknown colours');
