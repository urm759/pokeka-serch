const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),p=require('./publication_lineage');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-lineage-'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify(value));};
const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
try{
  write('data/pokemon-cards.json',[{id:'one',price:100}]);
  const outcome={generatedAt:'2026-10-24T00:00:00Z',counts:{listed:1,analyzable:1},previousObservation:{filledCards:1}};
  write('data/card-catalog-completion.json',{summary:{total:1,analyzable:1}});
  write('data/completion-outcomes.json',outcome);
  write('data/update-status.json',{unifiedMonitor:{outcomes:outcome}});
  const initial=p.snapshot(root);p.seal(root,initial);p.verify(root);
  write('data/completion-outcomes.json',{...outcome,previousObservation:{filledCards:0}});
  assert.throws(()=>p.verify(root),/monitor and downloadable/,'a second audit cannot silently replace published acquisition deltas');
  write('data/completion-outcomes.json',outcome);
  write('data/pokemon-cards.json',[{id:'one',price:200}]);
  assert.throws(()=>p.seal(root,initial),/during finalization/);
  assert.throws(()=>p.verify(root),/source revision/);
  p.seal(root,p.snapshot(root));p.verify(root);
  git(['init','--quiet']);git(['add','data']);p.verify(root,{staged:true});
  write('data/completion-outcomes.json',{...outcome,generatedAt:'later'});
  write('data/update-status.json',{unifiedMonitor:{outcomes:{...outcome,generatedAt:'later'}}});
  assert.throws(()=>p.verify(root),/summary revision/);
  p.seal(root,p.snapshot(root));git(['add','data/completion-outcomes.json','data/update-status.json']);
  assert.throws(()=>p.verify(root,{staged:true}),/summary revision/,'mixed index and working tree must stop publication');
  git(['add','data']);p.verify(root,{staged:true});
  console.log('Publication lineage: parallel source changes, repeated audit, staged mixes and matching snapshot passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
