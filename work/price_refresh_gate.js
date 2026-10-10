const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite, lock } = require('./acquisition_retry');
const HOUR = 3600000;
function decision(previous = {}, now = Date.now(), catchup = false) {
  const started = Date.parse(previous.startedAt || '');
  if (Number.isFinite(started) && started > now) return { allowed: false, reason: '記録時刻が未来・要確認' };
  const age = Number.isFinite(started) ? now - started : null;
  const minimum = (catchup ? 2.5 : 2) * HOUR;
  return { allowed: age == null || age >= minimum, ageMs: age, minimumIntervalMs: minimum,
    reason: age != null && age < minimum ? '共通更新間隔内・重複取得なし' : '定期の空白・既存の期限順キューで補完' };
}
function execute(root, callback, { catchup = false, now = Date.now() } = {}) {
  // Actions use the same repository concurrency group; local runs also need ownership.
  const release = lock(path.join(root, 'work/priority-price-refresh.lock'));
  try {
    const file = path.join(root, 'data/priority-price-execution.json');
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const plan = decision(previous, now, catchup);
    if (!plan.allowed) return { status: 'skipped', ...plan, llmCalls: 0, codexCalls: 0 };
    const before = require('./audit_completion_outcomes').snapshot(root, now);
    const historyFile = path.join(root, 'work/price-catchup-history.json');
    const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : { runs: [] };
    const record = { startedAt: new Date(now).toISOString(), runId: process.env.GITHUB_RUN_ID || null,
      event: process.env.GITHUB_EVENT_NAME || 'local', route: catchup ? '既存監視ジョブの空白補完' : '通常価格更新',
      status: 'running', ...plan, llmCalls: 0, codexCalls: 0 };
    const save = () => {
      atomicWrite(path.join(root, 'data/price-catchup-status.json'), record);
      const rows = [...history.runs.filter(r => r.startedAt !== record.startedAt), record].slice(-60);
      atomicWrite(historyFile, { version: 1, runs: rows });
    };
    save();
    try {
      const outcome = callback();
      record.sourceFailures = outcome?.sourceFailures || [];
      record.acquisitionStatus = record.sourceFailures.length ? 'partial-with-failure' : 'process-success';
      record.status = process.exitCode ? 'partial-failure' : 'acquired-saved';
    } catch (error) {
      record.status = 'failed'; record.error = error.message; throw error;
    } finally {
      record.endedAt = new Date().toISOString();
      record.durationMs = Date.parse(record.endedAt) - now;
      record.outcomes = require('./audit_completion_outcomes').compare(before, require('./audit_completion_outcomes').snapshot(root));
      record.publicationStatus = '保存済み・公開照合待ち';
      save();
    }
    return record;
  } finally { release(); }
}
module.exports = { decision, execute };
