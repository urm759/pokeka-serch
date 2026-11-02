// Full dated observations stay private. Export only four bounded comparison windows.
const fs=require('node:fs'),path=require('node:path'),model=require('../gemrate-pop-model');
function verifyRows(rows,bytes,context){
 const csv=require('./gemrate_csv_import'),cells=csv.parseCsv(bytes.toString('utf8')),headers=cells.shift(),source=new Map();
 for(const c of cells){const r=Object.fromEntries(headers.map((h,i)=>[h,c[i]])),key=csv.key(r,context),old=source.get(key);if(old&&(old.Gems!==r.Gems||old.Total!==r.Total))throw Error('Conflicting raw GemRate specification');source.set(key,r);}
 for(const r of rows){const raw=source.get(r.identity);if(!raw||csv.count(raw.Gems)!==r.psa10||csv.count(raw.Total)!==r.total||r.contextProof!==context.contextProof||r.sourceUpdatedDate!==context.sourceUpdatedDate||r.pageUrl!==context.pageUrl)throw Error('GemRate parsed observation differs from dated original');}
}
function verifyLegacy(root,store,receipt,rows){
 const crypto=require('node:crypto'),zlib=require('node:zlib'),storage=require('./gemrate_private_store'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const f of [receipt.storedPath,receipt.backupPath])if(storage.outside(fs.realpathSync(store),fs.realpathSync(f)))throw Error('Historical GemRate receipt escapes private store');
 const bytes=fs.readFileSync(receipt.storedPath);if(hash(bytes)!==receipt.sha256||hash(zlib.gunzipSync(fs.readFileSync(receipt.backupPath)))!==receipt.sha256)throw Error('Historical GemRate original/backup mismatch');
 const sidecarFile=receipt.originalPath+'.context.json';
 if(fs.existsSync(sidecarFile))require('./gemrate_private_inbox').validate(JSON.parse(fs.readFileSync(sidecarFile)),bytes,store,root);
 else {
  const proofFile=path.resolve(store,'..',receipt.originalName==='export (1).csv'?'gemrate-public-review-20261023.json':'gemrate-page-20261024.json'),proofBytes=fs.readFileSync(proofFile),proof=JSON.parse(proofBytes),context=receipt.context;
  if(context.contextProof!=='sha256:'+hash(proofBytes)||proof.updated!==context.sourceUpdatedDate||String(proof.grader).toLowerCase()!=='psa'||proof.set!==context.set||Number(proof.year)!==context.year||context.language!=='Japanese')throw Error('Historical GemRate date/source proof mismatch');
 }
 verifyRows(rows,bytes,receipt.context);
}
function sourceKey(row){const u=new URL(row.pageUrl);u.searchParams.sort();return JSON.stringify([row.identityKey,row.identity,u.origin+u.pathname+'?'+u.searchParams.toString()]);}
function project(latest,observations){
 const cards={},privateCards={},byCard=new Map();
 for(const row of observations){const rows=byCard.get(row.cardId)||[];rows.push(row);byCard.set(row.cardId,rows);}
 for(const [id,row]of latest){
  const candidates=byCard.get(id)||[],key=sourceKey(row),same=candidates.filter(p=>sourceKey(p)===key);
  cards[id]=model.summarize([row.identityKey,row.psa10,row.total,row.sourceUpdatedDate,row.pageUrl],same.map(p=>[p.sourceUpdatedDate,p.psa10,p.total]));
  const unique=new Map();for(const p of candidates){
   const key=sourceKey(p)+'|'+p.sourceUpdatedDate,old=unique.get(key);
   if(old&&(old.psa10!==p.psa10||old.total!==p.total))throw Error('Conflicting private GemRate observation');
   if(!old||p.retrievedAt<old.retrievedAt)unique.set(key,{identityKey:p.identityKey,identity:p.identity,sourceDate:p.sourceUpdatedDate,psa10:p.psa10,total:p.total,sourceUrl:p.pageUrl,retrievedAt:p.retrievedAt});
  }
  privateCards[id]=[...unique.values()].sort((a,b)=>a.sourceDate.localeCompare(b.sourceDate));
 }
 return {public:{version:1,rule:'same-source-exact-print-dated-v1',cards},private:{version:1,source:'GemRate',grader:'PSA',cards:privateCards}};
}
function save(store,data){
 const file=path.join(store,'population-observations.json'),text=JSON.stringify(data);
 if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===text)return false;
 if(fs.existsSync(file)){const backups=path.join(store,'population-backups');fs.mkdirSync(backups,{recursive:true});const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');const backup=path.join(backups,digest+'.json.gz');if(!fs.existsSync(backup))fs.writeFileSync(backup,require('node:zlib').gzipSync(fs.readFileSync(file)));}
 require('./acquisition_retry').atomicWrite(file,data,0);return true;
}
module.exports={sourceKey,project,save,verifyRows,verifyLegacy};
