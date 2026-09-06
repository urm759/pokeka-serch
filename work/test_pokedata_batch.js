const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  findDomestic, localIdentity, minimalTransactions,
  normalizeName, normalizeNumber, normalizeSetCode,
} = require("./update_pokedata_batch.js");

assert.strictEqual(normalizeSetCode(" sv-09 "), "SV9");
assert.strictEqual(normalizeNumber("009/100"), "9");
assert.strictEqual(normalizeName("Lillie’s Clefairy ex"), "lillie's clefairy ex");
assert.deepStrictEqual(localIdentity({ name: "リーリエのピッピex SAR [SV9 126/100](拡張パック)" }), {
  setCode: "SV9", number: "126", printedNumber: "126/100",
  baseName: "リーリエのピッピex SAR", rarity: "SAR", variant: "standard",
});

const sourceCard = { id: 73990, set_code: "SV9", num: "126" };
const domestic = { id: "pk-63635", name: "リーリエのピッピex SAR [SV9 126/100](拡張パック)" };
const byKey = new Map([["SV9|126", [domestic]]]);
assert.deepStrictEqual(findDomestic(sourceCard, byKey, []), {
  status: "auto-matched", localCardId: "pk-63635",
  method: "set-code+card-number+language",
});
assert.strictEqual(findDomestic({ id: 1, set_code: "SV9", num: "1" }, byKey, []).status, "domestic-base-missing");

const rows = minimalTransactions([{
  id: 1, ebay_item_id: "123", date_sold: "Fri, 04 Sep 2026 00:00:00 GMT",
  title: "Pokemon Japanese PSA 10", psa_grade: 10, sold_price: 100,
}], 150);
assert.strictEqual(rows[0].sold_price, 15000);
assert.strictEqual(rows[0].psa_grade, "10");
assert.strictEqual(rows[0].date_sold, "2026-09-04");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const updater = fs.readFileSync(path.join(__dirname, "update_pokedata_batch.js"), "utf8");
assert.match(app, /visiblePokedataRecords = 25/);
assert.match(app, /さらに25件表示/);
assert.match(app, /国内比/);
assert.match(updater, /POKEDATA_TARGET \|\| 132/);
assert.match(updater, /setComplete/);
assert.match(updater, /transactionCountStatus = "取得不能"/);

console.log(JSON.stringify({ pokedataBatch: "ok" }));
