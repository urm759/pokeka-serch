const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.join(__dirname, '..');
async function main() {
  const credential = cp.spawnSync('git', ['credential', 'fill'], { cwd: root,
    input: 'protocol=https\nhost=github.com\npath=urm759/pokeka-serch.git\n\n', encoding: 'utf8' });
  const password = credential.stdout.split(/\r?\n/).find(s => s.startsWith('password='))?.slice(9);
  if (!password) throw new Error('GitHub read credential unavailable');
  const headers = { Authorization: `Bearer ${password}`, 'User-Agent': 'pokeka-failure-audit' };
  const base = 'https://api.github.com/repos/urm759/pokeka-serch';
  const get = async url => {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub read HTTP ${response.status}`);
    return response;
  };
  const rows = [];
  for (const id of process.argv.slice(2)) {
    if (!/^\d+$/.test(id)) throw new Error('Invalid run ID');
    const run = await (await get(`${base}/actions/runs/${id}`)).json();
    const jobs = await (await get(`${base}/actions/runs/${id}/jobs`)).json();
    for (const job of jobs.jobs || []) {
      const log = await (await get(`${base}/actions/jobs/${job.id}/logs`)).text();
      fs.writeFileSync(path.join(root, `work/failed-run-${id}-${job.id}.txt`), log);
      rows.push({id, jobId:job.id, name:run.name, event:run.event, sha:run.head_sha, url:run.html_url,
        conclusion:run.conclusion, startedAt:job.started_at, endedAt:job.completed_at,
        failedSteps:job.steps.filter(s=>s.conclusion==='failure').map(s=>s.name),
        evidence:log.split('\n').filter(s=>/Error:|AssertionError|SyntaxError|TypeError|error:|Required rebuild|failed|Failure|exit code|HTTP 4|HTTP 5/i.test(s)).slice(-35).map(s=>s.slice(0,1200))});
    }
  }
  fs.writeFileSync(path.join(root,'data/update-failure-audit.json'),JSON.stringify({checkedAt:new Date().toISOString(),rows}));
  console.log(JSON.stringify(rows));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
