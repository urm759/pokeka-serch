// Display-only paired domestic observations. Never used by profit, search or GO.
const ev=require('./psa10_observation_evidence');
const DAY=86400000,SOURCE='mint-domestic-raw-aggregate-v1';
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
function rawProof(card,date,evidence,now=Date.now()) {
 if(!positive(card.price)||!card.identityKey||card.identityReviewRequired||card.language!=='ja')return null;
 const receipt=evidence?.receipt,checked=receipt?.rawCards?.[card.id],at=card.priceObservedAt;
 if(receipt?.payloadHash&&checked?.[0]===ev.identity(card)&&checked?.[1]===card.price&&ev.calendarDay(receipt.observedAt)===date&&Date.parse(receipt.observedAt)<=now)return [receipt.observedAt,ev.identity(card),SOURCE];
 // This explicit timestamp is set only for a supplied raw price, never the catalog generation time.
 if(evidence?.sourceIdentities?.get(card.id)===card.identityKey&&ev.calendarDay(at)===date&&Date.parse(at)<=now)return [at,ev.identity(card),SOURCE];
 return null;
}
function pairs(rows,card,now=Date.now(),saved={}) {
 const byDay=new Map(),expected=ev.identity(card),rejected={};
 const reject=k=>rejected[k]=(rejected[k]||0)+1;
 for(const row of rows||[]) {
  const p=row?.[10],r=row?.[11]||saved?.[row?.[0]];
  if(!Array.isArray(p)||!Array.isArray(r)||p[1]!==expected||r[1]!==expected||r[2]!==SOURCE){reject('仕様・両価格の確認根拠不足');continue;}
  if(!positive(row[1])||!positive(row[2])||r[3]!=null&&r[3]!==row[1]){reject('価格未取得・保存値不一致');continue;}
  if(ev.calendarDay(p[0])!==row[0]||ev.calendarDay(r[0])!==row[0]||Date.parse(p[0])>now||Date.parse(r[0])>now||Math.abs(Date.parse(p[0])-Date.parse(r[0]))>6*3600000){reject('日付不一致・確認時差超過');continue;}
  const at=Math.max(Date.parse(p[0]),Date.parse(r[0]));const old=byDay.get(row[0]);
  if(!old||old.at<at)byDay.set(row[0],{date:row[0],raw:row[1],psa10:row[2],ratio:(row[2]/row[1]-1)*100,at,rawAt:r[0],marketAt:p[0]});
 }
 return {rows:[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date)),rejected};
}
function summarize(rows,asOf) {
 const selected=days=>rows.filter(r=>r.date<=asOf&&Date.parse(r.date)>=Date.parse(asOf)-(days-1)*DAY);
 const stats=days=>{const a=selected(days),dates=new Set(a.map(r=>r.date));return {mean:a.length?a.reduce((s,r)=>s+r.ratio,0)/a.length:null,count:dates.size,span:a.length?(Date.parse(a.at(-1).date)-Date.parse(a[0].date))/DAY+1:0,maxGap:a.length>1?Math.max(...a.slice(1).map((r,i)=>(Date.parse(r.date)-Date.parse(a[i].date))/DAY-1)):null,first:a[0]?.date||null,last:a.at(-1)?.date||null};};
 const short=stats(7),medium=stats(75),latest=selected(75).at(-1),age=latest?(Date.parse(asOf)-Date.parse(latest.date))/DAY:null;
 const sufficient=short.count>=5&&medium.count>=38&&medium.span>=38&&medium.maxGap<=7&&age<=2;
 const change=sufficient?short.mean-medium.mean:null;
 return {short,medium,latest,change,direction:change==null?'判断材料不足':change>5?'拡大':change< -5?'縮小':'横ばい',reference:medium.count<75};
}
function readSaved(root) {
 const fs=require('fs'),path=require('path'),manifest=path.join(root,'work/raw-price-observations-manifest.json');
 if(!fs.existsSync(manifest))return {};
 const m=JSON.parse(fs.readFileSync(manifest));if(m.version!==1||m.file!=='work/raw-price-observations.json.gz')throw Error('Invalid raw observation archive manifest');
 const bytes=fs.readFileSync(path.join(root,m.file));if(require('crypto').createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw Error('Raw observation archive checksum mismatch');
 return JSON.parse(require('zlib').gunzipSync(bytes)).cards;
}
module.exports={SOURCE,rawProof,pairs,summarize,readSaved};
