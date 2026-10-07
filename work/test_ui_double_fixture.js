const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const codec = require('../ui-data-codec.js');
const {fixture} = require('./ui_double_fixture.js');
const root = path.join(__dirname, '..');
const file = 'data/ui/manifest.json';
const original = fs.readFileSync(path.join(root, file));
const base = JSON.parse(original);
const doubled = fixture(root);
const manifest = JSON.parse(doubled.get(file));
assert.equal(manifest.syntheticDouble, true);
assert.equal(manifest.revision, 'synthetic-double-' + base.revision);
for (const [name, hash] of Object.entries(manifest.hashes)) {
  const buffer = doubled.get(name);
  if (buffer) assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), hash);
}
for (const name of ['data/card-catalog/search-index.json', 'data/card-catalog/analysis.json', 'data/card-catalog-completion.json']) {
  const stored = base.aliases[name] || name;
  const before = codec.decode(JSON.parse(fs.readFileSync(path.join(root, stored))));
  const after = codec.decode(JSON.parse(doubled.get(stored)));
  const rows = value => Array.isArray(value) ? value : value.cards;
  const prior = rows(before), next = rows(after);
  const count = value => Array.isArray(value) ? value.length : Object.keys(value).length;
  assert.equal(count(next), count(prior) * 2);
  if (Array.isArray(prior)) {
    assert.deepEqual(next.slice(0, prior.length), prior);
    assert.deepEqual(next.slice(prior.length), prior.map(row => ({...row, id:'scale-' + row.id})));
    assert.equal(new Set(next.map(row => row.id)).size, next.length);
  } else {
    for (const [id, row] of Object.entries(prior)) {
      assert.deepEqual(next[id], row);
      assert.deepEqual(next['scale-' + id], row);
    }
  }
}
assert.deepEqual(fs.readFileSync(path.join(root, file)), original);
console.log('PASS: synthetic double fixture retains source values and does not persist fake cards');
