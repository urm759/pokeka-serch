// Consume locally received files only. No browser/API/HTTP, publication or official data changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const csv=require('./gemrate_csv_import'),matcher=require('./gemrate_identity_match'),storage=require('./gemrate_private_store');
const ROOT=path.resolve(__dirname,'..'),STORE=process.env.GEMRATE_PRIVATE_STORE||path.resolve(ROOT,'..','private-research/gemrate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function pendingFiles(store,reviewRevision=null) {
  const incoming=path.join(store,'incoming'),manifestFile=path.join(store,'manifest.json');
  const manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):{files:[]};
  const prepared=new Map(manifest.files.filter(r=>r.status==='prepared'&&path.dirname(r.originalPath)===incoming).map(r=>[path.basename(r.originalPath),r]));
  if(reviewRevision){
    const latest=new Map(manifest.files.filter(r=>r.kind==='list'&&path.dirname(r.originalPath)===incoming).map(r=>[r.originalPath,r]));
    for(const r of latest.values()){
      const revision=typeof reviewRevision==='function'?reviewRevision(r.context):reviewRevision;
      if(r.reviewRevision!==revision&&fs.existsSync(r.originalPath+'.context.json'))prepared.set(path.basename(r.originalPath),r);
    }
  }
  return [...new Set([...fs.readdirSync(incoming),...prepared.keys()])].filter(n=>/^export(?: \(\d+\))?\.csv$/i.test(n)).map(name=>({name,prepared:prepared.get(name)}));
}
function validate(sidecar,bytes,store,root=ROOT) {
  const privateRoot=fs.realpathSync(path.dirname(store)),proofFile=fs.realpathSync(path.resolve(store,sidecar.proofFile));
  const rel=path.relative(privateRoot,proofFile);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Source proof must remain in private storage');
  const proofBytes=fs.readFileSync(proofFile),proof=JSON.parse(proofBytes),context=sidecar.context;
  if(sidecar.csvSha256!==sha(bytes)||context?.contextProof!=='sha256:'+sha(proofBytes)
    ||proof.csvSha256&&proof.csvSha256!==sidecar.csvSha256
    ||proof.grader?.toLowerCase()!=='psa'||proof.set!==context.set||Number(proof.year)!==context.year
    ||proof.updated!==context.sourceUpdatedDate||context.language!=='Japanese')throw Error('CSV/page context evidence mismatch');
  const scopeFile=path.join(root,'work/gemrate-reviewed-sets.json');
  const scope=fs.existsSync(scopeFile)?JSON.parse(fs.readFileSync(scopeFile)):null;
  if(scope&&(scope.version!==1||!Array.isArray(scope.sets)))throw Error('Invalid reviewed set registry');
  const matches=(scope?.sets||[]).filter(s=>s.set===context.set&&s.year===context.year);
  if(matches.length){
    const s=matches[0];
    if(matches.length!==1||s.language!=='Japanese'||s.grader!=='PSA'||!s.setCode||(!(Number.isInteger(s.denominator)&&s.denominator>0)&&!matcher.promoScope(s))
      ||!s.reviewedAt||!s.officialSetUrl?.startsWith('https://www.pokemon-card.com/')
      ||proof.url!==context.pageUrl||proof.category!=='tcg-cards'||proof.language!=='Japanese')throw Error('Set identity has not been reviewed');
    csv.validateContext(context,'/item-details');
    const rows=csv.parseCsv(bytes.toString('utf8')),headers=rows.shift();
    const gems=headers.indexOf('Gems'),total=headers.indexOf('Total');
    if(gems<0||total<0||rows.length!==proof.csvRows||!proof.setTotals)throw Error('CSV/set totals evidence missing');
    let ten=0,all=0;
    for(const row of rows){const a=csv.count(row[gems]),b=csv.count(row[total]);if(a===null||b===null||a>b)throw Error('CSV set counts invalid');ten+=a;all+=b;}
    if(ten!==proof.setTotals.psa10||all!==proof.setTotals.total)throw Error('CSV/set page totals mismatch');
    return {context,setCode:s.setCode,denominator:s.denominator,...(matcher.promoScope(s)?{promoCampaign:s.promoCampaign}:{})};
  }
  // Keep the original S6a proof path intact; new sets require the registry above.
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
  const incoming=path.join(store,'incoming'),rows=[],confirmed=require('./gemrate_confirmed_links'),links=confirmed.load(store);
  const reviewed=require('./gemrate_reviewed_additions'),registry=reviewed.entries(ROOT);
  const reviewRevision=context=>confirmed.revision(confirmed.scope(ROOT,context)||{setCode:'S6A'},catalog,english,registry.filter(r=>r.set===context?.set&&r.year===context?.year&&r.language===context?.language));
  const oldManifest=fs.existsSync(path.join(store,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(store,'manifest.json'))):{files:[]};
  const known=new Set(oldManifest.files.filter(r=>r.kind==='list'&&r.parsedPath&&fs.existsSync(r.parsedPath)).flatMap(r=>JSON.parse(fs.readFileSync(r.parsedPath)).accepted.map(x=>x.identity)));
  // A new CSV requires its own original page evidence and SHA-bound sidecar. Never infer a date from file time.
  for(const {name,prepared} of pendingFiles(store,reviewRevision)) {
    const file=path.join(incoming,name),meta=file+'.context.json';
    if(!fs.existsSync(meta)){rows.push({name,status:'review',reason:'source-context-missing'});continue;}
    try {
      const retained=fs.existsSync(file)?file:prepared?.storedPath;
      if(!retained||storage.outside(store,fs.realpathSync(retained)))throw Error('Inbox original escapes private store or is missing');
      const bytes=fs.readFileSync(retained),sidecar=JSON.parse(fs.readFileSync(meta)),v=validate(sidecar,bytes,store);
      if(!fs.existsSync(file)){
        if(sha(require('node:zlib').gunzipSync(fs.readFileSync(prepared.backupPath)))!==sha(bytes))throw Error('Retained backup mismatch');
        fs.copyFileSync(retained,file,fs.constants.COPYFILE_EXCL);
      }
      const cells=csv.parseCsv(bytes.toString('utf8')),headers=cells.shift(),source=cells.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
      const prior=JSON.parse(fs.readFileSync(path.join(store,'verification-report.json')));
      const held=prior.receipts.filter(r=>r.kind==='list').flatMap(r=>JSON.parse(fs.readFileSync(r.parsedPath)).quarantined.filter(q=>q.reason==='source-discrepancy-hold').map(q=>q.identity));
      const additions=reviewed.mappings(source,v.context,catalog,registry,held);
      const set=confirmed.scope(ROOT,v.context);
      const matches=confirmed.resolve(source,v.context,catalog,english,{...v,contextProof:v.context.contextProof,heldKeys:held,
        ...(confirmed.enabled(set)?{parallels:set.automaticReference.parallels}:{})},links,additions);
      const firstMatches=matches.mappings.filter(m=>!m.hold&&!known.has(m.key)).length;
      const expanded=path.join(store,'expanded-verification-report.json');
      const previousObservations=fs.existsSync(expanded)?JSON.parse(fs.readFileSync(expanded)).outputs.flatMap(r=>{
        if(storage.outside(store,fs.realpathSync(r.path)))throw Error('Expanded observation path escapes private store');
        return JSON.parse(fs.readFileSync(r.path)).accepted;
      }):[];
      const result=storage.receive({store,previousObservations,files:[{path:file,kind:'list',context:v.context,mappings:matches.mappings}]});
      const manifestFile=path.join(store,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
      const receipt=manifest.files.findLast(r=>r.originalPath===file);receipt.reviewRevision=reviewRevision(v.context);
      receipt.identityReview=matches.review;
      require('./acquisition_retry').atomicWrite(manifestFile,manifest);
      require('./acquisition_retry').atomicWrite(path.join(store,confirmed.FILE),links);
      for(const m of matches.mappings)known.add(m.key);
      rows.push({name,status:'imported-private',accepted:result.newPrivateObservations,
        firstMatches,reusedMappings:matches.reused,storedMappings:matches.added,
        retainedCsvReevaluation:oldManifest.files.some(r=>r.sha256===sidecar.csvSha256),
        recovered:result.files.filter(r=>r.recovered).reduce((n,r)=>n+r.accepted,0),held:result.files[0].quarantined,sha256:result.files[0].sha256});
    } catch(e) {rows.push({name,status:'review',reason:e.message});}
  }
  const result={at:new Date().toISOString(),stage:'offline-received-csv-import',files:rows,newPrivateObservations:rows.reduce((n,r)=>n+(r.accepted||0),0),
    firstMatchedIdentities:rows.reduce((n,r)=>n+(r.firstMatches||0),0),reusedMappings:rows.reduce((n,r)=>n+(r.reusedMappings||0),0),
    retainedCsvReevaluations:rows.filter(r=>r.retainedCsvReevaluation).length,sourceAcquisitions:0,
    recoveredPrivateObservations:rows.reduce((n,r)=>n+(r.recovered||0),0),httpRequests:0,publicRecords:0,officialPopUpdates:0,llmCalls:0,codexCalls:0,
    status:rows.some(r=>r.status==='review')?'review':rows.length?'imported':'no-received-files'};
  fs.writeFileSync(path.join(store,'last-inbox-run.json.tmp'),JSON.stringify(result,null,2));fs.renameSync(path.join(store,'last-inbox-run.json.tmp'),path.join(store,'last-inbox-run.json'));
  console.log(JSON.stringify(result));return result;
  } finally {release();}
}
if(require.main===module)run();
module.exports={validate,run,pendingFiles};
