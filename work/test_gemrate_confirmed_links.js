const assert=require('node:assert/strict'),links=require('./gemrate_confirmed_links'),csv=require('./gemrate_csv_import');
const c={id:'a',name:'ミュウex SAR[SV2a 205/165]',language:'ja',rarity:'SAR',identityKey:'ja|sv2a|205|sar'},english={a:{englishName:'Mew ex SAR[SV2a 205/165]',fetchedAt:'2026-10-01'}};
const context={grader:'PSA',language:'Japanese',set:'Japanese 151',year:2023},row={'Card #':'205',Name:'Mew EX',Parallel:'Special Art Rare',Gems:'8',Total:'10'};
const s={setCode:'SV2A',set:context.set,year:context.year,automaticReference:{rule:links.RULE,parallels:['Special Art Rare','Base']}},opts={setCode:'SV2A',denominator:165,contextProof:'original-proof',parallels:s.automaticReference.parallels};
const registry={version:1,rule:links.RULE,links:{}};
let first=links.resolve([row],context,[c],english,opts,registry);assert.equal(first.added,1);assert.equal(first.reused,0);
const key=csv.key(row,context),before=JSON.stringify(registry.links[key]);
let next=links.resolve([{...row,Gems:'9',Total:'11'}],context,[c],english,opts,registry);
assert.equal(next.added,0);assert.equal(next.reused,1);assert.equal(JSON.stringify(registry.links[key]),before,'counts/receipt times never change identity evidence');
assert(links.authorized({identity:key},c,s,registry,english));
for(const change of [{identityKey:'changed'},{language:'en'},{identityReviewRequired:true},{name:'ミュウex SAR[SV2a 206/165]'}]){
 const changed={...c,...change},result=links.resolve([row],context,[changed],english,opts,registry);
 assert.equal(result.mappings.length,0);assert.equal(result.review[0].reason,'confirmed-identity-changed');assert(!links.authorized({identity:key},changed,s,registry,english));
}
const held=links.resolve([row],context,[c],english,{...opts,heldKeys:[key]},registry);assert.equal(held.mappings[0].hold,true);
assert.equal(links.resolve([{...row,Parallel:'Special Art Rare-Missing Texture'}],context,[c],english,opts,registry).mappings.length,0);
assert.equal(links.resolve([{...row,Parallel:'Base'}],context,[c],english,opts,registry).mappings.length,0,'SAR is not a base finish');
const same=links.revision(s,[c],english,[]);assert.equal(links.revision(s,[c,{id:'other',name:'別[SM9 001/095]'}],{...english,a:{...english.a,fetchedAt:'2026-11-02'}},[]),same,'unrelated card and fetch date do not trigger whole inbox replay');
for(const variant of ['mirror','master-ball-mirror','metal','error','sar-style']){
 const changed={...c,variant};assert(!links.authorized({identity:key},changed,s,registry,english));
 assert.equal(require('./gemrate_identity_match').resolve([row],context,[changed],english,opts).mappings.length,0,'unknown processing cannot be matched from ordinary English name');
}
assert.notEqual(links.revision(s,[{...c,identityKey:'changed'}],english,[]),same);
console.log('PASS persistent exact identity reuse, count refresh, specification change hold, unresolved finish, source discrepancy and scoped replay');
