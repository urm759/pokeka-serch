// Weekly full regression runner (4-J C). Runs every work/test_*.js to the end instead of
// stopping at the first failure, lists each failure as a GitHub error annotation and in
// the step summary, and exits 1 when any test failed. It adds no acquisition or AI call.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');

function run({ dir = path.join(__dirname), pattern = /^test_.*\.js$/, timeoutMs = 10 * 60000, env = process.env,
  log = line => console.log(line), spawn = cp.spawnSync } = {}) {
  const files = fs.readdirSync(dir).filter(f => pattern.test(f)).sort(), results = [];
  const started = Date.now();
  for (const file of files) {
    const t0 = Date.now();
    log(`::group::${file}`);
    const r = spawn(process.execPath, [path.join(dir, file)], { cwd: path.join(dir, '..'), env, stdio: 'inherit', timeout: timeoutMs });
    const timedOut = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';
    const status = r.status === 0 ? 'passed' : timedOut ? 'timeout' : 'failed';
    results.push({ file, status, exitCode: r.status, ms: Date.now() - t0 });
    log('::endgroup::');
    if (status !== 'passed') log(`::error title=Weekly test ${status}::${file} (exit ${r.status ?? r.signal ?? r.error?.code})`);
  }
  const failed = results.filter(r => r.status !== 'passed');
  const summary = [`## Weekly full regression`, '', `${results.length} tests, ${failed.length} not passed, ${Math.round((Date.now() - started) / 1000)}s. Source requests 0, AI calls 0.`, '',
    ...(failed.length ? ['| Test | Result | Exit |', '|---|---|---|', ...failed.map(r => `| ${r.file} | ${r.status} | ${r.exitCode ?? ''} |`)] : ['All tests passed.'])].join('\n');
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary + '\n');
  log(summary);
  return { total: results.length, failed, results };
}

if (require.main === module) {
  const result = run();
  if (result.failed.length) process.exitCode = 1;
}
module.exports = { run };
