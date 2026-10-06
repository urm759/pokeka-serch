const fs = require("node:fs");
const path = require("node:path");
function permitted(root = path.join(__dirname, "..")) {
  try {
    const policy = JSON.parse(fs.readFileSync(path.join(root, "data/snkr-access-policy.json"), "utf8"));
    return policy.authorized === true && Boolean(policy.authorizationEvidence) && Number.isFinite(Date.parse(policy.confirmedAt));
  } catch { return false; }
}
function hold(route) {
  if (permitted()) return false;
  console.log(JSON.stringify({ completionStatus: "manual-action-required", route, attemptedCount: 0, updated: 0,
    httpRequests: 0, stopReason: "スニダン自動収集の許諾未確認。第7条1項13号を確認。正常な過去データ・取得日時・再開位置を保持", llmCalls: 0, codexCalls: 0 }));
  return true;
}
module.exports = { permitted, hold };
