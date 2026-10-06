const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { atomicWrite, lock } = require("./acquisition_retry.js");
const { merge } = require("./recover_saved_psa.js");
const ROOT = path.join(__dirname, "..");
const FILES = ["data/psa-official-populations.json", "work/psa-fetch-progress.json", "work/psa_acquisition_result.json", "work/psa_update_state.json", "data/psa-pc-observation.json"];
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; } };
const timestamp = value => Date.parse(value?.startedAt || value?.observedAt || value?.lastAttemptAt || "") || 0;
function mergeCheckpoint(current, incoming) { return timestamp(incoming) < timestamp(current) ? current : { ...current, ...incoming }; }
function enqueue(root = ROOT) {
  const files = Object.fromEntries(FILES.filter(file => fs.existsSync(path.join(root, file))).map(file => [file, read(path.join(root, file))]));
  if (!Array.isArray(files[FILES[0]]?.rows)) throw new Error("Saved PSA rows missing; no publication packet created");
  const digest = crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex");
  const outbox = path.join(root, "work/psa-outbox"); fs.mkdirSync(outbox, { recursive: true });
  const file = path.join(outbox, `${digest}.json`);
  if (!fs.existsSync(file)) atomicWrite(file, { version: 1, digest, createdAt: new Date().toISOString(), files });
  return file;
}
function applyPacket(root, packet) {
  if (crypto.createHash("sha256").update(JSON.stringify(packet.files)).digest("hex") !== packet.digest) throw new Error("PSA handoff checksum mismatch");
  const populationFile = path.join(root, FILES[0]);
  const current = read(populationFile, { rows: [] });
  const merged = merge(current.rows || [], packet.files[FILES[0]].rows || []);
  if (merged.audit.rejected) throw new Error(`PSA handoff contains ${merged.audit.rejected} invalid rows`);
  if (merged.audit.added || merged.audit.refreshed) atomicWrite(populationFile, { ...current, rows: merged.rows, totalRows: merged.rows.length, generatedAt: new Date().toISOString() });
  for (const file of FILES.slice(1)) {
    if (!packet.files[file]) continue;
    const target = path.join(root, file);
    atomicWrite(target, mergeCheckpoint(read(target), packet.files[file]));
  }
  atomicWrite(path.join(root, "data/psa-publication-handoff.json"), { packetId: packet.digest, appliedAt: new Date().toISOString(), ...merged.audit, evidence: undefined, acquisitionRequests: 0, note: "保存済みPSAのみ統合。別取得元と新しいチェックポイントは保持" });
  return merged.audit;
}
function publish(root = ROOT, options = {}) {
  const outbox = path.join(root, "work/psa-outbox"); fs.mkdirSync(outbox, { recursive: true });
  const release = lock(path.join(outbox, "publish.lock"));
  const git = (args, cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(String(result.stderr || result.stdout));
    return String(result.stdout || "").trim();
  };
  try {
    const pending = fs.readdirSync(outbox).filter(file => /^[a-f0-9]{64}\.json$/.test(file) && !fs.existsSync(path.join(outbox, `${file}.ack`))).map(file => read(path.join(outbox, file))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const result = { published: [], acquisitionRequests: 0 };
    for (const packet of pending) {
      let success = false;
      const journal = { packetId: packet.digest, attempts: [], status: "saved-pending", acquisitionRequests: 0 };
      for (let attempt = 0; attempt < (options.retries || 3); attempt++) {
        let checkout;
        try {
          git(["fetch", "origin", "main"]);
          const base = git(["rev-parse", "origin/main"]);
          const directory = path.join(root, "work/psa-publication-checkouts"); fs.mkdirSync(directory, { recursive: true });
          checkout = path.join(directory, `${packet.digest.slice(0, 12)}-${Date.now()}-${attempt}`);
          git(["worktree", "add", "--detach", checkout, base]);
          applyPacket(checkout, packet);
          if (options.beforeBuild) options.beforeBuild(checkout, attempt);
          for (const script of options.scripts || ["build_psa_history.js", "build_card_completion.js", "audit_completion_outcomes.js", "build_psa_linkage_queue.js", "build_purchase_limit_audit.js", "audit_acquisition_progress.js", "audit_link_coverage.js", "finalize_update_status.js", "test_completion_routes.js", "test_purchase_limit_audit.js"]) {
            const run = spawnSync(process.execPath, [path.join(checkout, "work", script)], { cwd: checkout, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
            if (run.status !== 0) throw new Error(`Saved-data verification failed (${script}): ${run.stderr || run.stdout}`);
          }
          git(["add", "data", "work"], checkout);
          git(["-c", "user.name=PSA checkpoint publisher", "-c", "user.email=psa-checkpoint@users.noreply.github.com", "commit", "-m", "Publish saved PSA handoff without reacquisition"], checkout);
          git(["push", "origin", "HEAD:main"], checkout);
          const commit = git(["rev-parse", "HEAD"], checkout);
          journal.attempts.push({ at: new Date().toISOString(), base, commit, status: "published" });
          atomicWrite(path.join(outbox, `${packet.digest}.json.ack`), { commit, publishedAt: new Date().toISOString() });
          result.published.push(commit); journal.status = "published"; success = true;
        } catch (error) {
          journal.attempts.push({ at: new Date().toISOString(), status: "failed", error: error.message });
          if (!/rejected|fetch first|non-fast-forward|remote.*(500|502|503)|unable to access/i.test(error.message)) break;
        } finally {
          atomicWrite(path.join(outbox, `${packet.digest}.journal.json`), journal);
          // Remove only this newly created, committed, clean checkout; never force removal.
          if (checkout) { try { git(["worktree", "remove", checkout]); } catch { /* keep failed verification checkout for inspection */ } }
        }
        if (success) break;
      }
      if (!success) throw new Error(`Saved PSA packet ${packet.digest} remains pending. Publication-only retry; do not reacquire.`);
    }
    return result;
  } finally { release(); }
}
if (require.main === module) {
  try { console.log(JSON.stringify(process.argv.includes("--enqueue") ? { packet: enqueue() } : publish())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { enqueue, applyPacket, mergeCheckpoint, publish };
