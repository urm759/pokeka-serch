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
function due(entry, important, now=Date.now()) {
  const at=Date.parse(entry?.observedAt||'');
  return !Number.isFinite(at) || at<=now && now-at>=(important?6:48)*3600000;
}
function checkpoint(progress,total) {
  const previous=progress.maintenance;
  if(!previous)return;
  const wrapped=progress.currentSitemapIndex>=total;
  progress.maintenance={...previous,sitemapIndex:wrapped?0:progress.currentSitemapIndex,entryIndex:wrapped?0:progress.currentEntryIndex,
    cycles:previous.cycles+Number(wrapped),checkedAt:new Date().toISOString()};
  if (wrapped) { progress.currentSitemapIndex=0; progress.currentEntryIndex=0; }
}
function prioritize(entries,start,catalog,requested,detailLimit,retries={},now=Date.now()) {
  const normal=entries.slice(start).map((r,i)=>({...r,normalIndex:start+i})),seen=new Set(normal.map(r=>r.url));
  const order=new Map(requested.map((id,i)=>[id,i]));
  const selected=catalog.filter(r=>order.has(r.cardId)&&Number.isInteger(r.sourceSitemap)&&r.sourceSitemap>0
    &&/^https:\/\/torecacamp-pokemon\.com\/products\/[a-zA-Z0-9_%~-]+$/.test(r.detailUrl||'')&&!r.priceQuarantined&&!retries[r.detailUrl]
    &&due(r,true,now)&&!seen.has(r.detailUrl)).sort((a,b)=>order.get(a.cardId)-order.get(b.cardId))
    .slice(0,Math.floor(detailLimit/2)).map(r=>({url:r.detailUrl,title:r.title,handle:r.detailUrl.split('/').pop(),
      sourceSitemap:r.sourceSitemap,priorityRefresh:true}));
  const result=[];let n=0,p=0;
  while(n<normal.length||p<selected.length){if(n<normal.length)result.push(normal[n++]);if(p<selected.length)result.push(selected[p++]);}
  return result;
}
function legacyTargets(catalog,requested,retries={},now=Date.now()) {
  const order=new Map(requested.map((id,i)=>[id,i]));
  return catalog.filter(r=>order.has(r.cardId)&&!Number.isInteger(r.sourceSitemap)&&!r.priceQuarantined
    &&/^https:\/\/torecacamp-pokemon\.com\/products\/[a-zA-Z0-9_%~-]+$/.test(r.detailUrl||'')
    &&due(r,true,now)&&require('./acquisition_retry').eligible(retries[r.detailUrl],now))
    .sort((a,b)=>order.get(a.cardId)-order.get(b.cardId));
}
module.exports={prepare,due,checkpoint,prioritize,legacyTargets};
