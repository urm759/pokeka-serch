const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'optional-psa-'));
  try{
    fs.mkdirSync(path.join(root,'data'));
    const old={candidates:[{url:'https://www.psacard.com/pop/known'}],lastSuccessAt:'2026-10-01',url:'saved-checkpoint',manualWait:true};
    fs.writeFileSync(path.join(root,'data/psa-set-discovery.json'),JSON.stringify(old));
    let calls=0;
    const held=await require('./discover_psa_set_urls').run({root,optionalPermission:true,fetcher:()=>{calls++;throw Error('must not fetch');}});
    assert.equal(calls,0);assert.equal(held.status,'permission-wait');assert.equal(held.nextRetryAt,null);
    assert.deepEqual(held.candidates,old.candidates);assert.equal(held.lastSuccessAt,old.lastSuccessAt);assert.equal(held.url,old.url);
    await assert.rejects(require('./discover_psa_set_urls').run({root}),/permission-wait/,'direct acquisition remains fail-closed');
    const workflow=fs.readFileSync('.github/workflows/safe-checkpoint-backfill.yml','utf8');
    assert(workflow.includes('discover_psa_set_urls.js --optional-permission'));
    const daily=fs.readFileSync('.github/workflows/daily-fast-update.yml','utf8');
    const stage=daily.indexOf('git add -u -- data work');
    const receipt=daily.lastIndexOf('node work/scheduled_cycle_evidence.js daily');
    assert(receipt>=0&&stage>receipt);
    assert(stage<daily.indexOf('node work/publish_data_checkpoint.js'));
    assert(fs.readFileSync('work/publish_data_checkpoint.js','utf8').includes('verify(cwd,{staged:true})'),'publication boundary guard is not disabled');
    console.log('PASS optional permission hold retains checkpoint, zero fetch, independent source continuation, tracked finalization staging and mandatory publication guard');
  }finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'optional-psa-'));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
