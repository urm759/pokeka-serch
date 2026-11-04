// Non-AI handoff from the separately approved Chrome collector. No browser/API calls.
// Ordinary transport uses GemRate-Auto/pending/<uuid>. A bounded migration also
// recovers this collector's fully validated, misnamed JSON receipts, never general downloads.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const storage=require('./gemrate_private_store'),inbox=require('./gemrate_private_inbox'),retry=require('./acquisition_retry');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),ROOT=path.resolve(__dirname,'..');
const uuid=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
function inside(root,file){const rel=path.relative(fs.realpathSync(root),fs.realpathSync(file));if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Collector path escapes reserved directory');}
function read(file){return JSON.parse(fs.readFileSync(file));}
function scopes(root){const extra=path.join(root,'work/gemrate-collection-sets.json'),a=read(path.join(root,'work/gemrate-reviewed-sets.json')).sets,b=fs.existsSync(extra)?read(extra).sets:[],all=[...a,...b];if(new Set(all.map(s=>s.setCode)).size!==all.length)throw Error('Duplicate collector set context');return all;}
function put(file,bytes){if(fs.existsSync(file)){if(hash(fs.readFileSync(file))!==hash(bytes))throw Error('Existing collector proof conflict');}else fs.writeFileSync(file,bytes,{flag:'wx'});}
function directories(root,store,downloads){
  if(!storage.outside(fs.realpathSync(root),fs.realpathSync(store)))throw Error('Private collector storage required');
  if(!fs.readFileSync(path.join(store,'.gitignore'),'utf8').split(/\r?\n/).includes('*'))throw Error('Private deny-all missing');
  return {pending:path.join(downloads,'GemRate-Auto','pending'),index:path.join(store,'browser-receipts.json')};
}
function validate(meta,bytes,root,now=Date.now()){
  const p=meta.page,s=scopes(root).find(s=>s.setCode===meta.setCode);
  if(meta.version!==1||meta.kind!=='gemrate-normal-csv-v1'||!uuid(meta.jobId)||!s||!p||p.language!=='Japanese'||p.grader!=='psa'||p.category!=='tcg-cards'||s.language!=='Japanese'||s.grader!=='PSA')throw Error('Unreviewed collector context');
  if(!Number.isSafeInteger(p.csvRows)||p.csvRows<=0||!Number.isSafeInteger(p.setTotals?.psa10)||!Number.isSafeInteger(p.setTotals?.total)||p.setTotals.psa10<0||p.setTotals.psa10>p.setTotals.total)throw Error('Collector page count/total evidence missing');
  const same=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.gemrate.com'&&u.pathname==='/item-details'&&!u.hash&&[...u.searchParams].length===4&&u.searchParams.get('grader')==='psa'&&u.searchParams.get('category')==='tcg-cards'&&u.searchParams.get('set_name')===s.set&&Number(u.searchParams.get('year'))===s.year;}catch{return false;}};
  if(!same(p.url)||p.set!==s.set||p.year!==s.year||!/^\d{4}-\d{2}-\d{2}$/.test(p.updated)||new Date(p.updated).toISOString().slice(0,10)!==p.updated||!Number.isFinite(Date.parse(p.checkedAt))||Date.parse(p.checkedAt)>now+120000||p.updated>new Date(Date.parse(p.checkedAt)+9*3600000).toISOString().slice(0,10))throw Error('Collector page/date mismatch');
  const sha=bytes&&hash(bytes),proof={url:p.url,grader:p.grader,category:p.category,language:p.language,year:p.year,set:p.set,updated:p.updated,observedAt:p.checkedAt,csvRows:p.csvRows,setTotals:p.setTotals,...(sha?{csvSha256:sha}:{}),collectorJobId:meta.jobId};
  if(bytes){const d=meta.download;if(!d||d.state!=='complete'||!same(d.referrer)||!String(d.url).startsWith('blob:https://www.gemrate.com/')||d.fileSize!==bytes.length||Date.parse(d.startTime)<Date.parse(p.checkedAt)-1000||!Number.isFinite(Date.parse(d.startTime))||!Number.isFinite(Date.parse(d.endTime))||Date.parse(d.endTime)<Date.parse(d.startTime)||Date.parse(d.endTime)>now+120000)throw Error('CSV download association unproven');
    const csv=require('./gemrate_csv_import'),rows=csv.parseCsv(bytes.toString('utf8')),head=rows.shift(),g=head.indexOf('Gems'),t=head.indexOf('Total');let ten=0,total=0;
    if(g<0||t<0||rows.length!==p.csvRows||!p.setTotals)throw Error('Collector CSV/page row count mismatch');
    for(const r of rows){const a=csv.count(r[g]),b=csv.count(r[t]);if(a===null||b===null||a>b)throw Error('Collector CSV invalid PSA counts');ten+=a;total+=b;}
    if(ten!==p.setTotals.psa10||total!==p.setTotals.total)throw Error('Collector CSV/page totals mismatch');
  }
  else if(meta.download||meta.decision?.exportCsv)throw Error('CSV receipt without completed CSV');
  return proof;
}
function validateHold(meta,root,now=Date.now()){
  const s=scopes(root).find(s=>s.setCode===meta.setCode),u=new URL(meta.url);
  if(meta.version!==1||meta.kind!=='gemrate-source-hold-v1'||!uuid(meta.jobId)||!s||u.origin!=='https://www.gemrate.com'||u.pathname!=='/item-details'||u.hash||[...u.searchParams].length!==4||u.searchParams.get('set_name')!==s.set||Number(u.searchParams.get('year'))!==s.year||u.searchParams.get('grader')!=='psa'||u.searchParams.get('category')!=='tcg-cards'||!Number.isFinite(Date.parse(meta.at))||Date.parse(meta.at)>now+120000)throw Error('Unproven collector hold');
}
function recoverLooseReceipts(root,store,downloads){
  const paths=directories(root,store,downloads),file=path.join(store,'loose-receipt-recovery.json'),index=fs.existsSync(file)?read(file):{version:1,receipts:{}},results=[];
  if(!fs.existsSync(downloads))return results;
  for(const name of fs.readdirSync(downloads).filter(n=>/^(?:ダウンロード|download)(?: \(\d+\))?\.json$/i.test(n))){
    const original=path.join(downloads,name),stat=fs.lstatSync(original);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)continue;
    let meta,bytes;try{bytes=fs.readFileSync(original);meta=JSON.parse(bytes);}catch{continue;}
    if(!['gemrate-normal-csv-v1','gemrate-source-hold-v1'].includes(meta.kind)||!uuid(meta.jobId))continue;
    const at=Date.parse(meta.page?.checkedAt||meta.at);if(!Number.isFinite(at)||Date.now()-at>86400000)continue;
    try{
      if(meta.kind==='gemrate-source-hold-v1')validateHold(meta,root);
      else {
        const csv=path.join(paths.pending,meta.jobId,'export.csv');let raw=null;
        if(meta.download){inside(downloads,csv);if(fs.statSync(csv).size>5e6)throw Error('CSV too large');raw=fs.readFileSync(csv);}
        validate(meta,raw,root);
      }
      const sha=hash(bytes),old=index.receipts[meta.jobId];if(old&&old.sha256!==sha)throw Error('Loose receipt conflict');
      const backup=path.join(store,'browser-receipt-migration');fs.mkdirSync(backup,{recursive:true});
      put(path.join(backup,meta.jobId+'.json'),bytes);const gz=path.join(backup,meta.jobId+'.json.gz');if(!fs.existsSync(gz))put(gz,zlib.gzipSync(bytes));
      if(hash(zlib.gunzipSync(fs.readFileSync(gz)))!==sha)throw Error('Loose receipt backup mismatch');
      const dir=path.join(paths.pending,meta.jobId);fs.mkdirSync(dir,{recursive:true});inside(downloads,dir);put(path.join(dir,'receipt.json'),bytes);
      index.receipts[meta.jobId]={sourceFile:original,sha256:sha,recoveredAt:old?.recoveredAt||new Date().toISOString()};results.push({jobId:meta.jobId,status:'recovered'});
    }catch(e){results.push({jobId:meta.jobId,status:'review',reason:e.message});}
  }
  if(results.length)retry.atomicWrite(file,index,0);return results;
}
function receive(root=ROOT,store=path.resolve(root,'../private-research/gemrate'),downloads=path.join(os.homedir(),'Downloads')){
  const paths=directories(root,store,downloads);
  const release=retry.lock(path.join(store,'.browser-receipts.lock'));
  try{
    const recoveredTransport=recoverLooseReceipts(root,store,downloads);
    if(!fs.existsSync(paths.pending))return {status:'no-browser-receipts',queuedCsv:0,providerChecks:0,sourceAcquisitions:0,recoveredTransport};
    const index=fs.existsSync(paths.index)?read(paths.index):{version:1,receipts:{}},results=[];
    const evidence=path.join(store,'browser-receipts');fs.mkdirSync(evidence,{recursive:true});
    for(const name of fs.readdirSync(paths.pending).filter(uuid)){
      const dir=path.join(paths.pending,name),file=path.join(dir,'receipt.json');if(!fs.existsSync(file)||index.receipts[name]?.status==='complete')continue;
      try{
        inside(paths.pending,dir);inside(dir,file);if(fs.statSync(file).size>262144)throw Error('Collector metadata too large');
        const metaBytes=fs.readFileSync(file),meta=JSON.parse(metaBytes);if(meta.jobId!==name)throw Error('Collector job directory mismatch');
        if(meta.version===1&&meta.kind==='gemrate-source-hold-v1'){
          validateHold(meta,root);
          put(path.join(evidence,name+'.receipt.json'),metaBytes);
          index.receipts[name]={status:'queued',held:true,setCode:meta.setCode,checkedAt:meta.at,reason:meta.reason,csv:false,metadataSha256:hash(metaBytes)};results.push({jobId:name,...index.receipts[name]});continue;
        }
        const csvFile=path.join(dir,'export.csv');let bytes=null;
        if(meta.download){inside(dir,csvFile);if(fs.statSync(csvFile).size>5e6)throw Error('CSV exceeds approved small-export limit');bytes=fs.readFileSync(csvFile);}
        const proof=validate(meta,bytes,root),proofBytes=Buffer.from(JSON.stringify(proof)),proofFile=path.join(evidence,name+'.page.json');
        put(path.join(evidence,name+'.receipt.json'),metaBytes);put(proofFile,proofBytes);
        let incoming=null;
        if(bytes){
          incoming=index.receipts[name]?.incoming;
          if(!incoming){let n=0;do{incoming=path.join(store,'incoming','export'+(n?' ('+n+')':'')+'.csv');n++;}while(fs.existsSync(incoming)||fs.existsSync(incoming+'.context.json'));}
          const context={language:'Japanese',set:proof.set,year:proof.year,grader:'PSA',sourceUpdatedDate:proof.updated,retrievedAt:proof.observedAt,contextProof:'sha256:'+hash(proofBytes),pageUrl:proof.url};
          const sidecar={csvSha256:hash(bytes),proofFile:path.relative(store,proofFile),context};
          inbox.validate(sidecar,bytes,store,root);
          // A prepared/processed original can be replayed through the existing inbox, never re-downloaded.
          if(!fs.existsSync(incoming+'.context.json')){put(incoming,bytes);put(incoming+'.context.json',Buffer.from(JSON.stringify(sidecar)));}
        }
        const row={status:'queued',setCode:meta.setCode,checkedAt:meta.page.checkedAt,sourceDate:meta.page.updated,csv:Boolean(bytes),csvSha256:bytes&&hash(bytes),metadataSha256:hash(metaBytes),incoming,decision:meta.decision};
        index.receipts[name]=row;results.push({jobId:name,...row});
      }catch(e){results.push({jobId:name,status:'review',reason:e.message});}
    }
    retry.atomicWrite(paths.index,index,0);const summary=dailySummary(root,index);
    retry.atomicWrite(path.join(store,'collector-daily-confirmation.json'),summary,0);
    const result={at:new Date().toISOString(),status:[...results,...recoveredTransport].some(r=>r.status==='review')?'review':'received',providerChecks:results.filter(r=>r.status==='queued'&&!r.held).length,queuedCsv:results.filter(r=>r.status==='queued'&&r.csv).length,sourceAcquisitions:0,summary,recoveredTransport,results};
    retry.atomicWrite(path.join(store,'last-browser-receipts.json'),result,0);return result;
  }finally{release();}
}
function finalize(root=ROOT,store=path.resolve(root,'../private-research/gemrate'),downloads=path.join(os.homedir(),'Downloads')){
  const paths=directories(root,store,downloads);if(!fs.existsSync(paths.index))return {cleaned:0};
  const index=read(paths.index),manifest=fs.existsSync(path.join(store,'manifest.json'))?read(path.join(store,'manifest.json')).files:[];let cleaned=0;
  for(const [id,row]of Object.entries(index.receipts)){
    if(row.status!=='queued')continue;
    const dir=path.join(paths.pending,id),meta=path.join(dir,'receipt.json'),csv=path.join(dir,'export.csv'),retained=path.join(store,'browser-receipts',id+'.receipt.json');
    if(!fs.existsSync(meta))continue;inside(paths.pending,dir);inside(dir,meta);
    if(hash(fs.readFileSync(meta))!==row.metadataSha256||hash(fs.readFileSync(retained))!==row.metadataSha256)throw Error('Collector cleanup metadata changed; retained');
    if(row.csv){const r=manifest.findLast(r=>r.originalPath===row.incoming&&r.sha256===row.csvSha256&&['processed','review'].includes(r.status));if(!r)continue;
      for(const f of [r.storedPath,r.backupPath])inside(store,f);
      if(hash(fs.readFileSync(r.storedPath))!==row.csvSha256||hash(zlib.gunzipSync(fs.readFileSync(r.backupPath)))!==row.csvSha256)throw Error('Collector raw/backup verification failed');
      if(fs.existsSync(csv)){inside(dir,csv);if(hash(fs.readFileSync(csv))!==row.csvSha256)throw Error('Collector download changed; retained');fs.unlinkSync(csv);}
    }
    const migratedFile=path.join(store,'loose-receipt-recovery.json'),migrated=fs.existsSync(migratedFile)?read(migratedFile).receipts[id]:null;
    if(migrated&&fs.existsSync(migrated.sourceFile)){
      inside(downloads,migrated.sourceFile);const backup=path.join(store,'browser-receipt-migration',id+'.json'),gz=backup+'.gz';
      if(hash(fs.readFileSync(migrated.sourceFile))!==row.metadataSha256||migrated.sha256!==row.metadataSha256||hash(fs.readFileSync(backup))!==row.metadataSha256||hash(zlib.gunzipSync(fs.readFileSync(gz)))!==row.metadataSha256)throw Error('Loose collector receipt changed; retained');
      fs.unlinkSync(migrated.sourceFile);
    }
    fs.unlinkSync(meta);if(!fs.readdirSync(dir).length)fs.rmdirSync(dir);row.status='complete';row.processedAt=new Date().toISOString();cleaned++;
  }
  retry.atomicWrite(paths.index,index,0);return {cleaned};
}
function dailySummary(root,index,now=new Date().toISOString()){
  const day=at=>new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10),today=day(now),scope=scopes(root);
  const rows=Object.values(index.receipts).filter(r=>day(r.checkedAt)===today),successful=rows.filter(r=>!r.held),ids=new Set(successful.map(r=>r.setCode));
  const referenceFile=path.join(root,'data/gemrate-reference-summary.json');let targetCards=null,confirmedCards=null;
  if(fs.existsSync(referenceFile)){
    const values=Object.values(read(referenceFile).cards||{});targetCards=values.length;confirmedCards=values.filter(r=>{try{const u=new URL(r[4]),s=scope.find(s=>s.set===u.searchParams.get('set_name')&&s.year===Number(u.searchParams.get('year')));return s&&ids.has(s.setCode)&&u.origin==='https://www.gemrate.com'&&u.searchParams.get('grader')==='psa';}catch{return false;}}).length;
  }
  return {at:now,day:today,targetSets:scope.length,targetCards,confirmedCards,cardConfirmationRatePct:targetCards?confirmedCards/targetCards*100:null,attemptedSets:new Set(rows.map(r=>r.setCode)).size,confirmedSets:ids.size,confirmationRatePct:scope.length?ids.size/scope.length*100:null,sourceDateUpdatedSets:new Set(successful.filter(r=>r.decision?.newSourceDate).map(r=>r.setCode)).size,sourceDateUpdatedRatePct:ids.size?new Set(successful.filter(r=>r.decision?.newSourceDate).map(r=>r.setCode)).size/ids.size*100:null,csvReceipts:successful.filter(r=>r.csv).length,newPopObservations:null,calculationAdopted:0,method:'実受領証のみ。確認率と元基準日変更率は別。POP新観測数は既存の重複排除済み取込み結果で判断'};
}
module.exports={validate,receive,finalize,dailySummary};
