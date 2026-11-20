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

function generatedFixture(failValidation) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-generated-merge-'));
  const origin=path.join(dir,'origin.git'),left=path.join(dir,'left'),right=path.join(dir,'right');
  git(['init','--bare','--initial-branch=main',origin]);git(['clone',origin,left]);config(left);
  fs.mkdirSync(path.join(left,'data/ui'),{recursive:true});fs.mkdirSync(path.join(left,'work'));
  const put=(cwd,file,value)=>fs.writeFileSync(path.join(cwd,file),JSON.stringify(value));
  function generated(cwd,day){
    put(cwd,'data/update-status.json',{completeDate:day});
    put(cwd,'data/performance-history.json',{version:1,records:[{generatedAt:day+'T00:00:00Z',value:day}]});
    put(cwd,'data/runtime-availability-audit.json',{at:day});
    put(cwd,'data/ui/manifest.json',{revision:day});
  }
  generated(left,'2026-10-01');put(left,'data/source.json',{price:12345,observedAt:'2026-10-01'});
  git(['add','data'],left);git(['commit','-m','Initial derived snapshots'],left);git(['push','origin','main'],left);
  git(['clone',origin,right]);config(right);generated(right,'2026-10-02');
  git(['add','data'],right);git(['commit','-m','Remote generated update'],right);git(['push','origin','main'],right);
  generated(left,'2026-10-03');git(['add','data'],left);git(['commit','-m','Local generated update'],left);git(['fetch','origin','main'],left);
  assert.notEqual(spawnSync('git',['merge','--no-edit','origin/main'],{cwd:left,encoding:'utf8'}).status,0);
  const head=git(['rev-parse','HEAD'],left),incoming=git(['rev-parse','MERGE_HEAD'],left);
  const resolve=require('./resolve_generated_merge').resolve;
  const rebuild=()=>{
    if(failValidation)throw Error('Required validation failed');
    const history=JSON.parse(fs.readFileSync(path.join(left,'data/performance-history.json')));
    assert.deepEqual(history.records.map(r=>r.generatedAt),['2026-10-02T00:00:00Z','2026-10-03T00:00:00Z']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(left,'data/update-status.json'))).completeDate,'2026-10-02');
    assert.equal(JSON.parse(fs.readFileSync(path.join(left,'data/source.json'))).price,12345);
  };
  if(failValidation){assert.throws(()=>resolve(left,{rebuild}),/Required validation failed/);assert.equal(git(['rev-parse','HEAD'],left),head);}
  else {assert(resolve(left,{rebuild}));assert.equal(git(['diff','--name-only','--diff-filter=U'],left),'');}
  for(const stage of [1,2,3])assert(fs.existsSync(path.join(left,'work/generated-merge-stages',incoming,String(stage),'data/ui/manifest.json')));
}
generatedFixture(false);generatedFixture(true);
console.log('PASS generated-only publication conflicts, all-side archive, history preservation and failed validation publication stop');

// Reproduce an already-running publisher whose modules predate a concurrent
// evidence-policy update. Each post-merge check must use the merged code graph.
function runtimePolicyFixture(invalid=false) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-publish-runtime-'));
  const origin=path.join(dir,'remote.git'),left=path.join(dir,'left'),right=path.join(dir,'right');
  const write=(cwd,file,text)=>{fs.mkdirSync(path.dirname(path.join(cwd,file)),{recursive:true});fs.writeFileSync(path.join(cwd,file),text);};
  try {
    git(['init','--bare','--initial-branch=main',origin]);git(['clone',origin,left]);config(left);
    write(left,'work/publish_data_checkpoint.js',fs.readFileSync(path.join(__dirname,'publish_data_checkpoint.js')));
    write(left,'ui-data-codec.js','// fixture');
    write(left,'work/enforce_overseas_publication.js','exports.enforce=()=>{};exports.verify=()=>{};');
    write(left,'work/runtime-policy.js','exports.required=1;');
    write(left,'work/gemrate_confirmed_links.js',"exports.validatePublic=(root,data)=>{if(data.version!==require('./runtime-policy').required)throw Error('Reviewed addition evidence incomplete');};");
    write(left,'work/ui_projection_cache.js','exports.current=()=>false;');
    write(left,'work/build_ui_data.js',"exports.build=root=>require('fs').writeFileSync(require('path').join(root,'data/ui/manifest.json'),JSON.stringify({policy:require('./runtime-policy').required}));");
    write(left,'data/ui/manifest.json','{}');write(left,'data/gemrate-reference-summary.json','{"version":1}');
    write(left,'work/gemrate-confirmed-reference-registry.json','{}');
    git(['add','.'],left);git(['commit','-m','policy one'],left);git(['push','origin','main'],left);
    const publisher=require(path.join(left,'work/publish_data_checkpoint.js'));
    publisher.preparePublication(left);git(['commit','-am','initial projection'],left);git(['push','origin','main'],left);
    git(['clone',origin,right]);config(right);
    write(right,'work/runtime-policy.js','exports.required=2;');
    write(right,'data/gemrate-reference-summary.json',JSON.stringify({version:invalid?3:2}));
    git(['add','.'],right);git(['commit','-m','new evidence and required policy'],right);git(['push','origin','main'],right);
    write(left,'data/local-monitor.json','{"observedAt":"2026-11-21T00:00:00Z"}');git(['add','data'],left);
    if(invalid) {
      assert.throws(()=>publisher.publish({cwd:left}),/Merged publication validation failed.*checkpoint bundle retained/s);
      const saved=JSON.parse(fs.readFileSync(path.join(left,'work/publish-recovery.json')));
      assert.equal(saved.status,'merged-validation-failed');assert.equal(saved.attempts.at(-1).ok,false);
      git(['bundle','verify',path.join(left,'work/publish-recovery.bundle')],left);
      assert.throws(()=>git(['show','main:data/local-monitor.json'],origin),'invalid merged evidence must not be pushed');
    } else {
      const result=publisher.publish({cwd:left});assert.equal(result.status,'published');
      assert(result.timings.projectionChecks.every(r=>r.runtime==='fresh-node-current-tree'));
      assert.equal(JSON.parse(git(['show','main:data/ui/manifest.json'],origin)).policy,2);
      assert.equal(JSON.parse(git(['show','main:data/local-monitor.json'],origin)).observedAt,'2026-11-21T00:00:00Z');
      assert.throws(()=>publisher.preparePublication(left),/Reviewed addition evidence incomplete/,'the stale parent graph reproduces the actual old-validator error');
    }
  } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('pokeka-publish-runtime-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
runtimePolicyFixture();runtimePolicyFixture(true);
console.log('PASS fresh merged validation graph, real stale-module reproduction, invalid evidence stop, saved bundle and unchanged source timestamps');
