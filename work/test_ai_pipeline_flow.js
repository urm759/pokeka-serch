const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { git } = require('./ai_pipeline_gate');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-flow-'));

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
  call('prepare', 'ai_pipeline', ['prepare'], { GITHUB_TRIGGERING_ACTOR: 'other' }, 1);
  call('prepare', 'ai_pipeline', ['prepare'], { AI_MODE: 'real' }, 1);
  step('prepare', 'prepare');
  call('design', 'ai_pipeline', ['accept', 'design', '1'], { AI_RESULT: '{}' }, 1);
  model('design', 'design', 1);
  if (scenario !== 'needs_decision') {
    for (const round of [1, 2]) {
      const impl = 'implement-' + round, verify = 'verify-' + round, review = 'review-' + round;
      if (round === 2) {
        if (read('review-1', 'review.json').verdict !== 'changes_required') break;
        step(impl, 'restore', 'implementation', '2', repo);
        assert.match(fs.readFileSync(path.join(repo, 'docs/AI_PIPELINE_SMOKE.md'), 'utf8'), /round 1/);
      }
      model(impl, 'implementation', round);
      step(impl, 'capture', 'implementation', String(round), repo);
      git(repo, ['reset', '--hard', base]);
      step(verify, 'verify', 'implementation', String(round), repo);
      git(repo, ['reset', '--hard', base]);
      if (!read(verify, 'gate.json').accepted) {
        assert.equal(scenario, 'gate_reject');
        assert(!fs.existsSync(file(impl, 'change.diff')));
        break;
      }
      const exit = Number(options.failTests === true);
      fs.writeFileSync(file(verify, 'tests-raw.json'), JSON.stringify({
        passed: !exit, checks: [{ command: 'stub-check', exit_code: exit, duration_ms: 1, log: '' }]
      }));
      step(verify, 'accept-tests');
      step(review, 'prompt', 'review', String(round), repo);
      model(review, 'review', round);
    }
  }
  call('report', 'ai_pipeline_report', ['report', repo, file('prepare', 'request.md')]);
  assert.deepEqual(read('report', 'result.json'), expected);
  assert.equal(git(repo, ['rev-parse', 'refs/heads/main']).toString().trim(), base);
  assert.equal(fs.existsSync(file('report', 'draft.json')), false);
}

try {
  runScenario('pass', { status: 'pass', round: 1 });
  runScenario('revise_pass', { status: 'pass', round: 2 });
  runScenario('unresolved', { status: 'unresolved', round: 2 });
  runScenario('needs_decision', { status: 'decision', round: 0 });
  runScenario('gate_reject', { status: 'stopped', round: 0 });
  runScenario('pass', { status: 'unresolved', round: 1 }, { failTests: true });
  console.log('PASS five AI-free pipelines, owner authorization and failed-test handling');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
