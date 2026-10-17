const fs = require('node:fs'), path = require('node:path');
const evidence = require('./psa10_observation_evidence');
const DAY = 86400000;
const count = n => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root,file),'utf8')); } catch { return fallback; } };
function dailyObservations(rows) {
  const unique=new Map();
  for(const r of rows || []) {
    if(!Array.isArray(r)||!r[1]||!r[5]||evidence.calendarDay(r[4])!==r[0]||!Number.isFinite(Date.parse(r[4]))||!count(r[2])&&!count(r[3]))continue;
    const key=r[0]+'|'+r[1],old=unique.get(key);
    if(!old||Date.parse(r[4])>Date.parse(old[4]))unique.set(key,r);
  }
  return [...unique.values()].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
}
function aggregate(card, receipt, now) {
  const row = receipt?.cards?.[card.id], at = Date.parse(receipt?.observedAt);
  if (receipt?.version !== 1 || !receipt.payloadHash || !receipt.sourceUrl || !row
    || row[0] !== evidence.identity(card) || card.identityReviewRequired || card.language !== 'ja'
    || !Number.isFinite(at) || at > now) return null;
  // Only values captured from this response are evidence. Retained catalog fields are not.
  return { at:receipt.observedAt, source:receipt.sourceUrl, counts:{7:count(row[2]) ? row[2] : null,30:count(row[3]) ? row[3] : null},
    periodBoundary:'提供元の直近期間集計・時刻境界未公表', stale:now-at>48*3600000 };
}
function popWindow(history, days, endAt, now) {
  const ceiling = Math.min(Date.parse(endAt),now);
  const rows=(history || []).filter(r=>Array.isArray(r) && count(r[1]) && r[3]?.sourceUrl && r[3]?.specificationIdentity
    && r[3]?.captureVersion >= 2 && r[3]?.completeSnapshot === true
    && evidence.calendarDay(r[3].observedAt)?.replace(/-/g,'') === r[0] && Date.parse(r[3].observedAt)<=ceiling)
    .sort((a,b)=>Date.parse(a[3].observedAt)-Date.parse(b[3].observedAt));
  const urls=new Set(rows.map(r=>r[3].sourceUrl)), identities=new Set(rows.map(r=>r[3].specificationIdentity));
  if(urls.size>1 || identities.size>1) return {status:'仕様・元ページ不一致',delta:null,ratioEligible:false};
  if(rows.length<2) return {status:'日時根拠付きPOP履歴不足',delta:null,ratioEligible:false,observedPoints:rows.length};
  const last=rows.at(-1), cutoff=Date.parse(last[3].observedAt)-days*DAY;
  const base=[...rows].reverse().find(r=>Date.parse(r[3].observedAt)<=cutoff) || rows[0];
  const span=(Date.parse(last[3].observedAt)-Date.parse(base[3].observedAt))/DAY;
  const delta=last[1]-base[1], aligned=Math.abs(span-days)<=0.5 && ceiling-Date.parse(last[3].observedAt)<=DAY;
  return {delta,span,startAt:base[3].observedAt,endAt:last[3].observedAt,startPop:base[1],endPop:last[1],
    sourceUrl:last[3].sourceUrl,specificationIdentity:last[3].specificationIdentity,aligned,
    ratioEligible:aligned && delta>0,status:delta<0?'POP減少・訂正等（吸収としない）':!aligned?'期間不一致・部分期間':delta===0?'POP純増0・比率不可':'近い期間の参考比較',
    monthlyExtrapolation:span>0 ? {value:delta/span*30,estimate:true} : null};
}
function actualPeriod(card, days, asOf, now) {
  const coverage=card.snkPsa10TradeCoverage;
  const calendarEnd=Date.parse(asOf+'T00:00:00+09:00')+DAY, confirmedAt=Date.parse(coverage?.observedAt);
  const end=Number.isFinite(confirmedAt)&&confirmedAt<=now ? Math.min(calendarEnd,confirmedAt) : calendarEnd, start=calendarEnd-days*DAY;
  const complete=coverage?.complete===true && coverage.market==='domestic' && coverage.identityKey===card.identityKey
    && Date.parse(coverage.startAt)<=start && Date.parse(coverage.endAt)>=end && Date.parse(coverage.endAt)<=now
    && Date.parse(coverage.observedAt)<=now;
  const ids=new Set(), certificates=new Set(), accepted=[], excluded={};let repeats=0;
  const reject=reason=>excluded[reason]=(excluded[reason]||0)+1;
  for(const row of card.snkPsa10Trades || []) {
    if(row.measurementType!=='actual'||row.market!=='domestic'||row.currency!=='JPY'||row.cardId!==card.id
      ||row.identityKey!==card.identityKey||row.language!=='ja'||row.gradingCompany!=='PSA'||Number(row.grade)!==10||row.identityConfirmed!==true){reject('仕様・国内PSA10実成約の根拠不一致');continue;}
    const t=Date.parse(row.soldAt || row.date+'T12:00:00+09:00');
    if(!Number.isFinite(t)||t<start||t>=end||t>now)continue;
    if(!(row.price>0)||!row.id||!row.source){reject('価格または重複識別の根拠不足');continue;}
    const key=row.source+'/'+row.id;
    if(ids.has(key)){reject('同一成約ID重複');continue;}ids.add(key);
    if(row.certificateId){if(certificates.has(row.certificateId))repeats++;certificates.add(row.certificateId);}
    accepted.push(row);
  }
  const usable=complete && !Object.keys(excluded).some(k=>k!=='同一成約ID重複');
  return {count:usable ? accepted.length : null,
    availableRows:accepted.length,complete,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),
    observedAt:coverage?.observedAt || null,repeatedCertificateTransactions:repeats,excluded,
    status:usable?'個別国内PSA10実成約・全範囲確認':complete?'個別成約の仕様/識別根拠不足・総数算出不可':'個別成約取得範囲不足・総数算出不可'};
}
function prepare(root, cards, now=new Date()) {
  const receipt=read(root,'data/psa10-observation-receipt.json'), asOf=evidence.calendarDay(now.toISOString());
  const previous=read(root,'work/psa10-trade-observations.json',{version:1,cards:{}});
  const population=read(root,'data/psa-population-summary.json'), histories=new Map(), times=[], timeMap=new Map();
  const timeIndex=value=>{if(!value)return null;if(!timeMap.has(value)){timeMap.set(value,times.length);times.push(value);}return timeMap.get(value);};
  const summary={version:2,periods:[7,30,75,200],asOf,sourceUrl:receipt.sourceUrl || null,times,cards:{},
    label:'国内PSA10・取得元の期間集計件数（個別成約ではない）',boundary:'提供元の直近7/30日・時刻境界未公表',
    rule:'7/30集計を合算しない。75/200日総数は完全範囲の個別履歴のみ。国内取引と世界POPは参考比較・GO未反映',
    coverage:{aggregate7:0,aggregate30:0,actual75:0,actual200:0,matchedPop7:0,matchedPop30:0}};
  const details=new Map();let addedDays=0;
  for(const card of cards) {
    const incoming=aggregate(card,receipt,+now), stored=dailyObservations(previous.cards[card.id]);
    if(previous.cards[card.id])previous.cards[card.id]=stored;
    // Older scheduled collectors omit counts. Preserve the proven snapshot's own timestamp.
    const saved=[...stored].filter(r=>r[1]===evidence.identity(card) && r[5]
      && evidence.calendarDay(r[4])===r[0] && Date.parse(r[4])<=+now && (count(r[2])||count(r[3])))
      .sort((a,b)=>Date.parse(b[4])-Date.parse(a[4]))[0];
    const a=incoming && (incoming.counts[7]!=null||incoming.counts[30]!=null) ? incoming
      : saved && !card.identityReviewRequired && card.language==='ja'
        ? {at:saved[4],source:saved[5],counts:{7:count(saved[2])?saved[2]:null,30:count(saved[3])?saved[3]:null},
          periodBoundary:'保存済み取得元集計・元の確認日時を維持',stale:+now-Date.parse(saved[4])>48*3600000}
        : incoming;
    if(a && (a.counts[7]!=null||a.counts[30]!=null)) {
      const day=evidence.calendarDay(a.at), existing=stored.find(r=>r[0]===day && r[1]===evidence.identity(card));
      if(!existing){stored.push([day,evidence.identity(card),a.counts[7],a.counts[30],a.at,a.source]);addedDays++;}
      else if(Date.parse(a.at)>Date.parse(existing[4]))existing.splice(2,4,a.counts[7],a.counts[30],a.at,a.source);
      previous.cards[card.id]=stored.filter(r=>Date.parse(r[0])>=Date.parse(asOf)-(365-1)*DAY);
    }
    const official=population.cards?.[card.id];let history=[];
    if(official?.sh && !population.specificationHeld?.[card.id]) {
      if(!histories.has(official.sh))histories.set(official.sh,read(root,'data/psa-history/'+official.sh+'.json'));
      const shard=histories.get(official.sh);
      history=(shard.cards?.[card.id] || []).filter(r=>r[3]?.sourceUrl===official.u && r[3]?.specificationIdentity===shard.identities?.[card.id]);
    }
    const windows={}, actual={}, rolling={};
    for(const days of [7,30,75,200]) {
      windows[days]=popWindow(history,days,a?.at || now.toISOString(),+now);
      actual[days]=actualPeriod(card,days,asOf,+now);
      const adopted=(previous.cards[card.id] || []).filter(r=>r[1]===evidence.identity(card)&&r[0]<=asOf && Date.parse(r[0])>=Date.parse(asOf)-(days-1)*DAY);
      rolling[days]=Object.fromEntries([[7,2],[30,3]].map(([period,index])=>{const points=adopted.filter(r=>count(r[index]));return [period,{mean:points.length?points.reduce((s,r)=>s+r[index],0)/points.length:null,
        observedDays:points.length,latest:points.at(-1)?.[0] || null,label:`直近${period}日集計件数の観測平均（期間成約総数ではない）`}];}));
    }
    const pack=days=>{const w=windows[days];return w.delta==null?null:[w.delta,timeIndex(w.startAt),timeIndex(w.endAt),Math.round(w.span*100)/100,w.ratioEligible?0:w.delta<0?2:1];};
    if((a && (a.counts[7]!=null || a.counts[30]!=null)) || actual[75].count!=null || actual[200].count!=null || windows[7].delta!=null || windows[30].delta!=null)
      summary.cards[card.id]=[a?.counts[7]??null,a?.counts[30]??null,timeIndex(a?.at),pack(7),pack(30),actual[75].count,actual[200].count,timeIndex(actual[75].observedAt),timeIndex(actual[200].observedAt)];
    for(const days of [7,30]){summary.coverage['aggregate'+days]+=Number(a?.counts[days]!=null);summary.coverage['matchedPop'+days]+=Number(windows[days].ratioEligible && a?.counts[days]!=null);}
    for(const days of [75,200])summary.coverage['actual'+days]+=Number(actual[days].count!=null);
    details.set(card.id,{aggregate:a,actual,rolling,pop:windows,
      note:'POPは全世界の鑑定枚数で市場出品ではない。国内取引は再売買を含み得る。集計件数では重複/再売買識別不能。新紐付け・回収・仕様訂正を増加日へ移さない。'});
  }
  previous.retentionDays=365;
  const text=JSON.stringify(previous),target=path.join(root,'work/psa10-trade-observations.json');
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)require('./acquisition_retry').atomicWrite(target,previous,0);
  return {summary,details,addedDays};
}
module.exports={aggregate,popWindow,actualPeriod,prepare,dailyObservations};
