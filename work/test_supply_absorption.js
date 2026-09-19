const assert = require("assert");
const market = require("../market-analysis.js");

const absorbed = market.classifyDemandSupply({
  pressureRatio: 0.6, psaTx30: 30, rawTx30: 40, buybackShops: 3,
  listingTrendPct: -5, stockDrop30: 2, priceDirection: "横ばい",
});
assert.strictEqual(absorbed.liquidityDemand, "強い");
assert.strictEqual(absorbed.absorptionLabel, "吸収できている");
assert.strictEqual(absorbed.priceSupportEligible, true);

const oversupplied = market.classifyDemandSupply({
  pressureRatio: 8, psaTx30: 35, rawTx30: 50, buybackShops: 4,
  listingTrendPct: 22, stockDrop30: -4, priceDirection: "下降", supportBroken: true, newLow30: 3,
});
assert.strictEqual(oversupplied.liquidityDemand, "強い");
assert.strictEqual(oversupplied.supplyLevel, "多い");
assert.strictEqual(oversupplied.priceConclusion, "高回転だが価格下落警戒");
assert.strictEqual(oversupplied.priceSupportEligible, false);

const collecting = market.classifyDemandSupply({ psaTx30: 20, rawTx30: 30, buybackShops: 2 });
assert.strictEqual(collecting.absorptionLabel, "蓄積中");
assert.strictEqual(collecting.priceSupportEligible, undefined);

console.log(JSON.stringify({ supplyAbsorption: "ok" }));
