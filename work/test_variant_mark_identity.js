// 4-J E-3: a shop product and a card must agree on same-number variant marks
// (丸美屋, エラー版, メタモンマーク). Local fixtures only; no requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const q = require('./quarantine_shop_identity');
const card = name => ({ name, language: 'ja' });

// Mismatches in either direction are held.
assert.match(q.reason(card('Nのゾロアークex :エラー版 UR [SV9 131/100](拡張パック「バトルパートナーズ」)'), 'Nのゾロアークex(UR){悪}〈131/100〉[SV9]'), /エラー版/);
assert.match(q.reason(card('シャンデラVMAX RRR[s8 015/100](拡張パック「フュージョンアーツ」)'), 'シャンデラVMAX:エラー版(RRR){炎}〈015/100〉[S8]'), /エラー版/);
assert.match(q.reason(card('ドンメル / メタモン :メタモンマーク有 C [S10b 013/071](強化拡張パック「Pokemon GO」)'), 'ドンメル(C){炎}〈013/071〉[S10b]'), /メタモンマーク/);
assert.match(q.reason(card('ピカチュウ P [XY-P 064](プロモーションカード「熱戦にそなえろ！ 黒」)'), 'ピカチュウ*丸美屋(PROMO){雷}〈064/XY-P〉[XY-P]'), /丸美屋/);
assert.match(q.reason(card('ビクティニV: プロモ[S-P 243](プロモーションカード「S-P」)'), 'エラー版)ビクティニV PROMO 243/S-P 【KK】'), /エラー版/);

// Matching marks, and marks that are not same-number variants, are not held by this rule.
assert.equal(q.variantMarkReason(card('Nのゾロアークex UR [SV9 131/100](拡張パック「バトルパートナーズ」)'), 'Nのゾロアークex(UR){悪}〈131/100〉[SV9]'), null);
assert.equal(q.variantMarkReason(card('ドンメル / メタモン :メタモンマーク有 C [S10b 013/071]'), 'ドンメル(メタモンマーク)(C){炎}〈013/071〉[S10b]'), null);
assert.equal(q.variantMarkReason(card('ピカチュウ P [XY-P 064](丸美屋)'), 'ピカチュウ*丸美屋(PROMO){雷}〈064/XY-P〉[XY-P]'), null);
// Family deck marks are identified by the number alone.
assert.equal(q.variantMarkReason(card('ピカチュウ :ライチュウマーク [SML 018/051](サン&ムーン「ファミリーポケモンカードゲーム」)'), 'ピカチュウ(D){雷}〈018/051〉[SML]'), null);
assert.equal(q.variantMarkReason(card('ルカリオV [SH 027/053]'), 'ルカリオV(RR仕様/バンギラスマーク)【-】{027/053} [SH]'), null);
// Wording differences and a corrected print are not the error variant.
assert.equal(q.variantMarkReason(card('ドンメル :エネルギーマークミラー [M2a 022/193]'), 'ドンメル(炎エネルギーミラー)【-】{022/193} [M2a]'), null);
assert.equal(q.variantMarkReason(card('シャンデラVMAX RRR[s8 015/100]'), 'シャンデラVMAX(エラー修正版)【RRR】{015/100} [S8]'), null);
// Full-width input is normalised.
assert.match(q.variantMarkReason(card('ビッパ :メタモンマーク有 C [S10b 060/071]'), 'ビッパ（Ｃ）〈060/071〉［S10b］'), /メタモンマーク/);

// The existing quarantine step holds the row, keeps its saved values and detaches only that URL.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'variant-mark-'));
const put = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), JSON.stringify(value)); };
const at = '2026-11-22T23:45:00Z', url = 'https://www.hareruya2.com/products/9708383174976';
put('data/pokemon-cards.json', [
  { id: 'normal', name: 'Nのゾロアークex UR [SV9 131/100](拡張パック「バトルパートナーズ」)', language: 'ja', hareruya2Url: url },
  { id: 'error', name: 'Nのゾロアークex :エラー版 UR [SV9 131/100](拡張パック「バトルパートナーズ」)', language: 'ja', hareruya2Url: url },
]);
put('work/hareruya2_catalog.json', [{ cardId: 'error', name: 'Nのゾロアークex(UR){悪}〈131/100〉[SV9]', detailUrl: url, price: 2800, stock: 4, observedAt: at }]);
put('data/hareruya2-stock-summary.json', { cards: {
  error: { hareruya2Price: 2800, stock: 4, available: true, observedAt: at, identityVerified: true },
  normal: { hareruya2Price: 2800, stock: null, observedAt: at, identityVerified: true } } });
q.build(root); q.build(root);
const summary = JSON.parse(fs.readFileSync(path.join(root, 'data/hareruya2-stock-summary.json'))).cards;
assert.equal(summary.error.cardMismatchSuspected, true);
assert.equal(summary.error.identityVerified, false);
assert.match(summary.error.identityHoldReason, /同じ番号の別仕様（エラー版）/);
assert.equal(summary.error.hareruya2Price, 2800, 'saved value kept as evidence');
assert.equal(summary.error.stock, 4, 'hold does not invent a stock-out');
assert.equal(summary.normal.cardMismatchSuspected, undefined, 'the correctly matched normal card is untouched');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/pokemon-cards.json')));
assert.equal(cards.find(c => c.id === 'error').hareruya2Url, null);
assert.equal(cards.find(c => c.id === 'normal').hareruya2Url, url);
const history = JSON.parse(fs.readFileSync(path.join(root, 'work/shop-identity-quarantine-history.json'))).rows;
assert.equal(history.length, 1, 'repeat run keeps one historical observation');
fs.rmSync(root, { recursive: true, force: true });
console.log('PASS same-number variant marks: 丸美屋/エラー版/メタモンマーク held both ways, deck marks and wording kept, saved values retained');
