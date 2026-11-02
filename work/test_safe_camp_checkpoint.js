const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),compact=require('./safe_camp_checkpoint');
const {trustedSafe}=require('./recover_failed_price_run');
const trusted={name:'Safe Checkpoint Backfill',event:'schedule',conclusion:'failure',head_branch:'main',repository:{full_name:'urm759/pokeka-serch'},head_repository:{full_name:'urm759/pokeka-serch'}};
assert(trustedSafe(trusted));for(const x of [{event:'pull_request'},{head_branch:'feature'},{conclusion:'success'},{head_repository:{full_name:'fork/repo'}}])assert(!trustedSafe({...trusted,...x}));
function zip(files){const local=[],central=[];let offset=0;for(const [name,text]of Object.entries(files)){const n=Buffer.from(name),b=Buffer.from(text),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(b.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(l,n,b);central.push(c,n);offset+=l.length+n.length+b.length;}const d=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(Object.keys(files).length,8);e.writeUInt16LE(Object.keys(files).length,10);e.writeUInt32LE(d.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([...local,d,e]);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'camp-compact-')),root=path.join(temp,'repo'),capture=path.join(temp,'checkpoint');
const put=(f,x)=>{const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x));};
try{
 const source=path.join(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(source,'work/torecacamp_catalog.json'))),summary=JSON.parse(fs.readFileSync(path.join(source,'data/torecacamp-stock-summary.json')));
 const r=catalog.find(r=>r.identityVerified!==false&&r.price>0&&r.conditionAccepted!==false&&!r.referenceOnly&&!r.priceQuarantined&&summary.cards[r.cardId]?.identityVerified===true&&summary.cards[r.cardId]?.observedAt===r.observedAt);
 const c=JSON.parse(fs.readFileSync(path.join(source,'data/pokemon-cards.json'))).find(c=>c.id===r.cardId);
 put('data/pokemon-cards.json',[c]);put('work/torecacamp_catalog.json',[r]);put('data/torecacamp-stock-summary.json',{cards:{[r.cardId]:summary.cards[r.cardId]}});put('work/torecacamp_progress.json',{lastRun:{startedAt:r.observedAt}});
 compact.capture(root,'123',capture);const files=Object.fromEntries([...compact.FILES,'recovery-manifest.json'].map(f=>[f,fs.readFileSync(path.join(capture,f))]));
 put('work/torecacamp_catalog.json',[]);put('data/torecacamp-stock-summary.json',{cards:{}});put('work/torecacamp_progress.json',{lastRun:{startedAt:'2020-01-01T00:00:00Z'}});
 const archive=path.join(temp,'compact.zip');fs.writeFileSync(archive,zip(files));
 assert.throws(()=>compact.restore(archive,'456',root),/provenance/);
 const result=compact.restore(archive,'123',root);assert.equal(result.recovered,1);assert.equal(result.newSourceLinks,1);assert.equal(result.acquisitionRequests,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/torecacamp-stock-summary.json'))).cards[r.cardId].observedAt,r.observedAt);
 assert.equal(compact.restore(archive,'123',root).recovered,0,'repeat import does not mint another observation');
 files['work/torecacamp_catalog.json']=Buffer.from('[]');fs.writeFileSync(archive,zip(files));assert.throws(()=>compact.restore(archive,'123',root),/hash/);
 console.log('PASS compact pre-merge source capture, trusted scheduled-main origin, SHA/identity/quote/date, zero source requests, repeated import and corrupt archive hold');
}finally{assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('camp-compact-'));fs.rmSync(temp,{recursive:true,force:true});}
