const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {atomicWrite}=require('./acquisition_retry');
const root=path.join(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
function main() {
  const audit=read('data/source-recovery-audit.json');
  const folder=path.resolve(root,process.argv[2]||'');
  if(!folder.startsWith(path.join(root,'work/recovery-')))throw Error('Verified recovery directory required');
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'recovery-manifest.json'),'utf8'));
  if(String(manifest.workflowRunId)!==String(audit.runId))throw Error('Recovery run mismatch');
  const restored=[];
  for(const file of require('./recover_validated_sources').files) {
    if(!manifest.files.some(row=>row.file===file))continue;
    const original=JSON.parse(cp.execFileSync('git',['show',`${audit.baselineCommit}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:100*1024*1024}));
    const acquired=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));
    if(JSON.stringify(original)!==JSON.stringify(acquired))restored.push(file);
  }
  audit.recoveredSourceFiles=restored.length;
  audit.recoveredFiles=restored;
  audit.recoveryPasses=2;
  audit.restoredFilesNote='restoredFiles is the last import pass; recoveredSourceFiles is cumulative source evidence, not a new HTTP acquisition.';
  audit.outcomes=read('data/operation-improvement-audit.json').counts;
  const jsonLines=file=>fs.readFileSync(path.join(root,file),'utf8').trim().split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const prices=jsonLines('work/logs/price-refresh-20261010-evening.log').at(-1);
  const completion=jsonLines('work/logs/promo-completion-20261010.log').at(-1);
  audit.liveVerification={priceAttempted:prices.attemptedCount,priceConfirmed:prices.refreshedCount,
    priceChanged:prices.changedCount,priceHttpRequests:prices.httpRequests,durationMs:prices.durationMs,
    newUrlMatches:read('data/state-a-url-discovery.json').newLinked,
    newPriceAcquired:completion.newAcquired,newlyAnalyzableFromLiveVerification:0,
    note:'Recovery outcomes include saved scheduled data. URL discovery is not usable-price acquisition. Cardrush source metadata changes are not a successful 403 fetch.'};
  atomicWrite(path.join(root,'data/source-recovery-audit.json'),audit,0);
  console.log(JSON.stringify({recoveredSourceFiles:restored.length,outcomes:audit.outcomes,live:audit.liveVerification}));
}
if(require.main===module)main();
