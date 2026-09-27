const assert = require("assert");
const model = require("../grade-calibration.js");
const noOfficial = model.assess({ cardId: "a", releaseYear: null, officialRate: null, records: [] });
assert.equal(noOfficial.officialRate, null);
assert.equal(noOfficial.suggestedRate, null);
assert.equal(noOfficial.year.count, 0);
assert.equal(noOfficial.productionApplied, false);

const tenSuccesses = Array.from({ length: 10 }, (_, index) => ({ cardId: "a", releaseYear: 2026, inspection: "高", grade: "PSA10", specimenId: String(index) }));
const small = model.assess({ cardId: "a", releaseYear: 2026, officialRate: 65, records: tenSuccesses });
assert.equal(small.card.count, 10);
assert.equal(small.card.psa10, 10);
assert.equal(small.card.inspections["高"], 10);
assert.equal(small.eligibleForSharedReview, false, "少数の全成功で補正候補を出さない");
assert.equal(small.suggestedRate, null);

const many = Array.from({ length: 150 }, (_, index) => ({
  cardId: `c${index % 15}`, releaseYear: 2025, inspection: "標準",
  grade: index % 5 === 0 ? "PSA9" : "PSA10", specimenId: String(index),
}));
const eligible = model.assess({ cardId: "new", releaseYear: 2025, officialRate: 70, records: many });
assert.equal(eligible.year.count, 150);
assert.equal(eligible.year.distinctCards, 15);
assert.equal(eligible.eligibleForSharedReview, true);
assert(eligible.suggestedRate <= 75 && eligible.suggestedRate >= 60);
assert.equal(eligible.productionApplied, false, "補正候補があっても本番上限へ自動反映しない");
const missing = model.assess({ cardId: "new", releaseYear: 2025, officialRate: null, records: many });
assert.equal(missing.suggestedRate, null, "公式値未取得を0%の事前値として扱わない");
assert.equal(model.summarize([{ cardId: "x", grade: "PSA8以下" }]).below9, 1);
console.log("grade calibration tests passed");
