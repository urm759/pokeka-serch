const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const cache=require('./ui_projection_cache'),root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-ui-proof-'));
const write=(f,b)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),b);},hash=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
try{
 write('work/build_ui_data.js',"module.exports=require('../codec.js');");write('codec.js','module.exports={};');
 const raw='{"observedAt":"2026-11-13T00:00:00Z","price":100}',packed='{"version":1,"value":100}';write('data/raw.json',raw);write('data/ui/raw.json',packed);
 const manifest=JSON.stringify({hashes:{'data/raw.json':hash(raw),'data/ui/raw.json':hash(packed)},aliases:{'data/raw.json':'data/ui/raw.json'}});write('data/ui/manifest.json',manifest);
 assert(!cache.current(root));cache.remember(root);assert(cache.current(root));
 write('data/raw.json',raw.replace('100','200'));assert(!cache.current(root),'price/source date mutation invalidates exact build proof');write('data/raw.json',raw);assert(cache.current(root));
 write('data/ui/raw.json',packed.replace('100','99'));assert(!cache.current(root),'packed output mutation invalidates proof');write('data/ui/raw.json',packed);
 write('data/new.json','{}');assert(!cache.current(root),'new unlisted source cannot be omitted');fs.unlinkSync(path.join(root,'data/new.json'));
 fs.unlinkSync(path.join(root,'data/raw.json'));assert(!cache.current(root));write('data/raw.json',raw);
 write('codec.js','module.exports={changed:true};');assert(!cache.current(root),'transitive generator dependency changes invalidate proof');write('codec.js','module.exports={};');assert(cache.current(root));
 write('data/ui/manifest.json',manifest.replace('aliases','tamperedAliases'));assert(!cache.current(root));write('data/ui/manifest.json',manifest);
 write('.private/ui-projection-build-proof.json','bad');assert(!cache.current(root),'corrupt/missing local proof falls back to required rebuild');
 console.log('PASS exact UI projection cache: source/output/dependency/manifest/new-file/deletion/corrupt-proof invalidation, timestamps untouched');
}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('pokeka-ui-proof-'));fs.rmSync(root,{recursive:true,force:true});}
