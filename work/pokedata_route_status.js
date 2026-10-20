const fs=require('node:fs'),path=require('node:path'),access=require('./overseas_access_policy');
const root=path.resolve(__dirname,'..'),policy=access.read(root);
const status={version:1,checkedAt:new Date().toISOString(),source:'pokedata-official-api',
  status:access.allowed(root)?'private-api-not-scheduled':'permission-wait',
  reason:policy?.reason||'用途・API権限の確認待ち',legacyWebsiteAcquisition:'stopped',
  httpRequests:0,newAcquired:0,checkpointPreserved:true,privatePipelineImplemented:true,
  privatePipelineRun:'許諾・契約・予算確認後にローカルのみ。公開取得経路とは別',
  publicPricesAllowed:access.allowed(root,'public'),llmCalls:0,codexCalls:0};
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'POKEDATA_API_READY=0\nPOKEDATA_SET_READY=0\n');
fs.writeFileSync(path.join(root,'data/pokedata-route-status.json'),JSON.stringify(status));
console.log(JSON.stringify(status));
