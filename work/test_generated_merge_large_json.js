const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {resolve}=require('./resolve_generated_merge');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-large-merge-'));
const git=(args,success=true)=>{const p=cp.spawnSync('git',args,{cwd:dir,encoding:'utf8',maxBuffer:8000000});if(success)assert.equal(p.status,0,p.stderr);return p;};
try {
  git(['init','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);git(['config','commit.gpgsign','false']);
  fs.mkdirSync(path.join(dir,'data'));
  const file=path.join(dir,'data/update-status.json'),payload='x'.repeat(2200000);
  const write=(side,date)=>fs.writeFileSync(file,JSON.stringify({side,payload,completeDate:date}));
  write('base','2026-10-01');git(['add','.']);git(['commit','-m','base']);
  git(['checkout','-b','incoming']);write('incoming','2026-10-02');git(['commit','-am','incoming']);
  git(['checkout','main']);write('local','2026-10-03');git(['commit','-am','local']);
  assert.notEqual(git(['merge','incoming'],false).status,0);
  const incoming=git(['rev-parse','MERGE_HEAD']).stdout.trim();let rebuilt=0;
  assert(resolve(dir,{rebuild:()=>{
    rebuilt++;
    for(const stage of [1,2,3]){const saved=JSON.parse(fs.readFileSync(path.join(dir,'work/generated-merge-stages',incoming,String(stage),'data/update-status.json')));assert.equal(saved.payload.length,2200000);}
    const row=JSON.parse(fs.readFileSync(file));assert.equal(row.side,'local');assert.equal(row.completeDate,'2026-10-02');
    fs.writeFileSync(file,JSON.stringify({...row,verified:true}));
  }}));
  assert.equal(rebuilt,1);assert.equal(git(['diff','--name-only','--diff-filter=U']).stdout.trim(),'');assert(JSON.parse(fs.readFileSync(file)).verified);
  console.log('PASS >2MB generated JSON merge: all three full stages archived, parsed, rebuilt and committed without truncation');
}finally{
  const absolute=path.resolve(dir),parent=path.resolve(os.tmpdir());
  if(path.dirname(absolute)!==parent || !path.basename(absolute).startsWith('pokeka-large-merge-'))throw Error('Unsafe fixture cleanup path');
  fs.rmSync(absolute,{recursive:true,force:true});
}
