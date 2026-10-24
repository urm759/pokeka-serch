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
assert.equal(b.namesCompatible('Friends of Paldea SR [SV8a 195/187]', {name:'Friends in Paldea | Super Rare |'}),true);
assert.equal(b.namesCompatible('Alola Vulpix VSTAR HR [S11a 087/068]', {name:'Full Art/Alolan Vulpix Vstar | Hyper Rare |'}),true);
assert.equal(b.namesCompatible('Alola Vulpix V SR [S11a 077/068]', {name:'Full Art/Alolan Vulpix V |'}),true);
assert.equal(b.namesCompatible('Alola Vulpix V', {name:'Alolan Vulpix VSTAR |'}),false);
assert.equal(b.variantsCompatible('アローラロコンV SR[S11a 077/068]','Alola Vulpix V',{name:'Alolan Vulpix V | Missing Texture |'}),false);
const refs = [1, 2].map(n => ({ cardId: 'e' + n, set: 'S9', no: String(n), sourceUrl: 'https://www.psacard.com/pop/tcg-cards/2022/pokemon-japanese-x/1', title: "Cheren's Care", observedAt: '2026-10-10T10:00:00Z' }));
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
