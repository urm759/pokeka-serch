const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),{withEvaluationDate}=require('./measure_performance_guard');
const {cardFacts,transition}=require('./profile_candidate_evidence');
const ROOT=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
const git=(ref,f)=>cp.execFileSync('git',['show',`${ref}:${f}`],{cwd:ROOT,maxBuffer:96e6,encoding:'utf8'});
function frame(source,profile,at,ref,overlay={},inspectIds=[]){
  const url=new URL(profile.url);for(const[k,v]of Object.entries(overlay))if(!url.searchParams.has(k))url.searchParams.set(k,v);
  return withEvaluationDate(Date.parse(at),()=>{
    const api=load(source,at,{url:url.href,dataRef:ref}),cards=api.prepareCalculatedCards(api.state.cards),facts={};
    const ids=cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),inspect=new Set([...ids,...inspectIds]);
    for(const c of cards)if(inspect.has(c.id))facts[c.id]={name:c.name,metrics:cardFacts(api,c)};
    return {at,dataRef:ref||'saved-current',ids,facts,
      missingHistoricalInputs:api.missingHistoricalInputs};
  });
}
function build(ref='183e3282',at=new Date().toISOString()){
  if(!/^[a-f0-9]{7,40}$/.test(ref))throw Error('Explicit verified baseline commit required');
  const config=read('work/priority-search-profiles.json'),old=JSON.parse(git(ref,'work/priority-search-profiles.json'));
  if(JSON.stringify(config.profiles)!==JSON.stringify(old.profiles))throw Error('Fixed URL changed');
  const prior=JSON.parse(git(ref,'data/priority-search-profile-audit.json')),source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8'),oldSource=git(ref,'app.js');
  const hash=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
  const unchangedCode=hash(source)===hash(oldSource),profiles=[];
  for(const profile of config.profiles)for(const mode of ['url-only','approved-saved-overlay']){
    const overlay=mode==='url-only'?{}:config.knownSavedOverlay;
    const b=frame(oldSource,profile,prior.at,ref,overlay),t=frame(oldSource,profile,at,ref,overlay,b.ids);
    const d=frame(oldSource,profile,at,null,overlay,b.ids),a=unchangedCode?d:frame(source,profile,at,null,overlay,b.ids);
    const direct=transition(b,a),phases={timeOnly:transition(b,t),dataOnly:transition(t,d),codeOnly:transition(d,a)};
    for(const r of direct.rows)r.causes=Object.entries(phases).filter(([,p])=>p.lost.includes(r.id)).map(([key])=>key);
    profiles.push({id:profile.id,mode,urlHash:hash(profile.url),baselineAt:b.at,evaluationAt:at,unchangedCode,
      ...direct,phases,missingHistoricalInputs:[...new Set([...b.missingHistoricalInputs,...t.missingHistoricalInputs,...d.missingHistoricalInputs])]});
  }
  const result={version:1,generatedAt:at,baselineCommit:ref,profiles,unchangedCode,
    freshnessDefinitions:{targetHours:6,purchaseUseTtlHours:48,buybackUseTtlHours:48,
      note:'6時間は重要カードの再確認目標。48時間は既存の購入価格/買取出口の計算採用期限。目標未達だけで期限切れとしない。個別日時・在庫・仕様を別確認。国内PSA9など他項目の期限は既存モデルの理由を保存。'},
    savedConditionScope:'承認済み2項目だけ。端末の他の保存追加条件は未観測・勝手に解除しない。1000%条件は再適用しない。',
    sourceEvidence:'旧Git原票と最新保存原票を同じカード群で再計算。時間のみ→データのみ→コードのみの順で比較し、重複する原因とカード枚数を分離。',
    note:'候補減少のために条件・GO・仕入れ式を緩めない。履歴欠損は比較不能。長い原因監査は初期読込しない。',llmCalls:0,codexCalls:0};
  fs.writeFileSync(path.join(ROOT,'data/fixed-profile-change-audit.json'),JSON.stringify(result));
  console.log(JSON.stringify(profiles.map(p=>({id:p.id,mode:p.mode,before:p.before,after:p.after,lost:p.lost,gained:p.gained,phases:Object.fromEntries(Object.entries(p.phases).map(([k,v])=>[k,{lost:v.lost.length,gained:v.gained.length}]))}))));
  return result;
}
if(require.main===module)build(process.argv[2]||'183e3282');
module.exports={frame,build};
