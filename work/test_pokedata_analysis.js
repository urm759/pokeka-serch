const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { analyzeSales, classifySale } = require("./pokedata_analysis.js");

const identity = {
  number: "126",
  setAliases: ["Battle Partners", "SV9"],
  nameTokens: ["lillie", "clefairy", "ex"],
};

function sale(id, grade, price, title, date = "2026-08-20") {
  return { rowId: id, psa_grade: grade, sold_price: `¥${price}`, title, date_sold: date };
}

const base = "Pokemon Japanese SV9 Battle Partners Lillie's Clefairy ex 126/100";
assert.equal(classifySale(sale("tag", "Raw", 20000, `${base} TAG 10`), identity).classifiedGrade, "TAG10");
assert(classifySale(sale("tag", "Raw", 20000, `${base} TAG 10`), identity).reasons.includes("PSA以外の鑑定品:TAG"));
assert(classifySale(sale("kr", "Raw", 20000, `${base} Korean`), identity).reasons.includes("日本版以外"));
assert(classifySale(sale("lot", "Raw", 20000, `${base} lot of 2`), identity).reasons.includes("複数枚セット"));
assert.equal(classifySale(sale("sealed", "Raw", 20000, `${base} booster pack sealed`), identity).reviewClass, "out-of-scope");
assert.equal(classifySale(sale("mismatch", "Raw", 20000, "Pokemon Japanese SV8a Lillie's Clefairy ex 127/100"), identity).reviewClass, "ambiguous");
assert.equal(classifySale(sale("psa", "Raw", 40000, `${base} PSA 10`), identity).classifiedGrade, "PSA10");
assert.equal(classifySale(sale("missing", "PSA10", 40000, null), identity).status, "unverified");
assert.equal(classifySale(sale("missing", "PSA10", 40000, null), identity).reviewClass, "unverifiable");

const sample = [
  sale("raw1", "Raw", 18000, base),
  sale("raw2", "Raw", 19000, base),
  sale("raw3", "Raw", 20000, base),
  sale("raw4", "Raw", 21000, base),
  sale("raw5", "Raw", 22000, base),
  sale("raw6", "Raw", 23000, base),
  sale("raw7", "Raw", 24000, base),
  sale("raw8", "Raw", 25000, base),
  sale("raw-outlier", "Raw", 900000, base),
  sale("raw-tag", "Raw", 20000, `${base} TAG 10`),
];
const analyzed = analyzeSales(sample, identity, 156.25);
assert.equal(analyzed.summaries.raw.originalCount, 10);
assert.equal(analyzed.summaries.raw.adoptedCount, 8);
assert.equal(analyzed.summaries.raw.outlierCount, 1);
assert.equal(analyzed.summaries.raw.excludedCount, 2);
assert(Number.isFinite(analyzed.summaries.raw.medianJpy));

const generatedPath = path.join(__dirname, "..", "data", "pokedata-summary.json");
if (fs.existsSync(generatedPath)) {
  const generated = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "pokedata", "manifest.json"), "utf8"));
  const battlePartners = manifest.sets.find((entry) => entry.setName === "Battle Partners");
  if(manifest.publicationStatus==='cancelled'){
    assert.equal(generated.publicationStatus,'cancelled');
    assert.deepEqual(manifest.sets,[],'saved matching records are private after cancellation');
    assert.deepEqual(manifest.nextSetPriorities,[]);
  }else{
  assert(battlePartners, "Battle Partners shard is missing");
  const shard = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ...battlePartners.file.split("/")), "utf8"));
  const card = shard.cards["pk-63635"];
  assert(card, "Lillie's Clefairy ex trial data is missing");
  if(manifest.publicationStatus==='permission-wait'){
    assert.equal(generated.publicationStatus,'permission-wait');
    assert.deepEqual(card.markets,{},'unlicensed prices cannot remain a repository fixture');
    assert.equal(require('./enforce_overseas_publication').priceLeaks(shard).length,0);
  }else for(const market of Object.values(card.markets||{}).filter(m=>m.priceSource==='actual-sale')){
    assert.equal(market.originalCount,market.adoptedCount+market.excludedCount);
    assert(Number.isFinite(market.medianJpy));assert(market.targetPeriod);
  }
  }
}

console.log("PokeDATA classification and audit tests passed.");
