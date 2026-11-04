// Reuse the ordinary MINTORE bulk response. No requests to SNKRDUNK and no price/GO inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {canonicalIdentity}=require('./card_identity'),{atomicWrite}=require('./acquisition_retry');
const model=require('../psa10-listing-counts');
const ROOT=path.resolve(__dirname,'..'),HISTORY='work/mintore-listing-history';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function count(value){
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?{lower:value,exact:true}:null;
 if(typeof value!=='string')return null;
 const match=value.trim().match(/^(\d[\d,]*)(\+|以上)?$/);if(!match)return null;
 const n=Number(match[1].replaceAll(',',''));return Number.isSafeInteger(n)&&n>=0?{lower:n,exact:!match[2]}:null;
}
function sourceValues(row){
 const p=count(row.snkPsa10Count),r=count(row.snkListings),positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
 // These are the published offer sections. A nonzero old count alone is not a
 // clean listing: e.g. raw144 with price0 is hidden by the provider's current UI.
 return {psa10:p&&positive(row.snkPsa10Min)&&positive(row.snkPsa10Price)?p:null,
   raw:r&&positive(row.snkPrice)&&positive(row.price)&&row.rawBacked!==false?r:null,
   reasons:{psa10:!p?'項目未提供':!positive(row.snkPsa10Min)||!positive(row.snkPsa10Price)?'現在のPSA10掲載価格なし':null,
     raw:!r?'項目未提供':!positive(row.snkPrice)||!positive(row.price)||row.rawBacked===false?'美品現在価格の掲載根拠なし':null}};
}
function capture(root,cards,originalRows,receipt){
 const time=Date.parse(receipt.observedAt),now=Date.now();
 if(!Number.isFinite(time)||!receipt.observedAt.includes('T')||time>now+120000||receipt.sourceUrl!=='https://toreca-souba.com/cards'||!/^https:\/\/toreca-souba\.com\/_next\/static\/chunks\/[a-zA-Z0-9.-]+\.js(?:\?[^#]*)?$/.test(receipt.chunkUrl)||! /^[a-f0-9]{64}$/.test(receipt.payloadHash))throw Error('MINTORE listing receipt lacks actual bulk-response evidence');
 const date=model.day(receipt.observedAt),dir=path.join(root,HISTORY),file=path.join(dir,date.slice(0,7)+'.json');fs.mkdirSync(dir,{recursive:true});
 const history=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{version:1,source:'MINTORE',month:date.slice(0,7),receipts:[],cards:{}};
 if(history.version!==1||history.source!=='MINTORE')throw Error('Unrecognized listing history');
 // Provider does not publish a card-value update timestamp here. Neither sale
 // dates, script generation times nor filesystem mtime are a substitute.
 const provenance=[receipt.observedAt,null,receipt.payloadHash,receipt.chunkUrl];
 let ri=history.receipts.findIndex(r=>JSON.stringify(r)===JSON.stringify(provenance));if(ri<0){ri=history.receipts.length;history.receipts.push(provenance);}
 const unavailableByCard={},result={at:receipt.observedAt,source:'MINTORE',total:cards.length,psa10:0,raw:0,newPsa10Days:0,newRawDays:0,held:0,unavailable:{},changed:false};
 for(const card of cards){
   const original=originalRows.get(String(card.sourceId||card.id)),identity=original&&canonicalIdentity(original);
   if(!original||!identity||identity.key!==card.identityKey||identity.reviewRequired||card.identityReviewRequired||card.language!=='ja'){result.held++;unavailableByCard[card.id]=[card.identityKey,3,3];continue;}
   const values=sourceValues(original),valid=values.psa10||values.raw;
   const status=key=>values[key]?0:values.reasons[key]==='項目未提供'?1:2;
   if(status('psa10')||status('raw'))unavailableByCard[card.id]=[card.identityKey,status('psa10'),status('raw')];
   for(const [key,reason]of Object.entries(values.reasons))if(reason)result.unavailable[key+':'+reason]=(result.unavailable[key+':'+reason]||0)+1;
   if(!valid)continue;
   const row=history.cards[card.id]||{identityKey:card.identityKey,sourceId:card.sourceId||card.id,days:{}};
   if(row.identityKey!==card.identityKey||row.sourceId!==(card.sourceId||card.id)){result.held++;continue;}
   const before=row.days[date]||[null,null,null,null,null,null],next=[...before];
   for(const [key,offset]of [['psa10',0],['raw',3]]){
     const value=values[key];if(!value)continue;result[key]++;
     if(before[offset]==null)result[key==='psa10'?'newPsa10Days':'newRawDays']++;
     const previous=before[offset]!=null?history.receipts[before[offset]]:null;
     if(previous&&Date.parse(previous[0])>time)continue;
     next.splice(offset,3,ri,value.lower,value.exact?1:0);
   }
   if(JSON.stringify(next)!==JSON.stringify(before)){row.days[date]=next;history.cards[card.id]=row;result.changed=true;}
 }
 if(result.changed)atomicWrite(file,history,0);
 atomicWrite(path.join(root,'work/mintore-listing-last-receipt.json'),{...result,receipt:provenance,unavailableByCard,rule:'actual-present-published-offer-counts-v1',note:'Old retained counts do not receive a new date. Source update time is not provided.'},0);
 return result;
}
function build(root=ROOT,now=Date.now()){
 const catalogFile=path.join(root,'data/pokemon-cards.json'),catalogBytes=fs.readFileSync(catalogFile,'utf8').replace(/\r\n/g,'\n'),cards=JSON.parse(catalogBytes),dir=path.join(root,HISTORY),byId=new Map(),receipts=[],lookup=new Map();
 const first=model.day(new Date(now-29*86400000).toISOString()),last=model.day(new Date(now).toISOString());
 if(fs.existsSync(dir))for(const file of fs.readdirSync(dir).filter(f=>/^\d{4}-\d{2}\.json$/.test(f)&&f.slice(0,7)>=first.slice(0,7)&&f.slice(0,7)<=last.slice(0,7))){
   const h=JSON.parse(fs.readFileSync(path.join(dir,file)));if(h.version!==1||h.source!=='MINTORE')throw Error('Listing history format changed');
   for(const [id,r]of Object.entries(h.cards)){
     const value=byId.get(id)||[];
     for(const [date,p]of Object.entries(r.days))for(const [key,o]of [['psa10',0],['raw',3]]){
       if(p[o]==null||date<first||date>last)continue;const receipt=h.receipts[p[o]];
       if(!receipt||model.day(receipt[0])!==date)throw Error('Listing history receipt/date mismatch');
       const k=JSON.stringify(receipt);if(!lookup.has(k)){lookup.set(k,receipts.length);receipts.push(receipt);}
       value.push({key,identityKey:r.identityKey,sourceId:r.sourceId,at:receipt[0],date,lower:p[o+1],exact:p[o+2]===1,receipt:lookup.get(k)});
     }byId.set(id,value);
   }
 }
 const lastFile=path.join(root,'work/mintore-listing-last-receipt.json'),lastReceipt=fs.existsSync(lastFile)?JSON.parse(fs.readFileSync(lastFile)):null;
 const output={version:1,source:'MINTORE',scope:'provider-listed-psa10-and-clean-v1',catalogHash:hash(catalogBytes),receipts,cards:{},coverage:{catalog:cards.length,psa10:0,raw:0,psa10Days:{},rawDays:{}},sourceUpdatedAt:null,sourceUpdateStatus:'取得元のカード更新日時は未提供'};
 for(const card of cards){
   const observations=(byId.get(card.id)||[]).filter(r=>r.identityKey===card.identityKey&&r.sourceId===(card.sourceId||card.id)),values=[];
   for(const key of ['psa10','raw']){
     const rows=observations.filter(r=>r.key===key),view=model.summarize(rows,card.identityKey,now),current=view.current;
     if(!current){values.push(null);continue;}
     const latest=rows.filter(r=>r.at===current.at).at(-1),firstRow=[...rows].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0],mean=view.mean30;
     const compact=[current.lower,latest.receipt,current.exact?1:0];
     if(mean.days>1)compact.push(mean.lower,mean.days,firstRow.receipt,mean.exact?1:0);
     values.push(compact);output.coverage[key]++;const daysKey=key+'Days';output.coverage[daysKey][mean.days]=(output.coverage[daysKey][mean.days]||0)+1;
   }
   if(values.some(Boolean)){
     const status=lastReceipt?.unavailableByCard?.[card.id];
     if(status&&status[0]===card.identityKey){const r=lastReceipt.receipt,k=JSON.stringify(r);if(!lookup.has(k)){lookup.set(k,receipts.length);receipts.push(r);}values.push([lookup.get(k),status[1],status[2]]);for(const [key,i]of [['psa10',0],['raw',1]])if(values[i]&&status[i+1])output.coverage[key]--;}
     output.cards[card.id]=values;
   }
 }
 const target=path.join(root,'data/mintore-listing-summary.json'),text=JSON.stringify(output),changed=!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text;
 if(changed)atomicWrite(target,output,0);
 return {changed,...output.coverage,bytes:Buffer.byteLength(text),source:'MINTORE'};
}
if(require.main===module)console.log(JSON.stringify(build()));
function publicationSummary(summary,last,from,to){
 if(!summary)return null;
 const t=Date.parse(last?.at),start=Date.parse(from),end=Date.parse(to),acquired=Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(t)&&t>=start&&t<=end;
 return {source:'MINTORE',lastConfirmationAt:last?.at||null,sourceUpdatedAt:summary.sourceUpdatedAt??null,acquiredThisRun:acquired,
   psa10:summary.coverage.psa10,raw:summary.coverage.raw,psa10Days:summary.coverage.psa10Days,rawDays:summary.coverage.rawDays,
   newPsa10CardDays:acquired?last.newPsa10Days:0,newRawCardDays:acquired?last.newRawDays:0,
   note:'掲載値の実取得と公開要約を照合。再利用・取込みだけでは観測日を追加しない。30日平均は実観測日だけ。'};
}
module.exports={capture,build,count,sourceValues,publicationSummary};
