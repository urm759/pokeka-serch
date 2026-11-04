const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const core=require('./gemrate-collector-extension/core'),receiver=require('./gemrate_browser_receipts');
const vm=require('node:vm');
const id='11111111-1111-4111-8111-111111111111',filename='GemRate-Auto/pending/'+id+'/receipt.json',url='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({kind:'gemrate-normal-csv-v1',jobId:id}));
assert.equal(core.receiptFilename({url},{[id]:{url,filename}}),filename,'preserve explicit filename for our registered JSON, even after active job ends');
assert.equal(core.receiptFilename({url:'data:application/json,other'},{[id]:{url,filename}}),null,'never claim unrelated downloads');
assert.equal(core.receiptFilename({url},{[id]:{url,filename:'../receipt.json'}}),null,'no traversal');
async function actualListener(){
 let listener,chosen;const data={},event={addListener(){}};
 const chrome={storage:{local:{async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,v);}}},alarms:{create(){},onAlarm:event},runtime:{id:'fixture',onStartup:event,onInstalled:event,onMessage:event},tabs:{onUpdated:event},downloads:{onDeterminingFilename:{addListener(fn){listener=fn;}},onChanged:event,async download(options){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Filename listener did not finish')),1000);assert.equal(listener({id:1,url:options.url,filename:'ダウンロード.json'},v=>{chosen=v;clearTimeout(timer);resolve();}),true);});return 1;}}};
 const ctx=vm.createContext({chrome,GemRateCollector:core,importScripts(){},console,Date,encodeURIComponent,JSON});
 vm.runInContext(fs.readFileSync('work/gemrate-collector-extension/service-worker.js','utf8'),ctx);
 await ctx.writeReceipt({kind:'gemrate-normal-csv-v1',jobId:id});assert.equal(chosen.filename,filename,'actual determining-filename listener must retain the explicit JSON destination');
}
actualListener().then(()=>console.log('PASS actual asynchronous Chrome filename callback with active job absent')).catch(e=>{console.error(e);process.exitCode=1;});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-receipt-filename-')),root=path.join(tmp,'public'),store=path.join(tmp,'private'),downloads=path.join(tmp,'downloads');
const now=new Date().toISOString(),date=new Date(Date.now()-86400000).toISOString().slice(0,10),set={setCode:'S8B',set:'Pokemon Japanese Sword & Shield Vmax Climax',year:2021,language:'Japanese',grader:'PSA'};
for(const dir of [path.join(root,'work'),store,downloads])fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(store,'.gitignore'),'*\n');fs.writeFileSync(path.join(root,'work/gemrate-reviewed-sets.json'),JSON.stringify({version:1,sets:[set]}));
const page={url:core.url(set),grader:'psa',category:'tcg-cards',language:'Japanese',set:set.set,year:set.year,updated:date,checkedAt:now,csvRows:60,setTotals:{psa10:100,total:120}},receipt={version:1,kind:'gemrate-normal-csv-v1',jobId:id,setCode:'S8B',page,decision:{exportCsv:false,newSourceDate:false},download:null},bytes=Buffer.from(JSON.stringify(receipt));
try{
 const loose=path.join(downloads,'ダウンロード.json');fs.writeFileSync(loose,bytes);
 const general=path.join(downloads,'download (1).json');fs.writeFileSync(general,'{"user":"untouched"}');
 const conflict=path.join(downloads,'download (2).json');fs.writeFileSync(conflict,JSON.stringify({...receipt,jobId:'22222222-2222-4222-8222-222222222222',page:{...page,language:'English'}}));
 const r=receiver.receive(root,store,downloads);assert.equal(r.providerChecks,1);assert.equal(r.queuedCsv,0);assert.equal(r.summary.confirmationRatePct,100);assert.equal(r.summary.sourceDateUpdatedRatePct,0);
 const proof=JSON.parse(fs.readFileSync(path.join(store,'browser-receipts',id+'.page.json')));assert.equal(proof.observedAt,now);assert.equal(proof.updated,date,'preserve source date and real check time');
 const backup=path.join(store,'browser-receipt-migration',id+'.json.gz');assert.deepEqual(zlib.gunzipSync(fs.readFileSync(backup)),bytes);assert(fs.existsSync(loose),'retained until finalize and backup verification');
 receiver.finalize(root,store,downloads);assert(!fs.existsSync(loose));assert(fs.existsSync(general));assert(fs.existsSync(conflict),'failed/foreign context is never cleaned');
 fs.rmdirSync(path.join(downloads,'GemRate-Auto','pending'));
 const retry=receiver.receive(root,store,downloads);assert.equal(retry.providerChecks,0,'idempotent transport is not a new observation');
 assert.equal(retry.status,'review','review-only receipts are saved even when no reserved directory exists');
 assert.equal(JSON.parse(fs.readFileSync(path.join(store,'last-browser-receipts.json'))).status,'review');
 console.log('PASS registered receipt filename, active-job-independent proof, bounded verified loose-receipt migration, original/gzip parity before cleanup, unrelated/conflicting files retained, real date/time and replay idempotence');
}finally{assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir()));assert(path.basename(tmp).startsWith('gemrate-receipt-filename-'));fs.rmSync(tmp,{recursive:true,force:true});}
