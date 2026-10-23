const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./acquisition_retry');

function read(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'data/psa-access-policy.json'), 'utf8').replace(/^\uFEFF/, '')); }
  catch { return null; }
}
function decision(policy, phase = 'acquisition') {
  if (!['acquisition', 'publication'].includes(phase)) throw Error('Unknown PSA permission phase');
  const evidence = policy?.permissionEvidence;
  const documented = policy?.version === 1 && typeof evidence === 'string' && evidence.trim().length > 0;
  const allowed = documented && policy[phase === 'acquisition' ? 'automaticAcquisition' : 'publicationOfNewData'] === true;
  return { allowed: Boolean(allowed), phase, kind: 'permission', scope: 'source',
    dataScope: policy?.dataScope || 'official-population-and-grade-rate',
    independentOfOverseasPriceFreeze: true,
    status: allowed ? 'permission-confirmed' : 'permission-wait',
    reason: allowed ? 'Documented permission for this phase' : policy?.reason || 'PSA permission record missing or invalid; saved data and checkpoint retained',
    resumeCondition: policy?.resumeCondition || 'Confirm documented permission for acquisition and public reuse separately',
    nextRetryAt: null, automaticRetry: false, preserveSavedData: true, preserveCheckpoint: true };
}
function assertAllowed(root, phase = 'acquisition') {
  const result = decision(read(root), phase);
  if (!result.allowed) {
    const error = new Error(`PSA permission-wait: ${result.reason}`);
    error.code = 'PSA_PERMISSION_REQUIRED';
    throw error;
  }
  return result;
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const result = decision(read(root), process.argv.includes('--publication') ? 'publication' : 'acquisition');
  if (process.argv.includes('--record')) atomicWrite(path.join(root, 'work/psa-access-state.json'), {
    ...result, checkedAt: new Date().toISOString(), acquiredCount: 0, httpRequests: 0, llmCalls: 0, codexCalls: 0,
  });
  console.log(JSON.stringify(result));
  process.exitCode = result.allowed ? 0 : 3;
}
module.exports = { read, decision, assertAllowed };
