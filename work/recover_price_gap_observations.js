// Recover explicit retained raw-price timestamps from saved Git snapshots only.
const fs=require('fs'),cp=require('child_process'),path=require('path'),ev=require('./psa10_observation_evidence'),gap=require('./price_gap_observations');
function recover(root=path.join(__dirname,'..')) {
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),current=new Map(read('data/pokemon-cards.json').map(c=>[c.id,c])),history=read('work/market_stability_history.json');
 const output=path.join(root,'work/raw-price-observations.json.gz'),saved={version:1,source:gap.SOURCE,cards:gap.readSaved(root)};
 const show=(ref,f)=>{try{return JSON.parse(cp.execFileSync('git',['show',ref+':'+f],{cwd:root,maxBuffer:80e6,stdio:['ignore','pipe','ignore']}));}catch{return null;}};
 const commits=cp.execFileSync('git',['log','--since=2026-08-15','--format=%H','--','data/psa10-observation-receipt.json'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean),byDay=new Map();
 for(const commit of commits){const r=show(commit,'data/psa10-observation-receipt.json'),day=ev.calendarDay(r?.observedAt);if(day&&!byDay.has(day))byDay.set(day,{commit,receipt:r});}
 let recovered=0,examined=0;for(const [day,{commit,receipt}] of byDay){const cards=show(commit,'data/pokemon-cards.json');if(!cards)continue;examined++;
  for(const card of cards){const target=current.get(card.id),r=receipt.cards?.[card.id],rawAt=card.priceObservedAt;
   if(!target||card.identityReviewRequired||card.language!=='ja'||card.identityKey!==target.identityKey||!r||r[0]!==ev.identity(target)||ev.calendarDay(rawAt)!==day||!Number.isFinite(card.price)||card.price<=0)continue;
   const matching=(history.cards[card.id]||[]).find(row=>row[0]===day&&row[1]===card.price&&row[2]===r[1]&&row[10]?.[1]===r[0]);
   if(!matching||Math.abs(Date.parse(matching[10][0])-Date.parse(rawAt))>6*3600000)continue;
   const previous=saved.cards[card.id]?.[day];if(previous&&Date.parse(previous[0])>=Date.parse(rawAt))continue;
   (saved.cards[card.id]||={})[day]=[rawAt,r[0],gap.SOURCE,card.price,commit];recovered++;
  }
 }
 const bytes=require('zlib').gzipSync(JSON.stringify(saved),{level:9});fs.writeFileSync(output,bytes);
 fs.writeFileSync(path.join(root,'work/raw-price-observations-manifest.json'),JSON.stringify({version:1,file:'work/raw-price-observations.json.gz',sha256:require('crypto').createHash('sha256').update(bytes).digest('hex'),source:gap.SOURCE}));
 const report={at:new Date().toISOString(),savedReceiptCommits:commits.length,snapshotDaysExamined:examined,earliestVerifiedReceiptDay:[...byDay.keys()].sort()[0],recoveredRawPairs:recovered,totalRawPairs:Object.values(saved.cards).reduce((s,r)=>s+Object.keys(r).length,0),newSourceAcquisitions:0,sourceDatesPreserved:true,note:'Git commit time is discovery only. Both values/identity and the retained actual raw-price timestamp must match the existing verified PSA10 day. Older unsupported dates remain unverified.'};fs.writeFileSync(path.join(root,'work/price-gap-history-recovery.json'),JSON.stringify(report,null,2));return report;
}
if(require.main===module)console.log(JSON.stringify(recover()));module.exports={recover};
