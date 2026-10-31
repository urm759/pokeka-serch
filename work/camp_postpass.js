function prepare(progress, total, now=Date.now()) {
  const complete=Number(progress.totalSitemaps)>0 && (progress.processedSitemaps||[]).length>=progress.totalSitemaps;
  // Per-URL/page holds must not stop independent maintenance after the first pass.
  // Source-wide authentication/access holds are checked by the caller before this.
  if (!complete) return false;
  progress.firstPassCompletedAt ||= progress.lastRun?.completedAt || new Date(now).toISOString();
  progress.maintenance ||= {sitemapIndex:Math.max(0,total-1),entryIndex:0,cycles:0,refreshed:0,newLinks:0};
  progress.currentSitemapIndex=Math.min(progress.maintenance.sitemapIndex,total-1);
  progress.currentEntryIndex=progress.maintenance.entryIndex;
  return true;
}
function due(entry, important, now=Date.now(),leadMs=0) {
  const at=Date.parse(entry?.observedAt||'');
  return !Number.isFinite(at) || at<=now && now-at>=(important?6:48)*3600000-(important?Math.min(2*3600000,Math.max(0,Number(leadMs)||0)):0);
}
function checkpoint(progress,total) {
  const previous=progress.maintenance;
  if(!previous)return;
  const wrapped=progress.currentSitemapIndex>=total;
  progress.maintenance={...previous,sitemapIndex:wrapped?0:progress.currentSitemapIndex,entryIndex:wrapped?0:progress.currentEntryIndex,
    cycles:previous.cycles+Number(wrapped),checkedAt:new Date().toISOString()};
  if (wrapped) { progress.currentSitemapIndex=0; progress.currentEntryIndex=0; }
}
function prioritize(entries,start,catalog,requested,detailLimit,retries={},now=Date.now(),leadMs=0) {
  const normal=entries.slice(start).map((r,i)=>({...r,normalIndex:start+i}));
  const front=new Set(normal.slice(0,Math.ceil(detailLimit/2)).map(r=>r.url));
  const order=new Map(requested.map((id,i)=>[id,i]));
  const eligible=catalog.filter(r=>Number.isInteger(r.sourceSitemap)&&r.sourceSitemap>0
    &&/^https:\/\/torecacamp-pokemon\.com\/products\/[a-zA-Z0-9_%~-]+$/.test(r.detailUrl||'')&&!r.priceQuarantined
    &&require('./acquisition_retry').eligible(retries[r.detailUrl],now)&&due(r,order.has(r.cardId),now,leadMs)&&!front.has(r.detailUrl));
  const urgent=eligible.filter(r=>order.has(r.cardId)).sort((a,b)=>order.get(a.cardId)-order.get(b.cardId));
  const routine=eligible.filter(r=>!order.has(r.cardId)).sort((a,b)=>(Date.parse(a.observedAt)||0)-(Date.parse(b.observedAt)||0));
  const budget=Math.floor(detailLimit/2),priorityBudget=Math.max(1,Math.floor(budget*0.75));
  const chosen=[...urgent.slice(0,priorityBudget),...routine.slice(0,budget-Math.min(priorityBudget,urgent.length))];
  if(chosen.length<budget)chosen.push(...urgent.slice(priorityBudget,priorityBudget+budget-chosen.length));
  const selected=chosen.map(r=>({url:r.detailUrl,title:r.title,handle:r.detailUrl.split('/').pop(),sourceSitemap:r.sourceSitemap,priorityRefresh:true}));
  const moved=new Set(selected.map(r=>r.url)),remaining=normal.filter(r=>!moved.has(r.url));
  const result=[];let n=0,p=0;
  while(n<remaining.length||p<selected.length){if(n<remaining.length)result.push(remaining[n++]);if(p<selected.length)result.push(selected[p++]);}
  return result;
}
function legacyTargets(catalog,requested,retries={},now=Date.now(),leadMs=0) {
  const order=new Map(requested.map((id,i)=>[id,i]));
  return catalog.filter(r=>order.has(r.cardId)&&!Number.isInteger(r.sourceSitemap)&&!r.priceQuarantined
    &&/^https:\/\/torecacamp-pokemon\.com\/products\/[a-zA-Z0-9_%~-]+$/.test(r.detailUrl||'')
    &&due(r,true,now,leadMs)&&require('./acquisition_retry').eligible(retries[r.detailUrl],now))
    .sort((a,b)=>order.get(a.cardId)-order.get(b.cardId));
}
function priorityMaintenance(catalog,requested,progress={},run={},now=Date.now(),leadMs=0) {
  const retry=require('./acquisition_retry');
  const failure=retry.classify({error:run.lastError||''});
  if(progress.manualHold||failure.scope==='source'&&failure.manual||!retry.eligible(progress.sourceRetry,now))return {due:false,reason:'取得元の停止・再試行待ちを維持',targets:0};
  const attempted=Date.parse(run.lastAttemptAt||'');
  if(Number.isFinite(attempted)&&now-attempted<2*3600000)return {due:false,reason:'既存取得から2時間未満・重複取得なし',targets:0};
  const wanted=new Set(requested),ids=new Set(catalog.filter(r=>wanted.has(r.cardId)&&!r.priceQuarantined&&due(r,true,now,leadMs)
    &&retry.eligible(progress.retryByUrl?.[r.detailUrl]||progress.knownUrlRetries?.[r.detailUrl],now)).map(r=>r.cardId));
  return {due:ids.size>0,reason:ids.size?'既存の重要商品を通常巡回と共有して再確認':'重要商品の再確認期限内',targets:ids.size};
}
module.exports={prepare,due,checkpoint,prioritize,legacyTargets,priorityMaintenance};
