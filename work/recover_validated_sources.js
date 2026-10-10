const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const snapshots=require('./integrate_saved_snapshots'),{atomicWrite}=require('./acquisition_retry');
const root=path.join(__dirname,'..');
const files=['data/pokemon-cards.json','data/pokemon-cards-meta.json','data/shop-buyback-summary.json','data/hareruya2-stock-summary.json',
  'data/priority-price-execution.json','data/price-catchup-status.json','work/price-catchup-history.json',
  'work/hareruya2_catalog.json','work/hareruya2_stock_history.json','work/candidate-shop-refresh.json',
  'work/priority-price-checkpoint.json','work/priority-price-http-cache.json','work/source-update-runs.json','work/source-update-history.json',
  'work/shop_buyback_history.json','work/shop_buyback_catalog.json','work/shop_buyback_unmatched.json','work/shop_buyback_item_matches.json',
  'work/shop_buyback_image_matches.json','work/shop_buyback_quarantine.json','work/daily-http-cache.json','work/toreca-source-inventory.json',
  'work/toreca_source_diff.json','work/card-new-arrivals.json','work/card-lifecycle.json','work/changed-card-ids.json'];
function main() {
  const folder=path.resolve(root,process.argv[2]||''),base=process.argv[3];
  if(!folder.startsWith(path.join(root,'work/recovery-'))||!base||!/^[a-f0-9]{7,40}$/.test(base))throw Error('Explicit recovery directory/base required');
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'recovery-manifest.json')));
  for(const row of manifest.files) {
    if(!/^(data|work)\/[a-zA-Z0-9_/.-]+\.json$/.test(row.file)||row.file.includes('..'))throw Error('Invalid archive path');
    const bytes=fs.readFileSync(path.join(folder,row.file));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Archive hash mismatch: '+row.file);
    JSON.parse(bytes);
  }
  const results=[],pending=[];
  for(const file of files) {
    const metadata=manifest.files.find(row=>row.file===file);
    if(!metadata)continue;
    const acquired=JSON.parse(fs.readFileSync(path.join(folder,file))),current=JSON.parse(fs.readFileSync(path.join(root,file)));
    const original=JSON.parse(cp.execFileSync('git',['show',`${base}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:100*1024*1024}));
    let merged;
    if(file==='data/pokemon-cards.json')merged=snapshots.mergeRows(original,current,acquired,'id');
    else if(file==='work/hareruya2_catalog.json')merged=snapshots.mergeRows(original,current,acquired,'cardId');
    else if(file==='work/hareruya2_stock_history.json')merged=snapshots.mergeHistory(original,current,acquired);
    else merged=snapshots.merge(original,current,acquired,file);
    const changedFromBase=!snapshotsSame(original,acquired);
    if(snapshotsSame(current,merged))results.push({file,status:'unchanged',changedFromBase});
    else {pending.push([file,merged]);results.push({file,status:'recovered',changedFromBase});}
  }
  // Verify all merge conflicts first. No partial source import if a concurrent value conflicts.
  for(const [file,data]of pending)atomicWrite(path.join(root,file),data,0);
  const result={version:1,checkedAt:new Date().toISOString(),runId:manifest.workflowRunId,baselineCommit:base,
    verifiedFiles:manifest.files.length,results,restoredFiles:pending.length,recoveredSourceFiles:results.filter(r=>r.changedFromBase).length,newHttpRequests:0,
    publicationStatus:'保存済み・必須検証と公開照合待ち',normalDataPreserved:true,llmCalls:0,codexCalls:0};
  atomicWrite(path.join(root,'data/source-recovery-audit.json'),result,0);console.log(JSON.stringify(result));
}
function snapshotsSame(a,b){return JSON.stringify(a)===JSON.stringify(b);}
if(require.main===module)main();
module.exports={files};
