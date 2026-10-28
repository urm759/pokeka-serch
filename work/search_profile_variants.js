const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function reportName(id) {
  const base=String(id).replace(/-specified$/,'').replace(/-median$/,'');
  const name={A:'条件スタンダード',B:'条件プライオリティ',V:'条件バリュー'}[base] || id;
  return name+(String(id).includes('-median')?'（中央値）':'');
}
function medianProfile(base,id) {
  const url=new URL(base.url);url.searchParams.set('effBuy','median');
  const result={...base,id,baseId:base.id,basis:'median',url:url.href};
  const actual=new URL(result.url).searchParams,expected=new URL(base.url).searchParams;
  assert.deepEqual([...actual].filter(([k])=>k!=='effBuy'),[...expected].filter(([k])=>k!=='effBuy'));
  return result;
}
function allProfiles(config,{includeHistorical=false}={}) {
  const available=[...(config.profiles||[]),...(config.additionalProfiles||[])];
  const originals=includeHistorical||!config.focusProfileIds?available:config.focusProfileIds.map(id=>available.find(p=>p.id===id)).filter(Boolean);
  const variants=(config.medianVariants || []).filter(v=>originals.some(p=>p.id===v.baseId)).map(v=>{
    const base=originals.find(p=>p.id===v.baseId);assert(base,'Unknown original profile '+v.baseId);
    return medianProfile(base,v.id);
  });
  const result=[...originals,...variants].map(p=>({...p,reportName:reportName(p.id)}));assert.equal(new Set(result.map(p=>p.id)).size,result.length,'Profile IDs must be unique');
  return result;
}
function saveMedianProfiles(root,config) {
  const value={version:1,preferredBasis:'median',profiles:allProfiles(config).filter(p=>p.basis==='median'),
    historicalProfiles:allProfiles(config,{includeHistorical:true}).filter(p=>p.basis==='median'&&config.historicalProfileIds?.includes(p.baseId)),
    note:'Original A/B URLs remain immutable. Only effBuy differs; qualification changes here are basis changes, not acquisition outcomes.'};
  const file=path.join(root,'work/priority-search-median-profiles.json'),text=JSON.stringify(value);
  if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)require('./acquisition_retry').atomicWrite(file,value,0);
  return value;
}
function searchModeProfiles(config,options={}) {
  const site=allProfiles(config,options);
  return [...site,...site.map(p=>{
    const url=new URL(p.url);url.searchParams.set('preset','specified');
    assert.deepEqual([...url.searchParams].filter(([k])=>k!=='preset'),[...new URL(p.url).searchParams].filter(([k])=>k!=='preset'));
    return {...p,id:p.id+'-specified',baseId:p.baseId?p.baseId+'-specified':undefined,siteProfileId:p.id,searchMode:'specified',url:url.href};
  })];
}
module.exports={medianProfile,allProfiles,saveMedianProfiles,searchModeProfiles,reportName};
