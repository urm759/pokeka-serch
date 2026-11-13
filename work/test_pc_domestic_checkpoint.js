const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {preserveConflicted}=require('./pc_domestic_checkpoint');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pc-held-checkpoint-')),root=path.join(temp,'repo'),store=path.join(temp,'private'),worker=path.join(store,'domestic-worker');
fs.mkdirSync(root);fs.mkdirSync(store);
const git=(a,cwd=root)=>cp.execFileSync('git',a,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const write=(r,f,t)=>{const p=path.join(r,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,t);};
let held;
try{
 git(['init','-b','main']);git(['config','user.name','fixture']);git(['config','user.email','fixture@example.invalid']);
 write(root,'data/quote.json','{"price":100}');write(root,'work/code.js','original');git(['add','.']);git(['commit','-m','base']);const base=git(['rev-parse','HEAD']);
 git(['update-ref','refs/remotes/origin/main',base]);git(['worktree','add','--detach',worker,base]);
 write(worker,'data/quote.json','{"price":110}');git(['add','data/quote.json'],worker);git(['commit','-m','own data'],worker);const head=git(['rev-parse','HEAD'],worker);
 write(root,'data/quote.json','{"price":120}');write(root,'work/price-source-fixture.html','actual remote raw');git(['add','.']);git(['commit','-m','parallel source']);const incoming=git(['rev-parse','HEAD']);git(['update-ref','refs/remotes/origin/main',incoming]);
 assert.notEqual(cp.spawnSync('git',['merge','--no-edit','origin/main'],{cwd:worker}).status,0);
 write(worker,'work/publish-recovery.json',JSON.stringify({base,checkpointCommit:head,status:'manual-merge-required'}));write(worker,'work/publish-recovery.bundle','preserved bundle');
 assert.throws(()=>preserveConflicted({root,worker,store,owner:null}),/Unproven/);
 write(worker,'work/code.js','unowned developer change');
 assert.throws(()=>preserveConflicted({root,worker,store,owner:{base}}),/Unknown non-data/);assert(fs.existsSync(worker),'unknown developer bytes remain untouched');
 write(worker,'work/code.js','original');
 const r=preserveConflicted({root,worker,store,owner:{base},at:'2026-11-13T08:00:00Z'});held=r.held;
 assert.equal(r.recoveryApplied,false);assert.equal(r.sourceRequests,0);assert(r.normalUpdatesMayContinue);assert(!fs.existsSync(worker));
 assert(git(['diff','--name-only','--diff-filter=U'],held).includes('data/quote.json'),'merge stages are preserved rather than aborted');
 assert.equal(fs.readFileSync(path.join(held,'work/publish-recovery.bundle'),'utf8'),'preserved bundle');
 assert.equal(git(['rev-parse','HEAD'],held),head);assert.equal(git(['rev-parse','MERGE_HEAD'],held),incoming);
 git(['worktree','add','--detach',worker,'origin/main']);assert.equal(JSON.parse(fs.readFileSync(path.join(worker,'data/quote.json'))).price,120,'a new lane uses trusted main, never conflicted saved values');
 assert.equal(preserveConflicted({root,worker,store,owner:{base:incoming}}),null,'clean lanes are not archived again');
 console.log('PASS owned failed publication worktree retained intact with merge stages/raw/bundle; unknown code stops; fresh-main lane does not adopt held prices');
}finally{
 for(const dir of [worker,held].filter(Boolean))if(fs.existsSync(path.join(dir,'.git')))git(['worktree','remove','--force',dir]);
 assert(path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('pc-held-checkpoint-'));fs.rmSync(temp,{recursive:true,force:true});
}
