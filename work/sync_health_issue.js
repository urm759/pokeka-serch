// 4-J T1: tell the owner about NEW monitor alerts through one GitHub issue. No AI, no source requests.
// Alerts listed in work/health-issue-baseline.json are already known and never notify. A new alert opens the
// issue (or comments when more appear); when no new alert remains the issue is closed. Failures here only warn:
// the monitor itself must never stop because a notification could not be sent.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), LABEL = 'monitor-alert', MARK = /<!-- monitor-keys: ([^>]*) -->/;
const TITLE = 'サイトの監視：新しい警告があります';

function plan(issues, acknowledged, open) {
  const known = new Set(acknowledged || []);
  const fresh = (issues || []).filter(i => i && i.key && !known.has(i.key));
  const keys = [...new Set(fresh.map(i => i.key))].sort();
  const openKeys = open ? (String(open.body || '').match(MARK)?.[1] || '').split('|').filter(Boolean) : [];
  if (!keys.length) return open ? { action: 'close', number: open.number } : { action: 'none' };
  const lines = fresh.map(i => `- **${i.category || '確認が必要'}** ${String(i.reason || i.key).slice(0, 300)}${i.url ? ` ([詳細](${i.url}))` : ''}`);
  const body = [`監視（毎時の Watch Data Health）が、既知ではない警告を ${keys.length} 件見つけました。AI は使っていません。`, '',
    ...lines, '', '既知の警告は work/health-issue-baseline.json にあります。対応が済んだら、この Issue は次の監視で自動的に閉じます。',
    `<!-- monitor-keys: ${keys.join('|')} -->`].join('\n');
  if (!open) return { action: 'create', title: TITLE, body, keys };
  const added = keys.filter(k => !openKeys.includes(k));
  if (!added.length && keys.length === openKeys.length) return { action: 'none', number: open.number };
  const comment = added.length ? `新しい警告が ${added.length} 件増えました。\n\n` + fresh.filter(i => added.includes(i.key)).map(i => `- ${String(i.reason || i.key).slice(0, 300)}`).join('\n') : null;
  return { action: 'update', number: open.number, body, comment, keys };
}

function gh(args, run = spawnSync) {
  const r = run('gh', args, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  if (r.error || r.status !== 0) throw Error(`gh ${args[0]} ${args[1]} failed: ${String(r.error?.message || r.stderr || r.status).slice(0, 300)}`);
  return r.stdout;
}

function pagesIssues(runs) {
  const latest = runs.filter(r => Number.isSafeInteger(r.id) && r.head_branch === 'main'
      && ['schedule','workflow_dispatch'].includes(r.event)
      && ['success','failure','timed_out','action_required'].includes(r.conclusion))
    .sort((a,b) => b.id-a.id || b.run_attempt-a.run_attempt)[0];
  if (!latest || latest.conclusion === 'success') return [];
  return [{key:'pages:release-verification', reason:'公開後の版・改ざん防止・manifest・独立検査の確認に失敗しました。実行ログで対象を確認してください。', url:latest.html_url}];
}

function run({ root = ROOT, exec = spawnSync, dryRun = process.argv.includes('--dry-run'), withPages = false } = {}) {
  const health = JSON.parse(fs.readFileSync(path.join(root, 'data/update-health.json'), 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'work/health-issue-baseline.json'), 'utf8'));
  const call = args => gh(args, exec);
  const listed = dryRun ? [] : JSON.parse(call(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,body', '--limit', '5']) || '[]');
  const extra = withPages ? pagesIssues(JSON.parse(call(['api',
    'repos/{owner}/{repo}/actions/workflows/check-pages-release.yml/runs?branch=main&status=completed&per_page=100'])).workflow_runs) : [];
  const step = plan([...health.issues, ...extra], baseline.acknowledged, listed[0] || null);
  if (dryRun) { console.log(JSON.stringify({ dryRun: true, ...step, body: undefined })); return step; }
  if (step.action === 'create') {
    try { call(['label', 'create', LABEL, '--color', 'D93F0B', '--description', 'New site monitor alerts (automatic)']); } catch { /* label exists */ }
    call(['issue', 'create', '--title', step.title, '--label', LABEL, '--body', step.body]);
  } else if (step.action === 'update') {
    call(['issue', 'edit', String(step.number), '--body', step.body]);
    if (step.comment) call(['issue', 'comment', String(step.number), '--body', step.comment]);
  } else if (step.action === 'close') {
    call(['issue', 'close', String(step.number), '--comment', '新しい警告はなくなりました（監視による自動の終了）。']);
  }
  console.log(JSON.stringify({ action: step.action, number: step.number ?? null, keys: step.keys?.length ?? 0, llmCalls: 0, sourceRequests: 0 }));
  return step;
}

module.exports = { plan, run, pagesIssues, LABEL, TITLE };
if (require.main === module) {
  const withPages = process.argv.includes('--with-pages');
  try { run({withPages}); } catch (error) {
    console.log(`::warning::monitor alert issue not updated: ${String(error.message).slice(0, 300)}`);
    if (withPages) process.exitCode = 1;
  }
}
