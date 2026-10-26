const assert=require('node:assert/strict');
const m=require('./build_psa_history');
for(const no of ['61','85','90'])assert(m.namesCompatible("Lt. Surge's Transaction",{set:'M1L',no,name:"LT. Surge's Deal | Super Rare |"}));
for(const row of [{set:'M1S',no:'85',name:"LT. Surge's Deal"},{set:'M1L',no:'86',name:"LT. Surge's Deal"},{set:'M1L',no:'85',name:"Lt. Surge's Strategy"}])assert(!m.namesCompatible("Lt. Surge's Transaction",row));
assert(m.namesCompatible("Boss’s Orders Ghetsis SAR[SV1a 100/073]",{set:'SV1A',no:'100',name:"Boss's Orders | Special Art Rare |"}));
assert(!m.namesCompatible("Boss’s Orders Ghetsis",{set:'SV1A',no:'99',name:"Boss's Orders"}));
assert(!m.namesCompatible("Boss’s Orders Cyrus",{set:'SV1A',no:'100',name:"Boss's Orders"}));
assert(!m.variantsCompatible('Nのゾロアークex エラー版','Incorrect Texture',{name:'N Zoroark ex Ultra Rare',set:'SV9'}));
console.log('PASS scoped official trainer-name equivalence; unrelated set, number, character and texture stay distinct');
