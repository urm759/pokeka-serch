const assert = require('node:assert/strict');
const fs = require('node:fs');
const m = require('./build_psa_history');
const source = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'psa-name-aliases.json')));
const additions = source.sourceNames.filter(a => a.verifiedAt === '2026-10-26' && a.sourceEvidence.startsWith('Basic Energy type names'));
assert.equal(additions.length, 13);
for (const alias of additions) {
  const row = { set: alias.set, no: alias.numbers[0], name: `${alias.from} | Ultra Rare |` };
  assert(m.namesCompatible(alias.to, row), 'Basic prefix differs, same verified Japanese print');
  assert(!m.namesCompatible(alias.to, { ...row, set: 'UNVERIFIED' }));
  assert(!m.namesCompatible(alias.to, { ...row, no: '99999' }));
  assert(!m.namesCompatible(alias.to, { ...row, name: 'Double Turbo Energy' }));
  assert(!m.namesCompatible(alias.to, { ...row, name: 'Heat Fire Energy' }));
  assert(!m.variantsCompatible(alias.japanese, alias.to, { ...row, name: `${alias.from} | Missing Texture |` }));
}
const camp = require('./update_yuyutei_torecacamp');
const variants = [
  { title: '【状態A】', available: false, price: 5280000 },
  { title: '【状態A-】', available: true, price: 4480000 },
];
const selected = variants.filter(camp.campA);
assert.equal(selected.length, 1);
assert.equal(selected[0].available, false, 'A-minus stock must never restore state-A availability');
assert.equal(camp.campVariantPrice(selected[0]), 52800);
console.log('PASS saved Basic Energy print scope, special-energy/texture exclusion and exact state-A stock');
