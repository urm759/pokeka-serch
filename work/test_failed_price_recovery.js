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
const monitor={...good,id:123,name:'Data Update Health Watchdog',updated_at:'2026-10-26T14:54:00Z'};
assert(trustedMonitor(monitor));assert(!trustedMonitor(good));
for(const change of [{event:'workflow_dispatch'},{event:'workflow_run'},{conclusion:'success'},
  {head_branch:'feature'},{head_repository:{full_name:'fork/repo'}}])assert(!trustedMonitor({...monitor,...change}));
const recoveryOptions={currentRunId:124,now:Date.parse('2026-10-26T15:00:00Z'),lastAcquisitionAt:'2026-10-26T10:00:00Z'};
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
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-artifact-'));
const write=(f,x)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),JSON.stringify(x));};
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try{
  write('data/pokemon-cards.json',[{id:'one',price:100,observedAt:'2026-10-24T00:00:00Z'}]);
  git(['init']);git(['add','data']);git(['-c','user.name=test','-c','user.email=test@example.invalid','commit','-m','base']);const base=git(['rev-parse','HEAD']).trim();
  const incoming=JSON.stringify([{id:'one',price:110,observedAt:'2026-10-25T00:00:00Z'}]),prefix='work/unpublished-recovery/123-1/';
  const manifest={workflowRunId:'123',invalidJson:[],files:[{file:'data/pokemon-cards.json',bytes:Buffer.byteLength(incoming),sha256:crypto.createHash('sha256').update(incoming).digest('hex')}]};
  const archive=path.join(root,'recovery.zip');fs.writeFileSync(archive,zip({[prefix+'recovery-manifest.json']:JSON.stringify(manifest),[prefix+'data/pokemon-cards.json']:incoming}));
  let result=restore(archive,'123',base,root);assert.equal(result.restored.length,1);assert.equal(result.sourceRequests,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json')))[0].observedAt,'2026-10-25T00:00:00Z');
  assert.equal(restore(archive,'123',base,root).restored.length,0,'same receipt is idempotent');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'work/recovery-applied-123.json'))).restored.length,1,'a repeated invocation preserves the original recovery receipt');
  write('data/pokemon-cards.json',[{id:'one',price:120}]);assert.throws(()=>restore(archive,'123',base,root),/Concurrent/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json')))[0].price,120,'newer independent inputs are not overwritten');
}finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS failed price recovery: trusted schedule only, verified ZIP/manifest, no reacquisition, original times, idempotence and concurrent-input hold');
