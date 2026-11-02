// Display-only, same-source observations. Never supplies financial or search inputs.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GemRatePopModel=api;})(typeof window!=='undefined'?window:this,function(){
  const DAYS=[7,30,75,200],DAY=86400000;
  function day(value){const at=Date.parse(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===value?at:null;}
  function counts(ten,total){return Number.isSafeInteger(ten)&&Number.isSafeInteger(total)&&ten>=0&&total>0&&ten<=total;}
  function valid(row,summary){
    if(!Array.isArray(row)||row.length!==5||!counts(row[1],row[2])||day(row[3])===null)return false;
    if(!Array.isArray(summary)||summary.length!==4||!Number.isSafeInteger(summary[0])||summary[0]<1||day(summary[1])===null||summary[1]>row[3]||summary[0]>(day(row[3])-day(summary[1]))/DAY+1||!Number.isSafeInteger(summary[2])||summary[2]<0||summary[2]>200||!Array.isArray(summary[3])||summary[3].length!==4)return false;
    if(summary[0]===1&&(summary[1]!==row[3]||summary[2]!==0||summary[3].some(Boolean)))return false;
    return summary[3].every((w,i)=>w===null||Array.isArray(w)&&w.length===4&&day(w[0])!==null&&w[0]<row[3]&&(day(row[3])-day(w[0]))/DAY<=DAYS[i]&&counts(w[1],w[2])&&Number.isSafeInteger(w[3])&&w[3]>=2&&w[3]<=summary[0]&&w[3]<=(day(row[3])-day(w[0]))/DAY+1);
  }
  function summarize(row,points){
    // points already come from verified originals of this exact source identity.
    const byDate=new Map();
    for(const p of points){if(!Array.isArray(p)||p.length!==3||day(p[0])===null||!counts(p[1],p[2])||p[0]>row[3])throw Error('Invalid GemRate dated observation');const old=byDate.get(p[0]);if(old&&(old[1]!==p[1]||old[2]!==p[2]))throw Error('Conflicting GemRate same-date observation');byDate.set(p[0],p);}
    const sorted=[...byDate.values()].sort((a,b)=>a[0].localeCompare(b[0])),last=sorted.at(-1);
    if(!last||last[0]!==row[3]||last[1]!==row[1]||last[2]!==row[2])throw Error('GemRate history/latest mismatch');
    const recent=sorted.filter(p=>day(p[0])>=day(row[3])-200*DAY);
    const gap=recent.length<2?0:Math.max(...recent.slice(1).map((p,i)=>(day(p[0])-day(recent[i][0]))/DAY));
    const result=[sorted.length,sorted[0][0],gap,DAYS.map(days=>{const eligible=sorted.filter(p=>day(p[0])>=day(row[3])-days*DAY);return eligible.length<2?null:[eligible[0][0],eligible[0][1],eligible[0][2],eligible.length];})];
    if(!valid(row,result))throw Error('Invalid GemRate display summary');return result;
  }
  function compare(row,summary,days,now=Date.now()){
    if(!valid(row,summary)||!DAYS.includes(days))return {available:false,reason:'履歴接続待ち'};
    const stale=now-day(row[3])>168*3600000||now<day(row[3]),window=summary[3][DAYS.indexOf(days)];
    if(!window)return {available:false,reason:summary[0]===1?'実測1点・比較待ち':'期間内の実測不足',observed:1,stale};
    const span=(day(row[3])-day(window[0]))/DAY,delta=row[1]-window[1],partial=span<days;
    return {available:true,delta,rate:window[1]>0?100*delta/window[1]:null,start:window[0],end:row[3],span,observed:window[3],maxGap:summary[2],partial,stale,
      label:stale?'比較不足・古値':delta<0?'減少・訂正確認':delta>0?'増加':'横ばい',correction:delta<0||row[2]<window[2]};
  }
  return {DAYS,day,counts,valid,summarize,compare};
});
