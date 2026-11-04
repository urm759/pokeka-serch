const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function build(root=path.resolve(__dirname,'..'),store=path.resolve(root,'../private-research/gemrate')){
  if(!require('./gemrate_private_store').outside(fs.realpathSync(root),fs.realpathSync(store)))throw Error('Private package destination required');
  const source=path.join(root,'work/gemrate-collector-extension'),dest=path.join(store,'collector-extension');fs.mkdirSync(dest,{recursive:true});const files={};
  for(const f of fs.readdirSync(source)){const bytes=fs.readFileSync(path.join(source,f));fs.writeFileSync(path.join(dest,f),bytes);files[f]=crypto.createHash('sha256').update(bytes).digest('hex');}
  // Packaging cannot observe Chrome installation or the popup's enabled state.
  // Never overwrite a user's installation/runtime evidence with a build-time false.
  const result={at:new Date().toISOString(),installationState:'not-observed-by-builder',enabledState:'not-observed-by-builder',files};require('./acquisition_retry').atomicWrite(path.join(store,'collector-package-proof.json'),result,0);return {path:dest,...result};
}
if(require.main===module)console.log(JSON.stringify(build()));module.exports={build};
