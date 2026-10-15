const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function medianProfile(base,id) {
  const url=new URL(base.url);url.searchParams.set('effBuy','median');
  const result={...base,id,baseId:base.id,basis:'median',url:url.href};
  const actual=new URL(result.url).searchParams,expected=new URL(base.url).searchParams;
  assert.deepEqual([...actual].filter(([k])=>k!=='effBuy'),[...expected].filter(([k])=>k!=='effBuy'));
  return result;
}
function allProfiles(config) {
  const originals=config.profiles || [],variants=(config.medianVariants || []).map(v=>{
    const base=originals.find(p=>p.id===v.baseId);assert(base,'Unknown original profile '+v.baseId);
    return medianProfile(base,v.id);
  });
  const result=[...originals,...variants];assert.equal(new Set(result.map(p=>p.id)).size,result.length,'Profile IDs must be unique');
  return result;
}
function saveMedianProfiles(root,config) {
  const value={version:1,preferredBasis:'median',profiles:allProfiles(config).filter(p=>p.basis==='median'),
    note:'Original A/B URLs remain immutable. Only effBuy differs; qualification changes here are basis changes, not acquisition outcomes.'};
  const file=path.join(root,'work/priority-search-median-profiles.json'),text=JSON.stringify(value);
  if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)require('./acquisition_retry').atomicWrite(file,value,0);
  return value;
}
module.exports={medianProfile,allProfiles,saveMedianProfiles};
