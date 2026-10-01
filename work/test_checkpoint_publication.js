const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { publish } = require("./publish_data_checkpoint");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokeka-publish-test-"));
const remote = path.join(root, "remote.git");
const repo = path.join(root, "publisher");
const other = path.join(root, "other");
function git(args, cwd = root) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function config(cwd) {
  git(["config", "user.name", "Checkpoint Test"], cwd);
  git(["config", "user.email", "checkpoint@example.test"], cwd);
}
git(["init", "--bare", "--initial-branch=main", remote]);
git(["clone", remote, repo]); config(repo);
fs.mkdirSync(path.join(repo, "data")); fs.mkdirSync(path.join(repo, "work"));
fs.writeFileSync(path.join(repo, "data", "base.json"), '{"value":1}');
git(["add", "data"], repo); git(["commit", "-m", "Initial"], repo); git(["push", "origin", "main"], repo);
git(["clone", remote, other]); config(other);
fs.writeFileSync(path.join(other, "README.md"), "User change must survive.\n");
git(["add", "README.md"], other); git(["commit", "-m", "Remote user change"], other); git(["push", "origin", "main"], other);
fs.writeFileSync(path.join(repo, "data", "base.json"), '{"value":2}'); git(["add", "data"], repo);
assert.equal(publish({ cwd: repo, message: "New source checkpoint" }).status, "published");
assert.equal(fs.readFileSync(path.join(repo, "README.md"), "utf8").replace(/\r\n/g, "\n"), "User change must survive.\n");
assert.equal(git(["show", "main:data/base.json"], remote), '{"value":2}');
assert.equal(publish({ cwd: repo }).status, "unchanged", "no change must not create another commit");
git(["pull", "--ff-only"], other);
fs.writeFileSync(path.join(other, "data", "base.json"), '{"value":3}');
git(["add", "data"], other); git(["commit", "-m", "Conflicting remote source"], other); git(["push", "origin", "main"], other);
fs.writeFileSync(path.join(repo, "data", "base.json"), '{"value":4}'); git(["add", "data"], repo);
assert.throws(() => publish({ cwd: repo }), /checkpoint bundle saved/);
assert.equal(git(["show", "main:data/base.json"], remote), '{"value":3}', "conflict must not overwrite remote data");
assert.equal(JSON.parse(fs.readFileSync(path.join(repo, "work", "publish-recovery.json"))).status, "manual-merge-required");
git(["bundle", "verify", path.join(repo, "work", "publish-recovery.bundle")], repo);
const portable = spawnSync(process.execPath, ["-e", "Object.defineProperty(process,'platform',{value:'linux'});require('./work/update_psa_official_populations.js');console.log('portable import passed')"], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
assert.equal(portable.status, 0, portable.stderr);
console.log("Portable PSA import, recoverable publication, non-overlapping merge and conflicting data isolation passed");
