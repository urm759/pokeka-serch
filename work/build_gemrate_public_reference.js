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
  const cards=Object.fromEntries([...latest].sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>
    [id,[r.identityKey,r.psa10,r.total,r.sourceUpdatedDate,r.pageUrl]]));
  const result={version:1,source:'GemRate',grader:'PSA',scope:'received-csv-reference-50',
    fields:['identityKey','psa10','total','sourceDate','sourceUrl'],cards};
  // No original CSV, history, receipt metadata, private paths, or adopted rates are exported.
  const target=path.join(root,'data/gemrate-reference-summary.json');
  fs.writeFileSync(target,JSON.stringify(result));
  return {publishedReferences:latest.size,calculationAdopted:0,sourceAcquisitions:0,newObservations:0,
    bytes:fs.statSync(target).size,dates:[...new Set([...latest.values()].map(r=>r.sourceUpdatedDate))]};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build};
