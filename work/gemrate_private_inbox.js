// Consume locally received files only. No browser/API/HTTP, publication or official data changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const csv=require('./gemrate_csv_import'),matcher=require('./gemrate_identity_match'),storage=require('./gemrate_private_store');
const ROOT=path.resolve(__dirname,'..'),STORE=path.resolve(ROOT,'..','private-research/gemrate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validate(sidecar,bytes,store) {
  const privateRoot=fs.realpathSync(path.dirname(store)),proofFile=fs.realpathSync(path.resolve(store,sidecar.proofFile));
  const rel=path.relative(privateRoot,proofFile);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Source proof must remain in private storage');
  const proofBytes=fs.readFileSync(proofFile),proof=JSON.parse(proofBytes),context=sidecar.context;
  if(sidecar.csvSha256!==sha(bytes)||context?.contextProof!=='sha256:'+sha(proofBytes)
    ||proof.grader?.toLowerCase()!=='psa'||proof.set!==context.set||Number(proof.year)!==context.year
    ||proof.updated!==context.sourceUpdatedDate||context.language!=='Japanese')throw Error('CSV/page context evidence mismatch');
  const oldProof=JSON.parse(fs.readFileSync(path.resolve(store,'..','gemrate-public-review-20261023.json')));
  const sets=new Set(oldProof.identityReview.map(r=>r.set));
  if(sets.size!==1||oldProof.set!==context.set||oldProof.year!=context.year)throw Error('Set identity has not been reviewed');
  return {context,setCode:[...sets][0],denominator:69};
}
function run(store=STORE) {
  if(!storage.outside(ROOT,fs.realpathSync(store)))throw Error('Nonpublic store required');
  const release=require('./acquisition_retry').lock(path.join(store,'.inbox.lock'));
  try {
  const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'data/pokemon-cards.json'))),english=JSON.parse(fs.readFileSync(path.join(ROOT,'work/snkr_english_names.json'))).cards;
  const incoming=path.join(store,'incoming'),rows=[];
  // A new CSV requires its own original page evidence and SHA-bound sidecar. Never infer a date from file time.
  for(const name of fs.readdirSync(incoming).filter(n=>/^export(?: \(\d+\))?\.csv$/i.test(n))) {
    const file=path.join(incoming,name),meta=file+'.context.json';
    if(!fs.existsSync(meta)){rows.push({name,status:'review',reason:'source-context-missing'});continue;}
    try {
      const bytes=fs.readFileSync(file),sidecar=JSON.parse(fs.readFileSync(meta)),v=validate(sidecar,bytes,store);
      const cells=csv.parseCsv(bytes.toString('utf8')),headers=cells.shift(),source=cells.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
      const prior=JSON.parse(fs.readFileSync(path.join(store,'verification-report.json')));
      const held=prior.receipts.filter(r=>r.kind==='list').flatMap(r=>JSON.parse(fs.readFileSync(r.parsedPath)).quarantined.filter(q=>q.reason==='source-discrepancy-hold').map(q=>q.identity));
      const matches=matcher.resolve(source,v.context,catalog,english,{...v,contextProof:v.context.contextProof,heldKeys:held});
      if(storage.outside(store,fs.realpathSync(file)))throw Error('Inbox original escapes private store');
      const expanded=path.join(store,'expanded-verification-report.json');
      const previousObservations=fs.existsSync(expanded)?JSON.parse(fs.readFileSync(expanded)).outputs.flatMap(r=>{
        if(storage.outside(store,fs.realpathSync(r.path)))throw Error('Expanded observation path escapes private store');
        return JSON.parse(fs.readFileSync(r.path)).accepted;
      }):[];
      const result=storage.receive({store,previousObservations,files:[{path:file,kind:'list',context:v.context,mappings:matches.mappings}]});
      rows.push({name,status:'imported-private',accepted:result.newPrivateObservations,held:result.files[0].quarantined,sha256:result.files[0].sha256});
    } catch(e) {rows.push({name,status:'review',reason:e.message});}
  }
  const result={at:new Date().toISOString(),stage:'offline-received-csv-import',files:rows,newPrivateObservations:rows.reduce((n,r)=>n+(r.accepted||0),0),
    httpRequests:0,publicRecords:0,officialPopUpdates:0,llmCalls:0,codexCalls:0,
    status:rows.some(r=>r.status==='review')?'review':rows.length?'imported':'no-received-files'};
  fs.writeFileSync(path.join(store,'last-inbox-run.json.tmp'),JSON.stringify(result,null,2));fs.renameSync(path.join(store,'last-inbox-run.json.tmp'),path.join(store,'last-inbox-run.json'));
  console.log(JSON.stringify(result));return result;
  } finally {release();}
}
if(require.main===module)run();
module.exports={validate,run};
