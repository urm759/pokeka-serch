// Offline, bounded projection of already reviewed factual counts. No acquisition or calculation inputs.
const fs=require('node:fs'),path=require('node:path');
const {reference}=require('./gemrate_reference_display');
const ROOT=path.resolve(__dirname,'..');
function build(root=ROOT,store=path.resolve(root,'../private-research/gemrate')) {
  const report=JSON.parse(fs.readFileSync(path.join(store,'expanded-verification-report.json')));
  if(report.acceptedCards!==50||report.discrepancyHeldCards!==1)throw Error('Reviewed scope changed; a new publication review is required');
  const catalog=new Map(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'))).map(c=>[c.id,c]));
  const latest=new Map();
  for(const output of report.outputs) {
    const parsed=JSON.parse(fs.readFileSync(output.path));
    if(parsed.csvSha256!==output.sha256||parsed.accepted.length!==output.accepted)throw Error('Reviewed receipt mismatch');
    for(const row of parsed.accepted) {
      const card=catalog.get(row.cardId),value=card&&reference(card,row,{audience:'private-preview'});
      if(!value?.available)throw Error('Unproven reference identity/date/counts');
      const old=latest.get(card.id);
      if(old?.sourceUpdatedDate===row.sourceUpdatedDate&&(old.psa10!==row.psa10||old.total!==row.total))throw Error('Conflicting counts on same source date');
      if(!old||row.sourceUpdatedDate>old.sourceUpdatedDate)latest.set(card.id,row);
    }
  }
  if(latest.size!==50)throw Error('Limited publication must contain exactly the reviewed 50 identities');
  const reviewed=new Set(latest.keys());
  const additions=require('./gemrate_reviewed_additions').entries(root);
  for(const entry of additions)reviewed.add(entry.cardId);
  const manifestFile=path.join(store,'manifest.json');
  if(fs.existsSync(manifestFile)) {
    const crypto=require('node:crypto'),zlib=require('node:zlib'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
    const storage=require('./gemrate_private_store'),inbox=require('./gemrate_private_inbox');
    const manifest=JSON.parse(fs.readFileSync(manifestFile));
    for(const receipt of manifest.files||[]) {
      const sidecarFile=receipt.originalPath+'.context.json';
      if(receipt.kind!=='list'||receipt.status==='prepared'||!fs.existsSync(sidecarFile))continue;
      for(const file of [receipt.storedPath,receipt.parsedPath,receipt.backupPath])if(storage.outside(fs.realpathSync(store),fs.realpathSync(file)))throw Error('Private inbox receipt escapes store');
      const raw=fs.readFileSync(receipt.storedPath),sidecar=JSON.parse(fs.readFileSync(sidecarFile));
      inbox.validate(sidecar,raw,store);
      if(hash(raw)!==receipt.sha256||hash(zlib.gunzipSync(fs.readFileSync(receipt.backupPath)))!==receipt.sha256)throw Error('Inbox original/backup hash mismatch');
      const parsed=JSON.parse(fs.readFileSync(receipt.parsedPath));
      if(parsed.csvSha256!==receipt.sha256||parsed.accepted.length!==receipt.accepted)throw Error('Inbox parsed receipt mismatch');
      for(const row of parsed.accepted) {
        if(!reviewed.has(row.cardId))continue; // New identities need a separate publication review.
        if(row.csvSha256!==receipt.sha256||row.contextProof!==sidecar.context.contextProof||row.sourceUpdatedDate!==sidecar.context.sourceUpdatedDate||row.pageUrl!==sidecar.context.pageUrl)throw Error('Inbox row/page/date mismatch');
        const card=catalog.get(row.cardId),value=card&&reference(card,row,{audience:'private-preview'});
        if(!value?.available)throw Error('Inbox identity/date/counts unproven');
        const old=latest.get(row.cardId);
        if(additions.some(r=>r.cardId===row.cardId)){
          const spec=JSON.parse(row.specEvidence);
          if(spec.rule!=='reviewed-exact-identity-v1'||JSON.stringify(spec.review)!==JSON.stringify(additions.find(r=>r.cardId===row.cardId)))throw Error('Addition review mismatch');
          const identity=JSON.parse(row.identity);
          const checked=require('./gemrate_reviewed_additions').mappings([{'Card #':identity[3],Name:identity[4],Parallel:identity[5]}],sidecar.context,[card],additions);
          if(checked.length!==1||checked[0].cardId!==row.cardId)throw Error('Addition identity review mismatch');
        }
        if(old?.sourceUpdatedDate===row.sourceUpdatedDate&&(old.psa10!==row.psa10||old.total!==row.total))throw Error('Conflicting counts on same source date');
        if(!old||row.sourceUpdatedDate>old.sourceUpdatedDate)latest.set(row.cardId,row);
      }
    }
  }
  const cards=Object.fromEntries([...latest].sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>
    [id,[r.identityKey,r.psa10,r.total,r.sourceUpdatedDate,r.pageUrl]]));
  const result={version:2,source:'GemRate',grader:'PSA',scope:'reviewed-csv-reference',
    fields:['identityKey','psa10','total','sourceDate','sourceUrl'],cards};
  // No original CSV, history, receipt metadata, private paths, or adopted rates are exported.
  const target=path.join(root,'data/gemrate-reference-summary.json');
  const previous=fs.existsSync(target)?JSON.parse(fs.readFileSync(target)):null;
  const updatedReferences=Object.entries(cards).filter(([id,r])=>JSON.stringify(previous?.cards?.[id])!==JSON.stringify(r)).length;
  if(updatedReferences)require('./acquisition_retry').atomicWrite(target,result,0);
  return {updatedReferences,publishedReferences:latest.size,calculationAdopted:0,sourceAcquisitions:0,newObservations:0,
    bytes:fs.statSync(target).size,dates:[...new Set([...latest.values()].map(r=>r.sourceUpdatedDate))]};
}
function refreshIfAvailable(root=ROOT,store=path.resolve(root,'../private-research/gemrate')) {
  if(!fs.existsSync(path.join(store,'expanded-verification-report.json')))return {status:'private-store-unavailable',sourceAcquisitions:0};
  try{return {status:'validated',...build(root,store)};}
  catch(e){return {status:'held',reason:'GemRate保存CSV・照合・日時・版の検証停止',errorCode:e.code||'REFERENCE_VALIDATION',previousRetained:true,sourceAcquisitions:0};}
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build,refreshIfAvailable};
