const {calendarDay} = require('./psa10_observation_evidence');
const DAY=86400000, mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
// Input rows have already passed exact Japanese card identity and observation
// evidence checks in build_buyback_support.joined. No price/grade substitution.
function aggregate(rows,source,now=Date.now(),commonOffers={groups:[]}) {
  const asOf=calendarDay(new Date(now).toISOString()), end=Date.parse(asOf), merchants={}, days=new Map();
  for(const [shop,meta] of Object.entries(source.shops||{})) {
    if(['pending','retired'].includes(meta.acquisitionPermission))continue;
    const id=meta.merchantId||shop;
    const merchant=merchants[id]||={id,name:meta.name||id,channels:[],periods:{}};
    merchant.channels.push({id:shop,name:meta.name||shop,fulfilment:meta.fulfilment||'mail'});
  }
  const groups=(commonOffers.groups||[]).filter(g=>g.status==='verified'&&g.evidenceUrl&&g.sourceRowId&&g.merchantId&&Array.isArray(g.cardIds)&&g.cardIds.length>1);
  const audit={inputRows:rows.length,acceptedRows:0,rejectedRows:0,duplicateRows:0,conflictingOffers:0,sharedOfferVotes:0,unreviewedSharedRows:0};
  const owners=new Map();
  for(const row of rows)if(row.sourceRowId){const key=[source.shops?.[row.shop]?.merchantId||row.shop,row.date,row.sourceRowId].join('|');
    if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(row.physicalIdentity||row.identity||row.id);}
  const channels=new Map();
  for(const row of rows){const key=[row.shop,row.date,row.physicalIdentity||row.identity||row.id].join('|'),old=channels.get(key);
    if(!old||Date.parse(row.observedAt)>Date.parse(old.observedAt))channels.set(key,row);
    else if(row.observedAt===old.observedAt&&(row.price!==old.price||row.marketPrice!==old.marketPrice))channels.set(key,{...old,channelConflict:true});
  }
  for(const row of channels.values()) {
    const merchantId=source.shops?.[row.shop]?.merchantId||row.shop, date=Date.parse(row.date);
    if(row.channelConflict||!merchants[merchantId]||!Number.isFinite(date)||date>end||date<end-199*DAY||row.priceDate!==row.date||!(row.timeSkewHours<=6)
      ||!Number.isFinite(row.ratio)||!(row.ratio>0)||calendarDay(row.observedAt)!==row.date||calendarDay(row.marketAt)!==row.date
      ||Date.parse(row.observedAt)>now||Date.parse(row.marketAt)>now) {audit.rejectedRows++;continue;}
    const group=groups.find(g=>g.merchantId===merchantId&&g.cardIds.includes(row.id)&&g.sourceRowId===row.sourceRowId
      &&g.date===row.date&&g.observedAt===row.observedAt&&g.price===row.price);
    if(row.sourceRowId&&owners.get([merchantId,row.date,row.sourceRowId].join('|'))?.size>1&&!group){audit.unreviewedSharedRows++;audit.rejectedRows++;continue;}
    const vote=group?'offer:'+group.sourceRowId:'card:'+(row.physicalIdentity||row.identity||row.id);
    const key=merchantId+'|'+row.date;
    if(!days.has(key))days.set(key,{merchantId,date:row.date,votes:new Map()});
    const votes=days.get(key).votes, old=votes.get(vote);
    audit.acceptedRows++;
    if(old) {
      audit.duplicateRows++;
      // One shared offer cannot be divided by two conflicting markets. Retain
      // the evidence as a hold instead of multiplying or averaging its ratios.
      if(group&&(old.marketPrice!==row.marketPrice||old.price!==row.price)) {old.hold=true;audit.conflictingOffers++;continue;}
      if(old.hold)continue;
      // Same physical merchant: one card/day, highest valid channel offer;
      // same channel/day updates use the latest actual observation.
      if(old.shop===row.shop?Date.parse(row.observedAt)<Date.parse(old.observedAt):row.ratio<old.ratio)continue;
    }
    votes.set(vote,{...row,shared:Boolean(group)});
  }
  for(const day of days.values()) {
    const votes=[...day.votes.values()].filter(r=>!r.hold);
    if(!votes.length)continue;
    audit.sharedOfferVotes+=votes.filter(r=>r.shared).length;
    const merchant=merchants[day.merchantId];(merchant.daily||=[]).push({date:day.date,mean:mean(votes.map(r=>r.ratio)),cards:votes.length,
      identities:votes.map(r=>r.physicalIdentity||r.identity||r.id),lastObservedAt:votes.map(r=>r.observedAt).sort().at(-1)});
  }
  for(const merchant of Object.values(merchants)) {
    const daily=(merchant.daily||[]).sort((a,b)=>a.date.localeCompare(b.date));
    for(const period of [1,30,75,200]) {
      const selected=daily.filter(d=>Date.parse(d.date)>=end-(period-1)*DAY);
      merchant.periods[period]={mean:mean(selected.map(d=>d.mean)),observedDays:selected.length,periodDays:period,
        uniqueCards:new Set(selected.flatMap(d=>d.identities)).size,meanDailyCards:mean(selected.map(d=>d.cards)),
        firstDate:selected[0]?.date||null,lastDate:selected.at(-1)?.date||null,lastObservedAt:selected.at(-1)?.lastObservedAt||null,
        reference:selected.length<period};
    }
    merchant.lastComparableDate=daily.at(-1)?.date||null;
    // Send compact windows; the underlying daily observations stay in storage.
    delete merchant.daily;
  }
  return {version:1,asOf,periods:[1,30,75,200],merchants,audit,
    rule:'全掲載カード対象。減額前PSA10提示÷同仕様・同日・実確認差6時間以内の国内PSA10相場。カード1件1票の日次単純平均→有効日の日次平均の単純平均。欠測補完・金額加重なし。同店の受付別提示はカードごと有効最高1件。出典付きで確定した共通提示は1票、比較元矛盾は保留。検索・採算・GOには不使用。'};
}
module.exports={aggregate};
