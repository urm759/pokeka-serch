const assert = require('node:assert/strict'),fs = require('node:fs'),path = require('node:path');
const root = process.env.PSA_ACQUISITION_ROOT || path.join(__dirname,'..');
const read = f => JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const raw = read('data/psa-official-populations.json'), summary = read('data/psa-population-summary.json');
assert.equal(summary.updatedAt,raw.generatedAt,'saved PSA data must be reconciled in the publication checkout before publishing');
assert.equal(summary.matched,Object.keys(summary.cards).length);
assert(Object.keys(summary.cards).length <= read('data/pokemon-cards.json').length);
console.log('Saved PSA publication summary consistency passed');
