const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const policy=require('./psa_access_policy'),root=path.resolve(__dirname,'..');
const denied=policy.read(root);
assert.equal(denied.intendedUse,'personal-noncommercial');
for(const phase of ['acquisition','publication']){
  for(const p of [null,{},denied,{...denied,automaticAcquisition:true,publicationOfNewData:true}]){
    const result=policy.decision(p,phase);
    assert(!result.allowed);assert(!result.automaticRetry);assert.equal(result.nextRetryAt,null);
  }
}
const documented={version:1,permissionEvidence:'test-only documented scope',automaticAcquisition:true,publicationOfNewData:false};
assert(policy.decision(documented).allowed);assert(!policy.decision(documented,'publication').allowed);
assert.throws(()=>policy.decision(documented,'other'),/Unknown/);
const retry=require('./acquisition_retry').failure({}, {error:'PSA permission-wait'},Date.now());
assert.equal(retry.kind,'permission');assert.equal(retry.scope,'source');assert(retry.held);assert.equal(retry.nextRetryAt,null);
assert(retry.resumeCondition.includes('ログイン成功だけでは解除しない'));
const plan=require('./profile_completion_routes').prospectPlan({id:'test'},['psaOfficial','psa10Price'],{
  linkage:{test:{status:'unlinked',sourceSetUrl:'https://www.psacard.com/pop/tcg-cards/test/1'}},psaAccess:policy.decision(denied),
});
assert.equal(plan.requirements[0].state,'permission-wait');assert(!plan.requirements[0].automatic);
assert(plan.requirements[1].automatic,'independent domestic source stays eligible');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'psa-permission-'));
try {
  assert.throws(()=>require('./psa_handoff').publish(temp),/permission-wait/,'must stop before Git or outbox changes');
  assert.deepEqual(fs.readdirSync(temp),[]);
}finally{fs.rmdirSync(temp);}
const tracked=['data/psa-official-populations.json','work/psa-fetch-progress.json','work/psa_update_state.json'];
const before=tracked.map(f=>fs.readFileSync(path.join(root,f)));
const run=cp.spawnSync(process.execPath,['work/update_psa_official_populations.js'],{cwd:root,encoding:'utf8',timeout:10000});
assert.notEqual(run.status,0);assert.match(run.stderr,/permission-wait/);
const discoveryBefore=fs.readFileSync(path.join(root,'data/psa-set-discovery.json'));
const discovery=cp.spawnSync(process.execPath,['work/discover_psa_set_urls.js'],{cwd:root,encoding:'utf8',timeout:10000});
assert.notEqual(discovery.status,0);assert.match(discovery.stderr,/permission-wait/);
assert.deepEqual(fs.readFileSync(path.join(root,'data/psa-set-discovery.json')),discoveryBefore);
tracked.forEach((f,i)=>assert.deepEqual(fs.readFileSync(path.join(root,f)),before[i],f+' retained'));
for(const name of ['acquire_psa_data.ps1','run_psa_scheduled_update.ps1','publish_psa_update.ps1']){
  const text=fs.readFileSync(path.join(__dirname,name),'utf8');
  assert(text.includes('psa_access_policy.js'));assert(text.includes('exit 3'));
  if(name==='acquire_psa_data.ps1')assert(text.indexOf('psa_access_policy.js')<text.indexOf('start_psa_regular_chrome.ps1'));
  if(name==='run_psa_scheduled_update.ps1')assert(text.indexOf('psa_access_policy.js')<text.indexOf("publish_psa_update.ps1"));
}
console.log('PASS PSA permission gate: noncommercial is not permission, phase separation, no login bypass, no fetch/checkpoint loss, independent sources eligible');
