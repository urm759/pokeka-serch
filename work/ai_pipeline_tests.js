const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { designRecord } = require('./ai_pipeline');
const { credentials, git } = require('./ai_pipeline_gate');
const { inventory } = require('./operational_test_inventory');
const { testCommands } = require('./workflow_structure');

function testPlan(trusted, extra) {
  const testDir = path.join(trusted, '.github/workflows');
  const source = fs.readdirSync(testDir).filter(name => /\.ya?ml$/.test(name)).map(name => {
    const yaml = fs.readFileSync(path.join(testDir, name), 'utf8');
    return /^  pull_request:/m.test(yaml) ? yaml : '';
  }).filter(Boolean);
  const checks = source.flatMap(yaml => [...yaml.matchAll(/^\s*node --check ([\w./-]+\.js)\s*$/gm)].map(m => '--check ' + m[1]));
  const tests = [...new Set([...inventory(trusted).tests, ...source.flatMap(testCommands), ...extra])].sort();
  if (tests.some(file => !/^work\/test_[\w-]+\.js$/.test(file))) throw Error('Invalid test inventory');
  const plan = [...new Set(checks), ...tests];
  if (plan.length > 245) throw Error('Too many verification checks');
  return plan;
}

function logTail(stdout, stderr) {
  const text = ((stdout || '') + '\n' + (stderr || '')).trim();
  if (credentials.test(text)) return '[Output withheld: possible credential]';
  return text.replace(/[\x00-\x1f\x7f]+/g, ' ').slice(-200);
}

function runCheck(command, checkout) {
  if (command === 'initial-payload') return checkDataBudget(checkout);
  return spawnSync(process.execPath, command.split(' '), {
    cwd: checkout, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024
  });
}

function runChecks(trusted, candidate, commands) {
  const checks = commands.map(command => {
    const start = Date.now();
    const run = runCheck(command, candidate);
    return {
      command, exit_code: run.status ?? 1, duration_ms: Date.now() - start,
      log: logTail(run.stdout, run.stderr || run.error?.message), pre_existing: false
    };
  });
  const failures = checks.filter(check => check.exit_code !== 0);
  if (failures.length) {
    // Policy is the read-only checkout of the pinned base. Give its tests a
    // disposable writable checkout inside this same verification container.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-test-baseline-'));
    const baseline = path.join(tmp, 'checkout');
    try {
      const sha = git(trusted, ['rev-parse', 'HEAD']).toString().trim();
      git(trusted, ['clone', '--shared', '--no-checkout', '--quiet', '--', trusted, baseline], { timeout: 180000 });
      git(baseline, ['checkout', '--detach', '--quiet', sha], { timeout: 180000 });
      for (const check of failures) {
        const file = check.command.replace(/^--check /, '');
        // A test introduced by the patch cannot fail on the base.
        if (file !== 'initial-payload' && !fs.existsSync(path.join(baseline, file))) continue;
        const result = runCheck(check.command, baseline);
        check.pre_existing = Number.isInteger(result.status) && result.status > 0;
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return { passed: failures.length === 0, checks };
}

function checkDataBudget(candidate) {
  const result = spawnSync(process.execPath, ['work/test_ui_data.js'], {
    cwd: candidate, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) return result;
  // Data changes require the repository's same UI payload check. The
  // independent byte cap is applied to the declared startup projection.
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'data/ui/manifest.json'), 'utf8'));
    const app = fs.readFileSync(path.join(candidate, 'app.js'), 'utf8');
    const list = app.match(/const initialFiles = (\[[\s\S]*?\]);/);
    if (!list) throw Error('Initial file inventory not found');
    const startup = [...list[1].matchAll(/["']([\w/-]+)["']/g)].map(m => m[1]);
    if (!startup.length) throw Error('Initial file inventory empty');
    const paths = new Set(['data/ui/manifest.json', ...startup.map(name => {
      const original = 'data/' + name + '.json';
      return manifest.aliases?.[original] || original;
    })]);
    if ([...paths].some(file => !/^data\/(?:[\w-]+\/)*[\w-]+\.json$/.test(file))) throw Error('Invalid startup data path');
    const bytes = [...paths].reduce((sum, file) => sum + fs.statSync(path.join(candidate, file)).size, 0);
    return { status: Number(bytes > 24000000), stdout: JSON.stringify({ startupBytes: bytes, limit: 24000000 }) };
  } catch {
    return { status: 1, stderr: 'Could not verify startup payload' };
  }
}

if (require.main === module) {
  const [candidate, marker] = process.argv.slice(2);
  const d = designRecord();
  const trusted = path.join(__dirname, '..');
  const commands = testPlan(trusted, d.tests_to_run);
  if (marker === 'data') commands.push('initial-payload');
  const result = runChecks(trusted, candidate, commands);
  console.log(JSON.stringify(result));
}

module.exports = { logTail, runChecks, testPlan };
