const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {generationCode}=require('./publication_lineage');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'generation-checkout-'));
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,stdio:'pipe'});
try {
 fs.mkdirSync(path.join(root,'work'));fs.writeFileSync(path.join(root,'model.js'),'production');
 git('init','--quiet');git('add','model.js');
 const original=generationCode(root);
 fs.writeFileSync(path.join(root,'work/scratch.js'),'not deployed');
 assert.equal(generationCode(root),original,'untracked local helper must not invalidate cloud reuse');
 fs.writeFileSync(path.join(root,'model.js'),'changed production');
 assert.notEqual(generationCode(root),original,'tracked production content still invalidates');
 const changed=generationCode(root);git('add','work/scratch.js');
 assert.notEqual(generationCode(root),changed,'explicitly staged new generator is included before publication');
 const staged=generationCode(root);fs.writeFileSync(path.join(root,'work/gemrate-reviewed-sets.json'),'{"version":1,"sets":[]}');
 assert.notEqual(generationCode(root),staged,'reviewed acquisition context remains an explicit input');
 console.log('PASS checkout-stable generation scope: untracked helper ignored, tracked changes/new generator/review context invalidate');
} finally {
 assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('generation-checkout-'));
 fs.rmSync(root,{recursive:true,force:true});
}
