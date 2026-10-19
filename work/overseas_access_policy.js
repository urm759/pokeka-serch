const fs=require('node:fs'),path=require('node:path');
function read(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data/overseas-access-policy.json'),'utf8'));}catch{return null;}}
function allowed(root,phase='internal'){
  const p=read(root);return p?.version===1&&typeof p.permissionEvidence==='string'&&p.permissionEvidence.trim().length>0
    &&p[phase==='public'?'publicPricesAllowed':'internalAnalysisAllowed']===true;
}
function assertInternal(root){if(!allowed(root))throw Object.assign(Error('PokeDATA permission-wait: 仕入れ分析用途・API権限の確認待ち。取得0・保存済み原票保持'),{code:'POKEDATA_PERMISSION_REQUIRED'});}
function privatePath(root,relative){
  const base=path.resolve(root,'.private','overseas'),file=path.resolve(base,relative);
  if(!file.startsWith(base+path.sep))throw Error('Private overseas path escaped');return file;
}
module.exports={read,allowed,assertInternal,privatePath};
