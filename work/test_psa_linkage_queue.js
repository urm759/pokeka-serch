const assert = require("node:assert/strict");
const { makeQueue } = require("./build_psa_linkage_queue.js");

const url = "https://www.psacard.com/pop/tcg-cards/2017/pokemon-japanese-sun-moon-ultra/155511";
const cards = [
  { id: "a", setCode: "SM5M", name: "シロナ SR[SM5M 070/066]" },
  { id: "b", setCode: "SM5M", name: "シロナ SR[SM5M 070/066]【中国語版】" },
  { id: "c", setCode: "SMP", name: "ピカチュウ: プロモ[SM-P 239]" },
];
const population = { linked1: { u: "https://www.psacard.com/pop/tcg-cards/2018/pokemon-japanese-sm-promo/155528" }, linked2: { u: "https://www.psacard.com/pop/tcg-cards/2019/pokemon-japanese-sm-promo/163897" } };
const queue = makeQueue({
  cards: [...cards, { id: "linked1", setCode: "SMP" }, { id: "linked2", setCode: "SMP" }],
  population, buybacks: {}, setDates: {}, setUrls: [{ setCode: "SM5M", url }], analysisIds: new Set(), now: "2026-09-28T00:00:00Z",
});
assert.equal(queue.counts.linked, 2);
assert.equal(queue.counts.unlinked, 1);
assert.equal(queue.counts.ambiguous, 2);
const byId = Object.fromEntries(queue.priorityTop.map((row) => [row.cardId, row]));
assert.equal(byId.a.sourceSetUrl, url);
assert.equal(byId.b.ambiguityReason, "日本語POPと異なる言語");
assert.match(byId.c.ambiguityReason, /複数年/);
assert.equal(byId.c.candidateOfficialUrls.length, 2);
assert.equal(byId.c.sourceSetUrl, null);
console.log("PSA linkage queue tests passed");
