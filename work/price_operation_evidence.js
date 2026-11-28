const fs = require('node:fs');
const path = require('node:path');
const { LABELS: dailyLabels } = require('./daily_run_outcomes');

const inspectionLabels = {
  'publication-completed-separate-failure-no-price-recovery': '保存・push完了後の失敗または取消',
  'observer-only-failure-no-price-recovery': '監視・公開確認の失敗',
  'monitor-failed-before-acquisition': '取得前の失敗',
};
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const timestamp = value => Number.isFinite(Date.parse(value)) ? value : null;
const runId = value => /^\d+$/.test(String(value)) ? String(value) : null;
const sortedRecent = items => items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);

function inRunWindow(at, run) {
  const instant = Date.parse(at);
  const start = Date.parse(run.run_started_at || run.created_at);
  const end = run.status === 'completed' ? Date.parse(run.updated_at) : Infinity;
  return instant >= start && instant <= end;
}

function fromFirstAttempt(record, run) {
  return Boolean(runId(record?.runId) && run && runId(record.runId) === runId(run.id)
    && run.run_attempt === 1 && inRunWindow(record.startedAt, run));
}

function savedInspections(root) {
  const directory = path.join(root, 'work');
  return fs.readdirSync(directory).flatMap(name => {
    const match = name.match(/^recovery-inspected-(\d+)\.json$/);
    if (!match) return [];
    try {
      const row = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      return runId(row.runId) === match[1] ? [row] : [];
    } catch { return []; }
  });
}

function build({ pipelines, execution, dailySources, dailyOutcomes = [], sourceRecovery, inspections = [] }) {
  const fresh = [];
  const issues = dailyOutcomes.filter(row => !['recovered', 'unclassified-failure'].includes(row.state)
    && Object.hasOwn(dailyLabels, row.state) && runId(row.runId) && timestamp(row.createdAt))
    .map(row => ({ runId: String(row.runId), attempt: row.attempt, at: row.createdAt, state: row.state,
      label: dailyLabels[row.state], originalConclusion: row.originalConclusion }));
  for (const route of ['priority', 'watch']) {
    const run = pipelines?.[route]?.find(row => runId(row.id) === runId(execution?.runId));
    if (!fromFirstAttempt(execution, run) || execution.headSha !== run.head_sha) continue;
    const steps = (execution.runs || []).filter(row => inRunWindow(row.startedAt, run));
    for (const row of steps) {
      if (!(count(row.httpRequests) > 0)) continue;
      fresh.push({ runId: String(run.id), attempt: 1, at: row.startedAt, route, script: row.script,
        httpRequests: row.httpRequests, refreshedCards: count(row.refreshed), status: row.status });
    }
    const failedScripts = [...new Set(steps.filter(row => row.processStatus === 'failed' && row.failureClass === 'source-acquisition')
      .map(row => row.script))];
    if (failedScripts.length) issues.push({ runId: String(run.id), attempt: 1, at: execution.startedAt, state: 'acquisition-failed',
      label: dailyLabels['acquisition-failed'], originalConclusion: run.conclusion, failedScripts });
  }
  const daily = pipelines?.daily?.find(row => runId(row.id) === runId(dailySources?.runId));
  if (fromFirstAttempt(dailySources, daily)) {
    const buyback = dailySources.sources?.find(row => row.source === 'shopBuyback');
    if (count(buyback?.shopBuyback?.acquiredCount) > 0 && inRunWindow(buyback.startedAt, daily)) {
      fresh.push({ runId: String(daily.id), attempt: 1, at: buyback.startedAt, route: 'daily', source: 'shopBuyback',
        acquiredQuotes: buyback.shopBuyback.acquiredCount, httpRequests: null, status: buyback.shopBuyback.completionStatus });
    }
  }

  const recovered = dailyOutcomes.filter(row => row.state === 'recovered' && runId(row.runId) && timestamp(row.publicVerifiedAt))
    .map(row => ({ runId: String(row.runId), attempt: row.attempt, at: row.publicVerifiedAt,
      status: '退避原票から回収・Pages照合済み', recoverySourceRequests: 0, originalConclusion: row.originalConclusion }));
  const publicProof = sourceRecovery?.publicationEvidence;
  if (runId(sourceRecovery?.runId) && sourceRecovery.newHttpRequests === 0 && count(sourceRecovery.recoveredSourceFiles) > 0
    && timestamp(publicProof?.checkedAt) && /^[a-f0-9]{40}$/.test(publicProof.commit || '')) {
    const existing = recovered.find(row => row.runId === String(sourceRecovery.runId));
    if (!existing) recovered.push({ runId: String(sourceRecovery.runId), at: publicProof.checkedAt, status: '回収した国内原票の公開照合済み',
      recoverySourceRequests: 0, recoveredFiles: sourceRecovery.recoveredSourceFiles });
  }

  for (const row of inspections) {
    if (!runId(row.runId) || !timestamp(row.checkedAt) || !Object.hasOwn(inspectionLabels, row.status)) continue;
    issues.push({ runId: String(row.runId), attempt: row.runAttempt, at: row.checkedAt, state: row.status,
      label: inspectionLabels[row.status], originalConclusion: row.originalConclusion,
      pushCompletionProven: row.publicationStepSucceeded === true });
  }
  return { version: 1, freshSourceEvidence: sortedRecent(fresh), recovered: sortedRecent(recovered), issues: sortedRecent(issues),
    note: '根拠がある直近各5行。HTTP回数、確認枚数、買取提示数、回収ファイル数は別単位。公開照合や回収を実取得に加算せず、記録なしを取得0としない。',
    sourceRequests: 0, llmCalls: 0 };
}

module.exports = { build, savedInspections };
