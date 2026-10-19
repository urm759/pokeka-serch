const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),DAY=86400000;
const {dayKey,observationTime}=require('./build_psa_history');
function sourceKey(official){let h=2166136261;for(const c of `${official?.u||''}|${official?.n||''}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function datedRows(history,official,identity){return (history||[]).filter(r=>observationTime(r[3]?.observedAt)!=null
  &&r[3]?.sourceUrl===official?.u&&r[3]?.specificationIdentity===identity&&Number.isInteger(r[1])&&Number.isInteger(r[2])&&r[1]>=0&&r[2]>=r[1]);}
function completeDays(days,at,period){return Array.from({length:period+1},(_,i)=>dayKey(new Date(at-i*DAY))).every(day=>days.has(day));}
function reason(official,history,identity,value){
  if(observationTime(official?.f)==null)return 'confirmation-time-unknown';
  if(!identity)return 'identity-unproven';
  if(!history?.length)return 'no-history';
  const dated=datedRows(history,official,identity);
  if(!dated.length)return 'identity-or-undated-history';
  if(!value)return 'latest-or-provenance-mismatch';
  return value.previous?'comparable':'single-confirmation';
}
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
    return [latest[1]-base[1],base[1],Math.round(span*1000)/1000||span,base[3].observedAt,
      decrease?2:reference?1:0];
  }
  return {at:official.f,ten:official.ten,changed,dailyPrevious:!savedPrevious,previous:window(null),w7:window(7),w30:window(30),w75:window(75),w200:window(200)};
}
function build(root=ROOT) {
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const population=read('data/psa-population-summary.json'),groups=new Map();let records=0,comparable=0;
  const audit={version:1,at:new Date().toISOString(),reasons:{},periods:Object.fromEntries([7,30,75,200].map(d=>[d,{comparable:0,spansPeriod:0,dailyComplete:0}])),fresh:0,stale:0,cards:{}};
  const recoveryDir=path.join(root,'data/psa-pop-recovered');
  for(const [id,official]of Object.entries(population.cards||{})) {
    if(population.specificationHeld?.[id]||!/^\d{2}$/.test(official.sh||''))continue;
    if(!groups.has(official.sh)){
      const recoveredFile=path.join(recoveryDir,official.sh+'.json');
      groups.set(official.sh,{raw:read('data/psa-history/'+official.sh+'.json'),recovered:fs.existsSync(recoveredFile)?JSON.parse(fs.readFileSync(recoveredFile,'utf8')):{cards:{}},cards:{}});
    }
    const group=groups.get(official.sh),identity=group.raw.identities?.[id];
    const existing=group.raw.cards?.[id]||[], recovered=group.recovered.cards?.[id];
    // Recovery is a display-only evidence branch, never a financial/model input.
    const extra=recovered?.identity===identity&&recovered?.sourceUrl===official.u?recovered.points:[];
    const times=new Set(existing.map(r=>r[3]?.observedAt)),days=new Set(datedRows(existing,official,identity).map(r=>r[0])),additions=[];
    for(const r of extra||[])if(!times.has(r[3]?.observedAt)&&!days.has(r[0])){additions.push(r);times.add(r[3].observedAt);days.add(r[0]);}
    const history=[...existing,...additions];
    const value=summarize(official,history,identity,Date.now(),group.raw.previousConfirmations?.[id]);
    const why=reason(official,history,identity,value),at=observationTime(official.f),stale=at==null||Date.now()-at>36*3600000||at>Date.now();
    audit.reasons[why]=(audit.reasons[why]||0)+1;audit[stale?'stale':'fresh']++;
    const row=group.cards[id]={at:official.f,ten:official.ten,k:sourceKey(official),r:why,recovered:additions.length};
    audit.cards[id]={reason:why,stale,at:official.f,sourceUrl:official.u,recoveredPoints:extra?.length||0};
    if(value){
      records++;
      if(value.previous){
        comparable++;const windows=[],seen=new Map();
        const index=w=>{if(!w)return null;const key=JSON.stringify(w);if(!seen.has(key)){seen.set(key,windows.length);windows.push(w);}return seen.get(key);};
        Object.assign(row,{changed:value.changed,dailyPrevious:value.dailyPrevious,windows,p:[value.previous,value.w7,value.w30,value.w75,value.w200].map(index)});
        for(const d of [7,30,75,200]){
          const w=value['w'+d];if(!w)continue;
          audit.periods[d].comparable++;
          if(w[2]>=d)audit.periods[d].spansPeriod++;
          const days=new Set(datedRows(history,official,identity).filter(r=>Date.parse(r[3].observedAt)>=Date.parse(w[3])&&Date.parse(r[3].observedAt)<=at).map(r=>r[0]));
          if(w[2]>=d&&completeDays(days,at,d))audit.periods[d].dailyComplete++;
        }
      }
    }
  }
  fs.mkdirSync(path.join(root,'data/psa-pop-glance'),{recursive:true});
  let bytes=0;
  for(let i=0;i<32;i++){
    const file=path.join(root,'data/psa-pop-glance',String(i).padStart(2,'0')+'.json');
    const codes=['comparable','single-confirmation','no-history','confirmation-time-unknown','identity-unproven','identity-or-undated-history','latest-or-provenance-mismatch'];
    const cards=Object.fromEntries(Object.entries(groups.get(String(i).padStart(2,'0'))?.cards||{}).map(([id,r])=>{
      const at=Number.isFinite(Date.parse(r.at))?Date.parse(r.at):r.at;
      if(!r.p)return [id,[at,r.ten,r.k,codes.indexOf(r.r)]];
      return [id,{at,ten:r.ten,k:r.k,windows:r.windows.map(w=>[w[0],w[1],w[2],Date.parse(w[3]),w[4]]),p:r.p,
        ...(r.changed?{changed:true}:{}),...(r.dailyPrevious?{dailyPrevious:true}:{}),...(r.recovered?{recovered:r.recovered}:{})}];
    }));
    const text=JSON.stringify({version:2,cards});bytes+=Buffer.byteLength(text);
    if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)fs.writeFileSync(file,text);
  }
  const catalog=read('data/pokemon-cards.json');
  for(const card of catalog)if(!audit.cards[card.id]){
    const why=population.specificationHeld?.[card.id]?'specification-or-url-held':'official-not-linked';
    const hold=population.specificationHeld?.[card.id];
    audit.cards[card.id]={reason:why,...(hold?{holdReason:hold.reason,sourceUrl:hold.u,at:hold.f}:{})};audit.reasons[why]=(audit.reasons[why]||0)+1;
  }
  const denominator=Object.keys(population.cards||{}).length;
  for(const p of Object.values(audit.periods))Object.assign(p,{denominator,comparisonPct:denominator?100*p.comparable/denominator:null,
    spanningPct:denominator?100*p.spansPeriod/denominator:null,dailyCompletePct:denominator?100*p.dailyComplete/denominator:null});
  Object.assign(audit,{catalog:catalog.length,official:Object.keys(population.cards||{}).length,records,comparable,bytes,
    freshPct:denominator?100*audit.fresh/denominator:null,
    delivery:{publicReadFailures:null,runtimeCacheFailures:null,note:'端末での実際の通信/キャッシュ失敗は未観測。公開後の32分割照合証拠とは別。'},
    note:'同じ公式URL/仕様と元の実取得日時のみ。spansPeriodは実測区間が対象日数以上で、正確な7/30日差や日次連続記録とは別。古値は独立した重複理由。画面のHTTP失敗件数はサーバー側では未観測。'});
  fs.writeFileSync(path.join(root,'data/psa-pop-coverage.json'),JSON.stringify(audit));
  const historyFile=path.join(root,'work/psa-pop-coverage-history.json');
  const previous=fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile,'utf8')):{runs:[]};
  const sample={at:audit.at,reasons:audit.reasons,periods:audit.periods,fresh:audit.fresh,stale:audit.stale,comparable,
    inputHash:require('node:crypto').createHash('sha256').update(JSON.stringify([population,groups.size])).digest('hex'),
    runId:process.env.GITHUB_RUN_ID||null,event:process.env.GITHUB_EVENT_NAME||'manual-local',llmCalls:0,codexCalls:0};
  if(JSON.stringify({...previous.runs.at(-1),at:null})!==JSON.stringify({...sample,at:null})){
    previous.runs.push(sample);previous.runs=previous.runs.slice(-400);
    fs.writeFileSync(historyFile,JSON.stringify(previous));
  }
  return {records,comparable,bytes,shards:32,reasons:audit.reasons,periods:audit.periods,fresh:audit.fresh,stale:audit.stale};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={summarize,build,reason,sourceKey,datedRows,completeDays};
