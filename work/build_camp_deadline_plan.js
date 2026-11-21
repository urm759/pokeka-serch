const fs=require('node:fs'),path=require('node:path'),bulk=require('./camp_collection_batch'),post=require('./camp_postpass'),retry=require('./acquisition_retry'),camp=require('./update_yuyutei_torecacamp');
function build(root=path.join(__dirname,'..'),now=Date.now()){
 const read=(f,d={})=>{const p=path.join(root,f);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):d;};
 if(!fs.existsSync(path.join(root,'work/camp-fixed-cohort.json')))return null;
 const fixed=require('./fixed_price_cohort').ids(root,'torecacamp'),catalog=read('work/torecacamp_catalog.json',[]),cards=read('data/pokemon-cards.json',[]),progress=read('work/torecacamp_progress.json'),state=structuredClone(progress.collectionBatch||{routes:{}}),targets=read('work/search-profile-targets.json'),focus=read('work/priority-search-profiles.json').focusProfileIds||[];
 const formal=require('./formal_freshness_queue'),deadlines=formal.forSource(targets,focus,'torecacamp',now);
 const critical=camp.campCriticalIds(targets,focus),requested=[...new Set([...camp.campRequestedIds(targets),...Object.keys(deadlines),...fixed])],run=read('work/source-update-runs.json').sources?.torecacamp||{};
 let recoveryError=null;try{bulk.recoverPages(state,catalog);}catch(e){recoveryError=e.message;}
 const timing=require('./proactive_refresh').lead(require('./priority_price_queue').timingConfig(root,now,'torecacamp')),leadMs=post.proactiveLead(timing.leadMs),last=Date.parse(run.lastAttemptAt||''),earliest=Math.max(now,Number.isFinite(last)?last+2*3600000:now),retries={...progress.knownUrlRetries,...progress.retryByUrl};
 const sourceHeld=Boolean(progress.manualHold||!retry.eligible(progress.sourceRetry,now)||retry.classify({error:run.lastError||''}).manual&&retry.classify({error:run.lastError||''}).scope==='source');
 const plans=sourceHeld?[]:bulk.plan({routes:state.navigation?.routes||[],cards,catalog,requested,critical,fixed,deadlines,retryByUrl:retries,state:state.routes||{},membership:state.pageMembership||{},now:earliest,leadMs,due:post.due,signature:camp.cardSignature,eligible:retry.eligible});
 const completions=require('./profile_completion_routes').medianCompletionIds(targets,'torecacamp',focus);
 const bulkIds=new Map(plans.flatMap(p=>(p.expectedIds||[]).map(id=>[id,p]))),individual=sourceHeld?[]:post.unreachedTargets(catalog.filter(r=>!bulkIds.has(r.cardId)),requested,retries,earliest,leadMs,critical,completions,deadlines),individualIds=new Map(individual.slice(0,17).map((r,i)=>[r.cardId,i+1])),byId=new Map(catalog.map(r=>[r.cardId,r]));
 const rows=fixed.map(id=>{const r=byId.get(id),at=Date.parse(r?.observedAt||''),goal=Number.isFinite(at)?at+6*3600000:null,adoption=Number.isFinite(at)?at+48*3600000:null,hold=sourceHeld?'source-held':!r?'unlinked':r.priceQuarantined||r.identityHoldReason||r.cardMismatchSuspected||r.referenceOnly?'specification-held':!retry.eligible(retries[r.detailUrl],now)?'retry-or-access-held':null;
   const route=hold?'held':bulkIds.has(id)?'known-collection-page':individualIds.has(id)?'known-product-url':post.due(r,true,earliest,leadMs)?'later-cycle':'not-due';
   const eligibleAt=hold?null:Math.max(earliest,Number.isFinite(at)?at+6*3600000-leadMs:earliest),conditionalPublished=eligibleAt==null?null:eligibleAt+90000+timing.processingMs;
   const selected=['known-collection-page','known-product-url'].includes(route);
   return{id,lastConfirmedAt:r?.observedAt||null,goalDeadlineAt:goal?new Date(goal).toISOString():null,adoptionDeadlineAt:adoption?new Date(adoption).toISOString():null,state:hold||'normal-update-wait',route,earliestEligibleAt:eligibleAt==null?null:new Date(eligibleAt).toISOString(),plannedNextCycle:selected,page:bulkIds.has(id)?{url:bulkIds.get(id).url,page:bulkIds.get(id).page,lastMembershipAt:state.pageMembership?.[bulkIds.get(id).url]?.[bulkIds.get(id).page]?.observedAt}:null,individualSlot:individualIds.get(id)||null,conditionalWithin6h:selected&&goal&&conditionalPublished?conditionalPublished<=goal:null,actualNextStartAt:null};});
 const out={at:new Date(now).toISOString(),sourceRequests:0,llmCalls:0,codexCalls:0,cohort:fixed.length,requiredPerDay:576,headroomTargetPerDay:720,leadMs,sourceEarliestEligibleAt:new Date(earliest).toISOString(),pipelineAllowanceMs:timing.processingMs+90000,sourceHeld,recoveryError,summary:{plannedNextCycle:rows.filter(r=>r.plannedNextCycle).length,individual:rows.filter(r=>r.route==='known-product-url').length,bulk:rows.filter(r=>r.route==='known-collection-page').length,held:rows.filter(r=>r.route==='held').length,later:rows.filter(r=>r.route==='later-cycle').length,over6h:rows.filter(r=>r.goalDeadlineAt&&Date.parse(r.goalDeadlineAt)<now).length,over48h:rows.filter(r=>r.adoptionDeadlineAt&&Date.parse(r.adoptionDeadlineAt)<now).length},pages:plans.map(p=>({url:p.url,page:p.page,lane:p.lane,coverageKnown:p.coverageKnown,expectedIds:p.expectedIds,advanceCursor:p.advanceCursor})),rows,note:'Planning from dated saved membership only; no source recheck or price recovery. Earliest eligibility and conditional pipeline budget are not a guaranteed scheduled start/publication time. 4 list requests + at most17 priority details; at least18 of35 detail slots remain normal exploration. Unknown membership uses known URLs. Actual verification can reject changed/held specifications.'};
 fs.writeFileSync(path.join(root,'work/camp-deadline-plan.json'),JSON.stringify(out));return out;
}
function writeFormalDeadlines(root=path.join(__dirname,'..'),now=Date.now()){
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
 const q=require('./formal_freshness_queue'),targets=read('work/search-profile-targets.json'),cfg=read('work/priority-search-profiles.json');
 const {formal,departures}=q.build(targets,cfg.focusProfileIds||[],now);
 const iso=ms=>Number.isFinite(ms)?new Date(ms).toISOString():null;
 const previous=(targets.pendingDepartures||[]).filter(r=>cfg.focusProfileIds?.includes(r.profile)).map(r=>({
  id:r.id,profile:r.profile,lastQualifiedAt:r.beforeMeta?.at||null,previousMedianBuy:r.before?.efficiency?.buy??null,
  previousStorePrice:r.before?.purchase?.price??null,storePriceObservedAt:r.before?.purchase?.priceObservedAt||null,reason:r.departureAudit?.status||null,
  missing:r.departureAudit?.freshness||[],queued:departures.some(d=>d.id===r.id&&d.profile===r.profile),
 }));
 const value={at:iso(now),candidatesEvaluatedAt:targets.at||null,profileIds:cfg.focusProfileIds,formal:formal.map(r=>({
  id:r.id,profiles:r.profiles,first:r.dependencies[0]?.field||null,firstSource:r.dependencies[0]?.source||null,firstDeadline:iso(r.earliestDeadlineAt),
  dependencies:r.dependencies.map(({at,...d})=>({...d,deadlineAt:iso(at)})),
 })),previous,basis:'固定の採用条件による既知期限。未確定および集約元時刻を個別再確認と見なさない。6時間は店舗の巡回目標、48時間は店舗価格・在庫の採用期限。以前の適合は現在候補・GOと別。'};
 require('./acquisition_retry').atomicWrite(path.join(root,'data/formal-freshness-deadlines.json'),value,0);
 return value;
}
module.exports={build,writeFormalDeadlines};if(require.main===module){const r=build();writeFormalDeadlines();console.log(JSON.stringify({at:r.at,summary:r.summary,pages:r.pages.map(p=>({page:p.page,lane:p.lane,expected:p.expectedIds.length})),sourceEarliestEligibleAt:r.sourceEarliestEligibleAt}));}
