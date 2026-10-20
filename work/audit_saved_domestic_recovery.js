const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify(folder){
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'recovery-manifest.json')));
  for(const row of manifest.files){
    const file=path.resolve(folder,row.file);
    if(!/^(data|work)\/[a-zA-Z0-9_/.-]+\.json$/.test(row.file)||row.file.includes('..')||!file.startsWith(path.resolve(folder)+path.sep))throw Error('Unsafe recovery path');
    const bytes=fs.readFileSync(file);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Recovery hash mismatch: '+row.file);
    JSON.parse(bytes);
  }
  return manifest;
}
function compare(saved,current,records){
  const incoming=new Map(saved.map(r=>[r.cardId,r])),existing=new Map(current.map(r=>[r.cardId,r]));
  return records.filter(r=>r.status==='verified').map(record=>{
    const a=incoming.get(record.id),b=existing.get(record.id);
    const valid=a?.observedAt===record.confirmedAt&&a?.detailUrl===record.url&&a?.identityVerified===true&&a?.state==='A'&&a?.price>0;
    const alreadySaved=valid&&b?.detailUrl===a.detailUrl&&b.identityVerified===true&&b.state==='A'&&Number.isFinite(b.price)&&b.price>0
      &&!b.priceQuarantined&&!b.cardMismatchSuspected&&b.conditionAccepted!==false
      &&Number.isFinite(Date.parse(b.observedAt))&&Date.parse(b.observedAt)>=Date.parse(a.observedAt);
    return {id:record.id,originalAt:a?.observedAt||null,currentAt:b?.observedAt||null,status:!valid?'original-evidence-insufficient':alreadySaved?'equal-or-newer-saved':'review-for-recovery'};
  });
}
function run(folder,root=path.join(__dirname,'..')){
  folder=path.resolve(folder);
  if(!folder.startsWith(path.resolve(root,'work')+path.sep+'recovery-'))throw Error('Explicit recovery directory required');
  const manifest=verify(folder),read=(base,file)=>JSON.parse(fs.readFileSync(path.join(base,file)));
  const rows=compare(read(folder,'work/hareruya2_catalog.json'),read(root,'work/hareruya2_catalog.json'),read(folder,'work/candidate-shop-refresh.json').sources.hareruya2.records);
  const result={at:new Date().toISOString(),runId:manifest.workflowRunId,verifiedFiles:manifest.files.length,
    verifiedPurchaseRecords:rows.length,alreadySaved:rows.filter(r=>r.status==='equal-or-newer-saved').length,
    pending:rows.filter(r=>r.status!=='equal-or-newer-saved'),rows,restoredRecords:0,newHttpRequests:0,
    note:'原票全件SHA/JSON検証。現行の同じURL/状態Aが同日時以上なら再取得/上書きしない。他の原票・メタデータの統合完了とは別'};
  const report=read(root,'data/source-recovery-audit.json');report.savedDomesticValidation=result;
  require('./acquisition_retry').atomicWrite(path.join(root,'data/source-recovery-audit.json'),report,0);
  return result;
}
if(require.main===module)console.log(JSON.stringify(run(process.argv[2])));
module.exports={verify,compare,run};
