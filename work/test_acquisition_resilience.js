const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const retry = require("./acquisition_retry.js");
const { nextBatch } = require("./run_pokedata_backfill.js");
const { applyPacket, enqueue, mergeCheckpoint, publish, prepareInputs } = require("./psa_handoff.js");
const now = Date.now();
for (const error of ["HTTP 429", "HTTP 503", "ETIMEDOUT"]) {
  const first = retry.failure({}, { error }, now);
  const second = retry.failure(first, { error }, now);
  assert(!second.held, error); assert(second.waitMs > first.waitMs);
  assert(!retry.eligible(second, now)); assert(retry.eligible(second, now + second.waitMs));
  let last = second;
  for (let i = 2; i < 5; i++) last = retry.failure(last, { error }, now);
  assert(last.exhausted && last.held, "bounded retries, no infinite retry");
}
assert.equal(retry.classify({ error: "Unable to find a populated table" }).scope, "url");
assert.equal(retry.classify({ error: "PSA HTTP 403" }).scope, "source");
assert.equal(retry.classify({ error: "sign-in" }).kind, "authentication");
assert(!retry.migrateLegacy({ held: true, failures: 2, reason: "HTTP 503" }, now).held);
assert(retry.migrateLegacy({ held: true, failures: 2, reason: "HTTP 403" }, now).held);
assert.equal(nextBatch({ batchSize: 10, intervalMs: 1100, streak: 1 }, { failed: 0 }).batchSize, 12);
assert.equal(nextBatch({ batchSize: 10, intervalMs: 1100 }, { failed: 1 }).batchSize, 5);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pokeka-resilience-"));
const lockFile = path.join(temp, "source.lock");
const release = retry.lock(lockFile); assert.throws(() => retry.lock(lockFile), /already running/); release();
const release2 = retry.lock(lockFile); release2();
assert.equal(mergeCheckpoint({ startedAt: "2026-10-06", completedUrls: ["new"] }, { startedAt: "2026-10-05", completedUrls: [] }).completedUrls[0], "new");

// Real local Git repositories exercise concurrent publication, never the user's repository.
function git(args, cwd = temp) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
const remote = path.join(temp, "remote.git"), producer = path.join(temp, "producer"), other = path.join(temp, "other");
git(["init", "--bare", "--initial-branch=main", remote]); git(["clone", remote, producer]);
git(["config", "user.name", "Test"], producer); git(["config", "user.email", "test@example.test"], producer);
fs.mkdirSync(path.join(producer, "work")); fs.mkdirSync(path.join(producer, "data"));
const pop = { setCode: "SV9", cardNo: "126", cardName: "Clefairy", sourceUrl: "https://www.psacard.com/pop/tcg-cards/2025/verified/292980", fetchedAt: "2026-10-05T00:00:00Z", psa10Count: 100, psaTotal: 120 };
retry.atomicWrite(path.join(producer, "data/psa-official-populations.json"), { rows: [pop] });
retry.atomicWrite(path.join(producer, "work/psa-fetch-progress.json"), { startedAt: "2026-10-06T00:00:00Z", completedUrls: [pop.sourceUrl] });
retry.atomicWrite(path.join(producer, "work/psa_set_urls.json"), [{ setCode: "SV9", url: pop.sourceUrl }]);
retry.atomicWrite(path.join(producer, "work/psa_priority_queue.json"), { rows: [{ cardId: "new-card", setCode: "SV9", cardNo: "126" }] });
for (const file of ['update_psa_official_populations.js','build_psa_history.js','acquisition_retry.js','fair_batch.js']) {
  fs.copyFileSync(path.join(__dirname,file),path.join(producer,'work',file));
}
git(["add", "data", "work"], producer); git(["commit", "-m", "Initial"], producer); git(["push", "origin", "main"], producer);
git(["clone", remote, other]); git(["config", "user.name", "Other"], other); git(["config", "user.email", "other@example.test"], other);
retry.atomicWrite(path.join(producer, "data/psa-official-populations.json"), { rows: [{ ...pop, fetchedAt: "2026-10-06T00:00:00Z", psa10Count: 101 }] });
const packetFile = enqueue(producer), packet = JSON.parse(fs.readFileSync(packetFile));
assert.throws(() => applyPacket(producer, { ...packet, digest: "bad" }), /checksum/);
fs.writeFileSync(path.join(producer, "USER-NOTES.txt"), "Uncommitted user change must survive");
const out = publish(producer, { scripts: [], beforeBuild: (_, attempt) => {
  if (attempt) return;
  retry.atomicWrite(path.join(other, "data/psa-official-populations.json"), { rows: [{ ...pop, fetchedAt: "2026-10-06T01:00:00Z", psa10Count: 102 }, { ...pop, cardNo: "127" }] });
  retry.atomicWrite(path.join(other, "work/psa-fetch-progress.json"), { startedAt: "2026-10-06T01:00:00Z", completedUrls: ["newer-checkpoint"] });
  fs.writeFileSync(path.join(other, "data/shop.json"), '{"newerShopPrice":true}');
  git(["add", "data", "work"], other); git(["commit", "-m", "Concurrent source update"], other); git(["push", "origin", "main"], other);
} });
assert.equal(out.published.length, 1); assert.equal(out.acquisitionRequests, 0);
const rows = JSON.parse(git(["show", "main:data/psa-official-populations.json"], remote)).rows;
assert.equal(rows.length, 2); assert.equal(rows[0].psa10Count, 102);
assert.equal(JSON.parse(git(["show", "main:work/psa-fetch-progress.json"], remote)).completedUrls[0], "newer-checkpoint");
assert.equal(JSON.parse(git(["show", "main:data/shop.json"], remote)).newerShopPrice, true);
assert(fs.readFileSync(path.join(producer, "USER-NOTES.txt"), "utf8").includes("survive"));
assert.deepEqual(publish(producer, { scripts: [] }).published, [], "acknowledged packet is not republished");
assert(fs.existsSync(packetFile), "immutable saved packet retained after publication");
const inputs = prepareInputs(producer);
assert.equal(inputs.status, "latest-fetched-main");
assert.equal(inputs.httpAcquisitionRequests, 0);
assert.equal(JSON.parse(fs.readFileSync(inputs.priorityPath)).rows[0].cardId, "new-card");
assert.equal(require(inputs.collectorPath).cellTextWithSpecification({childNodes:[{textContent:'Pikachu'},{textContent:'Master Ball Reverse Holo'}]}),'Pikachu | Master Ball Reverse Holo');
assert.equal(fs.readFileSync(inputs.historyPath,'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(path.join(__dirname,'build_psa_history.js'),'utf8').replace(/\r\n/g,'\n'),'snapshot comes from fetched commit, not an edited working source');
assert.equal(Object.keys(inputs.runtimeHashes).length,4);
assert.equal(require(path.join(path.dirname(inputs.collectorPath),'fair_batch.js')).fairBatch([1,2,3],2,x=>x===1).length,2);
for (const file of Object.keys(inputs.runtimeHashes)) {
  const source=fs.readFileSync(path.join(path.dirname(inputs.collectorPath),file),'utf8');
  for(const match of source.matchAll(/require\(["'](\.\.?\/[^"']+)["']\)/g)) assert.doesNotThrow(()=>require.resolve(path.resolve(path.dirname(inputs.collectorPath),match[1])));
}
assert(fs.readFileSync(path.join(producer, "USER-NOTES.txt"), "utf8").includes("survive"));
console.log("Transient retries, URL/source isolation, adaptive rate, duplicate lock, saved packet checksum, concurrent Git publication and newer checkpoint preservation: passed");
