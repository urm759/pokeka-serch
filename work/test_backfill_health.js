const assert = require("node:assert/strict");
const { evaluate } = require("./backfill_health_model.js");

const run = (id, conclusion = "success") => ({ id, status: "completed", conclusion,
  created_at: `2026-09-30T0${id}:00:00Z`, updated_at: `2026-09-30T0${id}:10:00Z`, html_url: `https://github.com/example/actions/runs/${id}` });
const base = { now: Date.parse("2026-09-30T10:00:00Z"), safeProgress: { sources: {
  yuyutei: { status: "manual-action-required", reason: "HTTP 403・正規アクセス待ち", position: { lastSuccessfulPage: "page-3" } },
  priceEvidence: { status: "partial", position: { inspected: 15 } },
  torecacamp: { status: "partial", position: { sitemap: 3, productIndex: 8 } },
} }, pokeProgress: [{ setName: "SM-P", processedCardIds: [1, 2], targetCount: 410 }],
  discovery: { manualReview: [{ sourceSetId: 99, reason: "曖昧一致" }] } };

const first = evaluate({ ...base, safeRuns: [run(1)], pokeRuns: [run(1)] });
assert(first.issues.some((issue) => issue.reason.includes("403")), "緑のActionsでも内部停止を見せる");
assert.equal(first.backfills.reviewIds.length, 1);
assert.equal(first.backfills.newManualReviewCount, 0, "既存の曖昧候補を新規扱いしない");
const previous = { ...first, backfills: first.backfills };
const repeat = evaluate({ ...base, safeRuns: [run(2), run(1)], pokeRuns: [run(2), run(1)], previous });
assert.equal(repeat.newIssues.length, 0, "同じ403で再通知しない");
const newReview = evaluate({ ...base, safeRuns: [run(2)], pokeRuns: [run(2)], previous,
  discovery: { manualReview: [...base.discovery.manualReview, { sourceSetId: 100, reason: "別仕様" }] } });
assert.equal(newReview.backfills.newManualReviewCount, 1);
assert(newReview.newIssues.some((issue) => issue.key.startsWith("pokedata:new-manual-review")));

let snapshot = first;
for (const id of [2, 3, 4]) snapshot = evaluate({ ...base, safeRuns: [run(id)], pokeRuns: [run(id)], previous: snapshot });
assert(snapshot.issues.some((issue) => issue.key === "pokedata:stalled"));
assert(snapshot.issues.some((issue) => issue.key === "safe:priceEvidence:stalled"));
const again = evaluate({ ...base, safeRuns: [run(5)], pokeRuns: [run(5)], previous: snapshot });
assert(!again.newIssues.some((issue) => issue.key.endsWith(":stalled")), "停滞の継続通知を抑制");

let failures = first;
for (const id of [2, 3]) failures = evaluate({ ...base, safeRuns: [run(id, "failure")], pokeRuns: [run(id)], previous: failures });
assert(failures.issues.some((issue) => issue.key.startsWith("safe:repeated-failure")));
assert(!evaluate({ ...base, safeRuns: [run(4, "failure")], pokeRuns: [run(4)], previous: failures })
  .newIssues.some((issue) => issue.key.startsWith("safe:repeated-failure")));
console.log("backfill health: green holds, new reviews, repeated failures, stalls, dedup passed");
