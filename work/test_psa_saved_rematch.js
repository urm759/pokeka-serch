const assert = require('node:assert/strict');
const b = require('./build_psa_history');
const { needed } = require('./reconcile_saved_psa_summary');
const card = { id: 'target', name: 'ニンフィアV CSR[S8b 231/184]' };
const empty = new Map();
assert.equal(b.resolvedEnglishName(card, 'Sylveon CSR[S8b 231/184]', empty).name, 'Sylveon V');
assert.equal(b.resolvedEnglishName({ name: 'リーフィアVSTAR SAR[S12a 210/172]' }, 'Leafeon VSATR SAR[S12a 210/172]', empty).name, 'Leafeon VSTAR');
assert.equal(b.resolvedEnglishName({ name: 'アローラナッシーex SAR[SV7a 089/064]' }, 'AlolanExeggutor SAR[SV7a 089/064]', empty).name, 'Alolan Exeggutor ex');
assert.equal(b.namesCompatible('Sylveon V', { name: 'Full Art/Sylveon V |' }), true);
assert.equal(b.namesCompatible('Sylveon V', { name: 'Sylveon Vmax |' }), false);
assert(b.namesCompatible('Ultra Ball UR', {name:'Full Art/Ultra Ball | Ultra Rare |'}));
assert(b.namesCompatible('Ultra Ball SR', {name:'Ultra Ball | Super Rare |'}));
assert(!b.namesCompatible('Ultra Ball', {name:'Master Ball | Ultra Rare |'}));
assert(!b.namesCompatible('Ultra Ball', {name:'Poke Ball | Ultra Rare |'}));
assert(!b.namesCompatible('Ultra Ball', {name:'Ultra Rare |'}));
assert(b.namesCompatible('Mew Mysterious Tail UR', {name:'Full Art/Mew | Ultra Rare |',set:'S8A',no:'30'}));
assert(!b.namesCompatible('Mew Mysterious Tail UR', {name:'Full Art/Mew | Ultra Rare |',set:'S8A',no:'2'}));
assert(!b.namesCompatible('Mew Mysterious Tail UR', {name:'Full Art/Mew | Ultra Rare |',set:'S8B',no:'30'}));
assert.equal(b.japaneseTitle({name: 'リーフィアVSTAR[S12a 210/172]'}), 'リーフィアVSTAR');
assert.equal(b.variantsCompatible(card.name, 'Sylveon V', { name: 'Sylveon V | Missing Texture |' }), false);
const raw = {set:'S8B',no:'231',name:'Full Art/Sylveon V |',url:'https://www.psacard.com/pop/tcg-cards/2021/pokemon-japanese-x/1',fetchedAt:'2026-10-10T10:00:00Z',captureVersion:2,completeSnapshot:true};
assert.equal(b.savedRematchProof(card,'Sylveon CSR','Sylveon V',raw,[raw]), true);
assert.equal(b.savedRematchProof(card,'Sylveon Master Ball Reverse Holo','Sylveon V',raw,[raw]), false, 'translation must not erase original variant evidence');
assert.equal(b.savedRematchProof(card,'Sylveon CSR','Sylveon V',{...raw,no:'232'},[raw]), false);
assert.equal(b.savedRematchProof(card,'Sylveon CSR','Sylveon V',{...raw,fetchedAt:null},[raw]), false);
assert.equal(b.savedRematchProof(card,'Sylveon CSR','Sylveon V',{...raw,captureVersion:1},[raw]), false);
assert.equal(b.savedRematchProof(card,'Sylveon CSR','Sylveon V',{...raw,url:raw.url.replace('pokemon-japanese','pokemon-english')},[raw]), false);
assert.equal(b.savedRematchProof(card,'Sylveon CSR','Sylveon V',raw,[raw,{...raw,url:raw.url+'2'}]), false);
assert.equal(b.namesCompatible('N Plan', { name: "N's Plot |" }), false, 'unproved translations remain held');
assert.equal(b.resolvedEnglishName({name:'フシギバナ SR[SV2a 184/165]'},'Venusaur',new Map()).name,'Venusaur EX');
assert.notEqual(b.resolvedEnglishName({name:'フシギバナ SR[SV2a 184/166]'},'Venusaur',new Map()).name,'Venusaur EX');
assert.notEqual(b.resolvedEnglishName({name:'フシギバナ SR[SV2a 185/165]'},'Venusaur',new Map()).name,'Venusaur EX');
assert.notEqual(b.resolvedEnglishName({name:'フシギバナ SR[SV2a 184/165]【英語版】'},'Venusaur',new Map()).name,'Venusaur EX');
assert(b.namesCompatible("Zinnia's Determination SR [S7R 079/067]", {name:"Full Art/Zinnia's Resolve |"}));
assert(b.namesCompatible('Miss Fortunes HR [S10a 096/071]', {name:'Full Art/Miss Fortune Sisters | Hyper Rare |'}));
assert(b.namesCompatible("N's Plan SAR",{name:"N's Plot | Special Art Rare |",set:'SV11B',no:'173'}));
assert(!b.namesCompatible("N's Plan SAR",{name:"N's Plot | Special Art Rare |",set:'SV11B',no:'166'}));
assert(!b.namesCompatible("N's Plan SAR",{name:"N's Plot | Special Art Rare |",set:'SV11W',no:'173'}));
assert(b.namesCompatible('Boost Shake UR',{name:'Full Art/Vigor Shake | Ultra Rare |',set:'S6A',no:'99'}));
assert(!b.namesCompatible("Misty's Determination", {name:"Misty's Vitality | Super Rare |"}), 'different trainer cards are not synonyms');
assert(!b.variantsCompatible('野盗三姉妹 HR[S10a 096/071]', 'Miss Fortunes', {name:'Miss Fortune Sisters | Missing Texture |'}));
assert.equal(b.namesCompatible('Friends of Paldea SR [SV8a 195/187]', {name:'Friends in Paldea | Super Rare |'}),true);
assert.equal(b.namesCompatible('Alola Vulpix VSTAR HR [S11a 087/068]', {name:'Full Art/Alolan Vulpix Vstar | Hyper Rare |'}),true);
assert.equal(b.namesCompatible('Alola Vulpix V SR [S11a 077/068]', {name:'Full Art/Alolan Vulpix V |'}),true);
assert.equal(b.namesCompatible('Alola Vulpix V', {name:'Alolan Vulpix VSTAR |'}),false);
assert.equal(b.variantsCompatible('アローラロコンV SR[S11a 077/068]','Alola Vulpix V',{name:'Alolan Vulpix V | Missing Texture |'}),false);
const refs = [1, 2].map(n => ({ cardId: 'e' + n, set: 'S9', no: String(n), sourceUrl: 'https://www.psacard.com/pop/tcg-cards/2022/pokemon-japanese-x/1', title: "Cheren's Care", observedAt: '2026-10-10T10:00:00Z' }));
const nameCards=[{id:'water1',name:'基本水エネルギー UR[S6H 095/070]'},{id:'water2',name:'基本水エネルギー SR[S12a 253/172]'}];
const nameRows=nameCards.map((c,i)=>({...b.cardIdentity(c),name:'Water Energy |',ten:10,total:20,
  url:`https://www.psacard.com/pop/tcg-cards/2022/pokemon-japanese-water/${i+1}`,fetchedAt:'2026-10-10T10:00:00Z'}));
const nameCache=Object.fromEntries(nameCards.map(c=>[c.id,{englishName:'Basic Water Energy'}]));
const withoutSummary=b.savedNameIndex(nameCards,{cards:{}},nameRows,nameCache);
const withSummary=b.savedNameIndex(nameCards,{cards:Object.fromEntries(nameCards.map((c,i)=>[c.id,{u:nameRows[i].url,n:nameRows[i].name,ten:10,total:20}]))},nameRows,nameCache);
assert.deepEqual(withoutSummary,withSummary,'same originals must not depend on the preceding generated summary');
assert.equal(withoutSummary.get('基本水エネルギー').length,2);
assert.equal(b.resolvedEnglishName({id:'water3',name:'基本水エネルギー[s8a WAT]'},'Basic Water Energy',withoutSummary).name,'Water Energy');
assert(!b.variantsCompatible('グラジオの決戦 エラー版','Gladion Error ver.',{name:'Gladion |'}),'unspecified error is not a normal print');
assert(!b.variantsCompatible('グラジオの決戦 エラー版','Gladion Error ver.',{name:'Gladion | Incorrect Texture |'}),'unknown error is not proof of a particular error');
const trainer = { id: 't', name: 'チェレンの気くばり SAR[S12a 241/172]' };
assert.equal(b.resolvedEnglishName(trainer, "Cheren's Attention SAR[S12a 241/172]", new Map([[b.japaneseTitle(trainer), refs]])).name, "Cheren's Care");
assert.notEqual(b.resolvedEnglishName(trainer, "Cheren's Attention", new Map([[b.japaneseTitle(trainer), [refs[0], refs[0]]]])).name, "Cheren's Care", 'duplicate print IDs cannot establish two proofs');
assert.notEqual(b.resolvedEnglishName(trainer, "Cheren's Attention", new Map([[b.japaneseTitle(trainer), [refs[0], { ...refs[1], title: 'Other Trainer' }]]])).name, "Cheren's Care");
const point = { fetchedAt: '2026-10-10T10:00:00Z', ten: 12, total: 15, url: refs[0].sourceUrl };
const history = b.appendObservation([], point, 'same-print');
assert.equal(history[0][3].observedAt, point.fetchedAt);
assert.deepEqual(b.appendObservation(history, point, 'same-print'), history, 'reconciliation does not add observation dates');
assert.equal(needed({ generatedAt: 'same', rows: [{}] }, { updatedAt: 'same', reconciliationFingerprint: 'old' }, 'new'), true);
assert.equal(needed({ generatedAt: 'same', rows: [{}] }, { updatedAt: 'same', reconciliationFingerprint: 'new' }, 'new'), false);
assert.equal(require('./psa_access_policy').decision(null).allowed, false, 'saved reconciliation never enables PSA network acquisition');
const route = require('./profile_completion_routes').prospectPlan({ id: 'held' }, ['psaOfficial'], {
  linkage: { held: { savedEvidence: { candidateCount: 1 } } }, psaAccess: { allowed: false }
}).requirements[0];
assert.equal(route.state, 'saved-rematch-review');
assert.equal(route.networkRequired, false);
assert.equal(route.automatic, false, 'unproved saved matches do not enter the network acquisition queue');
assert.equal(require('./completion_routes').routes({m:['psaOfficial'],i:{psaOfficial:['再照合待ち']}},
  {psaAllowed:false,overseasCancelled:true}).find(r=>r.key==='psaOfficial').acquisitionStatus, 'saved-rematch-review');
assert.equal(require('./profile_completion_routes').prospectPlan({id:'new'}, ['psaOfficial'], {psaAccess:{allowed:false}}).requirements[0].state, 'permission-wait');
const feasibility = require('./build_high_rarity_readiness').feasibility([
  { requirements: [{state:'bulk',automatic:true}] },
  { requirements: [{state:'saved-rematch-review',automatic:false}] },
  { requirements: [{state:'permission-wait',automatic:false},{state:'period-not-provided',automatic:false}] }
], 10, 7);
assert.equal(feasibility.automaticPathsOnly, 1);
assert.equal(feasibility.blockedCards, 2);
assert.equal(feasibility.conditionalCurrentRouteTotal, 8);
assert.equal(Object.values(feasibility.combinations).reduce((a,b)=>a+b,0), 3);
console.log('Saved PSA rematch identity, edition, evidence, timestamps and rule invalidation passed');

for(const [no,label]of [['144','With Mark'],['147','No Mark']]){const row={set:'S-P',no,name:"Kanazawa's Pikachu | Pokemon Center Kanazawa Opening |"};assert(b.namesCompatible('Kanazawa Pikachu '+label+': PROMO [S-P '+no+']',row));assert(!b.namesCompatible('Kanazawa Pikachu '+label,{...row,no:no==='144'?'147':'144'}));assert(!b.namesCompatible('Kanazawa Pikachu '+label,{...row,set:'SV-P'}));assert(!b.namesCompatible('Kanazawa Pikachu '+label,{...row,name:'Pikachu |'}));}
