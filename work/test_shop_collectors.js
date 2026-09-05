const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  campA, campMatchesCard, campSignature, cardSignature, parseYuyuteiResults, titleMatches,
} = require("./update_yuyutei_torecacamp.js");

const standard = {
  title: "AZ SR XY4 093/088 1ED",
  tags: ["#XY4_ファントムゲート", "ポケモンカードシングル"],
  variants: [{ title: "【状態A】", option1: "【状態A】", price: "24800", available: false }],
};
assert.deepStrictEqual(campSignature(standard).cardNo, "093/088");
assert.ok(campSignature(standard).setCodes.includes("xy4"));
assert.ok(campA(standard.variants[0]));
assert.ok(!campA({ title: "【状態A-】" }));
assert.ok(campMatchesCard({ name: "AZ SR [XY4 093/088](拡張パック)" }, standard));

const promo = {
  title: "ピカチュウ PROMO 323/S-P 【KK】",
  tags: ["#PROMO", "#S-P"],
  variants: [{ title: "【状態A】", price: "69800", available: false }],
};
assert.deepStrictEqual(campSignature(promo).cardNo, "323");
assert.ok(campSignature(promo).setCodes.includes("s-p"));
assert.ok(campMatchesCard({ name: "ピカチュウ: プロモ[323 S-P](プロモーションカード)" }, promo));

const yuyuteiHtml = `<a href="https://yuyu-tei.jp/sell/poc/card/sv4a/1"><div><img alt="349/190 SAR リザードンex"></div></a><span>349/190</span><a><h4>リザードンex SAR</h4></a><strong>39,800 円</strong><label>在庫 : 2 点</label>`;
const rows = parseYuyuteiResults(yuyuteiHtml);
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].cardNo, "349/190");
assert.strictEqual(rows[0].price, 39800);
assert.strictEqual(rows[0].stock, 2);
assert.ok(titleMatches(
  { name: "ヒロシマのピカチュウ P [SV-P 261](スペシャルBOX)" },
  "ヒロシマのピカチュウ", "261/SV-P", "svpromo-300",
));

assert.deepStrictEqual(cardSignature({ name: "ピカチュウex SAR仕様 [MC 764/742](商品)" }), {
  setCode: "mc", cardNo: "764/742", base: "ピカチュウex",
});

const updater = fs.readFileSync(path.join(__dirname, "update_yuyutei_torecacamp.js"), "utf8");
const tracker = fs.readFileSync(path.join(__dirname, "run_tracked_update.js"), "utf8");
assert.match(updater, /collections\/all\/products\.json/);
assert.doesNotMatch(updater, /r\.jina\.ai/);
assert.match(updater, /lastSuccessfulPage/);
assert.match(updater, /pageCache/);
assert.match(updater, /The checkpoint is written last/);
assert.match(updater, /estimatedMinimumPages/);
assert.match(updater, /linkageMissCount/);
assert.match(updater, /exceptionName/);
assert.match(updater, /response\.status === 429 \|\| response\.status >= 500/);
assert.match(tracker, /\["'\]\?/);
assert.doesNotMatch(tracker, /Number\(match\[1\] \|\| 1\)/);

console.log(JSON.stringify({ yuyuteiRows: rows.length, campStandard: "XY4|093/088", campPromo: "S-P|323", collectors: "ok" }));
