const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),DAY=86400000;
const {dayKey,observationTime}=require('./build_psa_history');
function summarize(official,history,identity,now=Date.now(),remembered=null) {
  const at=observationTime(official?.f);
  if(!official || !Number.isInteger(official.ten)||official.ten<0||!identity||!Number.isFinite(at)||at>now)return null;
  const rows=(history||[]).filter(r=>Number.isInteger(r[1])&&r[1]>=0&&Number.isInteger(r[2])&&r[2]>=r[1]
    && /^\d{8}$/.test(r[0])&&Number.isFinite(observationTime(r[3]?.observedAt))&&Date.parse(r[3].observedAt)<=at
    &&dayKey(new Date(r[3].observedAt))===r[0])
    .sort((a,b)=>Date.parse(a[3].observedAt)-Date.parse(b[3].observedAt));
  let segment=[],changed=false,boundary=-Infinity;
  for(const r of rows){
    if(r[3].sourceUrl!==official.u||r[3].specificationIdentity!==identity){segment=[];changed=true;boundary=Date.parse(r[3].observedAt);continue;}
    // Identical timestamps are one confirmation, not an extra supply observation.
    if(segment.at(-1)?.[3].observedAt===r[3].observedAt){if(segment.at(-1)[1]!==r[1])return null;continue;}
    segment.push(r);
  }
  const latest=segment.at(-1);
  if(!latest||latest[3].observedAt!==official.f||latest[1]!==official.ten)return null;
  const candidatePrevious=require('./build_psa_history').previousConfirmation(remembered?[remembered]:[],
    {url:official.u,fetchedAt:official.f},identity);
  const savedPrevious=candidatePrevious&&Date.parse(candidatePrevious[3].observedAt)>boundary?candidatePrevious:null;
  function window(days){
    if(segment.length<2&&!(days==null&&savedPrevious))return null;
    const cutoff=at-days*DAY;
    const base=days==null?savedPrevious||segment.at(-2):[...segment].reverse().find(r=>Date.parse(r[3].observedAt)<=cutoff)||segment[0];
    const span=(at-Date.parse(base[3].observedAt))/DAY;
    if(!(span>0))return null;
    const points=[base,...segment.filter(r=>Date.parse(r[3].observedAt)>Date.parse(base[3].observedAt))];
    const decrease=points.some((r,i)=>i>0&&r[1]<points[i-1][1]);
    const reference=points.some(r=>!(r[3].captureVersion>=2)||r[3].completeSnapshot!==true);
    return [latest[1]-base[1],base[1],Math.round(span*1000)/1000,base[3].observedAt,
      decrease?2:reference?1:0];
  }
  return {at:official.f,ten:official.ten,changed,dailyPrevious:!savedPrevious,previous:window(null),w7:window(7),w30:window(30),w75:window(75),w200:window(200)};
}
function build(root=ROOT) {
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const population=read('data/psa-population-summary.json'),groups=new Map();let records=0,comparable=0;
  for(const [id,official]of Object.entries(population.cards||{})) {
    if(population.specificationHeld?.[id]||!/^\d{2}$/.test(official.sh||''))continue;
    if(!groups.has(official.sh))groups.set(official.sh,{raw:read('data/psa-history/'+official.sh+'.json'),cards:{}});
    const group=groups.get(official.sh),value=summarize(official,group.raw.cards?.[id],group.raw.identities?.[id],Date.now(),group.raw.previousConfirmations?.[id]);
    if(value){
      records++;
      if(value.previous){
        comparable++;const windows=[],seen=new Map();
        const index=w=>{if(!w)return null;const key=JSON.stringify(w);if(!seen.has(key)){seen.set(key,windows.length);windows.push(w);}return seen.get(key);};
        group.cards[id]={at:value.at,ten:value.ten,changed:value.changed,dailyPrevious:value.dailyPrevious,windows,
          p:[value.previous,value.w7,value.w30,value.w75,value.w200].map(index)};
      }
    }
  }
  fs.mkdirSync(path.join(root,'data/psa-pop-glance'),{recursive:true});
  let bytes=0;
  for(let i=0;i<32;i++){
    const file=path.join(root,'data/psa-pop-glance',String(i).padStart(2,'0')+'.json');
    const text=JSON.stringify({version:1,cards:groups.get(String(i).padStart(2,'0'))?.cards||{}});bytes+=Buffer.byteLength(text);
    if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)fs.writeFileSync(file,text);
  }
  return {records,comparable,bytes,shards:32};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={summarize,build};
