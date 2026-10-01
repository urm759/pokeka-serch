const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function git(args, cwd) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: run.status === 0, output: `${run.stdout || ""}${run.stderr || ""}`.trim() };
}

function publish({ cwd = path.join(__dirname, ".."), message = "Publish deterministic data checkpoint", retries = 2, captureOnly = false } = {}) {
  if (captureOnly) {
    if (fs.existsSync(path.join(cwd, "work", "publish-recovery.bundle"))) return { status: "recovery-already-saved", published: false };
    const stagedRecovery = git(["add", "data", "work"], cwd);
    if (!stagedRecovery.ok) throw new Error(stagedRecovery.output);
  }
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
  const record = { savedAt: new Date().toISOString(), base, checkpointCommit: saved,
    workflowRunId: process.env.GITHUB_RUN_ID || null, bundle: "work/publish-recovery.bundle", attempts: [], status: "saved-before-publication" };
  const save = () => fs.writeFileSync(recovery, JSON.stringify(record, null, 2));
  save();
  if (captureOnly) return { status: "recovery-saved", published: false, commit: saved };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const pushed = git(["push", "origin", "HEAD:main"], cwd);
    record.attempts.push({ at: new Date().toISOString(), stage: "push", ok: pushed.ok, message: pushed.output });
    if (pushed.ok) { record.status = "published"; save(); return { status: "published", published: true, commit: git(["rev-parse", "HEAD"], cwd).output }; }
    if (!/rejected|fetch first|non-fast-forward/i.test(pushed.output) || attempt === retries) break;
    const fetched = git(["fetch", "origin", "main"], cwd);
    record.attempts.push({ at: new Date().toISOString(), stage: "fetch", ok: fetched.ok, message: fetched.output });
    if (!fetched.ok) break;
    // Git's three-way merge keeps independent source changes. Conflicts require review, never "ours" or force push.
    const merged = git(["merge", "--no-edit", "origin/main"], cwd);
    record.attempts.push({ at: new Date().toISOString(), stage: "merge", ok: merged.ok, message: merged.output });
    if (!merged.ok) { record.status = "manual-merge-required"; save(); throw new Error(`Publication conflict; checkpoint bundle saved. ${merged.output}`); }
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
