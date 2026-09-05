const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  campA, campMatchesCard, campSignature, cardSignature, parseProductSitemap,
  parseProductSitemapIndex, parseYuyuteiResults, preferCampEntry, titleMatches,
  yuyuteiPriority,
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
assert.equal(yuyuteiPriority({ id: "candidate", price: 10000, snkPsa10Price: 40000, tv30: 30 }, {}).label, "現在の候補カード");
assert.equal(yuyuteiPriority({ id: "psa", price: 40000, snkPsa10Price: 45000, tv30: 10 }, {}).label, "PSA10相場あり");
assert.equal(yuyuteiPriority({ id: "buyback", price: 5000 }, { buyback: { shops: { one: { price: 10000 } } } }).label, "買取掲載あり");

const updater = fs.readFileSync(path.join(__dirname, "update_yuyutei_torecacamp.js"), "utf8");
const tracker = fs.readFileSync(path.join(__dirname, "run_tracked_update.js"), "utf8");
const refreshWorkflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "refresh-all-site-data.yml"), "utf8");
const stockWorkflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-cardrush-stock.yml"), "utf8");
const sitemapIndex = parseProductSitemapIndex(`<sitemapindex><loc>https://torecacamp-pokemon.com/sitemap_products_1.xml?from=1&amp;to=2</loc></sitemapindex>`);
assert.deepStrictEqual(sitemapIndex, ["https://torecacamp-pokemon.com/sitemap_products_1.xml?from=1&to=2"]);
const sitemapRows = parseProductSitemap(`<urlset><url><loc>https://torecacamp-pokemon.com/products/test-card</loc><lastmod>2026-09-05</lastmod><image:image><image:title>AZ SR XY4 093/088</image:title></image:image></url></urlset>`);
assert.equal(sitemapRows.length, 1);
assert.equal(sitemapRows[0].handle, "test-card");
assert.equal(sitemapRows[0].title, "AZ SR XY4 093/088");
assert.equal(preferCampEntry({ price: 5000, available: false }, { price: 6000, available: true }).price, 6000);
assert.match(updater, /sitemap\.xml/);
assert.match(updater, /sitemap_products_/);
assert.match(updater, /TORECACAMP_PRODUCT_DETAIL_BATCH/);
assert.match(updater, /seenProductUrls/);
assert.doesNotMatch(updater, /r\.jina\.ai/);
assert.match(updater, /lastSuccessfulPage/);
assert.match(updater, /pageCache/);
assert.match(updater, /currentEntryIndex = entryIndex \+ 1/);
assert.doesNotMatch(updater, /collections\/all\/products\.json/);
assert.match(updater, /estimatedRemainingProducts/);
assert.match(updater, /remainingSearchCount/);
assert.match(updater, /priorityRemaining/);
assert.match(updater, /cumulativeProductCount/);
assert.match(updater, /crawlComplete/);
assert.match(updater, /stoppingReason/);
assert.match(updater, /linkageMissCount/);
assert.match(updater, /exceptionName/);
assert.match(updater, /response\.status === 429 \|\| response\.status >= 500/);
assert.match(tracker, /\["'\]\?/);
assert.doesNotMatch(tracker, /Number\(match\[1\] \|\| 1\)/);
for (const workflow of [refreshWorkflow, stockWorkflow]) {
  assert.match(workflow, /TORECACAMP_SITEMAPS_PER_RUN/);
  assert.match(workflow, /TORECACAMP_PRODUCT_DETAIL_BATCH/);
  assert.match(workflow, /YUYUTEI_SEARCH_BATCH/);
}
assert.doesNotMatch(stockWorkflow, /TORECACAMP_PAGES_PER_RUN/);

console.log(JSON.stringify({ yuyuteiRows: rows.length, campStandard: "XY4|093/088", campPromo: "S-P|323", collectors: "ok" }));
