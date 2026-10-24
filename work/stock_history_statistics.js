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
function period(rows,days,asOfDate) {
  const end=Date.parse(asOfDate+'T00:00:00Z'),start=end-days*DAY;
  const recent=rows.filter(([day])=>Date.parse(day+'T00:00:00Z')>=start);
  let total=0,pairs=0;
  for(let i=1;i<recent.length;i++) {
    const [a,x]=recent[i-1],[b,y]=recent[i];
    if(!Number.isFinite(x)||!Number.isFinite(y)||Date.parse(b)-Date.parse(a)!==DAY)continue;
    total+=Math.max(0,x-y);pairs++;
  }
  return {average:pairs?Math.round(total/pairs*100)/100:null,total:pairs?Math.round(total*100)/100:null,pairs,
    missingPairs:days-pairs};
}
const quantile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]:null;
function summarize(history,{asOf=new Date().toISOString()}={}) {
  const asOfDate=dayOf(asOf),rows={};
  for(const [id,values]of Object.entries(history.stocks||{})) {
    const observed=observations(history.dates,values,asOfDate),periods=Object.fromEntries([7,30,90].map(d=>[d,period(observed,d,asOfDate)]));
    rows[id]={avg7:periods[7].average,avg30:periods[30].average,avg90:periods[90].average,
      drop7:periods[7].total,drop30:periods[30].total,samples:observed.filter(([,v])=>Number.isFinite(v)).length,
      stockStatistics:{asOfDate,pairs7:periods[7].pairs,pairs30:periods[30].pairs,missing7:periods[7].missingPairs,missing30:periods[30].missingPairs}};
  }
  const rates=Object.values(rows).filter(r=>r.samples>=7&&Number.isFinite(r.avg30)&&r.avg30>0).map(r=>r.avg30);
  const model={minimumSamples:7,normalDaily:Math.max(.2,quantile(rates,.5)||0),highDaily:Math.max(.75,quantile(rates,.85)||0),normalTotal:2,highTotal:4,cohortSize:rates.length};
  for(const row of Object.values(rows))row.demand=row.samples<model.minimumSamples||row.avg30==null||row.drop30==null?'蓄積中':row.avg30>=model.highDaily&&row.drop30>=model.highTotal?'買う人が多い':row.avg30>=model.normalDaily&&row.drop30>=model.normalTotal?'普通':'少ない';
  return {cards:rows,demandModel:model,asOfDate,inputHash:crypto.createHash('sha256').update(JSON.stringify([asOfDate,history])).digest('hex')};
}
function apply(summary,history,options) {
  const result=summarize(history,options);let changed=0;
  for(const [id,row]of Object.entries(summary.cards||{})) {
    const next=result.cards[id]||{avg7:null,avg30:null,avg90:null,drop7:null,drop30:null,samples:0,demand:'蓄積中'};
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
  for(const id of ['hareruya2','cardrush']) {
    const historyFile=path.join(root,'work',id+'_stock_history.json'),file=path.join(root,'data',id+'-stock-summary.json');
    if(!fs.existsSync(historyFile)||!fs.existsSync(file))continue;
    const summary=JSON.parse(fs.readFileSync(file));out[id]=apply(summary,JSON.parse(fs.readFileSync(historyFile)),options);
    require('./acquisition_retry').atomicWrite(file,summary,0);
  }
  return out;
}
module.exports={observations,period,summarize,apply,reconcile};
