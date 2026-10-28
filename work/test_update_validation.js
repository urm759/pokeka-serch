const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const m=require('./update_validation');const root=fs.mkdtempSync(path.join(os.tmpdir(),'update-validation-'));
const write=(p,s)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s)};
const git=args=>{const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr)};
try{
 git(['init','--quiet']);write('work/model.js','const n=1;\n');write('work/test_model.js','// test\n');write('data/price.json','{}');git(['add','.']);
 assert.equal(m.plan(root).mode,'regression');m.record(root);assert.equal(m.plan(root).mode,'required');
 write('data/price.json','{"price":100,"observedAt":"new"}');assert.equal(m.plan(root).mode,'required','data still receives mandatory validation, not unchanged code tests');
 write('work/model.js','const n=2;\n');assert.equal(m.plan(root).mode,'regression');m.record(root);
 write('work/test_model.js','// changed test');assert.equal(m.plan(root).mode,'regression');m.record(root);
 write('work/model.js','const n=2;\r\n');assert.equal(m.plan(root).mode,'required','LF/CRLF normalization');
 write('work/update-validation-state.json','{"verified":false}');assert.equal(m.plan(root).mode,'regression');
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/watch-data-health.yml'),'utf8');
 assert(workflow.includes('publication_check:'));const check=workflow.split('  publication_check:')[1];assert(!/^    needs:/m.test(check));assert(!check.includes('git push'));
 assert(workflow.includes('node work/update_validation.js --required'));assert(fs.readFileSync(path.join(__dirname,'../.github/workflows/weekly-full-tests.yml'),'utf8').includes('work/test_*.js'));
 console.log('PASS code/test/workflow invalidation, mandatory data checks, no-op receipt exclusion and independent read-only verifier');
}finally{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}
