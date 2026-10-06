const fs = require('node:fs');
const cp = require('node:child_process');
const root = require('node:path').join(__dirname, '..');
const credential = cp.spawnSync('git', ['credential', 'fill'], { cwd: root,
  input: 'protocol=https\nhost=github.com\npath=urm759/pokeka-serch.git\n\n', encoding: 'utf8' });
const fields = Object.fromEntries(credential.stdout.trim().split('\n').map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
const headers = { Authorization: `Bearer ${fields.password}`, 'User-Agent': 'pokeka-scheduled-log-audit' };
const base = 'https://api.github.com/repos/urm759/pokeka-serch';
async function get(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub read failed ${response.status}`);
  return response;
}
(async () => {
  const results = [];
  for (const workflow of ['daily-fast-update.yml', 'priority-price-refresh.yml', 'safe-checkpoint-backfill.yml', 'backfill-data.yml']) {
    const data = await (await get(`${base}/actions/workflows/${workflow}/runs?event=schedule&per_page=1`)).json();
    const run = data.workflow_runs?.[0];
    if (!run) { results.push({ workflow, status: '未実行' }); continue; }
    const jobs = await (await get(`${base}/actions/runs/${run.id}/jobs`)).json();
    const summary = { workflow, id: run.id, url: run.html_url, sha: run.head_sha, createdAt: run.created_at,
      status: run.status, conclusion: run.conclusion, jobs: [] };
    for (const job of jobs.jobs || []) {
      const item = { name: job.name, startedAt: job.started_at, endedAt: job.completed_at, conclusion: job.conclusion,
        steps: job.steps?.map(step => ({ name: step.name, status: step.conclusion })) };
      if (job.status === 'completed') {
        const log = await (await get(`${base}/actions/jobs/${job.id}/logs`)).text();
        const file = `work/scheduled-log-${job.id}.txt`;
        fs.writeFileSync(require('node:path').join(root, file), log);
        item.logFile = file;
        item.evidence = log.split('\n').filter(line => /processedCards|newAcquired|newLinked|usableNet|newlyAnalyzable|remaining|HTTP 403|HTTP 503|llmCalls|codexCalls|stopReason|checkpoint|nothing to commit|-> main|safe-stop|durationMs/.test(line)).map(line => {
          try {
            const value = JSON.parse(line.slice(line.indexOf('{')));
            const keys = ['sourceId','source','status','completionStatus','sourceState','startedAt','endedAt','attemptedCount','acquiredCount','refreshedCount','updatedCount','newAcquiredCount','newLinkedCount','usableNet','changedCards','processedCards','remaining','stopReason','reason','durationMs','checkpoint','llmCalls','codexCalls'];
            return Object.fromEntries(keys.filter(key => Object.hasOwn(value,key)).map(key=>[key,value[key]]));
          } catch { return line.slice(0, 320); }
        }).filter(row=>typeof row==='string'||Object.keys(row).length).slice(-20);
        item.publication = log.split('\n').map(line => {
          try { const value=JSON.parse(line.slice(line.indexOf('{'))); return value.status==='published' ? {published:value.published,commit:value.commit}:null; }
          catch { return null; }
        }).filter(Boolean).at(-1) || null;
        item.sourceStops = log.split('\n').map(line => {
          try { const value=JSON.parse(line.slice(line.indexOf('{'))); return value.source && value.reason
            ? {source:value.source,status:value.status,reason:value.reason,checkpoint:value.position?.sitemap ? `${value.position.sitemap}/${value.position.totalSitemaps}・${value.position.productIndex}`:null} : null; }
          catch { return null; }
        }).filter(Boolean);
      }
      summary.jobs.push(item);
    }
    results.push(summary);
  }
  const output = { checkedAt: new Date().toISOString(), note: '直近のschedule実行ログ。手動取得・PC取得の成果と区別。AI呼出なしの読み取り監査。', runs: results };
  fs.writeFileSync(require('node:path').join(root, 'data/scheduled-execution-audit.json'), JSON.stringify(output));
  console.log(JSON.stringify(output));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
