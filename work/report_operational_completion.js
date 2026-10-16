const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const {load}=require('./audit_search_profit_consistency'),outcomes=require('./audit_completion_outcomes');
const fromGit=file=>cp.execFileSync('git',['show','07a91cb9:'+file],{maxBuffer:96e6});
function lastJson(file) {for(const line of fs.readFileSync(file,'utf8').trim().split(/\r?\n/).reverse())try{return JSON.parse(line);}catch{}throw Error('No saved acquisition result '+file);}
function build() {
  const at=new Date().toISOString(),baseline=read('work/search-profile-cycle-baseline-operations-20261016.json');
  const config=read('work/priority-search-profiles.json'),oldConfig=JSON.parse(fromGit('work/priority-search-profiles.json'));
  assert.deepEqual(config,oldConfig,'Fixed URL conditions and approved saved overlay must be unchanged');
  const unchanged=Object.fromEntries(['app.js','decision-model.js','current-market-model.js','exploration-metrics.js'].map(f=>[f,
    hash(fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))===hash(fromGit(f).toString().replace(/\r\n/g,'\n'))]));
  assert(Object.values(unchanged).every(Boolean),'No production formula or search changes in this operation');
  const profiles=require('./search_profile_variants').allProfiles(config).map(p=>{
    const evaluate=ref=>{const api=load(fs.readFileSync('app.js','utf8'),at,{url:p.url,...(ref?{dataRef:ref}:{})});
      assert.equal(api.missingHistoricalInputs.length,0);const cards=api.prepareCalculatedCards(api.state.cards);
      return {api,cards,ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id)};};
    const before=evaluate('07a91cb9'),after=evaluate(),initial=baseline.profiles.find(x=>x.id===p.id);
    const gained=after.ids.filter(id=>!before.ids.includes(id)),lost=before.ids.filter(id=>!after.ids.includes(id));
    const facts=(view,id)=>{const c=view.cards.find(c=>c.id===id);return c?{name:c.name,...require('./profile_candidate_evidence').cardFacts(view.api,c),exclusions:view.api.cardSearchExclusions(c)}:null;};
    return {id:p.id,urlHash:hash(p.url),initialTime:baseline.at,initial:initial.ids,
      previousDataAtSameTime:before.ids,current:after.ids,gainedByData:gained,lostByData:lost,
      timeOnlyLost:initial.ids.filter(id=>!before.ids.includes(id)),timeOnlyGained:before.ids.filter(id=>!initial.ids.includes(id)),
      changedCards:[...new Set([...gained,...lost])].map(id=>({id,before:facts(before,id),after:facts(after,id)}))};
  });
  const union=key=>[...new Set(profiles.flatMap(p=>p[key]))].sort(),before=union('previousDataAtSameTime'),after=union('current');
  const cycle=read('data/search-profile-cycle-progress.json').cycles.find(r=>r.key==='operations-20261016');
  const executions=read('work/operations-acquisition-execution.json'),window=executions.find(r=>r.name==='completion');
  const completion=(read('work/source-update-history.json').sources.hareruya2||[]).find(r=>r.mode==='completion-backfill'
    &&Date.parse(r.startedAt)>=Date.parse(window.start)&&Date.parse(r.startedAt)<=Date.parse(window.end));
  assert(completion,'Saved per-card completion acquisition evidence required');
  const acquisitions=[{name:'prices',...lastJson('work/operations-prices.log')},{name:'completion',...completion}];
  const linked=acquisitions.flatMap(r=>(r.records||[]).filter(x=>x.status==='verified'&&x.oldPrice==null).map(x=>x.id));
  const report={version:1,at,baselineAt:baseline.at,comparisonDataCommit:'07a91cb9',unchanged,
    profiles,uniqueCandidates:{initial:[...new Set(baseline.profiles.flatMap(p=>p.ids))].length,before:before.length,after:after.length,
      gained:after.filter(id=>!before.includes(id)),lost:before.filter(id=>!after.includes(id))},
    actualAcquisition:{executions,
      shopVerified:acquisitions.reduce((n,r)=>n+(r.refreshedCount??r.acquired??0),0),
      newPriceRecords:acquisitions.reduce((n,r)=>n+(r.newAcquiredCount??r.newAcquired??0),0),
      newPriceRecordIds:[...new Set(linked)],httpRequests:acquisitions.reduce((n,r)=>n+r.httpRequests,0),
      discovery:{...lastJson('work/operations-discovery.log'),records:undefined},
      psaSavedHandoff:read('data/psa-publication-handoff.json'),
      note:'手動店舗確認、通常定期取得、保存済みPSA回収を別記録。URL発見は価格取得でも条件適合でもない'},
    overall:outcomes.compare(outcomes.unpack(baseline.snapshot),outcomes.snapshot(process.cwd(),Date.parse(at))),
    prospectCycle:cycle,scheduled:read('data/scheduled-execution-audit.json'),
    fixedFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
    operational:read('data/operational-freshness-audit.json').sources.hareruya2.summary,
    research:read('data/supply-demand-validation-summary.json'),
    identityAudit:read('data/linkage-evidence-audit.json').verification,
    limits:'時間経過は同じ旧データで別評価。価格再集計や取得日時回復を新規掲載・新規分析可能と混同しない。修正後定期成功は別受領証で確認',
    llmCalls:0,codexCalls:0,aiSchedules:'停止維持'};
  fs.writeFileSync('data/operational-completion-report.json',JSON.stringify(report));
  console.log(JSON.stringify({profiles:profiles.map(p=>({id:p.id,initial:p.initial.length,timeOnly:p.previousDataAtSameTime.length,now:p.current.length,gained:p.gainedByData,lost:p.lostByData})),unique:report.uniqueCandidates,overall:report.overall}));
  return report;
}
if(require.main===module)build();module.exports={build};
