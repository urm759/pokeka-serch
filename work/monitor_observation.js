const fs=require('node:fs'),path=require('node:path');
const {atomicWrite}=require('./acquisition_retry');
const read=(root,file)=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return {};}};
function record(root,status,extra={}) {
  const previous=read(root,'data/monitor-observation.json');
  const now=new Date().toISOString();
  const result={...previous,version:1,status,lastAttemptAt:now,runId:process.env.GITHUB_RUN_ID||null,
    url:process.env.GITHUB_RUN_ID?`https://github.com/urm759/pokeka-serch/actions/runs/${process.env.GITHUB_RUN_ID}`:null,
    llmCalls:0,codexCalls:0,...extra};
  if(status==='observed')result.lastSuccessAt=now;
  atomicWrite(path.join(root,'data/monitor-observation.json'),result);
  return result;
}
function banner(root) {
  const health=read(root,'data/update-health.json'),status=read(root,'data/update-status.json');
  const observation=read(root,'data/monitor-observation.json');
  const monitoring=Object.fromEntries(['status','lastAttemptAt','lastSuccessAt','runId','url','error'].filter(key=>observation[key]!=null).map(key=>[key,observation[key]]));
  const result={version:1,generatedAt:new Date().toISOString(),sourceLastSuccessAt:status.sources?.toreca?.lastSuccessAt||null,
    monitoring,
    issues:(health.issues||[]).map(row=>({key:row.key,category:row.category,url:row.url,reason:String(row.reason||'').split('\n')[0].slice(0,650)})),
    reasons:health.reasons?.map(reason=>String(reason).split('\n')[0].slice(0,650))||[],
    detailUrl:'./data/update-health.json'};
  atomicWrite(path.join(root,'data/update-health-banner.json'),result);
  return result;
}
module.exports={record,banner};
