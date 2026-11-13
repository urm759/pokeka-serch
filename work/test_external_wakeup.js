const assert=require('node:assert/strict');
const config=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'../ops/external-wakeup/wrangler.jsonc'),'utf8'));
assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.equal(config.vars.ENABLED,'false','new/default deployments remain stopped until explicit activation');
(async()=>{
 const {tick,WakeState,default:worker}=await import('../ops/external-wakeup/worker.mjs');
 const now=Date.parse('2026-11-14T00:00:00Z'),h=3600000,env={ENABLED:'true'};
 const priority={id:1,path:'.github/workflows/priority-price-refresh.yml',event:'schedule',status:'completed',conclusion:'success',created_at:new Date(now-8*h).toISOString()};
 const storage=()=>{let data;return {get:async()=>structuredClone(data),put:async(k,v)=>{data=structuredClone(v);}};};
 let store=storage(),posts=0;
 const inventory=path=>({workflow_runs:path.includes('/workflows/')?[priority]:[]});
 const request=async(method,path,body)=>{if(method==='GET')return inventory(path);posts++;assert.equal(path,'/actions/workflows/watch-data-health.yml/dispatches');assert.equal(body.ref,'main');assert.equal(body.inputs.timer_scheduled_at,new Date(now).toISOString());return null;};
 assert.equal((await tick({env:{ENABLED:'false'},storage:store,now,request:()=>{throw Error('disabled must not request')}})).status,'disabled');
 const first=await tick({env,storage:store,now,scheduledAt:now,request});assert.equal(first.status,'dispatch-accepted-awaiting-execution');assert.equal(first.sourceAcquisitions,0);assert.equal(posts,1);
 const intent=(await store.get()).history.find(r=>r.status==='dispatch-intent');assert(intent,'intent persists before dispatch, separately from acceptance');
 await tick({env,storage:store,now:now+1000,request});assert.equal(posts,1);
 for(const status of ['pending','queued','in_progress','waiting','requested']){const s=storage();const r=await tick({env,storage:s,now,request:async method=>{assert.equal(method,'GET');return {workflow_runs:[priority,{path:'.github/workflows/daily-fast-update.yml',status}]};}});assert.equal(r.status,'not-dispatched');}
 store=storage();await tick({env,storage:store,now,request:async()=>{throw Object.assign(Error('denied'),{httpStatus:403});}});assert((await store.get()).held);
 assert.equal((await tick({env,storage:store,now:now+10*h,request:()=>{throw Error('held must not request')}})).status,'held');
 assert.equal((await store.get()).lastFailure.reason,'GitHub HTTP 403');
 store=storage();let attempts=0;await tick({env,storage:store,now,request:async(method,path)=>{attempts++;if(method==='GET')return inventory(path);throw Error('response uncertain');}});
 assert((await store.get()).lastDispatchAt);const backoff=await tick({env,storage:store,now:now+5000,request:()=>{throw Error('backoff prevents immediate retry')}});assert.equal(attempts,7);assert.equal(backoff.lastFailure.stage,'dispatch-request');assert.equal(backoff.nextAttemptAt,new Date(now+h).toISOString());assert.equal(backoff.nextCheckAt,new Date(now+7*60000).toISOString());
 store=storage();const full=await tick({env,storage:store,now,request:async(method,path)=>path.includes('/workflows/')?inventory(path):({workflow_runs:Array.from({length:100},()=>priority)})});assert.equal(full.status,'active-window-full-review');
 assert.equal((await worker.fetch(new Request('https://example.test/'))).status,404,'no unauthenticated public trigger');
 const lock={storage:storage(),blockConcurrencyWhile:async fn=>fn()};const instance=new WakeState(lock,{ENABLED:'false'});assert.equal((await instance.fetch(new Request('https://internal/tick'))).status,404);
 console.log('PASS disabled cloud timer, exact repo/workflow dispatch, saved intent/cooldown, shared writer guard, auth hold, uncertain response/backoff and private-only entry');
})().catch(e=>{console.error(e);process.exitCode=1;});
