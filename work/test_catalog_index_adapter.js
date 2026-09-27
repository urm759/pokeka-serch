const assert = require("assert");
const { fromSearchAndCompletion } = require("../catalog-index-adapter.js");
const search = require("../data/card-catalog/search-index.json").cards;
const completion = require("../data/card-catalog-completion.json").cards;
const original = require("../data/card-catalog/index.json").cards;
const derived = fromSearchAndCompletion(search, completion);
assert.equal(derived.length, original.length);
const byId = new Map(original.map((row) => [row.id, row]));
for (const row of derived) {
  const before = byId.get(row.id);
  assert(before, `Missing ${row.id}`);
  for (const field of ["name", "chunk", "status", "siteNew", "isNew", "recentRelease", "relisted", "releaseDate", "releaseYear", "setCode"]) {
    assert.equal(row[field], before[field], `${row.id} ${field}`);
  }
}
const trial = require("../data/psa-market-trial.json");
assert(trial.certificates.every((cert) => byId.has(cert.cardId)));
console.log(`catalog index adapter tests passed: ${derived.length} rows, all critical fields equal`);
