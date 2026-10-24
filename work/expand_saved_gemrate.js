const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const csv=require('./gemrate_csv_import'),matcher=require('./gemrate_identity_match');
const ROOT=path.resolve(__dirname,'..'),STORE=path.resolve(ROOT,'..','private-research/gemrate');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(store=STORE) {
  if(!require('./gemrate_private_store').outside(ROOT,fs.realpathSync(store)))throw Error('Nonpublic store required');
  const release=require('./acquisition_retry').lock(path.join(store,'.receipt.lock'));
  try {
    const manifest=JSON.parse(fs.readFileSync(path.join(store,'manifest.json'))),previous=JSON.parse(fs.readFileSync(path.join(store,'verification-report.json')));
    const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'data/pokemon-cards.json'))),english=JSON.parse(fs.readFileSync(path.join(ROOT,'work/snkr_english_names.json'))).cards;
    const outputs=[];
    const receivedHashes=new Set(previous.receipts.filter(r=>r.kind==='list').map(r=>r.sha256));
    for(const file of manifest.files.filter(r=>r.kind==='list'&&receivedHashes.has(r.sha256))) {
      const bytes=fs.readFileSync(file.storedPath);if(hash(bytes)!==file.sha256||hash(zlib.gunzipSync(fs.readFileSync(file.backupPath)))!==file.sha256)throw Error('Original/backup mismatch');
      const cells=csv.parseCsv(bytes.toString('utf8')),headers=cells.shift(),rows=cells.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
      const old=JSON.parse(fs.readFileSync(file.parsedPath));
      const heldKeys=old.quarantined.filter(r=>r.reason==='source-discrepancy-hold').map(r=>r.identity);
      const proof=JSON.parse(fs.readFileSync(path.resolve(store,'..',file.originalName==='export (1).csv'?'gemrate-public-review-20261023.json':'gemrate-page-20261024.json')));
      if(proof.grader.toLowerCase()!=='psa'||proof.set!==file.context.set||Number(proof.year)!==2021)throw Error('Saved page identity mismatch');
      const match=matcher.resolve(rows,file.context,catalog,english,{setCode:'S6a',denominator:69,contextProof:file.context.contextProof,heldKeys});
      const parsed=csv.importCsv(bytes.toString('utf8'),file.context,match.mappings);
      for(const prior of old.accepted)if(!parsed.accepted.some(r=>r.cardId===prior.cardId&&r.psa10===prior.psa10&&r.total===prior.total))throw Error('Previously accepted observation unexpectedly changed');
      const validationHash=hash(JSON.stringify(match.mappings)),target=path.join(store,'processed',file.sha256+'.'+validationHash+'.json');
      const result={...parsed,identityReview:match.review,validationHash,receivedOriginal:file.sha256,previousImport:file.parsedPath};
      if(!fs.existsSync(target)){fs.writeFileSync(target+'.tmp',JSON.stringify(result,null,2));fs.renameSync(target+'.tmp',target);}
      const saved=JSON.parse(fs.readFileSync(target));if(saved.csvSha256!==file.sha256||JSON.stringify(saved.accepted)!==JSON.stringify(parsed.accepted))throw Error('Expanded import verification failed');
      outputs.push({sha256:file.sha256,path:target,accepted:saved.accepted.length,mapped:match.mappings.length,review:match.review.length,
        held:parsed.quarantined.filter(r=>r.reason==='source-discrepancy-hold').length,reviewReasons:match.review.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{})});
    }
    const ids=new Set(outputs.flatMap(r=>JSON.parse(fs.readFileSync(r.path)).accepted.map(r=>r.cardId)));
    const priorExpandedFile=path.join(store,'expanded-verification-report.json');
    const priorExpanded=fs.existsSync(priorExpandedFile)?JSON.parse(fs.readFileSync(priorExpandedFile)):null;
    const priorReviewed=priorExpanded?.reviewed??previous.exactReviewedIdentities;
    const result={at:new Date().toISOString(),previousReviewed:priorReviewed,reviewed:outputs[0].mapped,
      newlyReviewed:outputs[0].mapped-priorReviewed,acceptedCards:ids.size,
      acceptedObservations:outputs.reduce((n,r)=>n+r.accepted,0),remainingSpecifications:121-outputs[0].mapped,
      discrepancyHeldCards:1,trendHeldPoints:53,outputs,publicRecords:0,officialPopUpdates:0,newAnalyzable:0};
    const f=path.join(store,'expanded-verification-report.json');
    if(fs.existsSync(f)){const old=JSON.parse(fs.readFileSync(f));result.newObservationsThisRun=old.outputs?.every((r,i)=>r.path===outputs[i]?.path)?0:result.acceptedObservations-old.acceptedObservations;}
    else result.newObservationsThisRun=result.acceptedObservations-previous.acceptedPrivateObservations;
    fs.writeFileSync(f+'.tmp',JSON.stringify(result,null,2));fs.renameSync(f+'.tmp',f);
    const planFile=path.join(store,'remaining-specification-plan.json');
    if(fs.existsSync(planFile)){
      const priorBytes=fs.readFileSync(planFile),plan=JSON.parse(priorBytes),oldRows=new Map((plan.rows||[]).map(r=>[r.key,r]));
      const review=JSON.parse(fs.readFileSync(outputs[0].path)).identityReview;
      const rows=review.map(r=>({...oldRows.get(r.key),...r}));
      if(rows.length!==result.remainingSpecifications)throw Error('Remaining specification plan mismatch');
      if(JSON.stringify(rows)!==JSON.stringify(plan.rows)||plan.acceptedPrivateCards!==result.acceptedCards){
        const backup=path.join(store,'backups','remaining-plan.'+hash(priorBytes)+'.json.gz');
        if(!fs.existsSync(backup))fs.writeFileSync(backup,zlib.gzipSync(priorBytes,{level:9}));
        require('./acquisition_retry').atomicWrite(planFile,{...plan,at:result.at,rows,
          acceptedPrivateCards:result.acceptedCards,remainingSpecifications:rows.length,previousPlan:backup,httpRequests:0,publicRecords:0},2);
      }
    }
    console.log(JSON.stringify({...result,outputs:outputs.map(({path,...r})=>r)}));return result;
  } finally {release();}
}
if(require.main===module)run();
module.exports={run};
