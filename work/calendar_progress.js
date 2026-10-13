const DAY=86400000;
function summarize(samples=[],now=Date.now(),windowDays=30) {
  const valid=samples.filter(s=>s.verified&&Number.isFinite(Date.parse(s.at))&&Date.parse(s.at)<=now&&Date.parse(s.at)>=now-windowDays*DAY);
  const first=valid.length?Math.min(...valid.map(s=>Date.parse(s.at))):null;
  const days=first==null?null:Math.max(1,Math.floor((now+9*3600000)/DAY)-Math.floor((first+9*3600000)/DAY)+1);
  const runtime=valid.reduce((n,s)=>n+(Number.isFinite(s.durationMs)&&s.durationMs>0?s.durationMs:0),0);
  const items=valid.reduce((n,s)=>n+(Number.isFinite(s.confirmed)&&s.confirmed>=0?s.confirmed:0),0);
  const net=valid.reduce((n,s)=>n+(Number.isFinite(s.usableNet)?s.usableNet:0),0);
  return {verifiedRuns:valid.length,observationFrom:first==null?null:new Date(first).toISOString(),calendarDays:days,
    activeDays:new Set(valid.map(s=>Math.floor((Date.parse(s.at)+9*3600000)/DAY))).size,
    confirmed:valid.some(s=>s.confirmed!=null)?items:null,usableNet:valid.some(s=>s.usableNet!=null)?net:null,runningItemsPerMinute:runtime>0&&valid.every(s=>s.confirmed!=null&&s.durationMs>0)?items/(runtime/60000):null,
    confirmedPerCalendarDay:days&&valid.every(s=>s.confirmed!=null)?items/days:null,usableNetPerCalendarDay:days&&valid.every(s=>s.usableNet!=null)?net/days:null,
    missingCountRuns:valid.filter(s=>s.confirmed==null).length,unverifiedRuns:samples.filter(s=>!s.verified).length,
    completionEstimate:null,estimateReason:valid.length<2||days<7?'暦日進捗の観測不足・終了日を算出しない':'初回巡回と有効値補完は異なる。取得可能残件と稼働条件の根拠が揃うまで終了日を算出しない',
    basis:'稼働中の速度と、観測開始から今日までの停止・未観測日を含む暦日平均は別。記録がない時間をPC停止と断定しない。再確認は新規取得ではない。'};
}
module.exports={summarize};
