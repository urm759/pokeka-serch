// 4-J: a state-A raw reference that equals the SNKRDUNK PSA10 lowest listing to the yen
// is the PSA10 price, not a raw price. It stays visible as evidence but is not used. Local only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const decisionModel = require('../decision-model.js');

const helper = app.match(/function rawReferenceSameAsPsa10Min\(card\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helper, 'helper present');
const same = new Function(helper + '\nreturn rawReferenceSameAsPsa10Min;')();
assert.equal(same({ price: 8461, snkPsa10Min: 8461 }), true, 'x-609599: raw 8,461 = PSA10 lowest 8,461');
assert.equal(same({ price: 8460, snkPsa10Min: 8461 }), false, 'exact match only: a near value is a different question');
assert.equal(same({ price: 8461, snkPsa10Min: null }), false, 'no PSA10 lowest listing: nothing to compare');
assert.equal(same({ price: null, snkPsa10Min: 8461 }), false);
assert.equal(same({ price: 0, snkPsa10Min: 0 }), false);

// calc() applies it first, keeps the value and the reason, and the price row is marked invalid with that reason.
assert.match(app, /function calc\(card\) \{\n  if \(rawReferenceSameAsPsa10Min\(card\)\) card = \{ \.\.\.card, price: null, rawReferenceHeldPrice: Number\(card\.price\), rawReferenceHoldReason: RAW_REFERENCE_PSA10_HOLD \};\n  const torecaPrice = Number\(card\.price\);/);
assert.match(app, /source: "みんトレ状態A", value: card\.rawReferenceHeldPrice \?\? torecaPrice,[^\n]*valid: !card\.rawReferenceHoldReason && referenceEvidence !== "unbacked", invalidReason: card\.rawReferenceHoldReason \|\| "実売の裏付けなし・計算対象外",/);
assert.match(app, /const RAW_REFERENCE_PSA10_HOLD = "PSA10最安値と同額・素体価格として不使用";/);
assert.match(app, /card\.rawReferenceHoldReason \? `みんトレ参考価格 ¥\$\{fmt\.format\(card\.rawReferenceHeldPrice\)\}（/, 'the panel shows the held value with its reason, not ¥0');

// The aggregation then uses only the shop price, and lists the held row with its reason.
const asOf = '2026-11-23';
const result = decisionModel.aggregatePrices([
  { source: 'みんトレ状態A', value: 8461, kind: '参考価格', valid: false, invalidReason: 'PSA10最安値と同額・素体価格として不使用', updatedAt: asOf },
  { source: '晴れる屋2状態A', value: 380, kind: '販売価格', updatedAt: asOf },
], { asOfDate: asOf });
assert.equal(result.value, 380);
assert.deepEqual(result.excluded.map(row => [row.source, row.excludedReasons]), [['みんトレ状態A', ['PSA10最安値と同額・素体価格として不使用']]]);
console.log('PASS raw reference equal to the PSA10 lowest listing is held with its reason; shops decide the raw price');
