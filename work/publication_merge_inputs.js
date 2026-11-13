// Typed reconciliation only. Unknown raw files and ambiguous observation times
// remain conflicts. Every original side is archived by resolve_generated_merge.
const {latest,mergeProfileTargets}=require('./reconcile_saved_source_merge');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
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
const TYPES=new Map([
  ['data/state-a-price-evidence.json',evidence],['data/operational-limit-history.json',operational],
  ['work/search-profile-targets.json',mergeProfileTargets],['work/candidate-daily-history.json',candidates],
  ...['work/acquisition-progress-last.json','work/completion-outcomes-last.json','work/purchase-price-observation-snapshot.json'].map(f=>[f,latest])
]);
// latest takes (a,b,base), unlike the three-way handlers above.
function merge(file,base,a,b,context){return TYPES.get(file)===latest?latest(a,b,base):TYPES.get(file)(base,a,b,context);}
module.exports={TYPES,merge,evidence,operational,candidates};
