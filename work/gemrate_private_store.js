const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const importer=require('./gemrate_csv_import');
const ROOT=path.resolve(__dirname,'..');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function outside(root, target) {
  const rel=path.relative(path.resolve(root),path.resolve(target));
  return rel.startsWith('..'+path.sep)||path.isAbsolute(rel);
}
function atomic(file,value) {
  const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);
}
function receive({store,files,publicRoot=ROOT,now=new Date().toISOString(),previousObservations=[]}) {
  store=path.resolve(store);
  if(!outside(ROOT,store)||!outside(publicRoot,store))throw Error('Private storage must be outside the publication repository');
  fs.mkdirSync(store,{recursive:true});
  if(!outside(fs.realpathSync(ROOT),fs.realpathSync(store)))throw Error('Private storage junction resolves into the publication repository');
  if(!fs.existsSync(path.join(store,'.gitignore'))||!fs.readFileSync(path.join(store,'.gitignore'),'utf8').split(/\r?\n/).includes('*')) {
    throw Error('Private store requires a deny-all .gitignore before receipt');
  }
  for(const dir of ['incoming','processed','review','backups'])fs.mkdirSync(path.join(store,dir),{recursive:true});
  const release=require('./acquisition_retry').lock(path.join(store,'.receipt.lock'));
  try {
    const manifestFile=path.join(store,'manifest.json');
    const manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{version:1,files:[]};
    const result=[];
    for(const file of files) {
      const source=path.resolve(file.path), previous=manifest.files.findLast(r=>r.originalPath===source);
      const {retrievedAt,...sourceContext}=file.context;
      const validationKey=hash(JSON.stringify({sourceContext,mappings:file.mappings,kind:file.kind}));
      if(!fs.existsSync(source)) {
        if(!previous||!fs.existsSync(previous.storedPath)||hash(fs.readFileSync(previous.storedPath))!==previous.sha256)throw Error('Receipt source missing or stored original damaged');
        if(previous.validationKey!==validationKey)throw Error('Validation context changed; explicit reprocessing of the retained original is required');
        if(hash(zlib.gunzipSync(fs.readFileSync(previous.backupPath)))!==previous.sha256)throw Error('Stored backup damaged; no replacement or deletion');
        const saved=JSON.parse(fs.readFileSync(previous.parsedPath,'utf8'));
        if(saved.csvSha256!==previous.sha256)throw Error('Stored import mismatch');
        const recovered=previous.status==='prepared';
        if(recovered){previous.status=previous.finalStatus;previous.originalRetained=false;atomic(manifestFile,manifest);}
        result.push({...previous,replay:true,recovered});continue;
      }
      if(!/^export(?: \(\d+\))?\.csv$/i.test(path.basename(source)))throw Error('Only explicitly selected GemRate export CSV files are accepted');
      const bytes=fs.readFileSync(source),sha=hash(bytes),stat=fs.statSync(source);
      const compressed=path.join(store,'backups',sha+'.csv.gz');
      if(!fs.existsSync(compressed))fs.writeFileSync(compressed,zlib.gzipSync(bytes),{flag:'wx'});
      if(hash(zlib.gunzipSync(fs.readFileSync(compressed)))!==sha)throw Error('Backup verification failed; original retained');
      const existing=manifest.files.find(r=>r.sha256===sha);
      const sameValidation=manifest.files.find(r=>r.sha256===sha&&r.validationKey===validationKey);
      if(sameValidation) {
        if(hash(zlib.gunzipSync(fs.readFileSync(sameValidation.backupPath)))!==sha
          ||JSON.parse(fs.readFileSync(sameValidation.parsedPath)).csvSha256!==sha)throw Error('Duplicate verification failed; incoming copy retained');
        const recovered=sameValidation.status==='prepared';
        if(recovered&&!fs.existsSync(sameValidation.storedPath))fs.renameSync(source,sameValidation.storedPath);
        if(!fs.existsSync(sameValidation.storedPath)||hash(fs.readFileSync(sameValidation.storedPath))!==sha)throw Error('Duplicate original verification failed; incoming copy retained');
        // The byte-identical extra copy is disposable only after both retained original and backup verify.
        if(source!==sameValidation.storedPath&&fs.existsSync(source))fs.unlinkSync(source);
        if(recovered){sameValidation.status=sameValidation.finalStatus;sameValidation.originalRetained=false;atomic(manifestFile,manifest);}
        result.push({...sameValidation,duplicateFile:true,replay:true,recovered,originalRetained:fs.existsSync(source)});continue;
      }
      const past=manifest.files.filter(r=>r.kind==='list'&&fs.existsSync(r.parsedPath))
        .flatMap(r=>JSON.parse(fs.readFileSync(r.parsedPath)).accepted);
      const parsed=file.kind==='trend'?importer.importTrendCsv(bytes.toString('utf8'),file.context,file.mappings)
        :importer.importCsv(bytes.toString('utf8'),file.context,file.mappings,[...past,...previousObservations]);
      const target=existing?.storedPath||path.join(store,parsed.quarantined.length?'review':'processed',sha+'.csv');
      const parsedPath=path.join(store,'processed',sha+'.'+validationKey+'.json');
      atomic(parsedPath,parsed);
      const saved=JSON.parse(fs.readFileSync(parsedPath,'utf8'));
      if(saved.csvSha256!==sha||saved.accepted.length!==parsed.accepted.length)throw Error('Import persistence verification failed; original retained');
      if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==sha)throw Error('Stored original conflict; source retained');
      const finalStatus=parsed.quarantined.length?'review':'processed';
      const receipt={originalName:path.basename(source),originalPath:source,sha256:sha,bytes:bytes.length,
        receiptConfirmedAt:now,receivedAt:file.receivedAt||null,
        filesystemMetadata:{createdAt:stat.birthtime.toISOString(),modifiedAt:stat.mtime.toISOString(),notSourceUpdatedAt:true},
        kind:file.kind,context:file.context,backupPath:compressed,storedPath:target,parsedPath,
        status:'prepared',finalStatus,accepted:parsed.accepted.length,
        quarantined:parsed.quarantined.length,duplicateRows:parsed.duplicates.length,
        duplicateFile:false,rawBytesReused:Boolean(existing),originalRetained:fs.existsSync(source),publicRecords:0};
      receipt.validationKey=validationKey;
      manifest.files.push(receipt);
      // Persist the destination and verified backup before moving the original.
      atomic(manifestFile,manifest);
      if(!fs.existsSync(target))fs.renameSync(source,target);
      if(hash(fs.readFileSync(target))!==sha)throw Error('Original move verification failed');
      if(source!==target&&fs.existsSync(source)&&hash(fs.readFileSync(source))===sha)fs.unlinkSync(source);
      receipt.status=finalStatus;receipt.originalRetained=fs.existsSync(source);
      atomic(manifestFile,manifest);result.push(receipt);
    }
    return {files:result,newPrivateObservations:result.filter(r=>!r.replay&&!r.duplicateFile).reduce((n,r)=>n+r.accepted,0),newOfficialObservations:0,publicRecords:0};
  } finally {release();}
}
module.exports={receive,outside};
