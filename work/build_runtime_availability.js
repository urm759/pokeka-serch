const fs=require('node:fs'),path=require('node:path'),{atomicWrite}=require('./acquisition_retry'),{summarize}=require('./calendar_progress');
const ROOT=path.join(__dirname,'..'),read=(f,v={})=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8').replace(/^\uFEFF/,''));}catch{return v;}};
function build(root=ROOT,now=Date.now()) {
  const get=(f,v={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,''));}catch{return v;}};
  const verification=get('data/scheduled-cycle-verification.json').pipelines||{},receipts=get('data/scheduled-cycle-receipts.json').pipelines||{};
  const history=get('work/calendar-progress-history.json',{samples:[]}).samples;
  for(const [route,proof] of Object.entries(verification)) {
    const receipt=receipts[route];
    if(!proof.confirmed||String(proof.runId)!==String(receipt?.runId)||history.some(s=>s.runId===String(proof.runId)))continue;
    history.push({runId:String(proof.runId),route,at:receipt.recordedAt,from:receipt.outcomes?.runDelta?.baselineAt??null,verified:true,
      observations:receipt.cardObservations||{},delta:receipt.outcomes?.runDelta||null});
  }
  const pc=get('data/psa-pc-observation.json'),status=get('data/update-status.json').sources||{};
  const acquired=pc.acquisitionState||{};
  if (acquired.startedAt&&acquired.acquiredCount>0&&['published','success'].includes(acquired.publishStatus)) {
    const id='pc:'+acquired.startedAt;
    if(!history.some(s=>s.runId===id))history.push({runId:id,route:'pc',at:acquired.endedAt,verified:true,
      observations:{psaOfficial:[]},confirmedCounts:{psaOfficial:acquired.acquiredCount},
      durations:{psaOfficial:acquired.durationMs},delta:null,note:'PC取得/保存/公開ack。Pagesと本実行による国内分析可能増分は別照合'});
  }
  const sourceNames=new Set([...Object.keys(status),...history.flatMap(s=>Object.keys(s.observations))]);
  const sources={};
  for(const source of sourceNames) {
    const samples=history.filter(s=>s.observations[source]).map(s=>{
      const start=Date.parse(s.from||s.delta?.baselineAt||''),end=Date.parse(s.at);
      const confirmed=s.confirmedCounts?.[source]??(Number.isFinite(start)?s.observations[source].filter(r=>Date.parse(r.at)>=start&&Date.parse(r.at)<=end).length:null);
      return {at:s.at,verified:s.verified,confirmed,usableNet:s.delta?.sources?.[source]?.usableNet??null,durationMs:s.durations?.[source]??null};
    });
    sources[source]={environment:['psaOfficial'].includes(source)?'PC・専用Chrome認証':source==='snkrRaw'?'許諾待ち・取得停止':'GitHub Actions（PC不要の独立処理）',
      unit:source==='psaOfficial'?'POP行。国内カード新規紐付け・有効値純増とは別':'本実行内の個別価格/在庫確認。同じ値の再確認・在庫なしも含み、新規取得/補完とは別',
      authenticatedDetail:source==='pokedata'?'公開一覧はGitHub、認証実成約はPC・Chromeが別途必要':null,
      acquisitionAt:status[source]?.lastSuccessAt??null,attemptAt:status[source]?.lastAttemptAt??null,
      stopReason:status[source]?.lastError??null,progress:summarize(samples,now)};
  }
  const out={version:1,at:new Date(now).toISOString(),sources,pc:{observedAt:pc.observedAt||null,
    state:pc.error?'観測失敗':!pc.observedAt?'未観測':Date.parse(pc.observedAt)>now||now-Date.parse(pc.observedAt)>36*3600000?'観測期限超過・PC停止とは断定不可':'既存タスクを観測',
    tasks:pc.tasks||[],phases:pc.phases||{},independentObserverRegistered:pc.independentObserverRegistered??null,
    powerPolicy:'電源・スリープ・認証情報のクラウド移行・有料環境は変更しない'},
    catchup:get('data/price-catchup-status.json'),cadence:get('data/refresh-cadence-audit.json'),
    constraints:'GitHubにも定期開始の保証はない。既存の毎時47分補完は共通排他・2.5時間クールダウン・アクセス予算を維持。未実行回数をまとめて再取得しない。PC停止は正規ログ・観測がある場合だけ分類。鮮度6時間と購入価格有効期限は別。',llmCalls:0,codexCalls:0};
  atomicWrite(path.join(root,'work/calendar-progress-history.json'),{version:1,samples:history.filter(s=>now-Date.parse(s.at)<=365*86400000)},0);
  atomicWrite(path.join(root,'data/runtime-availability-audit.json'),out,0);return out;
}
module.exports={build};
if(require.main===module)console.log(JSON.stringify({sources:Object.keys(build().sources).length}));
