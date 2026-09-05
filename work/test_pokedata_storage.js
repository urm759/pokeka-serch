const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { selectShardFiles, writeSetState } = require("./pokedata_storage.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokedata-shards-"));
const cards = Object.fromEntries(Array.from({ length: 57 }, (_, index) => [`card-${index}`, { localCardId: `card-${index}` }]));
const records = Array.from({ length: 132 }, (_, index) => ({ pokedataCardId: index, setName: "Battle Partners", localCardId: index < 57 ? `card-${index}` : null }));
const result = writeSetState(root, { coverage: { acquired: 132 }, linkage: { records } }, {
  setName: "Battle Partners", setCode: "SV9", cards, records, sourceCount: 132,
  updatedAt: "2026-09-05T00:00:00.000Z",
});
assert.equal(result.manifest.sets.length, 1);
assert.equal(result.entry.count, 57);
assert.equal(result.entry.linkageCount, 132);
assert.deepStrictEqual(selectShardFiles(result.manifest, ["card-1"]), [result.entry.file]);
assert.deepStrictEqual(selectShardFiles(result.manifest, ["not-present"]), []);
const compact = JSON.parse(fs.readFileSync(path.join(root, "data", "pokedata-summary.json"), "utf8"));
assert(!Object.hasOwn(compact, "cards"));
assert.equal(compact.storage.lazyLoaded, true);

const simulatedManifest = {
  sets: Array.from({ length: 121 }, (_, setIndex) => ({
    file: `data/pokedata/sets/set-${setIndex}.json`,
    localCardIds: Array.from({ length: 100 }, (_, cardIndex) => `card-${setIndex * 100 + cardIndex}`),
  })),
};
const startedAt = performance.now();
const selected = selectShardFiles(simulatedManifest, ["card-12032"]);
const elapsedMs = performance.now() - startedAt;
assert.equal(selected.length, 1);
assert(elapsedMs < 100, `12,033-card manifest selection took ${elapsedMs.toFixed(1)}ms`);

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(app, /pokedata\/manifest\.json/);
assert.match(app, /ensurePokedataForCardIds/);
assert.match(app, /if \(state\.q\) visibleCards/);
console.log(JSON.stringify({ pokedataStorage: "ok", simulatedCards: 12033, selectionMs: Number(elapsedMs.toFixed(3)) }));
