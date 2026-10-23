const assert = require('node:assert/strict');
const { parseCsv, importCsv, key, count } = require('./gemrate_csv_import');
// Deliberately synthetic counts/names: these fixtures are not acquired POP.
const context = { grader:'PSA', language:'Japanese', set:'Synthetic Set', year:2021,
  sourceUpdatedDate:'2026-10-22', retrievedAt:'2026-10-23T12:00:00Z',
  pageUrl:'https://www.gemrate.com/item-details?grader=psa&category=tcg-cards&set_name=Synthetic+Set&year=2021', contextProof:'synthetic-page-proof' };
const header='Trend,Card #,Name,Parallel,Gems,Total,Gem Rate\r\n';
const line='trend,077,"Synthetic, V",Base,10,20,50%\r\n';
const row={'Card #':'077',Name:'Synthetic, V',Parallel:'Base'};
const mapping={key:key(row,context),cardId:'test-1',identityKey:'exact-jp-spec',specEvidence:'synthetic-exact-spec'};
const run=(csv=header+line, ctx=context, maps=[mapping], prev=[])=>importCsv(csv,ctx,maps,prev);
const first=run(); assert.equal(first.accepted.length,1);
assert.equal(first.accepted[0].sourceUpdatedDate,'2026-10-22');
assert.equal(first.accepted[0].officialObservedAt,null);
assert.equal(first.accepted[0].populationDelta,null);
assert.equal(first.accepted[0].gemratePsa10Rate,0.5);
assert.equal(first.accepted[0].publicationAllowed,false);
assert.equal(run(header+line+line).duplicates.length,1);
assert.equal(run(undefined,undefined,undefined,first.accepted).accepted.length,0);
assert.equal(run(header+line+line.replace(',10,20,',',11,20,')).accepted.length,0);
assert.equal(run(header+line.replace(',10,20,',',21,20,')).quarantined[0].reason,'invalid-count');
assert.equal(run(header+line.replace(',10,20,',',,20,')).accepted.length,0);
assert.equal(run(header+line.replace(',10,20,',',0,20,')).accepted[0].psa10,0);
assert.equal(run(header+line.replace(',10,20,',',0,0,')).accepted.length,0);
const aliasLine=line.replace('"Synthetic, V"','"Synthetic Alias, V"');
const alias={...mapping,key:key({...row,Name:'Synthetic Alias, V'},context)};
assert.equal(run(header+line+aliasLine,context,[mapping,alias]).accepted.length,1);
assert.equal(run(undefined,{...context,sourceUpdatedDate:'2026-10-23'},undefined,first.accepted).accepted.length,1);
const official=[{...first.accepted[0],source:'PSA official',psa10:9}];
const officialBefore=JSON.stringify(official);
assert.equal(run(undefined,undefined,undefined,official).accepted[0].populationDelta,null);
assert.equal(JSON.stringify(official),officialBefore);
assert.equal(run(undefined,undefined,[{...mapping,hold:true}]).quarantined[0].reason,'source-discrepancy-hold');
assert.equal(run(undefined,undefined,[mapping,mapping]).accepted.length,0);
assert.equal(run(header+line.replace(',Base,',',Holo,')).accepted.length,0);
assert.equal(run(undefined,undefined,[{...mapping,specEvidence:null}]).accepted.length,0);
for(const patch of [{grader:'CGC'},{language:'English'},{sourceUpdatedDate:null},
  {sourceUpdatedDate:'2026-11-01'},{contextProof:null},{retrievedAt:'2026-10-23'},
  {pageUrl:context.pageUrl.replace('grader=psa','grader=cgc')},
  {pageUrl:context.pageUrl.replace('www.gemrate.com','untrusted.example')}]) assert.throws(()=>run(undefined,{...context,...patch}));
assert.equal(count('0'),0); assert.equal(count('1,234'),1234);
assert.equal(count(''),null); assert.equal(count('-1'),null); assert.equal(count('1,23'),null);
assert.deepEqual(parseCsv('\uFEFFa,b\r\n"a""b","x\ny"'),[['a','b'],['a"b','x\ny']]);
assert.throws(()=>parseCsv('a,"broken'));
assert.throws(()=>run('Card #,Name,Parallel,Gems,Gems\n'));
console.log('PASS synthetic GemRate CSV: exact identity, PSA-only context, original day, dedupe, conflict quarantine, no public/official mutation');
