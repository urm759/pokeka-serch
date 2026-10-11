const {execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
function verify(ref='HEAD') {
  const files=new Set(execFileSync('git',['ls-tree','-r','--name-only',ref],{encoding:'utf8',maxBuffer:20000000}).trim().split(/\r?\n/));
  const manifest=JSON.parse(execFileSync('git',['show',`${ref}:data/ui/manifest.json`],{encoding:'utf8',maxBuffer:20000000}));
  const missing=Object.keys(manifest.hashes).filter(file=>!files.has(file));
  assert.deepEqual(missing,[],'manifest data must exist in the committed release, not only the local working tree');
  console.log(JSON.stringify({ref,resources:Object.keys(manifest.hashes).length,missing:missing.length,revision:manifest.revision}));
}
if(require.main===module)verify(process.argv[2] || 'HEAD');
module.exports={verify};
