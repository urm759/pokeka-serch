const assert=require('node:assert/strict'),{resolve}=require('./gemrate_identity_match'),{key}=require('./gemrate_csv_import');
const context={grader:'PSA',language:'Japanese',set:'saved Japanese set',year:2021};
const rows=[{'Card #':'071',Name:'Full Art/Leafeon V',Parallel:'Base'},
 {'Card #':'070',Name:'Full Art/Leafeon V',Parallel:'Base'},
 {'Card #':'071',Name:'Full Art/Leafeon V',Parallel:'Missing Texture'}];
const cards=[{id:'sa',name:'リーフィアV SR: SA[S6a 071/069]',identityKey:'sa',language:'ja'},
 {id:'sr',name:'リーフィアV SR[S6a 070/069]',identityKey:'sr',language:'ja'}];
const english={sa:{englishName:'Leafeon V SR: SA[S6a 071/069]'},sr:{englishName:'Leafeon V SR[S6a 070/069]'}};
const options={setCode:'S6a',denominator:69,contextProof:'saved-page-hash',heldKeys:[key(rows[0],context)]};
const r=resolve(rows,context,cards,english,options);assert.equal(r.mappings.length,2);assert(r.mappings.find(r=>r.cardId==='sa').hold);assert.equal(r.review[0].reason,'special-parallel-unresolved');
assert.equal(resolve(rows,context,[...cards,{...cards[0],id:'duplicate'}],{...english,duplicate:english.sa},options).mappings.length,1);
for(const extra of [{language:'en'},{name:'リーフィアV SR: SA[S6a 071/070]'},{identityKey:null},{identityReviewRequired:true}])assert.equal(resolve([rows[0]],context,[{...cards[0],...extra}],english,options).mappings.length,0);
assert.equal(resolve([rows[0]],context,cards,{...english,sa:{englishName:'Glaceon V SR: SA[S6a 071/069]'}},options).mappings.length,0);
assert.throws(()=>resolve(rows,{...context,grader:'CGC'},cards,english,options));
const energy={id:'energy',name:'基本悪エネルギー UR[S6a 101/069]',identityKey:'energy',language:'ja'};
const energyEnglish={energy:{englishName:'Basic Darkness Energy UR[S6a 101/069]'}};
const energyRow={'Card #':'101',Name:'Darkness Energy',Parallel:'Ultra Rare'};
assert.equal(resolve([energyRow],context,[energy],energyEnglish,options).mappings.length,1);
for(const row of [{...energyRow,'Card #':'100'},{...energyRow,Parallel:'Missing Texture'},{...energyRow,Name:'Special Darkness Energy'}])
  assert.equal(resolve([row],context,[energy],energyEnglish,options).mappings.length,0);
assert.equal(resolve([energyRow],context,[{...energy,name:'別カード UR[S6a 101/069]'}],energyEnglish,options).mappings.length,0);
console.log('PASS GemRate exact Japanese set/number/name/finish, SA vs SR, duplicate candidates, foreign and persistent discrepancy hold');
