// Typed reconciliation only. Unknown raw files and ambiguous observation times
// remain conflicts. Every original side is archived by resolve_generated_merge.
const {latest,mergeProfileTargets}=require('./reconcile_saved_source_merge');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function buybackObservations(base,a,b){
  if(![base,a,b].every(v=>v?.version===1&&v.shops&&typeof v.shops==='object'&&!Array.isArray(v.shops)&&Object.keys(v).every(k=>['version','shops'].includes(k))))throw Error('Buyback observation schema changed; review required');
  const shops={};
  for(const shop of new Set([...Object.keys(a.shops),...Object.keys(b.shops)])){
    shops[shop]={};
    for(const id of new Set([...Object.keys(a.shops[shop]||{}),...Object.keys(b.shops[shop]||{})])){
      const left=a.shops[shop]?.[id]||{},right=b.shops[shop]?.[id]||{},old=base.shops[shop]?.[id]||{},days={};
      for(const day of new Set([...Object.keys(left),...Object.keys(right)])){
        const x=left[day],y=right[day];
        // Preserve identical legacy/held evidence; this is not a new quote or
        // a justification for changing its observation date or quarantine.
        if(same(x,y)){days[day]=x;continue;}
        for(const r of [x,y].filter(Boolean))if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!r.identity||!Number.isFinite(Date.parse(r.observedAt))||!(r.price>0))throw Error('Buyback observation date/identity/price missing');
        if(!x){days[day]=y;continue;}if(!y){days[day]=x;continue;}
        if(x.identity!==y.identity||x.grade!==y.grade||x.currency!==y.currency)throw Error('Buyback observation identity/grade/currency changed; review required');
        days[day]=latest(x,y,old[day]);
      }
      shops[shop][id]=days;
    }
  }
  return {version:1,shops};
}
function evidence(base,a,b) {
  const result={...latest(a,b,base),cards:{...a.cards}};
  for(const [id,row]of Object.entries(b.cards||{}))result.cards[id]=latest(a.cards?.[id],row,base.cards?.[id]);
  return result;
}
function operational(base,a,b) {
  if(!same(a.settings,b.settings)||a.modelVersion!==b.modelVersion)throw Error('Operational model/settings conflict; review required');
  const result={...latest(a,b,base),cards:{}};
  for(const id of new Set([...Object.keys(a.cards||{}),...Object.keys(b.cards||{})])){
    result.cards[id]={};
    for(const mode of new Set([...Object.keys(a.cards?.[id]||{}),...Object.keys(b.cards?.[id]||{})])){
      const x=a.cards?.[id]?.[mode]||[],y=b.cards?.[id]?.[mode]||[],old=new Map((base.cards?.[id]?.[mode]||[]).map(r=>[r.date,r]));
      const rows=new Map(x.map(r=>[r.date,r]));
      for(const row of y){const prior=rows.get(row.date);if(!prior||same(prior,row)||same(prior,old.get(row.date)))rows.set(row.date,row);
        else if(!same(row,old.get(row.date))){const chosen=latest(a,b,base);rows.set(row.date,chosen===a?prior:row);}}
      result.cards[id][mode]=[...rows.values()].sort((u,v)=>u.date.localeCompare(v.date));
    }
  }
  return result;
}
function candidates(base,a,b,context) {
  if(![base,a,b].every(v=>Array.isArray(v.days)))throw Error('Candidate history schema changed');
  const old=new Map(base.days.map(r=>[r.date,r])),rows=new Map(a.days.map(r=>[r.date,r]));
  for(const row of b.days){const prior=rows.get(row.date);if(!prior||same(prior,row)||same(prior,old.get(row.date)))rows.set(row.date,row);
    else if(!same(row,old.get(row.date))){
      if(!same(prior.settings,row.settings)||prior.modelVersion!==row.modelVersion)throw Error('Candidate history settings differ');
      const x=Date.parse(context.leftAudit?.evaluationAt||context.leftAudit?.generatedAt),y=Date.parse(context.rightAudit?.evaluationAt||context.rightAudit?.generatedAt);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x===y)throw Error('Candidate snapshots require distinct timestamps');
      const chosen=latest(context.leftAudit,context.rightAudit,context.baseAudit);
      rows.set(row.date,chosen===context.leftAudit?prior:row);
    }}
  return {...a,days:[...rows.values()].sort((x,y)=>x.date.localeCompare(y.date))};
}
function availability(base,a,b) {
  if(![base,a,b].every(v=>v.version===1&&Array.isArray(v.runs)))throw Error('Availability history schema changed');
  const rows=new Map();
  for(const row of [...a.runs,...b.runs]) {
    if(!Number.isFinite(Date.parse(row.generatedAt))||!row.modelVersion||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))throw Error('Availability snapshot timestamp/identity missing');
    const old=rows.get(row.generatedAt);
    if(old&&!same(old,row))throw Error('Availability snapshot same-time contradiction; review required');
    rows.set(row.generatedAt,row);
  }
  return {version:1,runs:[...rows.values()].sort((x,y)=>Date.parse(x.generatedAt)-Date.parse(y.generatedAt))};
}
const TYPES=new Map([
  ['work/buyback-price-observations.json',buybackObservations],
  ['data/state-a-price-evidence.json',evidence],['data/operational-limit-history.json',operational],
  ['work/search-profile-targets.json',mergeProfileTargets],['work/candidate-daily-history.json',candidates],
  ['work/candidate-availability-history.json',availability],
  ...['work/acquisition-progress-last.json','work/completion-outcomes-last.json','work/purchase-price-observation-snapshot.json','data/workflow-stage-audit.json'].map(f=>[f,latest])
]);
// latest takes (a,b,base), unlike the three-way handlers above.
function merge(file,base,a,b,context){return TYPES.get(file)===latest?latest(a,b,base):TYPES.get(file)(base,a,b,context);}
module.exports={TYPES,merge,evidence,operational,candidates,availability,buybackObservations};
