const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { git } = require('./ai_pipeline_gate');
const { runChecks } = require('./ai_pipeline_tests');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-flow-'));
const check = (command, exit_code, pre_existing = false) => ({
  command, exit_code, pre_existing, duration_ms: 1, log: 'Fixture evidence'
});

function verifyBaselineReruns() {
  const root = fs.mkdtempSync(path.join(sandbox, 'baseline-'));
  const trusted = path.join(root, 'policy');
  const candidate = path.join(root, 'candidate');
  const trace = path.join(root, 'trace');
  for (const checkout of [trusted, candidate]) fs.mkdirSync(path.join(checkout, 'work'), { recursive: true });
  const put = (checkout, command, label, code) => {
    const body = 'require("node:fs").appendFileSync(' + JSON.stringify(trace) + ', ' + JSON.stringify(label + ' ' + command + '\n') + ');\n'
      + 'process.exitCode = ' + code + ';\n';
    fs.writeFileSync(path.join(checkout, command), body);
  };
  const commands = ['existing', 'regression', 'added', 'passing'].map(name => 'work/test_' + name + '.js');
  const [existing, regression, added, passing] = commands;
  put(trusted, existing, 'base', 9);
  put(trusted, regression, 'base', 0);
  put(trusted, passing, 'base', 9);
  git(trusted, ['init', '-q', '-b', 'main']);
  git(trusted, ['add', '.']);
  git(trusted, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'base']);
  put(trusted, regression, 'dirty-policy', 1);
  const noFailures = runChecks(trusted, candidate, []);
  assert.deepEqual(noFailures, { passed: true, checks: [] });
  for (const command of commands) put(candidate, command, 'candidate', Number(command !== passing));
  const result = runChecks(trusted, candidate, commands);
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks.map(row => [row.command, row.exit_code, row.pre_existing]), [
    [existing, 1, true], [regression, 1, false], [added, 1, false], [passing, 0, false]
  ]);
  assert.deepEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), [
    ...commands.map(command => 'candidate ' + command), 'base ' + existing, 'base ' + regression
  ]);
}

function runScenario(scenario, expected, options = {}) {
  const root = fs.mkdtempSync(path.join(sandbox, scenario + '-'));
  const repo = path.join(root, 'candidate');
  const exchange = path.join(root, 'exchange');
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs/base.md'), '# Base\n');
  fs.writeFileSync(path.join(repo, '.github/workflows/base.yml'), 'name: Fixture\n');
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['add', '.']);
  git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'base']);
  const base = git(repo, ['rev-parse', 'HEAD']).toString().trim();
  const env = {
    ...process.env, AI_MODE: 'stub', AI_SCENARIO: scenario, AI_BASE: 'main', AI_REQUEST: 'Safe fixture',
    AI_OWNER: 'owner', AI_ARTIFACT_PREFIX: 'fixture', AI_EXCHANGE: exchange,
    GITHUB_SHA: base, GITHUB_ACTOR: 'owner', GITHUB_TRIGGERING_ACTOR: 'owner',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_OUTPUT: path.join(root, 'outputs'), GITHUB_STEP_SUMMARY: path.join(root, 'summary.md')
  };
  for (const name of ['AI_RESULT', 'AI_REAL_ENABLED', 'GH_TOKEN', 'GITHUB_TOKEN']) delete env[name];
  const dir = stage => path.join(exchange, 'fixture-' + stage);
  const file = (stage, name) => path.join(dir(stage), name);
  const read = (stage, name) => JSON.parse(fs.readFileSync(file(stage, name)));
  const call = (stage, script, args, overrides = {}, code = 0) => {
    const result = spawnSync(process.execPath, [path.join(__dirname, script + '.js'), ...args], {
      cwd: root, encoding: 'utf8', env: { ...env, AI_OUT: dir(stage), ...overrides }
    });
    assert.equal(result.status, code, script + ' ' + args.join(' ') + '\n' + result.stderr);
  };
  const step = (stage, ...args) => call(stage, 'ai_pipeline', args);
  const model = (stage, kind, round) => {
    call(stage, 'ai_pipeline_stub', [kind, String(round), repo]);
    step(stage, 'accept', kind, String(round));
  };
  const verdicts = () => [...fs.readFileSync(env.GITHUB_OUTPUT, 'utf8').matchAll(/^verdict<<[^\n]+\n([^\n]+)$/gm)].map(m => m[1]);
  call('prepare', 'ai_pipeline', ['prepare'], { GITHUB_TRIGGERING_ACTOR: 'other' }, 1);
  call('prepare', 'ai_pipeline', ['prepare'], { AI_MODE: 'real' }, 1);
  step('prepare', 'prepare');
  call('design', 'ai_pipeline', ['accept', 'design', '1'], { AI_RESULT: '{}' }, 1);
  model('design', 'design', 1);
  let implementations = 0;
  if (scenario !== 'needs_decision') {
    for (const round of [1, 2]) {
      const impl = 'implement-' + round, verify = 'verify-' + round, review = 'review-' + round;
      if (round === 2) {
        if (verdicts()[0] !== 'changes_required') break;
        step(impl, 'restore', 'implementation', '2', repo);
        assert.match(fs.readFileSync(path.join(repo, 'docs/AI_PIPELINE_SMOKE.md'), 'utf8'), /round 1/);
      }
      model(impl, 'implementation', round);
      implementations++;
      step(impl, 'capture', 'implementation', String(round), repo);
      git(repo, ['reset', '--hard', base]);
      step(verify, 'verify', 'implementation', String(round), repo);
      git(repo, ['reset', '--hard', base]);
      if (!read(verify, 'gate.json').accepted) {
        assert.equal(scenario, 'gate_reject');
        assert(!fs.existsSync(file(impl, 'change.diff')));
        break;
      }
      const checks = options.checks?.[round - 1] ?? [check('stub-check', 0)];
      const result = { passed: checks.every(row => row.exit_code === 0), checks };
      if (options.rejectInconsistent && round === 1) {
        const invalid = { passed: true, checks: [check('stub-check', 0, true)] };
        fs.writeFileSync(file(verify, 'tests-raw.json'), JSON.stringify(invalid));
        call(verify, 'ai_pipeline', ['accept-tests'], {}, 1);
        assert(!fs.existsSync(file(verify, 'tests.json')));
      }
      fs.writeFileSync(file(verify, 'tests-raw.json'), JSON.stringify(result));
      step(verify, 'accept-tests');
      step(review, 'prompt', 'review', String(round), repo);
      model(review, 'review', round);
      if (options.forcedVerdicts?.[round - 1]) {
        const accepted = read(review, 'review.json');
        assert.equal(read(review, 'model-result.json').verdict, 'pass');
        assert.equal(accepted.verdict, options.forcedVerdicts[round - 1]);
        assert.equal(verdicts()[round - 1], accepted.verdict);
        if (accepted.verdict === 'changes_required') {
          assert.equal(accepted.findings[0].id, 'independent-tests');
          assert.match(accepted.findings[0].problem, /stub-new-failure/);
          assert.doesNotMatch(accepted.findings[0].problem, /stub-existing-failure/);
          if (round === 2) assert.equal(accepted.prior_findings[0].status, 'unresolved');
        }
      }
    }
  }
  call('report', 'ai_pipeline_report', ['report', repo, file('prepare', 'request.md')]);
  assert.deepEqual(read('report', 'result.json'), expected);
  if (options.implementations !== undefined) assert.equal(implementations, options.implementations);
  if (options.summary) assert.match(fs.readFileSync(file('report', 'summary.md'), 'utf8'), options.summary);
  assert.equal(git(repo, ['rev-parse', 'refs/heads/main']).toString().trim(), base);
  assert.equal(fs.existsSync(file('report', 'draft.json')), false);
}

try {
  verifyBaselineReruns();
  runScenario('pass', { status: 'pass', round: 1 });
  runScenario('revise_pass', { status: 'pass', round: 2 });
  runScenario('unresolved', { status: 'unresolved', round: 2 });
  runScenario('needs_decision', { status: 'decision', round: 0 });
  runScenario('gate_reject', { status: 'stopped', round: 0 });
  const newFailure = check('stub-new-failure', 1);
  const existingFailure = check('stub-existing-failure', 1, true);
  runScenario('pass', { status: 'pass', round: 2 }, {
    checks: [[existingFailure, newFailure], [existingFailure]], forcedVerdicts: ['changes_required', 'pass'], implementations: 2
  });
  runScenario('pass', { status: 'unresolved', round: 2 }, {
    checks: [[newFailure], [newFailure]], forcedVerdicts: ['changes_required', 'changes_required'], implementations: 2
  });
  runScenario('pass', { status: 'pass', round: 1 }, {
    checks: [[existingFailure]], forcedVerdicts: ['pass'], implementations: 1, rejectInconsistent: true,
    summary: /### 未確認\n- 基準版でも失敗したテスト · stub-existing-failure/
  });
  console.log('PASS AI-free pipeline scenarios, pinned baseline reruns, regression retry and baseline-only reporting');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
