const assert = require("assert");
const fs = require("fs");
const { build, validateIdentity } = require("./build_psa_market_trial.js");
const { makeQueue } = require("./build_psa_linkage_queue.js");
const visibility = require("../candidate-visibility.js");

const cards = require("../data/pokemon-cards.json");
const capture = require("./psa_market_trial_capture.json");
const saved = require("../data/psa-market-trial.json");
const sales = require("../data/pokedata-sales/pk-63635.json");
const output = build({ cards, capture, pokedataRowsByCard: { "pk-63635": sales.rows } });
assert.equal(output.cardCount, 2);
assert.equal(output.psaExcerptRows, 10);
assert.equal(output.overlappedRows, 5);
assert(output.certificates.every((cert) => cert.identity.matched));
assert(output.certificates.every((cert) => cert.salesHistory.count30 === null && cert.salesHistory.count90 === null));
assert(output.certificates.every((cert) => cert.verifiedForTrading === false));
assert.equal(output.tcgplayerNewAcquisitionStopped, false);
assert.equal(saved.overlappedRows, output.overlappedRows);
assert.equal(output.certificates[0].salesHistory.sales[0].jpyAtReferenceFx, Math.round(215 * 157.59));
assert.equal(output.certificates[0].estimate.type, "PSA Estimate, not a sale");
assert.equal(output.certificates[0].population.type, "grade-specific-cert-snapshot");
assert.equal(validateIdentity(cards.find((card) => card.id === "pk-63635"), { ...capture.certificates[0], cardNumber: "127" }), false);
assert.equal(validateIdentity(cards.find((card) => card.id === "pk-63635"), { ...capture.certificates[0], rarity: "MUR" }), false);
assert.equal(validateIdentity(cards.find((card) => card.id === "pk-63635"), { ...capture.certificates[0], language: "Korean" }), false);
const dupCapture = structuredClone(capture);
dupCapture.certificates[0].sales.push({ ...dupCapture.certificates[0].sales[0] });
const deduped = build({ cards, capture: dupCapture, pokedataRowsByCard: { "pk-63635": sales.rows } });
assert.equal(deduped.psaExcerptRows, 10);
assert.equal(deduped.certificates[0].salesHistory.duplicateWithinPsa, 1);

const queue = makeQueue({ cards: [{ id: "new", name: "A SAR [SV9 126/100]", setCode: "SV9", p10tv30: 20 },
  { id: "old", name: "B SAR [SV9 125/100]", setCode: "SV9" }], population: {},
  buybacks: { new: { currentShops: 2, total30: 8 } }, setDates: { SV9: "2026-01-01" },
  setUrls: [{ setCode: "SV9", url: "https://www.psacard.com/pop/example" }],
  analysisIds: new Set(["new"]), now: "2026-09-27T00:00:00Z" });
assert.equal(queue.priorityTop[0].cardId, "new");
assert.equal(queue.counts.unlinked, 2);

const thin = { psaTx30d: 0, buyback30: 0, catalogCompletion: {}, psaDecision: { expectedProfit: 1000 }, roi: 5 };
assert.equal(visibility.isVisible(thin, { enabled: true }), false);
assert.equal(visibility.isVisible(thin, { enabled: true, query: "M2 110/080" }), true);
assert.equal(visibility.isVisible(thin, { enabled: true, purchaseMode: "snkr-raw" }), true);
assert.equal(visibility.isVisible({ ...thin, catalogCompletion: { n: true } }, { enabled: true }), true);
assert.equal(visibility.isVisible({ ...thin, catalogCompletion: { rr: true } }, { enabled: true }), true);
assert.equal(visibility.isVisible({ ...thin, psaDecision: { expectedProfit: 25000 }, roi: 45 }, { enabled: true }), true);
assert.equal(visibility.isVisible({ ...thin, psaTx30d: 1 }, { enabled: true }), true);
assert.equal(visibility.isVisible({ ...thin, buyback30: 1 }, { enabled: true }), true);
assert(!fs.readFileSync("decision-model.js", "utf8").includes("psa-market-trial"));
console.log("PSA market trial, identity, overlap, queue and visibility tests passed");
