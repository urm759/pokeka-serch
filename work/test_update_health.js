const assert = require("node:assert/strict");
const model = require("../update-health-model.js");
const now = Date.parse("2026-09-30T00:00:00Z");
const run = (id, conclusion, updated_at) => ({ id, status: "completed", conclusion, created_at: updated_at, updated_at, html_url: `https://github.com/urm759/pokeka-serch/actions/runs/${id}` });
const fresh = "2026-09-29T18:00:00Z";
assert.equal(model.evaluate({ now, runs: [run(2, "success", fresh)], sourceLastSuccessAt: fresh }).status, "ok");
const failures = model.evaluate({ now, runs: [run(4, "failure", fresh), run(3, "failure", "2026-09-29T12:00:00Z"), run(2, "success", "2026-09-28T00:00:00Z")], sourceLastSuccessAt: fresh });
assert.equal(failures.status, "alert");
assert.equal(failures.consecutiveFailures, 2);
assert(failures.reasons.some((reason) => reason.includes("24時間以上")), "前回成功からの停止も検出する");
const stale = model.evaluate({ now, runs: [run(2, "success", fresh)], sourceLastSuccessAt: "2026-09-28T23:59:00Z" });
assert(stale.reasons.some((reason) => reason.includes("みんトレ")));
assert.equal(model.evaluate({ now, runs: [], sourceLastSuccessAt: null }).status, "alert", "履歴欠損を正常扱いしない");
assert.equal(model.fingerprint({ ...failures, sourceAgeHours: 1 }), model.fingerprint({ ...failures, sourceAgeHours: 3 }), "経過時間のみでは再通知しない");
assert.notEqual(model.fingerprint(failures), model.fingerprint({ ...failures, latestRunId: 5 }), "新しい失敗は再通知する");
console.log("update failure and 24-hour stall tests passed");
const proof={runId:4,confirmed:true,receiptMatches:true,event:'schedule',hashes:[{matched:true}],stages:{acquisition:true,validation:true,savePublish:true}};
const partial=model.evaluate({now,runs:[run(4,'failure',fresh),run(3,'failure','2026-09-28T00:00:00Z')],sourceLastSuccessAt:fresh,verifiedPublications:[proof]});
assert.equal(partial.consecutiveFailures,0);
assert.equal(partial.workflowConsecutiveFailures,2);
assert(partial.partialPublished);
assert(partial.reasons.some(r=>r.includes('一部取得元')));
assert(!partial.reasons.some(r=>/連続失敗|24時間/.test(r)));
for(const invalid of [{...proof,confirmed:false},{...proof,receiptMatches:false},{...proof,hashes:[{matched:false}]},{...proof,event:'workflow_dispatch'},{...proof,stages:{...proof.stages,validation:false}}]) {
  assert(!model.evaluate({now,runs:[run(4,'failure',fresh)],sourceLastSuccessAt:fresh,verifiedPublications:[invalid]}).partialPublished);
}
const next=model.evaluate({now,runs:[run(5,'failure',fresh),run(4,'failure','2026-09-29T12:00:00Z')],sourceLastSuccessAt:fresh,verifiedPublications:[proof]});
assert.equal(next.consecutiveFailures,1,'a new pipeline failure must still alert');
assert(model.sourceOnlyFailure({runId:4,runs:[{processStatus:'failed',failureClass:'source-acquisition'}]},4));
assert(!model.sourceOnlyFailure({runId:4,runs:[{processStatus:'failed',failureClass:'required-calculation'}]},4));
assert(!model.sourceOnlyFailure({runId:3,runs:[{processStatus:'failed',failureClass:'source-acquisition'}]},4));
assert(!model.sourceOnlyFailure({runId:4,runs:[{processStatus:'failed'}]},4));

const daily=require('./daily_run_outcomes');
const failedRun={...run(4,'failure',fresh),run_attempt:2};
const archive={id:100,name:'daily-recovery-4-2',size_in_bytes:500,expired:false};
const jobs=(name,conclusion='failure')=>[{steps:[{name,conclusion}]}];
assert.equal(daily.classify(failedRun,{jobs:jobs('Run deterministic delta update')}).state,'acquisition-failed');
assert.equal(daily.classify(failedRun,{jobs:jobs('Run fast regression tests')}).state,'validation-failed');
assert.equal(daily.classify(failedRun,{jobs:jobs('Commit changed data only'),artifacts:[archive]}).state,'saved-not-published');
assert.equal(daily.classify(failedRun,{jobs:jobs('Commit changed data only'),artifacts:[{...archive,name:'daily-recovery-4-1'}]}).state,'publication-failed');
assert.equal(daily.classify(failedRun,{jobs:jobs('Commit changed data only','success')}).state,'pages-unverified');
const publishedProof={...proof,publicationConfirmed:true,runAttempt:2,publicVerifiedAt:'2026-09-29T18:15:00Z'};
assert.equal(daily.classify(failedRun,{jobs:jobs('Report independent acquisition failures without hiding them'),proof:publishedProof}).state,'source-warning');
assert.equal(daily.classify(failedRun,{jobs:jobs('Report independent acquisition failures without hiding them'),proof:{...publishedProof,runAttempt:1}}).state,'unclassified-failure');
const recovered=daily.classify(failedRun,{artifacts:[archive],recovery:{
  runId:'4',attempt:2,sourceRequests:0,requiredChecks:9,publicVerifiedAt:'2026-09-29T18:15:00Z',
  artifactSha256:'a'.repeat(64),publishedCommit:'b'.repeat(40),pagesRunId:123,
}});
assert.equal(recovered.state,'recovered');
assert.equal(recovered.originalConclusion,'failure');
assert.equal(daily.updateHistory([recovered],[daily.classify(failedRun)])[0].state,'recovered');
const recoveredHealth=model.evaluate({now,runs:[failedRun],sourceLastSuccessAt:fresh,dailyOutcomes:[recovered],outcomeLabels:daily.LABELS});
assert.equal(recoveredHealth.consecutiveFailures,0);
assert.equal(recoveredHealth.workflowConsecutiveFailures,1);
assert.equal(recoveredHealth.lastSuccessfulRunAt,recovered.publicVerifiedAt);
assert.equal(recoveredHealth.latestRunConclusion,'failure');
assert.equal(recoveredHealth.status,'ok');
