const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const csv=require('./gemrate_csv_import'),{receive}=require('./gemrate_private_store');
const ROOT=path.resolve(__dirname,'..'),PRIVATE=path.resolve(ROOT,'..','private-research');
const STORE=path.join(PRIVATE,'gemrate');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=n=>JSON.parse(fs.readFileSync(path.join(PRIVATE,n),'utf8'));
function cells(text) {
  const lines=text.split('\n').filter(Boolean);
  if(lines[0]!=='trending_up')return null;
  return {'Card #':lines[1],Name:lines[2].replace(/ open_in_new$/,''),Parallel:lines[3],Gems:csv.count(lines[4]),Total:csv.count(lines[5])};
}
function records(text) {
  const a=csv.parseCsv(text),h=a.shift();return a.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
}
function context(proof,proofFile) {
  const page=proof.pageUrl?new URL(proof.pageUrl):new URL(proof.rows[0].links[0].url);
  page.pathname='/item-details';for(const k of ['card_number','name','parallel'])page.searchParams.delete(k);
  return {grader:proof.grader.toUpperCase(),language:'Japanese',set:proof.set,year:Number(proof.year),
    sourceUpdatedDate:proof.updated,retrievedAt:proof.capturedAt||proof.reviewedAt,pageUrl:page.href,
    contextProof:'sha256:'+sha(fs.readFileSync(path.join(PRIVATE,proofFile))),
    dateBasis:'GemRate source page Updated; never file creation/modification time'};
}
function run() {
  const prior=read('gemrate-public-review-20261023.json'),current=read('gemrate-page-20261024.json'),trend=read('gemrate-trend-page-20261024.json');
  const cards=new Map(require('../data/pokemon-cards.json').map(c=>[c.id,c]));
  const contexts=[context(prior,'gemrate-public-review-20261023.json'),context(current,'gemrate-page-20261024.json')];
  const mappings=prior.identityReview.map(r=>{
    assert(r.unique&&r.catalogIds.length===1&&r.language==='Japanese'&&r.set==='S6a'&&r.specification==='V SR SA');
    const card=cards.get(r.catalogIds[0]);assert(card?.identityKey&&/\bSR\b.*SA/.test(card.name)&&card.name.includes('S6a '+r.number+'/069'));
    const source=prior.rows.map(r=>new URL(r.links[0].url)).find(u=>u.searchParams.get('card_number')===r.number);
    const row={'Card #':r.number,Name:source.searchParams.get('name'),Parallel:source.searchParams.get('parallel')};
    return {key:csv.key(row,contexts[0]),cardId:card.id,identityKey:card.identityKey,
      specEvidence:contexts[0].contextProof+':verified-identity-review',hold:r.number===trend.number,
      holdReason:r.number===trend.number?'set-list-versus-trend-count-discrepancy':null};
  });
  const manifest=fs.existsSync(path.join(STORE,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(STORE,'manifest.json'))):{files:[]};
  const source=name=>path.join(os.homedir(),'Downloads',name);
  const content=name=>fs.readFileSync(fs.existsSync(source(name))?source(name):manifest.files.find(r=>r.originalName===name)?.storedPath,'utf8');
  const names=['export (1).csv','export (2).csv'],lists=names.map(n=>records(content(n)));
  const checked=lists.map((rows,i)=>{
    const visible=(i?current:prior).rows.map(r=>cells(r.text)).filter(Boolean);
    let verified=0;
    for(const map of mappings) {
      const actual=rows.find(r=>csv.key(r,contexts[i])===map.key),proof=visible.find(r=>csv.key(r,contexts[i])===map.key);
      assert(actual&&proof,'Each reviewed card must have a matching visible-page row');
      assert.equal(csv.count(actual.Gems),proof.Gems);assert.equal(csv.count(actual.Total),proof.Total);verified++;
    }
    if(i===1) {
      const headings=current.headings.join(' '),gems=rows.reduce((n,r)=>n+csv.count(r.Gems),0),total=rows.reduce((n,r)=>n+csv.count(r.Total),0);
      assert(headings.includes(gems.toLocaleString('en-US'))&&headings.includes(total.toLocaleString('en-US')),'Latest complete CSV totals must match the PSA set page');
    }
    return verified;
  });
  assert.equal(lists[0].length,121);assert.equal(lists[1].length,121);
  const trendRows=records(content('export.csv')),byDay=new Map(trendRows.map(r=>[r.Date,r]));
  let trendVisibleMatches=0;
  for(const text of trend.rows) {
    const [date,gems,total]=text.split('\n');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const row=byDay.get(date);assert(row);assert.equal(csv.count(row['Total Gems']),csv.count(gems));assert.equal(csv.count(row['Total Grades']),csv.count(total));trendVisibleMatches++;
  }
  assert(trendVisibleMatches>0);assert.equal(trendRows.length,53);
  const trendContext={...contexts[1],pageUrl:trend.pageUrl,sourceUpdatedDate:trend.updated,
    retrievedAt:trend.capturedAt,contextProof:'sha256:'+sha(fs.readFileSync(path.join(PRIVATE,'gemrate-trend-page-20261024.json')))};
  const result=receive({store:STORE,files:[...names.map((n,i)=>({path:source(n),kind:'list',context:contexts[i],mappings})),
    {path:source('export.csv'),kind:'trend',context:trendContext,mappings}]});
  const acceptedIds=new Set(result.files.flatMap(r=>JSON.parse(fs.readFileSync(r.parsedPath,'utf8')).accepted.map(row=>row.cardId)));
  const heldIds=new Set(mappings.filter(r=>r.hold).map(r=>r.cardId));
  const report={verifiedAt:new Date().toISOString(),realFiles:3,listRows:lists.map(r=>r.length),trendPoints:trendRows.length,
    exactReviewedIdentities:mappings.length,verifiedRowsBySnapshot:checked,acceptedIndependentCards:acceptedIds.size,
    acceptedPrivateObservations:result.files.reduce((n,r)=>n+r.accepted,0),trendVisibleMatches,
    changedListRows:lists[0].filter(a=>{const b=lists[1].find(b=>b['Card #']===a['Card #']&&b.Name===a.Name&&b.Parallel===a.Parallel);return !b||b.Gems!==a.Gems||b.Total!==a.Total;}).length,
    distinctFileHashes:new Set(result.files.map(r=>r.sha256)).size,receipts:result.files,
    discrepancy:{cardId:mappings.find(m=>m.hold).cardId,status:'held',reason:'same published Updated date does not establish matching set/trend snapshots; exact cause unresolved'},
    newPrivateObservations:result.newPrivateObservations,
    newOfficialObservations:0,newAnalyzable:0,publicRecords:0,publicationAllowed:false};
  fs.writeFileSync(path.join(STORE,'verification-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({realFiles:3,listRows:report.listRows,trendPoints:53,verifiedIdentities:report.exactReviewedIdentities,
    acceptedPrivateObservations:report.acceptedPrivateObservations,acceptedIndependentCards:report.acceptedIndependentCards,heldCard:heldIds.size,
    changedListRows:report.changedListRows,distinctFiles:report.distinctFileHashes,
    newPrivateObservations:report.newPrivateObservations,publicRecords:0,newOfficialObservations:0}));
  return report;
}
if(require.main===module)run();
module.exports={run,cells,records};
