const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),dir=path.join(root,'work/current-guide-merge-stages/20261026-failed-logs/');
const zip=fs.readFileSync(path.join(dir,'monitor-40234562359.zip'));
assert.equal(crypto.createHash('sha256').update(zip).digest('hex'),'e5a9d3e13e17ac0cfaede978fc8cadca58318ea6d7225447c1eb8e74f4ca0e60');
const entries=require('./restore_price_artifact').zipEntries(zip),manifestEntry=[...entries].find(([k])=>k.endsWith('/recovery-manifest.json'));
const manifest=JSON.parse(manifestEntry[1]());assert.equal(String(manifest.workflowRunId),'40234562359');assert.equal(manifest.invalidJson.length,0);
function raw(file){const proof=manifest.files.find(r=>r.file===file);const get=entries.get(manifestEntry[0].replace(/recovery-manifest.json$/,'')+file);assert(get);const body=get();assert.equal(crypto.createHash('sha256').update(body).digest('hex'),proof.sha256);return JSON.parse(body);}
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p))),write=(p,x)=>require('./acquisition_retry').atomicWrite(path.join(root,p),x,0);
const file='work/hareruya2_catalog.json',cards=new Map(read('data/pokemon-cards.json').map(c=>[c.id,c]));
const result=require('./recover_saved_shop_rows').mergeRows(read(file),raw(file),cards,'hareruya2');
write(file,result.rows);require('./recover_saved_shop_rows').project(root,result.changes);
const historyFile='work/hareruya2_stock_history.json',history=read(historyFile),saved=raw(historyFile),points=[];
for(const c of result.changes){
  const day=new Date(Date.parse(c.after.observedAt)+9*3600000).toISOString().slice(0,10),i=history.dates.indexOf(day),j=saved.dates.indexOf(day),v=saved.stocks?.[c.id]?.[j];
  if(i<0||j<0||!Number.isInteger(v)||v<0||v!==c.after.stock)continue;
  history.stocks[c.id]??=Array(history.dates.length).fill(null);
  points.push({id:c.id,day,before:history.stocks[c.id][i]??null,after:v,observedAt:c.after.observedAt});history.stocks[c.id][i]=v;
}
write(historyFile,history);require('./stock_history_statistics').reconcile(root);
const report={at:new Date().toISOString(),baseline:'a3b528998',sourceRun:40234562359,sourceRequests:0,archiveHashVerified:true,
  changed:result.changes.length,available:result.changes.filter(c=>c.after.available).length,priceChanges:result.changes.filter(c=>c.before?.price!==c.after.price).length,
  ids:result.changes.map(c=>({id:c.id,observedAt:c.after.observedAt})),stockPoints:points,rejected:result.rejected,
  preservedNewerGlaceon:result.rows.find(r=>r.cardId==='pk-20743').observedAt==='2026-10-26T00:37:06.087Z'};
write('work/20261026-glaceon-final-recovery.json',report);
console.log({changed:report.changed,available:report.available,priceChanges:report.priceChanges,stockPoints:points.length,preservedNewerGlaceon:report.preservedNewerGlaceon});
