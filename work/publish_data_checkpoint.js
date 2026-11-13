const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function git(args, cwd) {
  const started=Date.now();
  const run = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer:64*1024*1024 });
  return { ok: run.status === 0, durationMs:Date.now()-started, output: `${run.stdout || ""}${run.stderr || ""}`.trim() };
}

function publish({ cwd = path.join(__dirname, ".."), message = "Publish deterministic data checkpoint", retries = 2, captureOnly = false } = {}) {
  const began=Date.now(),projectionChecks=[];
  function syncUiData() {
    if (!fs.existsSync(path.join(cwd, 'ui-data-codec.js'))) return;
    const at=Date.now();
    require('./enforce_overseas_publication').enforce(cwd);
    const registry=path.join(cwd,'work/gemrate-confirmed-reference-registry.json');
    if(fs.existsSync(registry))require('./gemrate_confirmed_links').validatePublic(cwd,JSON.parse(fs.readFileSync(path.join(cwd,'data/gemrate-reference-summary.json'))),JSON.parse(fs.readFileSync(registry)));
    const reused=require('./ui_projection_cache').current(cwd);
    if(!reused)require('./build_ui_data.js').build(cwd);
    projectionChecks.push({mode:reused?'exact-input-code-output-reuse':'rebuild',durationMs:Date.now()-at});
    const added = git(['add', 'data/ui'], cwd);
    if (!added.ok) throw new Error(added.output);
  }
  if (captureOnly) {
    const raw = require('./capture_unpublished_data.js').capture({cwd, source:'capture-only'});
    return {status:'raw-recovery-saved', published:false, raw};
  }
  if (!captureOnly) syncUiData();
  if(fs.existsSync(path.join(cwd,'data/card-catalog-completion.json')))require('./publication_lineage').verify(cwd,{staged:true});
  if(fs.existsSync(path.join(cwd,'data/overseas-access-policy.json')))require('./enforce_overseas_publication').verify(cwd,{staged:true});
  const staged = git(["diff", "--cached", "--quiet"], cwd);
  if (staged.ok) return { status: "unchanged", published: false };
  const base = git(["rev-parse", "HEAD"], cwd).output;
  const commit = git(["commit", "-m", message], cwd);
  if (!commit.ok) throw new Error(commit.output);
  const saved = git(["rev-parse", "HEAD"], cwd).output;
  const recovery = path.join(cwd, "work", "publish-recovery.json");
  const bundle = path.join(cwd, "work", "publish-recovery.bundle");
  fs.mkdirSync(path.dirname(recovery), { recursive: true });
  const bundled = git(["bundle", "create", bundle, "HEAD", `^${base}`], cwd);
  if (!bundled.ok) throw new Error(`Recovery bundle failed; publication stopped: ${bundled.output}`);
  const record = { savedAt: new Date().toISOString(), base, checkpointCommit: saved, commitMs:commit.durationMs,bundleMs:bundled.durationMs,
    workflowRunId: process.env.GITHUB_RUN_ID || null, bundle: "work/publish-recovery.bundle", attempts: [], status: "saved-before-publication" };
  const save = () => fs.writeFileSync(recovery, JSON.stringify(record, null, 2));
  save();
  if (captureOnly) return { status: "recovery-saved", published: false, commit: saved };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if(fs.existsSync(path.join(cwd,'data/overseas-access-policy.json')))require('./enforce_overseas_publication').verify(cwd,{staged:true});
    const pushed = git(["push", "origin", "HEAD:main"], cwd);
    record.attempts.push({ at: new Date().toISOString(), stage: "push", durationMs:pushed.durationMs, ok: pushed.ok, message: pushed.output });
    if (pushed.ok) { record.status = "published";record.totalMs=Date.now()-began;record.projectionChecks=projectionChecks; save(); return { status: "published", published: true, commit: git(["rev-parse", "HEAD"], cwd).output,
      timings:{totalMs:record.totalMs,projectionChecks,commitMs:record.commitMs,bundleMs:record.bundleMs,bundleBytes:fs.statSync(bundle).size,attempts:record.attempts.map(({stage,durationMs,ok})=>({stage,durationMs:durationMs??null,ok}))} }; }
    if (!/rejected|fetch first|non-fast-forward/i.test(pushed.output) || attempt === retries) break;
    const fetched = git(["fetch", "origin", "main"], cwd);
    record.attempts.push({ at: new Date().toISOString(), stage: "fetch", durationMs:fetched.durationMs, ok: fetched.ok, message: fetched.output });
    if (!fetched.ok) break;
    // Git's three-way merge keeps independent source changes. Conflicts require review, never "ours" or force push.
    const merged = git(["merge", "--no-edit", "origin/main"], cwd);
    record.attempts.push({ at: new Date().toISOString(), stage: "merge", durationMs:merged.durationMs, ok: merged.ok, message: merged.output });
    if (!merged.ok) {
      let resolved=false;
      const regenerationStarted=Date.now();
      try { resolved=require('./resolve_generated_merge.js').resolve(cwd); }
      catch(error) { record.attempts.push({stage:'regenerate-derived',durationMs:Date.now()-regenerationStarted,ok:false,message:error.message}); }
      if (!resolved) {
        require('./capture_unpublished_data.js').capture({cwd,source:'publication-conflict'});
        record.status = "manual-merge-required"; save(); throw new Error(`Publication conflict; checkpoint bundle saved. ${merged.output}`);
      }
      record.attempts.push({stage:'regenerate-derived',durationMs:Date.now()-regenerationStarted,ok:true});
    }
    syncUiData();
    if(fs.existsSync(path.join(cwd,'data/card-catalog-completion.json')))require('./publication_lineage').verify(cwd,{staged:true});
    if(fs.existsSync(path.join(cwd,'data/overseas-access-policy.json')))require('./enforce_overseas_publication').verify(cwd,{staged:true});
    if (!git(['diff', '--cached', '--quiet'], cwd).ok) {
      const reconciled = git(['commit', '-m', 'Reconcile pinned UI summaries after data merge'], cwd);
      if (!reconciled.ok) throw new Error(reconciled.output);
    }
  }
  record.status = "publication-failed"; save();
  throw new Error("Data acquired and committed, but publication failed. Restore the saved checkpoint bundle; do not skip unpersisted data.");
}

if (require.main === module) {
  try { console.log(JSON.stringify(publish({ captureOnly: process.argv.includes("--capture-only"),
    message: process.argv.slice(2).filter((arg) => arg !== "--capture-only").join(" ") || undefined }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { publish };
