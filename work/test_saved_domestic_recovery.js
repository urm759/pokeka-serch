const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const audit=require('./audit_saved_domestic_recovery');
const row={cardId:'fixture',detailUrl:'https://shop.example/one',state:'A',price:1000,identityVerified:true,observedAt:'2026-10-19T01:00:00Z'};
const records=[{id:'fixture',url:row.detailUrl,status:'verified',confirmedAt:row.observedAt}];
assert.equal(audit.compare([row],[{...row,observedAt:'2026-10-20T01:00:00Z'}],records)[0].status,'equal-or-newer-saved');
assert.equal(audit.compare([row],[row],records)[0].status,'equal-or-newer-saved');
for(const change of [{observedAt:'2026-10-18T01:00:00Z'},{detailUrl:'different'},{state:'B'},{identityVerified:false},{price:null},{priceQuarantined:true},{cardMismatchSuspected:true},{conditionAccepted:false}])
  assert.equal(audit.compare([row],[{...row,...change}],records)[0].status,'review-for-recovery');
assert.equal(audit.compare([{...row,identityVerified:false}],[row],records)[0].status,'original-evidence-insufficient');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-audit-'));
try{
  fs.mkdirSync(path.join(root,'data'));const bytes=Buffer.from('{"value":1}');fs.writeFileSync(path.join(root,'data/one.json'),bytes);
  const manifest={files:[{file:'data/one.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex')}]};
  fs.writeFileSync(path.join(root,'recovery-manifest.json'),JSON.stringify(manifest));assert.equal(audit.verify(root).files.length,1);
  fs.writeFileSync(path.join(root,'data/one.json'),'{"value":2}');assert.throws(()=>audit.verify(root),/hash mismatch/);
  manifest.files[0].file='../escape.json';fs.writeFileSync(path.join(root,'recovery-manifest.json'),JSON.stringify(manifest));assert.throws(()=>audit.verify(root),/Unsafe/);
}finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'recovery-audit-'));fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS saved recovery hashes/path, exact URL/condition/time, newer normal data retained and no overwriting');
const recoveryFiles=require('./recover_validated_sources').files;
assert(recoveryFiles.includes('work/homura-public-checkpoint.json'),'saved successful feed must resume without refetching');
assert(recoveryFiles.includes('work/buyback-price-observations.json'),'daily observations must travel with quotes');
