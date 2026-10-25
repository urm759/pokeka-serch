const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execute}=require('./price_refresh_gate');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'final-price-pack-'));
fs.mkdirSync(path.join(root,'work'));fs.mkdirSync(path.join(root,'data'));
let packs=0;
const pack=record=>{
  const saved=JSON.parse(fs.readFileSync(path.join(root,'data/price-catchup-status.json')));
  assert.equal(saved.status,'acquired-saved');assert.equal(saved.endedAt,record.endedAt);
  assert.equal(saved.publicationStatus,'保存済み・公開照合待ち');
  fs.writeFileSync(path.join(root,'data/packed-status.json'),JSON.stringify(saved));packs++;
};
const now=Date.parse('2026-10-26T00:00:00Z');
const done=execute(root,()=>({sourceFailures:['optional-origin']}),{now,afterSave:pack});
assert.equal(done.acquisitionStatus,'partial-with-failure');assert.equal(packs,1);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'data/packed-status.json'))),JSON.parse(fs.readFileSync(path.join(root,'data/price-catchup-status.json'))));
assert.throws(()=>execute(root,()=>{throw Error('mandatory verification failed');},{now:now+3*3600000,afterSave:pack}),/mandatory verification/);
assert.equal(packs,1,'failed verification never packs a success status');
fs.writeFileSync(path.join(root,'data/priority-price-execution.json'),JSON.stringify({startedAt:new Date(now).toISOString()}));
execute(root,()=>{throw Error('must not acquire');},{now:now+60000,afterSave:pack});assert.equal(packs,1,'cooldown skips acquisition and packing');
for(const marker of ["afterSave: () => require('./build_ui_data').build(ROOT)","main(); require('./build_ui_data').build(ROOT)"])
  assert(fs.readFileSync(path.join(__dirname,'run_priority_price_refresh.js'),'utf8').includes(marker));
console.log('PASS final status pack: completed/partial, final timestamps, mandatory failure and cooldown');
