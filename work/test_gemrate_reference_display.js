const assert=require('node:assert/strict'),{reference,render}=require('./gemrate_reference_display');
const card={id:'fixture',identityKey:'ja|S6A|071|SA',official:{rate:70,ten:7,total:10,f:'2026-10-01T01:00:00Z'},
  buyLimits:{clean:{assumptions:{hitRate:.7,hitRateSource:'PSA公式取得率'}}}};
const row={source:'GemRate',grader:'PSA',cardId:card.id,identityKey:card.identityKey,psa10:8,total:10,
  sourceUpdatedDate:'2026-10-23',identity:JSON.stringify(['Japanese','set',2021,'071','Leafeon V','Base']),
  specEvidence:'exact',contextProof:'page-hash',csvSha256:'original-hash',pageUrl:'https://www.gemrate.com/item-details'};
const options={audience:'private-preview',now:Date.parse('2026-10-24T00:00:00Z')};
const frozen=JSON.stringify({card,row});
assert.equal(reference(card,row,options).rate,80);
assert.equal(reference(card,{...row,gemratePsa10Rate:.1},options).rate,80,'derive rate from PSA-only counts, never a cached Gems rate');
assert.equal(reference(card,{...row,psa10:0},options).rate,0,'observed zero is valid');
for(const patch of [{grader:'CGC'},{total:0},{psa10:11},{psa10:null},{hold:true},{quarantined:true},
  {identityKey:'other'},{sourceUpdatedDate:null},{sourceUpdatedDate:'2026-10-25'},{sourceUpdatedDate:'2026-02-30'},
  {identity:JSON.stringify(['English'])},{specEvidence:null}])assert.equal(reference(card,{...row,...patch},options).available,false);
assert.equal(reference(card,row,{now:options.now}).available,false);
assert.equal(reference(card,{...row,publicationAllowed:true},{now:options.now}).available,false,'import flag cannot authorize public republication');
assert.equal(reference(card,row,{...options,now:Date.parse('2026-11-24T00:00:00Z')}).stale,true);
assert.equal(reference(card,null,options).available,false);
const html=render(card,row,options);
assert(html.includes('PSA10率（GemRate集計）')&&html.includes('80.0%')&&html.includes('70.0%')&&html.includes(card.official.f));
assert(!render(card,row).includes('80.0%'),'unapproved display has no GemRate counts or rate');
assert.equal(JSON.stringify({card,row}),frozen,'display projection does not mutate official history or calculation assumptions');
console.log('PASS display-only GemRate rates, PSA denominator, exact identity/date, persistent holds, public denial, old official detail and immutable adopted rate');
