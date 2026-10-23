const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency');
const metrics=require('../exploration-metrics');
const root=require('node:path').resolve(__dirname,'..');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function measure(input) {
  const source=fs.readFileSync('app.js','utf8');
  const run=dataRef=>{
    const api=load(source,input.at,{url:input.profile.url,fixedModelClock:true});
    if(dataRef)api.state.buybackObservationSummary=JSON.parse(cp.execFileSync('git',['show',dataRef+':data/buyback-observation-summary.json'],{cwd:root,maxBuffer:32e6}));
    const cards=api.prepareCalculatedCards(api.state.cards),byId=new Map(cards.map(c=>[c.id,c]));
    const ids=cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
    const scope=[...new Set([...ids,...input.ids])].filter(id=>byId.has(id));
    const groups={};
    for(const scenario of ['current',...metrics.observationPeriods.map(n=>'obs'+n)]) {
      const group={calculated:0,reference:0,unavailable:0,causes:{},rows:{}};
      for(const id of scope) {
        const e=api.cardEfficiency(byId.get(id),Date.parse(input.at),api.state.purchaseMode,scenario);
        group[e.calculationState]++;
        const cause=Number.isFinite(e.annual)?null:metrics.efficiencyUnavailableLabel(e);
        if(cause)group.causes[cause]=(group.causes[cause]||0)+1;
        group.rows[id]={annual:e.annual,reason:e.reason,buy:e.purchasePrice,observation:e.observation,state:e.calculationState};
      }
      groups[scenario]=group;
    }
    return {ids,scope,groups,financialHash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))};
  };
  const before=run(input.ref),after=run(null);
  assert.equal(before.financialHash,after.financialHash,'saved mean recovery must not change limits or GO');
  return {id:input.profile.id,before,after,gained:after.ids.filter(id=>!before.ids.includes(id)),lost:before.ids.filter(id=>!after.ids.includes(id))};
}
if(process.argv.includes('--worker'))process.stdout.write(JSON.stringify(measure(JSON.parse(fs.readFileSync(0,'utf8')))));
else {
  const config=require('./priority-search-profiles.json'),definitions=require('./search_profile_variants').searchModeProfiles(config);
  const at=new Date().toISOString(),ref=process.argv.find(v=>v.startsWith('--reference='))?.slice(12)||cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert(/^[a-f0-9]{7,40}$/.test(ref),'explicit commit required');
  const old=JSON.parse(cp.execFileSync('git',['show',ref+':data/priority-search-profile-audit.json'],{cwd:root,maxBuffer:32e6}));
  const profiles=[];
  for(const profile of definitions) {
    const previous=old.profiles.find(p=>p.urlOnly.id===profile.id)?.urlOnly;
    const ids=previous?.rows?.map(r=>r.id)||[];
    const child=cp.spawnSync(process.execPath,['--max-old-space-size=2048',__filename,'--worker'],{cwd:root,input:JSON.stringify({profile,ids,ref,at}),encoding:'utf8',timeout:180000,maxBuffer:32e6});
    if(child.status!==0)throw Error(child.stderr||child.error?.message||'comparison failed');
    profiles.push(JSON.parse(child.stdout));
  }
  const result={at,reference:ref,httpRequests:0,financialUnchanged:true,scope:'same fixed time/code/settings/current data; only the saved buyback mean summary differs; existing candidate and completion prospect IDs, not all catalog',profiles};
  fs.writeFileSync('work/20261023-period-fixed-comparison.json',JSON.stringify(result));
  console.log(JSON.stringify(profiles.map(p=>({id:p.id,before:p.before.ids.length,after:p.after.ids.length,gained:p.gained,lost:p.lost,periods:Object.fromEntries(Object.entries(p.after.groups).map(([k,g])=>[k,{calculated:g.calculated,reference:g.reference,unavailable:g.unavailable,causes:g.causes}]))})),null,2));
}
module.exports={measure};
