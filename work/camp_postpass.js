function prepare(progress, total, now=Date.now()) {
  const complete=Number(progress.totalSitemaps)>0 && (progress.processedSitemaps||[]).length>=progress.totalSitemaps;
  if (!complete || Object.keys(progress.failedSitemaps||{}).length || Object.keys(progress.retryByUrl||{}).length) return false;
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
module.exports={prepare,due,checkpoint};
