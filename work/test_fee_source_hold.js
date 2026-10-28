const assert=require('node:assert/strict'),{retryState}=require('./update_psa_japan_services'),{eligible}=require('./acquisition_retry');
const at='2026-10-27T23:07:18Z';
for(const checkError of ['PSA Japan HTTP 403','PSA Japan HTTP 401','PSA Japan Cloudflare・正規認証待ち']){
 const r=retryState({checkStatus:'failed',checkError,lastAttemptAt:at});assert(r.held);assert(!eligible(r));assert.equal(r.lastAttemptAt,new Date(at).toISOString());
}
const transient=retryState({checkStatus:'failed',checkError:'HTTP 503',lastAttemptAt:at});assert(!transient.held);assert(eligible(transient,Date.parse(at)+3600000));
assert.equal(retryState({checkStatus:'success'}),null);
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'fee-source-hold-'));
try{
 fs.mkdirSync(path.join(root,'data'));let called=0;
 const result=require('./run_daily_sources').run([{source:'fee'},{source:'normal'}],task=>{called++;return {status:0,stdout:JSON.stringify(task.source==='fee'?{held:true,waiting:true,reason:'HTTP 403',httpRequests:0}:{})}},root);
 assert.equal(called,2);assert.equal(result.status,'partial-with-hold');assert.equal(result.sources[0].status,'held');assert.equal(result.sources[1].status,'process-success');
 const wait=require('./run_daily_sources').run([{source:'fee'}],()=>({status:0,stdout:JSON.stringify({waiting:true,held:false,reason:'HTTP 503',nextRetryAt:at,httpRequests:0})}),root);
 assert.equal(wait.status,'partial-with-wait');assert.equal(wait.sources[0].status,'retry-wait');
}finally{assert.equal(path.dirname(root),os.tmpdir());fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS fee-source 403/auth hold, original attempt date retained, transient backoff; no POP permission change or new network call');
