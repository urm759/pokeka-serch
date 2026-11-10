const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const variants=require('./search_profile_variants');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'priority-search-profiles.json'))),before=JSON.stringify(config);
const profiles=variants.searchModeProfiles(config);
for(const profile of profiles){
  assert.equal(profile.reportName,variants.reportName(profile.id));
  const original=[...config.profiles,...(config.additionalProfiles||[])].find(p=>p.id===profile.id.replace(/-specified$/,'').replace(/-median$/,'').replace(/-reference$/,''));
  const actual=new URL(profile.url),expected=new URL(original.url);
  if(profile.id.includes('-reference'))expected.searchParams.set('effBuy','reference-min');
  if(profile.id.includes('-median'))expected.searchParams.set('effBuy','median');
  if(profile.id.endsWith('-specified'))expected.searchParams.set('preset','specified');
  assert.equal(actual.href,expected.href);
}
assert.equal(JSON.stringify(config),before,'saved config is not migrated by a reporting rename');
assert.equal(variants.reportName('A'),'条件スタンダード');
assert.equal(variants.reportName('B-median'),'条件プライオリティ（中央値）');
assert.equal(profiles.length,4,'two formal real-store profiles in both existing search modes');
for(const p of variants.allProfiles(config).filter(p=>!p.basis||p.basis==='auto'))assert.equal(new URL(p.url).searchParams.get('effBuy'),'auto');
assert.equal(variants.reportName('V-auto-20261101'),'条件バリュー');
assert.equal(variants.searchModeProfiles(config,{includeHistorical:true}).length,24,'all previous URLs and median variants retained alongside new formal URLs');
console.log('PASS report-only profile names, immutable IDs, full URLs and saved conditions');
require('./test_focus_pop_priority');
const audit=require('./build_priority_search_targets'),migration={independentCandidates:{before:0,after:2,gained:['a','b'],lost:[],note:''}};audit.applyReferenceComparison(process.cwd(),migration,{comparisonRevision:'new'},{comparisonRevision:'old'},{referenceFocus:false});assert.equal(migration.independentCandidates.before,null);assert.deepEqual(migration.independentCandidates.gained,[]);assert.deepEqual(migration.independentCandidates.baselineIds,['a','b']);console.log('PASS new URL baseline cannot become data-completion gains');
