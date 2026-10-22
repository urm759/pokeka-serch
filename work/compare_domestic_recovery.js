const fs=require('node:fs'),cp=require('node:child_process');
const {load}=require('./audit_search_profit_consistency');
const {allProfiles}=require('./search_profile_variants');
const source=fs.readFileSync('app.js','utf8');
const baseline=process.env.DOMESTIC_COMPARE_BASELINE || '7859954a';
if(!/^[a-f0-9]{7,40}$/.test(baseline))throw Error('Explicit saved-data commit required');
const inspectIds=new Set((process.env.DOMESTIC_COMPARE_INSPECT||'').split(',').filter(Boolean));
function evaluate(url,at,dataRef) {
  const api=load(source,at,{url,dataRef,fixedModelClock:true}),cards=api.prepareCalculatedCards(api.state.cards);
  const rows=Object.fromEntries(cards.map(c=>[c.id,{name:c.name,reasons:api.cardSearchExclusions(c)}]));
  const ids=cards.filter(c=>!rows[c.id].reasons.length).map(c=>c.id);
  const facts={};for(const c of cards)if(ids.includes(c.id)||inspectIds.has(c.id))facts[c.id]=require('./profile_candidate_evidence').cardFacts(api,c);
  return {ids,rows,facts,missingHistoricalInputs:api.missingHistoricalInputs};
}
if(process.argv[2]==='--profile') {
  const profile=allProfiles(require('./priority-search-profiles.json')).find(p=>p.id===process.argv[3]);
  const at=process.argv[4],before=evaluate(profile.url,at,baseline),after=evaluate(profile.url,at);
  console.log(JSON.stringify({id:profile.id,before:before.ids,after:after.ids,
    gained:after.ids.filter(id=>!before.ids.includes(id)).map(id=>({id,name:after.rows[id].name,previousReasons:before.rows[id]?.reasons||[],facts:after.facts[id]})),
    lost:before.ids.filter(id=>!after.ids.includes(id)).map(id=>({id,name:before.rows[id].name,reasons:after.rows[id]?.reasons||['掲載なし'],before:before.facts[id]})),
    inspected:[...inspectIds].map(id=>({id,before:before.facts[id],after:after.facts[id]})),
    missingHistoricalInputs:before.missingHistoricalInputs}));
} else {
  const at=new Date().toISOString(),rows=[];
  for(const p of allProfiles(require('./priority-search-profiles.json'))) {
    const r=cp.spawnSync(process.execPath,[__filename,'--profile',p.id,at],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
    if(r.status!==0)throw Error(r.stderr||'profile comparison failed');rows.push(JSON.parse(r.stdout));
  }
  const before=[...new Set(rows.flatMap(r=>r.before))],after=[...new Set(rows.flatMap(r=>r.after))];
  const report={at,baseline,sameCode:true,sameSettings:true,sameEvaluationTime:true,profiles:rows,
    independent:{before:before.length,after:after.length,gained:after.filter(id=>!before.includes(id)),lost:before.filter(id=>!after.includes(id))},
    caution:'固定時計で実データ差を比較。初めての履歴適合と再適合の分類は通常差分台帳で別確認。取得だけでGOへ昇格しない'};
  const output=process.env.DOMESTIC_COMPARE_OUTPUT || 'work/20261022-fixed-data-recovery.json';
  if(!/^work\/[a-zA-Z0-9-]+\.json$/.test(output))throw Error('Local work report path required');
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({profiles:rows.map(r=>({id:r.id,before:r.before.length,after:r.after.length,gained:r.gained.map(x=>x.id),lost:r.lost.map(x=>x.id)})),independent:report.independent}));
}
