const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function merge(current,incoming,currentCards,savedCards,points,savedAt,matches=(c,r)=>require('./update_yuyutei_torecacamp').campMatchesCard(c,{title:r.title})) {
  const cards=new Map(currentCards.map(c=>[c.id,c])),oldCards=new Map(savedCards.map(c=>[c.id,c]));
  const rows=new Map(current.map(r=>[r.cardId,r])),admitted=[],rejected=[];
  assert.equal(rows.size,current.length,'duplicate catalog identity');
  assert.equal(new Set(incoming.map(r=>r.cardId)).size,incoming.length,'duplicate saved identity');
  for(const row of incoming) {
    const old=rows.get(row.cardId),c=cards.get(row.cardId),prior=oldCards.get(row.cardId),p=points[row.cardId];
    if(old&&Date.parse(old.observedAt)>=Date.parse(row.observedAt))continue;
    const valid=c?.identityKey&&c.identityKey===prior?.identityKey&&!c.identityReviewRequired
      &&row.identityVerified!==false&&matches(c,row)
      &&!row.cardMismatchSuspected&&!row.priceQuarantined&&!row.identityHoldReason&&row.price>0
      &&typeof row.available==='boolean'&&Number.isFinite(Date.parse(row.observedAt))
      &&Date.parse(row.observedAt)<=Date.parse(savedAt)
      &&/^https:\/\/torecacamp-pokemon\.com\/products\/[^/?#]+$/.test(row.detailUrl||'')
      &&p?.detailUrl===row.detailUrl&&p.observedAt===row.observedAt&&p.torecacampPrice===row.price
      &&p.available===row.available&&p.identityVerified===true&&!p.cardMismatchSuspected&&!p.priceQuarantined&&!p.identityHoldReason
      &&prior.torecacampUrl===row.detailUrl&&(!c.torecacampUrl||c.torecacampUrl===row.detailUrl);
    if(!valid){rejected.push({id:row.cardId,reason:'同一仕様・個別価格/在庫/日時・URLの保存根拠が不足または競合'});continue;}
    rows.set(row.cardId,row);admitted.push({id:row.cardId,newLink:!old,observedAt:row.observedAt,referenceOnly:row.referenceOnly===true});
  }
  return {rows:[...rows.values()],admitted,rejected};
}
function run(folder,root=path.join(__dirname,'..')) {
  folder=path.resolve(folder);
  if(!folder.startsWith(path.resolve(root,'work')+path.sep+'recovery-'))throw Error('Explicit recovery directory required');
  const manifest=require('./audit_saved_domestic_recovery').verify(folder),read=(base,f)=>JSON.parse(fs.readFileSync(path.join(base,f)));
  const cards=read(root,'data/pokemon-cards.json'),savedCards=read(folder,'data/pokemon-cards.json');
  const summary=read(root,'data/torecacamp-stock-summary.json'),incoming=read(folder,'data/torecacamp-stock-summary.json');
  const result=merge(read(root,'work/torecacamp_catalog.json'),read(folder,'work/torecacamp_catalog.json'),cards,savedCards,incoming.cards,manifest.savedAt);
  const byId=new Map(result.rows.map(r=>[r.cardId,r]));
  for(const r of result.admitted){summary.cards[r.id]=incoming.cards[r.id];const c=cards.find(c=>c.id===r.id);if(!c.torecacampUrl)c.torecacampUrl=byId.get(r.id).detailUrl;}
  const progress=read(root,'work/torecacamp_progress.json'),savedProgress=read(folder,'work/torecacamp_progress.json');
  const checkpointRecovered=Date.parse(savedProgress.lastRun?.startedAt)>Date.parse(progress.lastRun?.startedAt||0);
  const outputs=[['work/torecacamp_catalog.json',result.rows],['data/torecacamp-stock-summary.json',summary],['data/pokemon-cards.json',cards]];
  if(checkpointRecovered)outputs.push(['work/torecacamp_progress.json',savedProgress]);
  const backup=path.join(root,'work/logs/camp-saved-recovery',String(manifest.workflowRunId));
  for(const [file]of outputs){const to=path.join(backup,file);if(!fs.existsSync(to)){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}}
  for(const [file,value]of outputs)require('./acquisition_retry').atomicWrite(path.join(root,file),value,0);
  const proof={at:new Date().toISOString(),runId:manifest.workflowRunId,verifiedFiles:manifest.files.length,
    recovered:result.admitted.length,newSourceLinks:result.admitted.filter(r=>r.newLink).length,
    rows:result.admitted,rejected:result.rejected,checkpointRecovered,acquisitionRequests:0,
    note:'保存原票の回収。個別日時/状態区分を保持し、必須不足の解消・分析可能・候補適合は別再判定'};
  if(proof.recovered||proof.checkpointRecovered)require('./acquisition_retry').atomicWrite(path.join(root,'data/camp-saved-recovery.json'),proof,0);
  console.log(JSON.stringify({...proof,rows:undefined,rejected:proof.rejected.length}));return proof;
}
if(require.main===module)run(process.argv[2]);
module.exports={merge,run};
