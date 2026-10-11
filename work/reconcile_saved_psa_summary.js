const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function needed(raw, summary) {
  if (!raw?.generatedAt || !Array.isArray(raw.rows) || !raw.rows.length) throw new Error('PSA原票不足・正常要約を保持');
  return summary?.updatedAt !== raw.generatedAt;
}
function main() {
  const root = process.env.PSA_ACQUISITION_ROOT || path.join(__dirname, '..');
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const raw = read('data/psa-official-populations.json');
  const summary = read('data/psa-population-summary.json');
  if (!needed(raw, summary)) { console.log('PSA saved summary unchanged; reconciliation skipped, HTTP0'); return; }
  for (const file of ['build_psa_history.js', 'test_saved_psa_summary.js']) {
    const child = spawnSync(process.execPath, [path.join(__dirname, file)], {
      cwd: root, env: { ...process.env, PSA_ACQUISITION_ROOT: root },
      encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024
    });
    if (child.status !== 0) throw new Error(`Saved PSA reconciliation failed: ${child.stderr || child.stdout}`);
    process.stdout.write(child.stdout);
  }
}
if (require.main === module) main();
module.exports = { needed };
