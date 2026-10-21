const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),config=require('./priority-search-profiles.json'),{allProfiles}=require('./search_profile_variants');
const old=cp.execFileSync('git',['show','839d8685:app.js'],{encoding:'utf8',maxBuffer:12000000}),source=fs.readFileSync('app.js','utf8');
const at=process.env.SEARCH_MODE_AT||new Date().toISOString(),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={version:1,at,baseline:'839d8685',dataAcquisitionFirstQualifications:0,profiles:[]};
for(const p of allProfiles(config)) {
  for(const [scope,overlay] of [['urlOnly',{}],['knownSaved',config.knownSavedOverlay||{}]]) {
    const url=new URL(p.url);for(const [k,v] of Object.entries(overlay))if(!url.searchParams.has(k))url.searchParams.set(k,v);
    console.log('Evaluating '+p.id+' '+scope);
    const before=load(old,at,{url:url.href,fixedModelClock:true}),after=load(source,at,{url:url.href,fixedModelClock:true});
    const b=before.prepareCalculatedCards(before.state.cards),a=after.prepareCalculatedCards(after.state.cards);
    const financial=c=>c.map(c=>[c.id,c.buyLimits,c.purchaseDecision]);assert.equal(hash(financial(a)),hash(financial(b)),'site formula and GO unchanged');
    const ids=(api,c)=>c.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id).sort();
    const oldIds=ids(before,b),siteIds=ids(after,a);assert.deepEqual(siteIds,oldIds,'renamed site mode preserves IDs');
    after.state.purchaseMode='specified';
    const representatives=a.filter(c=>['pk-73731','pk-22379','pk-14592'].includes(c.id));
    const recalculated=after.prepareCalculatedCards(after.state.cards.filter(c=>representatives.some(r=>r.id===c.id)));
    assert.equal(hash(financial(recalculated)),hash(financial(representatives)),'mode-independent financial calculation');
    const specifiedIds=ids(after,a),siteSet=new Set(siteIds),specifiedSet=new Set(specifiedIds);
    const row={id:p.id,scope,analyzable:a.filter(c=>c.catalogCompletion?.s==='分析可能').length,site:siteIds.length,specified:specifiedIds.length,siteIds,specifiedIds,
      gainedByMode:specifiedIds.filter(id=>!siteSet.has(id)),excludedByRequiredEvidence:siteIds.filter(id=>!specifiedSet.has(id)),financialHash:hash(financial(a)),unchangedSiteMode:true};
    report.profiles.push(row);console.log(JSON.stringify({id:p.id,scope,site:row.site,specified:row.specified,modeOnlyGain:row.gainedByMode.length}));
  }
}
report.independent={site:new Set(report.profiles.filter(p=>p.scope==='urlOnly').flatMap(p=>p.siteIds)).size,specified:new Set(report.profiles.filter(p=>p.scope==='urlOnly').flatMap(p=>p.specifiedIds)).size};
fs.writeFileSync('work/two-search-modes-comparison.json',JSON.stringify(report,null,2));
