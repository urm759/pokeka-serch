const fs = require('node:fs');
const path = require('node:path');
const { designRecord, manifest, readStage, save } = require('./ai_pipeline');

function stub(kind, round, candidate) {
  const m = manifest();
  if (m.mode !== 'stub') throw Error('Stub may only run in the stub lane');
  const fixture = 'docs/AI_PIPELINE_SMOKE.md';
  if (kind === 'design') return {
    summary: 'Synthetic smoke test', targets: [fixture], rationale: ['No provider credentials are used'],
    scope: { allowed_paths: [fixture], forbidden_paths: [] }, data_changes_allowed: false,
    acceptance_criteria: [{ id: 'smoke', description: 'A text-only fixture is proposed', verification: 'Review the verified patch' }],
    tests_to_run: [], post_publish_checks: [], risks: [],
    needs_user_decision: { required: m.scenario === 'needs_decision', reason: m.scenario === 'needs_decision' ? 'Synthetic owner decision' : '' }
  };
  if (kind === 'implementation') {
    const file = m.scenario === 'gate_reject' ? '.github/workflows/ai-pipeline-smoke.yml' : fixture;
    fs.writeFileSync(path.join(candidate, file), '# Synthetic test only · round ' + round + '\n');
    return {
      summary: 'Synthetic implementation ' + round, tests: [], measurements: [], unverified: [], review_focus: [], suggestions: [],
      findings: round === 2 ? readStage('review-1', 'review').findings.map(f => ({
        id: f.id, status: m.scenario === 'unresolved' ? 'not_fixed' : 'fixed', reason: 'Synthetic revision'
      })) : []
    };
  }
  if (kind === 'review') {
    const revise = m.scenario === 'unresolved' || (m.scenario === 'revise_pass' && round === 1);
    return {
      verdict: revise ? 'changes_required' : 'pass',
      criteria: designRecord().acceptance_criteria.map(c => ({ id: c.id, status: revise ? 'unmet' : 'met', evidence: 'Synthetic review' })),
      findings: revise ? [{ id: 'smoke-finding', severity: 'minor', file: fixture, line: 1,
        problem: 'Synthetic revision test', fix: 'Revise the fixture', acceptance: 'Fixture revised' }] : [],
      prior_findings: round === 2 ? readStage('review-1', 'review').findings.map(f => ({
        id: f.id, status: revise ? 'unresolved' : 'resolved', evidence: 'Synthetic review'
      })) : [],
      unverified: [], post_publish_checks: [], suggestions: []
    };
  }
  throw Error('Unknown stub role');
}

if (require.main === module) {
  const [kind, round, candidate] = process.argv.slice(2);
  save('model-result.json', stub(kind, Number(round), candidate));
}
