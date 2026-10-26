const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const text=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const source=text.slice(text.indexOf('let gemRateReferenceRevision='),text.indexOf('function gradeRateSummary('));
const state={psaSpecificationHeld:{}},manifest={revision:'first',referenceDisplayIds:Array.from({length:50},(_,i)=>'id-'+i)};
let payload=null,calls=0;
const ctx={state,uiDataManifest:manifest,Date,URL,Set,Map,Number,Array,Object,fmt:new Intl.NumberFormat('ja-JP'),escapeHtml:s=>String(s),
  fetchJsonMaybe:async()=>{calls++;return payload;},document:{querySelectorAll:()=>[]}};
vm.createContext(ctx);vm.runInContext(source+';globalThis.api={value:gemRateReferenceValue,header:gemRateReferenceHeader,ensure:ensureGemRateReference};',ctx);
const card={id:'id-0',identityKey:'exact',official:{rate:50,ten:1,total:2,f:'2026-10-01'},buyLimits:{hitRate:.5}};
const row=['exact',8,10,'2026-10-23','https://www.gemrate.com/item-details?grader=psa'];
const before=JSON.stringify(card),now=Date.parse('2026-10-26T00:00:00Z');
assert.equal(ctx.api.value(card,row,now).rate,80);
assert.equal(ctx.api.value(card,['exact',0,10,row[3],row[4]],now).rate,0);
for(const patch of [['other',8,10,row[3],row[4]],['exact',8,0,row[3],row[4]],['exact',11,10,row[3],row[4]],
  ['exact',null,10,row[3],row[4]],['exact',8,10,'2026-02-30',row[4]],['exact',8,10,'2099-01-01',row[4]],
  ['exact',8,10,row[3],'https://example.com/'],['exact',8,10,row[3],'https://www.gemrate.com/item-details?grader=cgc']])assert.equal(ctx.api.value(card,patch,now),null);
assert.equal(ctx.api.value({...card,identityReviewRequired:true},row,now),null);
state.psaSpecificationHeld[card.id]={reason:'hold'};assert.equal(ctx.api.value(card,row,now),null);delete state.psaSpecificationHeld[card.id];
assert.equal(ctx.api.value(card,row,Date.parse('2026-11-26')).stale,true);
(async()=>{
  await ctx.api.ensure([{id:'not-in-scope'}]);assert.equal(calls,0,'no reference download for unrelated visible cards');
  await ctx.api.ensure([card]);assert.equal(calls,1);assert.equal(ctx.api.header(card),null,'null loader result is failure, never a successful empty summary');
  await ctx.api.ensure([card]);assert.equal(calls,1,'no per-search retry loop');
  payload={version:1,source:'GemRate',grader:'PSA',scope:'received-csv-reference-50',cards:Object.fromEntries(manifest.referenceDisplayIds.map(id=>[id,row]))};
  manifest.revision='second';await ctx.api.ensure([card]);assert.equal(calls,2);
  assert(ctx.api.header(card).includes('PSA10率（GemRate集計）'));
  assert(ctx.api.header(card).includes('80.0%'));assert(ctx.api.header(card).includes('50.0%'),'old official retained in details');
  manifest.revision='third';assert.equal(ctx.api.header(card),null,'no stale revision flash before the next load');
  payload={...payload,grader:'CGC'};await ctx.api.ensure([card]);assert.equal(ctx.api.header(card),null);
  assert.equal(JSON.stringify(card),before,'display must not mutate rate, POP history, calculation or GO inputs');
  const exported=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/gemrate-reference-summary.json')));
  assert.equal(Object.keys(exported.cards).length,50);assert.deepEqual(Object.keys(exported).sort(),['cards','fields','grader','scope','source','version']);
  for(const r of Object.values(exported.cards)){assert.equal(r.length,5);assert(!JSON.stringify(r).includes('csvSha256'));}
  console.log('PASS bounded 50 factual references; exact identity/count/date, load failures, lazy reuse, revision invalidation, immutable calculations and no raw export');
})().catch(e=>{console.error(e);process.exitCode=1});
