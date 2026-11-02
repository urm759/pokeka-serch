const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const {trusted,METADATA_TIMEOUT_MS,ARCHIVE_TIMEOUT_MS}=require('./recover_failed_price_run'),{zipEntries,restore}=require('./restore_price_artifact');
assert.equal(METADATA_TIMEOUT_MS,60000);assert.equal(ARCHIVE_TIMEOUT_MS,240000);
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/priority-price-refresh.yml'),'utf8');
const sourceArtifact=workflow.slice(workflow.indexOf('name: priority-price-recovery-'),workflow.indexOf('name: priority-git-recovery-'));
assert(sourceArtifact.includes('work/unpublished-recovery/'));
assert(!sourceArtifact.includes('work/publish-recovery.bundle'),'normal raw checkpoint recovery must not download the large Git bundle');
assert(workflow.slice(workflow.indexOf('name: priority-git-recovery-')).includes('work/publish-recovery.bundle'),'Git recovery is preserved separately');
const good={name:'Priority Purchase Price Refresh',event:'schedule',conclusion:'failure',head_branch:'main',repository:{full_name:'urm759/pokeka-serch'},head_repository:{full_name:'urm759/pokeka-serch'}};
assert(trusted(good));for(const change of [{event:'pull_request'},{head_branch:'feature'},{conclusion:'success'},{head_repository:{full_name:'fork/repo'}},{name:'Daily Fast Update'}])assert(!trusted({...good,...change}));
const {trustedMonitor,latestMonitor}=require('./recover_failed_price_run');
const {monitorRecoveryNeeded}=require('./recover_failed_price_run');
const acquired={name:'catchup',status:'completed',conclusion:'success'};
assert.equal(monitorRecoveryNeeded({jobs:[acquired,{name:'publication_check',conclusion:'failure'}]}),false,'independent verification failure has no unpublished source checkpoint');
assert.equal(monitorRecoveryNeeded({jobs:[acquired,{name:'watch',conclusion:'failure'}]}),false,'monitor-only failure must not block acquisition');
assert(monitorRecoveryNeeded({jobs:[{...acquired,conclusion:'failure'},{name:'publication_check',conclusion:'failure'}]}),'failed catchup still requires recovery');
assert(monitorRecoveryNeeded({jobs:[]}), 'missing job proof is never a recovery exemption');
const monitor={...good,id:123,name:'Data Update Health Watchdog',updated_at:'2026-10-26T14:54:00Z'};
assert(trustedMonitor(monitor));assert(!trustedMonitor(good));
for(const change of [{event:'workflow_dispatch'},{event:'workflow_run'},{conclusion:'success'},
  {head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])assert(!trustedMonitor({...monitor,...change}));
const recoveryOptions={currentRunId:124,now:Date.parse('2026-10-26T15:00:00Z'),lastAcquisitionAt:'2026-10-26T10:00:00Z'};
const {trustedDaily,latestDaily}=require('./recover_failed_price_run');
const daily={...monitor,name:'Daily Fast Update'};
assert(trustedDaily(daily));assert(!trustedDaily(good));assert.equal(latestDaily([daily,monitor],recoveryOptions).id,123);
for(const change of [{event:'workflow_dispatch'},{conclusion:'success'},{head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])assert(!trustedDaily({...daily,...change}));
assert.equal(latestDaily([daily],{...recoveryOptions,alreadyApplied:()=>true}),null);
assert.equal(latestDaily([daily],{...recoveryOptions,now:Date.parse('2026-11-05')}),null);
for(const file of ['data/psa10-observation-receipt.json','data/domestic-trade-source-audit.json','work/card-new-arrivals.json','work/card-lifecycle.json'])
  assert(require('./restore_price_artifact').INPUTS.includes(file),'daily source evidence must survive recovery: '+file);
assert.equal(latestMonitor([monitor],recoveryOptions).id,123);
assert.equal(latestMonitor([monitor],{...recoveryOptions,currentRunId:123}),null,'never restore the running job itself');
assert.equal(latestMonitor([monitor],{...recoveryOptions,alreadyApplied:()=>true}),null,'do not repeat restored checkpoints');
assert.equal(latestMonitor([monitor],{...recoveryOptions,lastAcquisitionAt:'2026-10-26T14:55:00Z'}),null,'newer acquisition inputs take precedence');
assert.equal(latestMonitor([monitor],{...recoveryOptions,now:Date.parse('2026-11-05')}),null,'expired checkpoints are not re-requested');
const health=fs.readFileSync(path.join(__dirname,'../.github/workflows/watch-data-health.yml'),'utf8');
assert(health.indexOf('--latest-monitor')<health.indexOf('id: catchup_plan'),'restore before selecting optional acquisition');
function zip(files){
  let offset=0;const local=[],central=[];
  for(const [name,value]of Object.entries(files)){
    const n=Buffer.from(name),b=Buffer.from(value),l=Buffer.alloc(30),c=Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(b.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    local.push(l,n,b);central.push(c,n);offset+=l.length+n.length+b.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
assert.throws(()=>zipEntries(Buffer.from('invalid')),/ZIP/);
assert.throws(()=>zipEntries(zip({'../outside':'bad'})),/Unsafe/);
const {reconstructionManifest}=require('./restore_price_artifact');
const manifests=(changes={})=>zipEntries(zip({
 'work/pre/recovery-manifest.json':JSON.stringify({workflowRunId:'123',source:'daily-prevalidation',savedAt:'2026-11-02T18:03:38Z',files:[{file:'data/pokemon-cards.json'}],invalidJson:[]}),
 'work/final/recovery-manifest.json':JSON.stringify({workflowRunId:'123',source:'daily',savedAt:'2026-11-02T18:05:38Z',files:[{file:'data/pokemon-cards.json'}],invalidJson:[],...changes})}));
assert.equal(reconstructionManifest(manifests(),'123').file,'work/final/recovery-manifest.json');
assert.throws(()=>reconstructionManifest(manifests({workflowRunId:'124'}),'123'),/proof mismatch/);
assert.throws(()=>reconstructionManifest(manifests({files:[]}),'123'),/Incomplete/);
assert.throws(()=>reconstructionManifest(manifests({savedAt:'2026-11-02T18:00:00Z'}),'123'),/Incomplete/);
assert.throws(()=>reconstructionManifest(manifests({source:'unknown'}),'123'),/Ambiguous/);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-artifact-'));
const write=(f,x)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),JSON.stringify(x));};
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try{
  const {lastSuccessfulAcquisition}=require('./recover_failed_price_run');
  assert.equal(lastSuccessfulAcquisition(root),null);
  write('data/priority-price-execution.json',{startedAt:'2026-10-26T10:00:00Z'});
  write('work/source-update-runs.json',{sources:{toreca:{lastSuccessAt:'2026-10-26T14:55:00Z'},shopBuyback:{lastSuccessAt:'invalid'},marketAnalysis:{lastSuccessAt:'2026-11-01T00:00:00Z'}}});
  assert.equal(lastSuccessfulAcquisition(root),'2026-10-26T14:55:00.000Z','real Daily source times take precedence; derived aggregation time is excluded');
  assert.equal(latestMonitor([monitor],{...recoveryOptions,lastAcquisitionAt:lastSuccessfulAcquisition(root)}),null,'older failed monitor cannot roll back or block recovered Daily inputs');
  const {inspectedForRun}=require('./recover_failed_price_run');write('work/recovery-inspected-999.json',{runAttempt:1,headSha:'abc'});
  assert(inspectedForRun(root,{id:999,run_attempt:1,head_sha:'abc'}));assert(!inspectedForRun(root,{id:999,run_attempt:2,head_sha:'abc'}),'new rerun cannot inherit an old observer-only inspection');
  write('data/pokemon-cards.json',[{id:'one',price:100,observedAt:'2026-10-24T00:00:00Z'}]);
  const checkpoint={sources:{shop:{jobs:{one:{lastAttemptAt:'2026-10-24T00:00:00Z',nextDueAt:'2026-10-24T06:00:00Z'}}}}};
  write('work/priority-price-checkpoint.json',checkpoint);
  git(['init']);git(['add','data','work/priority-price-checkpoint.json']);git(['-c','user.name=test','-c','user.email=test@example.invalid','commit','-m','base']);const base=git(['rev-parse','HEAD']).trim();
  const incoming=JSON.stringify([{id:'one',price:110,observedAt:'2026-10-25T00:00:00Z'}]),prefix='work/unpublished-recovery/123-1/';
  const manifest={workflowRunId:'123',invalidJson:[],files:[{file:'data/pokemon-cards.json',bytes:Buffer.byteLength(incoming),sha256:crypto.createHash('sha256').update(incoming).digest('hex')}]};
  const monitored=structuredClone(checkpoint);monitored.sources.shop.jobs.one.nextDueAt='2026-10-24T12:00:00Z';write('work/priority-price-checkpoint.json',monitored);
  const newCheckpoint=structuredClone(checkpoint);newCheckpoint.sources.shop.jobs.one={lastAttemptAt:'2026-10-25T00:00:00Z',lastSuccessAt:'2026-10-25T00:00:01Z',nextDueAt:'2026-10-25T06:00:01Z'};
  const checkpointBytes=JSON.stringify(newCheckpoint);manifest.files.push({file:'work/priority-price-checkpoint.json',bytes:Buffer.byteLength(checkpointBytes),sha256:crypto.createHash('sha256').update(checkpointBytes).digest('hex')});
  const archive=path.join(root,'recovery.zip');fs.writeFileSync(archive,zip({[prefix+'recovery-manifest.json']:JSON.stringify(manifest),[prefix+'data/pokemon-cards.json']:incoming,[prefix+'work/priority-price-checkpoint.json']:checkpointBytes}));
  let result=restore(archive,'123',base,root);assert.equal(result.restored.length,2);assert.equal(result.sourceRequests,0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'work/priority-price-checkpoint.json'))),newCheckpoint,'monitor-only deadline changes do not block real acquired data');
  const held=structuredClone(monitored);held.sources.shop.jobs.one.held=true;
  assert.throws(()=>require('./reconcile_saved_source_merge').mergePriorityCheckpoint(checkpoint,held,newCheckpoint),/manual checkpoint hold/,'manual stops are not auto-released');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json')))[0].observedAt,'2026-10-25T00:00:00Z');
  assert.equal(restore(archive,'123',base,root).restored.length,0,'same receipt is idempotent');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'work/recovery-applied-123.json'))).restored.length,2,'a repeated invocation preserves the original recovery receipt');
  write('data/pokemon-cards.json',[{id:'one',price:120}]);assert.throws(()=>restore(archive,'123',base,root),/Concurrent/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json')))[0].price,120,'newer independent inputs are not overwritten');
  git(['add','data']);git(['-c','user.name=test','-c','user.email=test@example.invalid','commit','-m','later']);
  const shallow=path.join(root,'shallow'),url=require('node:url').pathToFileURL(root).href;
  git(['clone','--quiet','--depth=1',url,shallow]);
  assert.notEqual(cp.spawnSync('git',['cat-file','-e',base+'^{commit}'],{cwd:shallow}).status,0,'Actions-style shallow clone lacks the acquisition base');
  assert.throws(()=>restore(archive,'123',base,shallow),/base commit unavailable/,'missing base is not silently treated as a new-file conflict');
  const {ensureTrustedBase}=require('./recover_failed_price_run');
  assert.deepEqual(ensureTrustedBase(shallow,base),{fetched:true});
  assert.deepEqual(ensureTrustedBase(shallow,base),{fetched:false},'known base requires no repeated fetch');
  assert.throws(()=>ensureTrustedBase(shallow,'main'),/Exact trusted/);
  assert.throws(()=>ensureTrustedBase(shallow,'f'.repeat(40),()=>({status:1})),/saved archive retained/);
  assert.throws(()=>restore(archive,'123',base,shallow),/Concurrent/,'genuine newer source conflicts remain held after the base is available');
}finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS failed price recovery: trusted schedule only, verified ZIP/manifest, no reacquisition, original times, idempotence and concurrent-input hold');
