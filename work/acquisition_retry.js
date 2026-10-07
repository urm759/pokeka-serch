const fs = require("node:fs");

function classify(error = {}) {
  const message = String(error.error || error.message || error.reason || "");
  const httpStatus = Number(error.httpStatus || error.metric?.httpStatus || message.match(/HTTP\s+(\d{3})/i)?.[1]);
  if (httpStatus === 401 || /sign-in|sign in|認証切れ|login required/i.test(message)) return { kind: "authentication", scope: "source", manual: true };
  if (httpStatus === 403 || /Cloudflare|robot|verification|external_access_blocked/i.test(message)) return { kind: "access", scope: "source", manual: true };
  if (httpStatus === 429) return { kind: "rate-limit", scope: "source", manual: false };
  if (httpStatus >= 500 && httpStatus <= 599 || /timeout|timed? out|ETIMEDOUT|AbortError|ECONNRESET|ENOTFOUND|fetch failed/i.test(message)) return { kind: "transient", scope: "url", manual: false };
  if (/populated table|表が見つ|sitemap.*not found|HTTP 404|HTTP 410/i.test(message)) return { kind: "missing-page", scope: "url", manual: true };
  if (/形式|format|JSON|structure|商品サイトマップ/i.test(message)) return { kind: "format", scope: error.scope || "url", manual: true };
  if (/同一カード|不一致|ambiguous|曖昧/i.test(message)) return { kind: "identity", scope: "url", manual: true };
  return { kind: "unclassified", scope: "url", manual: true };
}

function failure(old = {}, error = {}, now = Date.now(), options = {}) {
  const policy = classify(error);
  const attempts = Number(old.attempts || old.failures || 0) + 1;
  const maxAttempts = options.maxAttempts || 5;
  const exhausted = !policy.manual && attempts >= maxAttempts;
  const delayMs = Math.min(24 * 3600000, (options.baseDelayMs || 3600000) * 2 ** Math.min(5, attempts - 1));
  return { ...policy, attempts, failures: attempts, maxAttempts, exhausted,
    reason: String(error.error || error.message || error.reason || "unknown error"),
    lastAttemptAt: new Date(now).toISOString(), lastSuccessAt: old.lastSuccessAt || null,
    status: policy.manual || exhausted ? "manual-wait" : "retry-wait",
    held: policy.manual || exhausted, manualReview: policy.manual || exhausted,
    waitMs: policy.manual || exhausted ? null : delayMs,
    nextRetryAt: policy.manual || exhausted ? null : new Date(now + delayMs).toISOString(),
    resumeCondition: exhausted ? "再試行上限に到達。原因確認後にこのURLの試行回数のみ再開" : policy.manual ? "正規アクセス・形式・同一仕様の確認後に停止範囲だけ再開" : "待機期限後の定期実行で自動再試行" };
}

function eligible(state, now = Date.now()) {
  if (!state) return true;
  if (state.held || state.manualReview) return false;
  const next = Date.parse(state.nextRetryAt || "");
  return !Number.isFinite(next) || next <= now;
}

function migrateLegacy(state, now = Date.now()) {
  if (state && !state.kind && !state.reason && Number(state.failures || 0) >= 3) return { ...state, kind: "unclassified", scope: "url", held: true, manualReview: true, reason: "旧再試行記録の原因未記録・確認待ち" };
  if (!state || state.kind || !(state.held || state.manualReview)) return state;
  const policy = classify(state);
  if (policy.manual) return { ...state, ...policy };
  return { ...state, ...failure({ attempts: Math.max(0, Number(state.attempts || state.failures || 1) - 1), lastSuccessAt: state.lastSuccessAt }, state, now) };
}

function atomicWrite(file, value, indent = 2) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, indent), "utf8");
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); break; }
    catch (error) {
      if (attempt >= 3 || !['EPERM','EACCES','EBUSY','UNKNOWN'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * 2 ** attempt);
    }
  }
}

// Exclusive, OS-released process ownership; a live worker is never evicted by age.
function lock(file) {
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return () => { fs.closeSync(fd); fs.unlinkSync(file); };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try { owner = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("Worker lock unreadable; review required"); }
    try { process.kill(owner.pid, 0); } catch (e) {
      if (e.code === "ESRCH") { fs.unlinkSync(file); return lock(file); }
      throw e;
    }
    throw new Error(`Worker already running (pid ${owner.pid}); checkpoint unchanged`);
  }
}

module.exports = { classify, failure, eligible, migrateLegacy, atomicWrite, lock };
