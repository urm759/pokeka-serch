const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
function resolve(cwd) {
  const git = args => {
    const run=spawnSync('git', args, {cwd, encoding:'utf8'});
    if (run.status!==0) throw new Error(run.stderr || run.stdout);
    return run.stdout.trim();
  };
  const conflicts=git(['diff','--name-only','--diff-filter=U']).split('\n').filter(Boolean);
  if (!conflicts.length) return false;
  if (conflicts.some(name=>!name.startsWith('data/ui/') && name!=='data/update-status.json')) return false;
  if (conflicts.includes('data/update-status.json')) {
    const a=JSON.parse(git(['show',':2:data/update-status.json']));
    const b=JSON.parse(git(['show',':3:data/update-status.json']));
    const seed={...a};
    for(const key of ['completeDate','allDataCompleteDate','majorDataCompleteDate']) {
      const dates=[a[key],b[key]].filter(Boolean).sort();
      seed[key]=dates[0] || null;
    }
    fs.writeFileSync(path.join(cwd,'data/update-status.json'),JSON.stringify(seed));
    const finalizer=spawnSync(process.execPath,['work/finalize_update_status.js'],{cwd,encoding:'utf8',maxBuffer:10*1024*1024});
    if(finalizer.status!==0) throw new Error(finalizer.stderr || 'Status regeneration failed');
  }
  require('./build_ui_data.js').build(cwd);
  git(['add',...conflicts]);
  git(['add','data/ui']);
  if (conflicts.includes('data/update-status.json')) git(['add','data/update-history.json']);
  git(['commit','--no-edit']);
  return true;
}
module.exports={resolve};
