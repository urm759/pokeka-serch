const FAILURES = new Set(['failure', 'timed_out']);
const LABELS = {
  'acquisition-failed': '取得工程で失敗',
  'validation-failed': '必須検証で失敗',
  'saved-not-published': '原票退避あり・未公開',
  'publication-failed': '公開工程で失敗・退避未確認',
  'pages-unverified': '保存・push済み・Pages公開照合待ち',
  'source-warning': '一部取得元警告・正常分は公開照合済み',
  'recovered': '退避原票から回収・Pages確認済み',
  'unclassified-failure': '失敗工程未確認',
};

function classify(run, { jobs = [], artifacts = [], proof = null, recovery = null } = {}) {
  const outcome = { runId: String(run.id), attempt: run.run_attempt || 1, originalConclusion: run.conclusion,
    createdAt: run.created_at, url: run.html_url };
  const steps = jobs.flatMap(job => job.steps || []);
  const save = steps.find(step => step.name === 'Commit changed data only');
  const failed = steps.filter(step => FAILURES.has(step.conclusion)).map(step => step.name);
  const verified = String(proof?.runId) === outcome.runId && proof.runAttempt === outcome.attempt
    && proof.publicationConfirmed && proof.receiptMatches && proof.hashes?.length && proof.hashes.every(item => item.matched)
    && ['acquisition', 'validation', 'savePublish'].every(stage => proof.stages?.[stage] === true);
  const archived = artifacts.filter(item => !item.expired &&
    new RegExp('^daily-(?:recovery|prevalidation)-' + outcome.runId + '-' + outcome.attempt + '$').test(item.name)
    && Number(item.size_in_bytes) > 0);
  const failedRun = FAILURES.has(run.conclusion);
  const recovered = failedRun && String(recovery?.runId) === outcome.runId && recovery.attempt === outcome.attempt
    && recovery?.sourceRequests === 0 && recovery?.requiredChecks > 0 && Number.isFinite(Date.parse(recovery?.publicVerifiedAt))
    && /^[0-9a-f]{40}$/.test(recovery?.publishedCommit || '') && Number.isSafeInteger(recovery?.pagesRunId)
    && /^[0-9a-f]{64}$/.test(recovery?.artifactSha256 || '');
  let state = run.conclusion === 'success' ? (verified ? 'published' : 'success-no-receipt') : 'unclassified-failure';
  if (recovered) state = 'recovered';
  else if (verified && failedRun && failed.includes('Report independent acquisition failures without hiding them')) state = 'source-warning';
  else if (save?.conclusion === 'success' && !verified && (failedRun || proof?.receiptMatches)) state = 'pages-unverified';
  else if (failedRun && archived.length) state = 'saved-not-published';
  else if (failedRun && FAILURES.has(save?.conclusion)) state = 'publication-failed';
  else if (failed.some(name => /mandatory verification|fast regression/.test(name))) state = 'validation-failed';
  else if (failed.some(name => /Run deterministic delta update|Refresh independent sources/.test(name))) state = 'acquisition-failed';
  return { ...outcome, state, failedStages: failed, archiveIds: archived.map(item => item.id),
    publicVerifiedAt: recovered ? recovery.publicVerifiedAt : verified ? proof.publicVerifiedAt || null : null,
    ...(recovered ? { pagesRunId: recovery.pagesRunId, publishedCommit: recovery.publishedCommit } : {}) };
}

function updateHistory(previous, observations, limit = 30) {
  const indexed = new Map((previous || []).map(row => [row.runId + ':' + row.attempt, row]));
  for (const row of observations) {
    const key = row.runId + ':' + row.attempt;
    const prior = indexed.get(key);
    if (prior?.publicVerifiedAt && !row.publicVerifiedAt) continue;
    if (prior && row.state === 'unclassified-failure' && prior.state !== row.state) continue;
    indexed.set(key, row);
  }
  return [...indexed.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.attempt - a.attempt).slice(0, limit);
}

module.exports = { classify, updateHistory, LABELS };
