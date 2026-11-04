const crypto=require('node:crypto');
const DAY=86400000;
const dayOf=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function observations(dates,values,asOfDate) {
  const result=new Map(),conflicts=new Set();
  for(let i=0;i<dates.length;i++) {
    const date=dates[i],value=values[i];
    if(!validDay(date)||date>asOfDate)continue;
    const usable=Number.isFinite(value)&&value>=0?value:null;
    if(result.has(date)&&result.get(date)!==usable){conflicts.add(date);result.set(date,null);}
    else if(!conflicts.has(date))result.set(date,usable);
  }
  return [...result].sort(([a],[b])=>a.localeCompare(b));
}
function period(rows,days,asOfDate,proofs=null,asOf=Date.parse(asOfDate+'T23:59:59.999Z')) {
  const end=Date.parse(asOfDate+'T00:00:00Z'),start=end-days*DAY;
  const recent=rows.filter(([day])=>Date.parse(day+'T00:00:00Z')>=start&&Date.parse(day+'T00:00:00Z')<=end);
  let total=0,pairs=0,increase=0,net=0;const usedDays=new Set(),segments=[],excluded={missingQuantity:0,missingDays:0,missingEvidence:0,changedProduct:0,changedSpecification:0,invalidEvidenceTime:0};
  for(let i=1;i<recent.length;i++) {
    const [a,x]=recent[i-1],[b,y]=recent[i];
    if(!Number.isFinite(x)||!Number.isFinite(y)){excluded.missingQuantity++;continue;}
    if(Date.parse(b)-Date.parse(a)!==DAY){excluded.missingDays++;continue;}
    if(proofs){
      const p=proofs[a],q=proofs[b];
      if(!p||!q||p[0]!==x||q[0]!==y||!p[1]||!q[1]||!p[3]||!q[3]){excluded.missingEvidence++;continue;}
      if(p[1]!==q[1]){excluded.changedProduct++;continue;}
      if(p[3]!==q[3]){excluded.changedSpecification++;continue;}
      if(!Number.isFinite(Date.parse(p[2]))||!Number.isFinite(Date.parse(q[2]))||Date.parse(p[2])>asOf||Date.parse(q[2])>asOf||dayOf(p[2])!==a||dayOf(q[2])!==b){excluded.invalidEvidenceTime++;continue;}
      const prior=segments.at(-1);
      if(prior&&prior.last===a&&prior.url===p[1]&&prior.identityKey===p[3]){prior.last=b;prior.pairs++;prior.days++;}
      else segments.push({url:p[1],identityKey:p[3],first:a,last:b,pairs:1,days:2});
    }
    total+=Math.max(0,x-y);increase+=Math.max(0,y-x);net+=y-x;pairs++;usedDays.add(a);usedDays.add(b);
  }
  return {average:pairs?Math.round(total/pairs*100)/100:null,total:pairs?Math.round(total*100)/100:null,pairs,
    missingPairs:days-pairs,increase:pairs?increase:null,net:pairs?net:null,days:usedDays.size,
    first:[...usedDays].sort()[0]||null,last:[...usedDays].sort().at(-1)||null,
    asOfDate,windowStart:new Date(start).toISOString().slice(0,10),windowEnd:asOfDate,excluded,segments};
}
const quantile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]:null;
function summarize(history,{asOf=new Date().toISOString()}={}) {
  const asOfDate=dayOf(asOf),rows={};
  for(const [id,values]of Object.entries(history.stocks||{})) {
    const observed=observations(history.dates,values,asOfDate),periods=Object.fromEntries([7,30,90].map(d=>[d,period(observed,d,asOfDate)]));
    rows[id]={avg7:periods[7].average,avg30:periods[30].average,avg90:periods[90].average,
      drop7:periods[7].total,drop30:periods[30].total,samples:observed.filter(([,v])=>Number.isFinite(v)).length,
      stockStatistics:{asOfDate,pairs7:periods[7].pairs,pairs30:periods[30].pairs,missing7:periods[7].missingPairs,missing30:periods[30].missingPairs}};
    const proofs=history.quantityEvidence?.[id];
    rows[id].stockFlow=proofs?Object.fromEntries([7,30].map(d=>{const p=period(observed,d,asOfDate,proofs,Date.parse(asOf));return[d,{net:p.net,increase:p.increase,decrease:p.total,pairs:p.pairs,days:p.days,first:p.first,last:p.last,asOfDate,
      windowStart:p.windowStart,windowEnd:p.windowEnd,missingPairs:p.missingPairs,excluded:p.excluded,segments:p.segments}];})):null;
  }
  const rates=Object.values(rows).filter(r=>r.samples>=7&&Number.isFinite(r.avg30)&&r.avg30>0).map(r=>r.avg30);
  const model={minimumSamples:7,normalDaily:Math.max(.2,quantile(rates,.5)||0),highDaily:Math.max(.75,quantile(rates,.85)||0),normalTotal:2,highTotal:4,cohortSize:rates.length};
  for(const row of Object.values(rows))row.demand=row.samples<model.minimumSamples||row.avg30==null||row.drop30==null?'蓄積中':row.avg30>=model.highDaily&&row.drop30>=model.highTotal?'買う人が多い':row.avg30>=model.normalDaily&&row.drop30>=model.normalTotal?'普通':'少ない';
  return {cards:rows,demandModel:model,asOfDate,inputHash:crypto.createHash('sha256').update(JSON.stringify([asOfDate,history])).digest('hex')};
}
function apply(summary,history,options) {
  const result=summarize(history,options);let changed=0;
  for(const [id,row]of Object.entries(summary.cards||{})) {
    const next=result.cards[id]||{avg7:null,avg30:null,avg90:null,drop7:null,drop30:null,samples:0,demand:'蓄積中',stockFlow:null,
      stockStatistics:{asOfDate:result.asOfDate,pairs7:0,pairs30:0,missing7:7,missing30:30}};
    if(Object.entries(next).some(([k,v])=>JSON.stringify(row[k])!==JSON.stringify(v)))changed++;
    Object.assign(row,next);
  }
  summary.demandModel=result.demandModel;
  summary.stockStatistics={version:1,asOfDate:result.asOfDate,inputHash:result.inputHash,missingIsZero:false};
  return {changed,cards:Object.keys(summary.cards||{}).length,asOfDate:result.asOfDate,inputHash:result.inputHash};
}
function reconcile(root,options) {
  options={asOf:new Date().toISOString(),...options};
  const fs=require('node:fs'),path=require('node:path'),out={};
  const cardFile=path.join(root,'data/pokemon-cards.json'),cards=fs.existsSync(cardFile)?JSON.parse(fs.readFileSync(cardFile)):[];
  for(const id of ['hareruya2','cardrush','yuyutei','torecacamp']) {
    const historyFile=path.join(root,'work',id+'_stock_history.json'),file=path.join(root,'data',id+'-stock-summary.json');
    if(!fs.existsSync(historyFile)||!fs.existsSync(file))continue;
    const summary=JSON.parse(fs.readFileSync(file)),history=JSON.parse(fs.readFileSync(historyFile)),catalogFile=path.join(root,'work',id+'_catalog.json');
    const recovered=fs.existsSync(catalogFile)?captureQuantity(history,JSON.parse(fs.readFileSync(catalogFile)),cards,id):0;
    out[id]={...apply(summary,history,options),recoveredQuantityProofs:recovered};
    if(recovered)require('./acquisition_retry').atomicWrite(historyFile,history,0);
    require('./acquisition_retry').atomicWrite(file,summary,0);
  }
  return out;
}
function captureQuantity(history,catalog,cards,source) {
  const byId=new Map(cards.map(c=>[c.id,c])),dates=new Map(history.dates.map((d,i)=>[d,i]));let recovered=0;
  const hosts={hareruya2:'www.hareruya2.com',cardrush:'www.cardrush-pokemon.jp',yuyutei:'yuyu-tei.jp',torecacamp:'torecacamp-pokemon.com'};
  for(const r of catalog){const c=byId.get(r.cardId),at=Date.parse(r.observedAt);if(!c||!Number.isInteger(r.stock)||r.stock<0||typeof r.observedAt!=='string'||!r.observedAt.includes('T')||!Number.isFinite(at)||at>Date.now()||r.identityVerified!==true||r.cardMismatchSuspected||r.priceQuarantined||r.state!=='A')continue;
    let u;try{u=new URL(r.detailUrl);}catch{continue;}if(u.protocol!=='https:'||u.hostname!==hosts[source]||!(source==='yuyutei'?/^\/sell\/poc\/card\//:/^\/products?\//).test(u.pathname))continue;
    const day=dayOf(at),i=dates.get(day);if(i==null||history.stocks?.[c.id]?.[i]!==r.stock)continue;
    const rows=(history.quantityEvidence||={})[c.id]||={};const old=rows[day],next=[r.stock,u.href,r.observedAt,c.identityKey];
    if(!c.identityKey||old===null)continue;
    if(old&&(old[1]!==next[1]||old[3]!==next[3])){rows[day]=null;recovered++;continue;}
    if(!old||Date.parse(old[2])<at){rows[day]=next;recovered++;}
  }return recovered;
}
module.exports={observations,period,summarize,apply,reconcile,captureQuantity,dayOf};
