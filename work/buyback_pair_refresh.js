// Plans only real, permitted bulk confirmations; never advances observation dates.
const {calendarDay}=require('./psa10_observation_evidence');
const HOUR=3600000;
function plan(cards,source,receipt,run,now=Date.now()) {
  const today=calendarDay(new Date(now).toISOString()),marketDay=calendarDay(receipt?.observedAt),pending=new Set();
  for(const c of cards||[]) {
    if(c.language!=='ja'||c.identityReviewRequired||!(c.snkPsa10Price>0))continue;
    for(const [shop,q]of Object.entries(source?.cards?.[c.id]?.shops||{})) {
      const meta=source.shops?.[shop],at=Date.parse(q.observedAt);
      if(!meta||['pending','retired'].includes(meta.acquisitionPermission)||meta.acquisitionStopped||meta.reviewStatus
        ||/HTTP\s*(?:401|403)|認証切れ|許諾確認待ち/.test(meta.error||'')
        ||q.quarantined||q.matchConfidence!=='high'||q.listingActive!==true||!(q.price>0)||q.maxQuantity===0
        ||q.campaign||q.quantityLimited||q.conditionsConfirmed===false
        ||!Number.isFinite(at)||at>now||now-at>48*HOUR||q.priceDate!==today||calendarDay(q.observedAt)!==today)continue;
      if(marketDay!==today)pending.add(c.id);
    }
  }
  const attempt=Date.parse(run?.lastAttemptAt),retryAt=Number.isFinite(attempt)?attempt+2*HOUR:null;
  return {today,marketDay,pendingCards:pending.size,ids:[...pending],marketNeeded:pending.size>0,
    requiredDay:pending.size&&(!retryAt||retryAt<=now)?today:null,
    retryAt:retryAt&&retryAt>now?new Date(retryAt).toISOString():null,
    action:pending.size?'同日の国内相場を既存の一括取得枠で確認し、保存済み買取と再集計':'通常の期限前更新',
    rule:'既存2時間再試行間隔を維持。項目未提供・保留・失敗を日時更新で代用しない。',llmCalls:0,codexCalls:0};
}
module.exports={plan};
