(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PriceReferenceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DAY = 86400000;
  const positive = v => typeof v === "number" && Number.isFinite(v) && v > 0;
  function median(a) { const s = a.filter(Number.isFinite).sort((x,y)=>x-y); return !s.length ? null : (s[Math.floor((s.length-1)/2)] + s[Math.floor(s.length/2)]) / 2; }
  function point(rows, date, col) { return rows.filter(r=>r[0]===date && positive(r[col])).at(-1)?.[col] ?? null; }
  function windowReturn(rows, date, days, col) {
    const start = new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY).toISOString().slice(0,10);
    const a=point(rows,start,col), b=point(rows,date,col);
    return a && b ? (b/a-1)*100 : null;
  }
  function build(history, previous = {}, market = {}, asOfDate) {
    const baselineDate = previous.baselineDate || history.dates?.[0] || asOfDate;
    const cohortMethod='complete-initial-history-v1';
    const initialDates=(history.dates||[]).filter(d=>d>=baselineDate&&d<=asOfDate);
    const cohort = previous.cohortMethod===cohortMethod ? previous.cohort : Object.entries(history.cards || {}).filter(([,r])=>initialDates.length && initialDates.every(date=>positive(point(r,date,1)) && positive(point(r,date,2)))).map(([id])=>id).sort();
    const baselinePrices = {...(previous.baselinePrices || {})};
    for(const [id,rows] of Object.entries(history.cards || {})) if(!Object.hasOwn(baselinePrices,id)) baselinePrices[id]=[point(rows,baselineDate,1),point(rows,baselineDate,2)];
    const dates = (history.dates || []).filter(d=>d<=asOfDate);
    const indices = dates.map(date=> {
      const raw=[], psa=[];
      for (const id of cohort) {
        const rows=history.cards[id] || [], a=baselinePrices[id]?.[0], b=point(rows,date,1), c=baselinePrices[id]?.[1], d=point(rows,date,2);
        if(a&&b)raw.push(b/a*100); if(c&&d)psa.push(d/c*100);
      }
      return { date, rawIndex: raw.length===cohort.length && cohort.length ? median(raw) : null,
        psa10Index: psa.length===cohort.length && cohort.length ? median(psa) : null, rawObserved:raw.length, psa10Observed:psa.length, cohort:cohort.length };
    });
    const cards={};
    for(const id of new Set([...Object.keys(history.cards || {}),...Object.keys(previous.cards || {})])) {
      const rawRows=history.cards?.[id] || [];
      const rows = [...new Map(rawRows.filter(r=>r[0]<=asOfDate).map(r=>[r[0],r])).values()].sort((a,b)=>a[0].localeCompare(b[0]));
      const braw=baselinePrices[id]?.[0]??point(rows,baselineDate,1), bpsa=baselinePrices[id]?.[1]??point(rows,baselineDate,2), raw=point(rows,asOfDate,1), psa=point(rows,asOfDate,2);
      const before=previous.cards?.[id] || {}, summary=market[id] || {};
      const events=(before.supportEvents || []).map(x=>({...x}));
      if(summary.supportBroken && summary.supportConfirmed && positive(summary.supportLow)) {
        const key=`${summary.supportLow}:${summary.supportHigh}`;
        if(!events.some(e=>e.key===key&&!e.resolvedAt)) events.push({key,detectedAt:asOfDate,low:summary.supportLow,high:summary.supportHigh,resolvedAt:null});
      }
      const recent=rows.filter(r=>r[0]<=asOfDate && Date.parse(`${r[0]}T00:00:00Z`)>=Date.parse(`${asOfDate}T00:00:00Z`)-14*DAY && positive(r[2]));
      const span=recent.length ? (Date.parse(recent.at(-1)[0])-Date.parse(recent[0][0]))/DAY : 0;
      const rawPrices=recent.map(r=>r[1]).filter(positive);
      const rawMaintained=rawPrices.length>=8 && Math.max(...rawPrices)/Math.min(...rawPrices)<=1.1;
      const stable=rawMaintained && recent.length>=8 && span>=13 && summary.newLow14===0 && typeof summary.width14Pct==="number" && summary.width14Pct<=10
        && !String(summary.direction||'').includes('下降') && !summary.supportBroken && Number(rows.find(r=>r[0]===asOfDate)?.[7])>=10 && typeof summary.supplyAbsorption==="number" && summary.supplyAbsorption<=1;
      if(stable) for(const event of events) if(!event.resolvedAt && (Date.parse(asOfDate)-Date.parse(event.detectedAt))/DAY>=14) event.resolvedAt=asOfDate;
      const unresolved=events.some(e=>!e.resolvedAt);
      cards[id]={ rawIndex:braw&&raw?raw/braw*100:null,psa10Index:bpsa&&psa?psa/bpsa*100:null,
        raw30:windowReturn(rows,asOfDate,30,1), raw90:windowReturn(rows,asOfDate,90,1), psa1030:windowReturn(rows,asOfDate,30,2), psa1090:windowReturn(rows,asOfDate,90,2),
        supportEvents:events, breakdownUnresolved:unresolved, floorReference:unresolved ? "下落警戒継続・新しい底値未確認" : stable ? "低価格帯の維持条件確認・参考" : "蓄積中",
        stableChecks: {samples:recent.length,spanDays:span,newLows:summary.newLow14??null,transactions30:rows.find(r=>r[0]===asOfDate)?.[7]??null,supplyPressure:summary.supplyAbsorption??null} };
    }
    const latest=indices.find(r=>r.date===asOfDate), earlier=indices.find(r=>r.date===new Date(Date.parse(asOfDate)-30*DAY).toISOString().slice(0,10));
    for(const row of Object.values(cards)) row.relativePsa1030=positive(latest?.psa10Index)&&positive(earlier?.psa10Index)&&row.psa1030!=null ? row.psa1030-(latest.psa10Index/earlier.psa10Index-1)*100 : null;
    const indexRows=indices.map(r=>[r.date,r.rawIndex,r.psa10Index]);
    const marketReturns={raw30:windowReturn(indexRows,asOfDate,30,1),raw90:windowReturn(indexRows,asOfDate,90,1),psa1030:windowReturn(indexRows,asOfDate,30,2),psa1090:windowReturn(indexRows,asOfDate,90,2)};
    return {version:1,baselineDate,asOfDate,cohort,cohortMethod,baselinePrices,indices,marketReturns,cards,referenceOnly:true,
      method:"国内みんトレ素体集計値とPSA10集計値。初回作成時の基準日から取得日まで両価格が揃ったカードを固定し、カード別騰落指数の中央値を採用（当初の完全観測群への選択偏りあり、全市場とは別）。以後の追加削除で構成を変えない。欠損が1枚でもある日は確定市場指数を出さず蓄積中。実成約・状態A限定証明とは別",warning:"絶対下落と相対強度は別。過去高値・支持帯は将来価格保証や上限の下限にしない。仕入れ判定へ未適用"};
  }
  function fixedBreakEven({purchasePrice, gradingFee, extraCost=0, feeRate=0, hitRate, lowerGradePrice, psa10Multiplier}) {
    if(![purchasePrice,gradingFee,extraCost,feeRate,hitRate,lowerGradePrice].every(v=>typeof v==='number'&&Number.isFinite(v))||hitRate<=0||hitRate>1||feeRate<0||feeRate>=100||Math.min(purchasePrice,gradingFee,extraCost,lowerGradePrice)<0)return null;
    const multiplier=psa10Multiplier===undefined?(1-feeRate/100):psa10Multiplier;
    if(typeof multiplier!=='number'||!Number.isFinite(multiplier)||multiplier<=0)return null;
    return (purchasePrice+gradingFee+extraCost-(1-hitRate)*lowerGradePrice*(1-feeRate/100))/(hitRate*multiplier);
  }
  function bucket(id) {let h=0; for(const ch of String(id))h=(h*31+ch.charCodeAt(0))>>>0; return (h%32).toString(16).padStart(2,'0');}
  return {build,windowReturn,fixedBreakEven,bucket};
});
