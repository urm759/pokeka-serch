const fs=require('node:fs'),path=require('node:path');
function read(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data/overseas-access-policy.json'),'utf8'));}catch{return null;}}
function cancelled(root){const p=read(root);return p?.cancelledByUser===true||p?.status==='cancelled';}
function allowed(root,phase='internal'){
  if(cancelled(root))return false;
  if(phase==='internal'){
    try{
      const grant=JSON.parse(fs.readFileSync(privatePath(root,'api/permission.json'),'utf8'));
      if(grant.version===1&&grant.internalAnalysisAllowed===true&&grant.apiSubscriptionConfirmed===true
        &&typeof grant.permissionEvidence==='string'&&grant.permissionEvidence.trim()
        &&Number.isFinite(Date.parse(grant.reviewedAt))
        &&(!grant.expiresAt||Date.parse(grant.expiresAt)>Date.now()))return true;
    }catch{}
  }
  const p=read(root);return p?.version===1&&typeof p.permissionEvidence==='string'&&p.permissionEvidence.trim().length>0
    &&p[phase==='public'?'publicPricesAllowed':'internalAnalysisAllowed']===true;
}
function assertInternal(root){if(cancelled(root))throw Object.assign(Error('PokeDATA user-cancelled: 利用者判断で中止。取得/分析0・保存済み原票保持'),{code:'POKEDATA_CANCELLED'});if(!allowed(root))throw Object.assign(Error('PokeDATA permission-wait: 仕入れ分析用途・API権限の確認待ち。取得0・保存済み原票保持'),{code:'POKEDATA_PERMISSION_REQUIRED'});}
function privatePath(root,relative){
  const base=path.resolve(root,'.private','overseas'),file=path.resolve(base,relative);
  if(!file.startsWith(base+path.sep))throw Error('Private overseas path escaped');return file;
}
module.exports={read,allowed,assertInternal,privatePath,cancelled};
