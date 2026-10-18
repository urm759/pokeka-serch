const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const DERIVED=new Set(['data/update-status.json','data/performance-guard.json','data/performance-history.json',
  'data/runtime-availability-audit.json','data/update-health-banner.json']);
function resolve(cwd,{rebuild}={}) {
  const git = args => {
    const run=spawnSync('git', args, {cwd, encoding:'utf8'});
    if (run.status!==0) throw new Error(run.stderr || run.stdout);
    return run.stdout.trim();
  };
  const conflicts=git(['diff','--name-only','--diff-filter=U']).split('\n').filter(Boolean);
  if (!conflicts.length) return false;
  if (conflicts.some(name=>!name.startsWith('data/ui/') && !DERIVED.has(name))) return false;
  const incoming=git(['rev-parse','MERGE_HEAD']);
  const archive=path.join(cwd,'work/generated-merge-stages',incoming);
  const staged=new Map();
  // Save every side before replacing a generated seed. Source-record conflicts never enter this path.
  for(const file of conflicts){
    const sides=[1,2,3].map(stage=>{
      const text=git(['show',`:${stage}:${file}`]);
      const target=path.join(archive,String(stage),file);
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
      return JSON.parse(text);
    });
    staged.set(file,sides);
  }
  for(const [file,[base,a,b]]of staged){
    let seed=a;
    if(file==='data/performance-history.json'){
      const records=[...new Map([...(a.records||[]),...(b.records||[])].map(r=>[JSON.stringify(r),r])).values()];
      seed={...a,records:records.sort((x,y)=>Date.parse(x.generatedAt)-Date.parse(y.generatedAt)).slice(-90)};
    }
    fs.writeFileSync(path.join(cwd,file),JSON.stringify(seed));
  }
  if (conflicts.includes('data/update-status.json')) {
    const [,a,b]=staged.get('data/update-status.json');
    const seed={...a};
    for(const key of ['completeDate','allDataCompleteDate','majorDataCompleteDate']) {
      const dates=[a[key],b[key]].filter(Boolean).sort();
      seed[key]=dates[0] || null;
    }
    fs.writeFileSync(path.join(cwd,'data/update-status.json'),JSON.stringify(seed));
  }
  if(rebuild)rebuild(cwd);
  else {
    for(const file of ['finalize_update_status.js','measure_performance_guard.js','build_ui_data.js','test_ui_data.js']){
      const child=spawnSync(process.execPath,['work/'+file],{cwd,encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024});
      if(child.status!==0)throw new Error(`${file}: ${child.stderr||child.stdout||child.error?.message||'regeneration failed'}`);
    }
    const verify=spawnSync(process.execPath,['work/build_purchase_limit_audit.js','--verify'],{cwd,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
    if(verify.status!==0)throw new Error(verify.stderr||verify.stdout||'Required purchase audit failed');
  }
  git(['add',...conflicts]);
  const trackedRoots=['data','work'].filter(dir=>git(['ls-files','--',dir]).length);
  git(['add','--update','--',...trackedRoots]);
  git(['commit','--no-edit']);
  return true;
}
module.exports={resolve,DERIVED};
