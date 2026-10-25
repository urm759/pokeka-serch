'use strict';
// Synthetic identities only: this test never reads the received plan or accepted observations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { classify, printedListing, preserveWrite, SCOPE } = require('./classify_gemrate_remaining');
let checks = 0;
function check(test) { test(); checks++; }
function pending(number = '019', name = 'Synthetic', parallel = 'Base', extra = {}) {
  return { key: JSON.stringify([SCOPE.language, SCOPE.set, SCOPE.year, number, name, parallel]),
    number, name, parallel, status: ['Base', 'Ultra Rare'].includes(parallel)
      ? 'domestic-catalog-unlisted' : 'special-finish-review', ...extra };
}
function listing(name = '合成カード【C】{019/069} [S6a]', extra = {}) {
  return { name, detailUrl: 'https://www.cardrush-pokemon.jp/product/1', state: 'A', ...extra };
}
function fixture(rows = [pending()], cardrush = [listing()], other = {}) {
  return classify({ rows }, { cardrush, hareruya2: [], torecacamp: [], ...other });
}
const status = result => result.rows[0].classification;
check(() => assert.equal(status(fixture()), 'domestic-listing-relevant'));
check(() => {
  const result = fixture([pending()], [listing(), listing(undefined, { state: 'B', detailUrl: 'https://www.cardrush-pokemon.jp/product/2' })]);
  assert.equal(result.rows[0].evidence.length, 1);
  assert.equal(result.counts.conditionDuplicateRowsCollapsed, 1);
  assert.equal(result.counts.independentSourceProofs, 1);
});
check(() => {
  const result = fixture([pending()], [listing()], {
    hareruya2: [{ name: '合成カード(C){水}〈019/069〉[S6a]', detailUrl: 'https://www.hareruya2.com/products/3' }],
    torecacamp: [{ title: '合成カード C S6a 019/069 【KK】', detailUrl: 'https://torecacamp-pokemon.com/products/test' }],
  });
  assert.equal(result.rows[0].evidence.length, 1);
  assert.equal(result.counts.independentSourceProofs, 3);
  assert.equal(result.counts.conditionDuplicateRowsCollapsed, 0);
});
for (const label of ['合成カード【C】{019/069} [S6b]', '合成カード【C】{020/069} [S6a]',
  '合成カード【C】{019/070} [S6a]', '合成カード C [S6a] 019', '合成カード [S6a 019/069]',
  '合成カード【C】{019/069} [S6a] [S6b]', '合成カード【C】{019/069} [S6a] 020/069']) {
  check(() => assert.equal(status(fixture([pending()], [listing(label)])), 'listing-not-evidenced'));
}
check(() => assert.equal(status(fixture([pending('019', 'Synthetic', 'Base', { rarity: 'U' })])), 'listing-not-evidenced'));
check(() => assert.equal(status(fixture([pending('019', 'Synthetic', 'Base', { finish: 'holo' })])), 'listing-not-evidenced'));
check(() => assert.equal(status(fixture([pending('019', 'Synthetic-Holo')])), 'listing-not-evidenced'));
check(() => assert.equal(status(fixture([pending('019', 'Synthetic', 'Ultra Rare')])), 'listing-not-evidenced'));
check(() => assert.equal(status(fixture([pending('100', 'Full Art/Synthetic', 'Ultra Rare')],
  [listing('合成スタジアム【UR】{100/069} [S6a]')])), 'domestic-listing-relevant'));
check(() => assert.equal(status(fixture([pending('100', 'Synthetic', 'Ultra Rare', { rarity: 'C' })],
  [listing('合成スタジアム【C】{100/069} [S6a]')])), 'listing-not-evidenced'));
for (const label of ['合成カード【C】{019/069} [S6a] ミラー', '合成カード【C】{019/069} [S6a] Missing Texture',
  '合成カード【C】{019/069} [S6a] エラー', '合成カード【C】{019/069} [S6a] ホロ',
  '合成カード(SA)【C】{019/069} [S6a]', '合成カード【C】{019/069} [S6a] 英語版',
  '合成カード【C】{019/069} [S6a] PSA10', '合成カード【C UR】{019/069} [S6a]']) {
  check(() => assert.equal(status(fixture([pending()], [listing(label)])), 'listing-not-evidenced'));
}
check(() => assert.equal(status(fixture([pending()], [listing('合成カード【C】{019/069} [S6a]', { language: 'en' })])), 'listing-not-evidenced'));
check(() => assert.equal(status(fixture([pending()], [listing(undefined, { setCode: 'S6B' })])), 'listing-not-evidenced'));
check(() => assert.equal(status(fixture([pending()], [listing(undefined, { rarity: 'U' })])), 'listing-not-evidenced'));
for (const extra of [{ identityVerified: false }, { cardMismatchSuspected: true }, { identityHoldReason: 'held' },
  { matchStatus: 'ambiguous' }, { detailUrl: 'https://foreign.example/product/1' },
  { cardNo: '020/069' }, { cardNumber: '019/070' }, { finish: 'mirror' }, { variant: 'missing-texture' }]) {
  check(() => assert.equal(status(fixture([pending()], [listing(undefined, extra)])), 'listing-not-evidenced'));
}
check(() => assert.equal(status(fixture([pending()], [listing(), listing('別名カード【C】{019/069} [S6a]')])), 'listing-ambiguous'));
check(() => assert.equal(status(fixture([pending()], [listing(), listing('合成カード【U】{019/069} [S6a]')])), 'listing-ambiguous'));
check(() => {
  const result = fixture([pending('019', 'Synthetic', 'Missing Texture')], [listing(), listing('合成カード【C】{019/069} [S6a] Missing Texture')]);
  assert.equal(status(result), 'special-finish-held');
  assert.deepEqual(result.rows[0].evidence, []);
  assert.equal(result.counts.domesticListingRelevant, 0);
});
check(() => {
  const rows = Array.from({ length: 50 }, (_, i) => pending(String(i + 1), 'Synthetic ' + i))
    .concat(Array.from({ length: 20 }, (_, i) => pending(String(i + 1), 'Synthetic special ' + i, 'Missing Texture')));
  const result = fixture(rows, []);
  assert.equal(result.counts.pendingSpecifications, 70);
  assert.equal(result.counts.baseSpecifications, 50);
  assert.equal(result.counts.specialFinishHeld, 20);
});
check(() => assert.throws(() => fixture([pending(), pending()]), /Duplicate pending/));
check(() => assert.throws(() => fixture([pending('019', 'Synthetic', 'Base', { status: 'accepted' })]), /Only remaining/));
check(() => assert.throws(() => fixture([pending('019', 'Synthetic', 'Base', { key: '[]' })]), /scope\/identity/));
check(() => assert.throws(() => fixture([pending('019', 'Synthetic', 'Base', { denominator: 70 })]), /context mismatch/));
check(() => {
  const p = pending('019', 'Synthetic', 'Base', { Gems: 'SYNTHETIC_SECRET', total: 'SYNTHETIC_SECRET', candidateIds: ['SYNTHETIC_SECRET'] });
  const c = listing(undefined, { price: 'SYNTHETIC_SECRET', stock: 'SYNTHETIC_SECRET', cardId: 'SYNTHETIC_SECRET' });
  const before = JSON.stringify({ p, c }), result = fixture([p], [c]);
  assert.equal(JSON.stringify({ p, c }), before);
  assert(!JSON.stringify(result).includes('SYNTHETIC_SECRET'));
  assert.equal(result.rows[0].acceptedMapping, false);
  assert.equal(result.counts.acceptedMappingChanges, 0);
  assert.equal(result.counts.masterAdditions, 0);
  assert(Object.values(result.counts).every(n => Number.isInteger(n)));
});
check(() => assert.equal(printedListing(listing('合成カード C [S6a 019/069]'), 'cardrush').number, 19));

const temporary = fs.mkdtempSync(path.join(__dirname, '.gemrate-listing-synthetic-'));
try {
  const file = path.join(temporary, 'output.json'), backups = path.join(temporary, 'backups');
  fs.mkdirSync(backups);
  check(() => {
    assert.equal(preserveWrite(file, { first: 1 }, backups), true);
    const before = fs.statSync(file).mtimeMs;
    assert.equal(preserveWrite(file, { first: 1 }, backups), false);
    assert.equal(fs.statSync(file).mtimeMs, before);
    assert.equal(fs.readdirSync(backups).length, 0);
  });
  check(() => {
    const prior = fs.readFileSync(file);
    assert.equal(preserveWrite(file, { second: 2 }, backups), true);
    const names = fs.readdirSync(backups);
    assert.equal(names.length, 1);
    assert(zlib.gunzipSync(fs.readFileSync(path.join(backups, names[0]))).equals(prior));
    assert.equal(preserveWrite(file, { second: 2 }, backups), false);
    assert.deepEqual(fs.readdirSync(backups), names);
  });
  check(() => {
    const stale = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(stale, 'owned by another writer');
    const prior = fs.readFileSync(file);
    assert.throws(() => preserveWrite(file, { third: 3 }, backups), /EEXIST/);
    assert.equal(fs.readFileSync(stale, 'utf8'), 'owned by another writer');
    assert(fs.readFileSync(file).equals(prior));
  });
} finally {
  assert.equal(path.dirname(fs.realpathSync(temporary)), fs.realpathSync(__dirname));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ syntheticChecksPassed: checks }));
