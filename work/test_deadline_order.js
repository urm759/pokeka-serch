const assert=require('node:assert/strict');
const {plan}=require('./priority_price_queue.js');
const {estimate}=require('./refresh_capacity.js');
const now=Date.parse('2026-10-06T03:00:00Z');
const definitions=[['a-late',120],['z-early',15],['overdue',-20],['retry',5],['manual',2],['normal',-100]];
const cards=definitions.map(([id])=>({id,name:id,hareruya2Url:'https://example.test/'+id}));
const catalog=definitions.map(([cardId,minutes])=>({cardId,observedAt:new Date(now+minutes*60000-(cardId==='normal'?720:6)*3600000).toISOString()}));
const args={cards,catalog,sourceId:'hareruya2',now,candidateRows:Object.fromEntries(cards.filter(c=>c.id!=='normal').map(c=>[c.id,{}])),
 jobs:{retry:{nextRetryAt:new Date(now+60000).toISOString()}},manualWait:{manual:{url:'https://example.test/manual'}}};
const selected=plan(args).queue;
assert.deepEqual(selected.map(r=>r.card.id),['overdue','z-early','a-late','normal']);
assert.deepEqual(selected.slice(0,2).map(r=>r.card.id),['overdue','z-early'],'insufficient budget must defer later deadlines');
assert.equal(selected.some(r=>r.card.id==='manual'||r.card.id==='retry'),false);
assert(plan({...args,jobs:{...args.jobs,overdue:{url:cards[2].hareruya2Url,failures:3,error:'timeout: 通信前に時間予算を確認・保存して停止',nextRetryAt:new Date(now+3600000).toISOString()}}}).queue.some(r=>r.card.id==='overdue'),
  'a recorded pre-request budget deferral is not a network failure or permanent manual hold');
const lanes=plan({...args,fixedIds:['z-early','a-late']}).queue;
assert.deepEqual(lanes.map(r=>r.card.id),['z-early','a-late','overdue','normal'],'critical lane must not be starved by broad historical backlog; all lanes retained');
assert.deepEqual(lanes.slice(0,2).map(r=>r.card.id),['z-early','a-late'],'same lane stays deadline-first');
const broad = plan({...args,fixedIds:['z-early','a-late'],candidateRows:Object.fromEntries(cards.filter(c=>c.id!=='normal').map(c=>[c.id,{currentMarket:true,priceRefreshReady:true}]))});
assert.deepEqual(broad.queue.slice(0,4).map(r=>r.card.id),['z-early','a-late','overdue','normal'],
  'old broad-exploration prices must not take the fixed maintenance reservations');
assert.equal(broad.queue.length,selected.length,'reserving maintenance slots must not drop other candidates');
const pressureCards=Array.from({length:40},(_,i)=>({id:'card'+i,name:'card'+i,hareruya2Url:'https://example.test/'+i}));
const pressure=plan({sourceId:'hareruya2',now,cards:pressureCards,
  fixedIds:pressureCards.slice(0,20).map(c=>c.id),
  candidateRows:Object.fromEntries(pressureCards.slice(20,30).map(c=>[c.id,{}])),
  catalog:pressureCards.map((c,i)=>({cardId:c.id,observedAt:new Date(now-(i>=30?721:7)*3600000).toISOString()}))});
const firstEight=pressure.queue.slice(0,8);
assert.equal(firstEight.filter(r=>r.fixedTarget).length,5,'deadline pressure must retain a fifth maintenance slot');
assert.equal(firstEight.filter(r=>!r.important).length,2,'ordinary traversal stays 25 percent');
assert.equal(firstEight.filter(r=>r.important&&!r.fixedTarget).length,1,'new candidate work must retain capacity');
assert.equal(new Set(pressure.queue.map(r=>r.card.id)).size,pressure.queue.length,'no duplicate requests');
assert.equal(plan({...args,now:now+2*60000}).queue.find(r=>r.card.id==='retry')?.status,'次回完了前に期限切れ・先回り待ち');
const weak=estimate({importantCount:300,eligibleCount:150,verifiedCount:20,durationMs:360000});
assert.equal(weak.requiredPerRun,100);assert.equal(weak.availablePerRun,15);assert.equal(weak.deficitPerRun,85);assert.equal(weak.sustainable,false);
assert.equal(estimate({importantCount:10,eligibleCount:5,verifiedCount:0,durationMs:1000}).availablePerRun,null);
assert.equal(estimate({importantCount:10,eligibleCount:5,blocked:true,verifiedCount:0,durationMs:1000}).availablePerRun,0);
assert.equal(estimate({importantCount:30,eligibleCount:25,verifiedCount:40,durationMs:360000,manualCount:1}).sustainable,false);
console.log('PASS deadline order, 15min vs 2h, overdue, limited slots, manual/retry holds, capacity deficits');
const {verify}=require('./price_publication_evidence.js');
const run={id:100,event:'schedule',conclusion:'success'};
const jobs={jobs:[{steps:['Refresh due purchase prices','Verify safety','Publish validated data'].map(name=>({name,conclusion:'success'}))}]};
assert.equal(verify(run,jobs,{runId:100},{conclusion:'success'}).confirmed,true);
assert.equal(verify(run,jobs,{runId:99},{conclusion:'success'}).confirmed,false);
assert.equal(verify(run,{jobs:[]},{runId:100},{conclusion:'success'}).confirmed,false);
assert.equal(verify({...run,event:'workflow_dispatch'},jobs,{runId:100},{conclusion:'success'}).confirmed,false);
