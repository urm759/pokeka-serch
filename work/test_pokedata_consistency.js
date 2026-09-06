const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { fromSetEntries } = require("./pokedata_aggregate.js");

const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const manifest = read("data/pokedata/manifest.json");
const status = read("data/update-status.json");
const coverage = read("data/link-coverage.json").current.storeCoverage.overseasSources.pokedata;
const expected = fromSetEntries(manifest.sets, manifest.acquisition.updatedAt);

assert.deepStrictEqual(manifest.acquisition, expected, "manifest must contain the shared acquisition aggregate");
for (const entry of manifest.sets) {
  const shard = read(entry.file);
  assert.deepStrictEqual(shard.acquisition, entry.acquisition, `${entry.setName}: shard and manifest acquisition mismatch`);
}
for (const field of [
  "linkedCards", "browserValidatedCards", "browserPricedCards", "adoptedRawRows", "adoptedPsa10Rows", "adoptedPsa9Rows",
  "usableRawMedianCards", "usablePsa10MedianCards", "usablePsa9MedianCards", "allGradesSufficientCards",
  "browserValidationPct", "pricedCardPct", "usableRawMedianPct", "usablePsa10MedianPct", "usablePsa9MedianPct",
]) {
  assert.deepStrictEqual(status.sources.pokedata.diagnostics[field], manifest.acquisition[field], `update status mismatch: ${field}`);
  assert.deepStrictEqual(coverage.diagnostics[field], manifest.acquisition[field], `coverage diagnostics mismatch: ${field}`);
  assert.deepStrictEqual(coverage[field], manifest.acquisition[field], `overseas panel mismatch: ${field}`);
}
assert.equal(manifest.acquisition.medianPolicy.minimumAdoptedCount, 3);
assert.notEqual(manifest.acquisition.browserValidatedCards, manifest.acquisition.usablePsa10MedianCards, "verification and PSA10 sufficiency must remain separate");
assert.equal(manifest.sets.find((entry) => entry.setName === "Battle Partners").acquisition.browserValidationPct, 100);
assert(manifest.qualityAudit?.sampleSize >= 100, "automatic match audit must sample at least 100 rows");
assert.equal(manifest.qualityAudit?.passed, true, "automatic match audit must pass before publishing");
assert(Number(manifest.qualityAudit?.mismatchRatePct) <= Number(manifest.qualityAudit?.thresholdPct), "mismatch rate exceeds publishing threshold");
assert.equal(manifest.nextSetPriorities?.length, 3, "three next-set priorities are required");
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /認証画面確認済み/);
assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /全グレード十分/);

console.log(JSON.stringify({ aggregate: manifest.acquisition, consistent: true }));
