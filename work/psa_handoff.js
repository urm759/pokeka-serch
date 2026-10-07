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
function prepareInputs(root = ROOT) {
  const directory = path.join(root, "work/psa-acquisition-inputs");
  const resultFile = path.join(directory, "audit.json");
  const show = ref => {
    const r = spawnSync("git", ["show", ref], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout;
  };
  fs.mkdirSync(directory, { recursive: true });
  try {
    const revision = spawnSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" });
    const commit = revision.status === 0 && /^[a-f0-9]{40}$/.test(revision.stdout.trim()) ? revision.stdout.trim() : null;
    if (!commit) throw new Error("Latest fetched main commit is unavailable");
    const rawManifest = JSON.parse(show(`${commit}:work/psa_set_urls.json`));
    const priority = JSON.parse(show(`${commit}:work/psa_priority_queue.json`));
    if (!Array.isArray(rawManifest) || !rawManifest.length || !Array.isArray(priority.rows)) throw new Error("PSA input format requires review; existing inputs retained");
    const quarantinedUrls = [];
    const manifest = rawManifest.map(row => {
      if (row && (!row.url || /^https:\/\/www\.psacard\.com\/(?:pop\/tcg-cards\/|spec\/psa\/\d+)/.test(row.url))) return row;
      quarantinedUrls.push({ setCode: row?.setCode || null, url: row?.url || null, reason: "公式URL形式の確認待ち・この対象のみ隔離" });
      return { ...row, url: null, quarantinedUrl: row?.url || null, note: "公式URL形式の確認待ち" };
    });
    const snapshotDirectory = path.join(directory, commit); fs.mkdirSync(snapshotDirectory, { recursive: true });
    atomicWrite(path.join(snapshotDirectory, "manifest.json"), manifest);
    atomicWrite(path.join(snapshotDirectory, "priority.json"), priority);
    const runtimeFiles = ['update_psa_official_populations.js','build_psa_history.js','acquisition_retry.js','fair_batch.js'];
    const runtimeHashes = {};
    for (const file of runtimeFiles) {
      const source = show(`${commit}:work/${file}`);
      const target = path.join(snapshotDirectory, file);
      fs.writeFileSync(target, source);
      runtimeHashes[file] = crypto.createHash('sha256').update(source).digest('hex');
      if (crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== runtimeHashes[file]) throw new Error('PSA runtime snapshot integrity failed');
    }
    for (const file of runtimeFiles) {
      const source = fs.readFileSync(path.join(snapshotDirectory, file), 'utf8');
      for (const match of source.matchAll(/require\(["'](\.\.?\/[^"']+)["']\)/g)) {
        const target = path.resolve(snapshotDirectory, match[1]);
        if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) throw new Error('PSA runtime dependency missing: ' + match[1]);
      }
    }
    const result = { status: "latest-fetched-main", commit, preparedAt: new Date().toISOString(), quarantinedUrls, manifestPath: path.join(snapshotDirectory, "manifest.json"), priorityPath: path.join(snapshotDirectory, "priority.json"),
      collectorPath:path.join(snapshotDirectory,'update_psa_official_populations.js'),historyPath:path.join(snapshotDirectory,'build_psa_history.js'),runtimeHashes,httpAcquisitionRequests: 0 };
    atomicWrite(resultFile, result); return result;
  } catch (error) {
    const cached = read(resultFile);
    if (!cached.manifestPath || !fs.existsSync(cached.manifestPath) || !fs.existsSync(cached.priorityPath)) throw error;
    const result = { ...cached, status: "previous-inputs", lastAttemptAt: new Date().toISOString(), error: error.message };
    atomicWrite(resultFile, result); return result;
  }
}
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
          for (const script of options.scripts || ["build_psa_history.js", "build_card_completion.js", "audit_completion_outcomes.js", "build_psa_linkage_queue.js", "build_purchase_limit_audit.js", "audit_acquisition_progress.js", "audit_link_coverage.js", "finalize_update_status.js", "measure_performance_guard.js", "build_ui_data.js", "test_ui_data.js", "test_specification_reexploration.js", "test_performance_guard.js", "test_completion_routes.js", "test_purchase_limit_audit.js", "test_preset_exploration.js"]) {
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
          if (!/rejected|fetch first|non-fast-forward|remote.*(500|502|503)|unable to access|curl (?:28|55|56)|connection (?:was )?reset|unexpected disconnect/i.test(error.message)) break;
          // Retry publication only; keep the immutable acquisition packet.
          if (attempt + 1 < (options.retries || 3)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(4000, 1000 * 2 ** attempt));
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
  try { console.log(JSON.stringify(process.argv.includes("--inputs") ? prepareInputs() : process.argv.includes("--enqueue") ? { packet: enqueue() } : publish())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { enqueue, applyPacket, mergeCheckpoint, publish, prepareInputs };
