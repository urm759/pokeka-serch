const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {resolve}=require('./resolve_generated_merge');
const {mergePriorityCheckpoint}=require('./reconcile_saved_source_merge');
const initial='2026-11-03T00:00:00Z',older='2026-11-03T01:00:00Z',newer='2026-11-03T02:00:00Z';
const checkpoint=(at,held=false)=>({sources:{shop:{jobs:{a:{lastAttemptAt:at,held,nextDueAt:at}}}}});
assert.throws(()=>mergePriorityCheckpoint(checkpoint(initial),checkpoint(newer),checkpoint(older,true)),/manual checkpoint hold/,
  'an older incoming hold must not be removed by a newer automatic checkpoint');
assert.throws(()=>mergePriorityCheckpoint(checkpoint(initial),checkpoint(older,true),checkpoint(newer)),/manual checkpoint hold/);
assert(mergePriorityCheckpoint(checkpoint(initial),checkpoint(older,true),checkpoint(older,true)).sources.shop.jobs.a.held,
  'identical retained holds on both sides remain held without blocking other cards');
function fixture(kind){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-concurrent-publish-'));
  const git=(args,ok=true)=>{const r=cp.spawnSync('git',args,{cwd:dir,encoding:'utf8'});if(ok)assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  const put=(file,value)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),JSON.stringify(value));};
  const fresh=(at,ids=['a'])=>({sources:{shop:{cohort:ids,observations:[{at}],intervalMinima:[],lastConfirmedRows:[{id:'a',lastConfirmedAt:initial}]}}});
  function side(at){
    put('work/priority-price-checkpoint.json',checkpoint(at));
    put('work/priority-freshness-history.json',fresh(at));
    for(const file of ['data/priority-price-monitor.json','data/operational-freshness-audit.json','data/ui/manifest.json'])put(file,{at});
    put('data/source-price.json',{price:12345,observedAt:initial});
  }
  try{
    git(['init','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['config','commit.gpgsign','false']);
    side(initial);git(['add','.']);git(['commit','-m','base']);
    git(['checkout','-b','incoming']);side(older);
    if(kind==='denominator')put('work/priority-freshness-history.json',fresh(older,['other']));
    if(kind==='hold')put('work/priority-price-checkpoint.json',checkpoint(older,true));
    if(kind==='source')put('data/source-price.json',{price:54321,observedAt:older});
    git(['add','.']);git(['commit','-m','remote observation']);git(['checkout','main']);side(newer);
    if(kind==='source')put('data/source-price.json',{price:23456,observedAt:newer});
    git(['add','.']);git(['commit','-m','local observation']);
    cp.spawnSync('git',['merge','--no-edit','incoming'],{cwd:dir,encoding:'utf8'});
    const conflicts=git(['diff','--name-only','--diff-filter=U']);assert(conflicts);
    const head=git(['rev-parse','HEAD']),before=fs.readFileSync(path.join(dir,'work/priority-price-checkpoint.json'),'utf8');let rebuilt=0;
    const rebuild=()=>{
      rebuilt++;
      if(kind==='validation')throw Error('Required validation failed');
      const merged=JSON.parse(fs.readFileSync(path.join(dir,'work/priority-freshness-history.json')));
      assert.deepEqual(merged.sources.shop.observations.map(r=>r.at),[older,newer]);
      assert.equal(merged.sources.shop.lastConfirmedRows[0].lastConfirmedAt,initial,'do not refresh price timestamps');
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'work/priority-price-checkpoint.json'))).sources.shop.jobs.a.lastAttemptAt,newer);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'data/source-price.json'))).price,12345);
      for(const f of ['data/priority-price-monitor.json','data/operational-freshness-audit.json','data/ui/manifest.json'])put(f,{rebuilt:true});
    };
    if(kind==='source'){assert.equal(resolve(dir,{rebuild}),false);assert.equal(rebuilt,0);}
    else if(['hold','denominator'].includes(kind)){
      assert.throws(()=>resolve(dir,{rebuild}),kind==='hold'?/manual checkpoint hold/:/denominator/);
      assert.equal(fs.readFileSync(path.join(dir,'work/priority-price-checkpoint.json'),'utf8'),before,'all inputs stay untouched on real conflict');assert.equal(rebuilt,0);
    }else if(kind==='validation'){assert.throws(()=>resolve(dir,{rebuild}),/Required validation failed/);assert.equal(git(['rev-parse','HEAD']),head);}
    else{
      assert(resolve(dir,{rebuild}));assert.equal(rebuilt,1);assert.equal(git(['diff','--name-only','--diff-filter=U']),'');
      const incoming=git(['rev-parse','incoming']);
      for(const stage of [1,2,3])assert(fs.existsSync(path.join(dir,'work/generated-merge-stages',incoming,String(stage),'work/priority-price-checkpoint.json')));
    }
  }finally{
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('pokeka-concurrent-publish-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
for(const kind of ['normal','hold','denominator','source','validation'])fixture(kind);
console.log('PASS concurrent price publication: actual checkpoint times, fixed history union, immutable source dates, both-side holds, denominator/source conflicts and validation failures');
