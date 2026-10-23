const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const variants=require('./search_profile_variants');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'priority-search-profiles.json'))),before=JSON.stringify(config);
const profiles=variants.searchModeProfiles(config);
for(const profile of profiles){
  assert.equal(profile.reportName,variants.reportName(profile.id));
  const original=config.profiles.find(p=>p.id===profile.id.split('-')[0]);
  const actual=new URL(profile.url),expected=new URL(original.url);
  if(profile.id.includes('-median'))expected.searchParams.set('effBuy','median');
  if(profile.id.endsWith('-specified'))expected.searchParams.set('preset','specified');
  assert.equal(actual.href,expected.href);
}
assert.equal(JSON.stringify(config),before,'saved config is not migrated by a reporting rename');
assert.equal(variants.reportName('A'),'条件スタンダード');
assert.equal(variants.reportName('B-median'),'条件プライマリ（中央値）');
assert.equal(profiles.length,8);
console.log('PASS report-only profile names, immutable IDs, full URLs and saved conditions');
