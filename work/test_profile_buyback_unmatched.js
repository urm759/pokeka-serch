const assert=require('node:assert/strict'),{inspect,serial}=require('./audit_profile_buyback_unmatched');
const card={name:'ピカチュウ SR [SV1 001/100]',model:'001/100',setCode:'SV1',language:'ja'};
assert.equal(serial('001/100'),'1/100');assert(inspect({name:'ピカチュウ SR [SV1 001/100]'},card).complete);
for(const name of ['ピカチュウ SR [SV1 002/100]','ピカチュウ SR [SV2 001/100]','ピカチュウ SAR [SV1 001/100]','ピカチュウ SR マスターボールミラー [SV1 001/100]','ピカチュウ SR 英語版 [SV1 001/100]','ピカチュウ [SV1 001/100]'])assert(!inspect({name},card).complete,name);
assert(!inspect({name:'ピカチュウ SR [SV1 001/100]',strictIdentity:true,mismatchReason:'source-held'},card).complete);
assert(!inspect({name:'ピカチュウ SR(SA) [SV1 001/100]'},card).complete,'unknown alternate artwork is not an exact match');
console.log('PASS buyback unmatched: exact set/number/name/rarity/language/specification, original holds preserved');
