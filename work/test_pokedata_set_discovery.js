const assert = require("node:assert/strict");
const { discover, fetchSets } = require("./discover_pokedata_sets");
const { activeQueue, selectNextSet } = require("./select_pokedata_set");
const { fetchJson } = require("./update_pokedata_batch");

const source = [
  { id: 1, name: "New Japanese Set", code: "M6", language: "JAPANESE", tcg: "Pokemon", live: true, release_date: "2026-09-01" },
  { id: 2, name: "Duplicate A", code: "M4", language: "JAPANESE", tcg: "Pokemon", live: true },
  { id: 3, name: "Duplicate B", code: "M4", language: "JAPANESE", tcg: "Pokemon", live: true },
  { id: 4, name: "Missing code", code: null, language: "JAPANESE", tcg: "Pokemon", live: true },
  { id: 5, name: "English Set", code: "EN1", language: "ENGLISH", tcg: "Pokemon", live: true },
  ...Array.from({ length: 20 }, (_, offset) => ({ id: offset + 10, name: `Other ${offset}`, code: `O${offset}`,
    language: "JAPANESE", tcg: "Pokemon", live: true })),
];
const domestic = [{ setCode: "M6", p10tv30: 12 }, { setCode: "M4" }, { setCode: "EN1" }];
const result = discover(source, domestic, { sets: [] }, 1);
assert.equal(result.eligibleSets, 1);
assert.equal(result.eligible[0].setCode, "M6");
assert.equal(result.manualReviewCount, 3);
assert.equal(result.eligible[0].status, "waiting");

const manifest = { sets: [{ setName: "Pokemon Card 151 Japanese", sourceCount: 516, linkageCount: 516 },
  { setName: "SM-P Promos", sourceCount: 410, linkageCount: 20 }] };
const queue = activeQueue(manifest, { eligible: result.eligible });
assert.deepEqual(queue.map((row) => row.setName), ["SM-P Promos", "New Japanese Set"]);
assert.equal(selectNextSet(manifest, [queue[1]]).setName, "New Japanese Set");
assert.throws(() => discover([], domestic, { sets: [] }, 1), /形式/);

(async () => {
  await assert.rejects(fetchSets(async () => ({ status: 403, ok: false })), (error) => error.manual === true);
  await assert.rejects(fetchSets(async () => ({ status: 200, ok: true, json: async () => { throw new Error("changed"); } })),
    (error) => error.manual === true);
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => ({ status: 403, ok: false, text: async () => "Forbidden" });
    await assert.rejects(fetchJson("https://www.pokedata.io/api/cards/1/transactions", 0),
      (error) => error.manual === true && error.metric.httpStatus === 403);
    global.fetch = async () => ({ status: 200, ok: true, text: async () => "changed HTML" });
    await assert.rejects(fetchJson("https://www.pokedata.io/api/cards/1/transactions", 0),
      (error) => error.manual === true && /JSON形式変更/.test(error.message));
  } finally {
    global.fetch = previousFetch;
  }
  console.log("PokeDATA discovery, ambiguity, checkpoint selection and access-hold tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
