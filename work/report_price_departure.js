const fs=require('node:fs'),cp=require('node:child_process');
const model=require('../decision-model');
const id=process.argv[2];if(!/^[a-z]+-\d+$/.test(id||''))throw Error('Card ID required');
const read=p=>JSON.parse(fs.readFileSync(p)),baseline=read('work/search-profile-cycle-baseline-manual.json');
function historical(at){
  const commit=cp.execFileSync('git',['rev-list','-1','--before='+at,'--all'],{encoding:'utf8'}).trim();
  const from=file=>{try{return JSON.parse(cp.execFileSync('git',['show',commit+':'+file],{maxBuffer:40e6,stdio:['ignore','pipe','pipe']}));}catch{return null;}};
  const card=from('data/pokemon-cards.json')?.find(c=>c.id===id),meta=from('data/pokemon-cards-meta.json');
  const evidence=from('data/state-a-price-evidence.json')?.cards?.[id]||null;
  const sources=['cardrush','hareruya2','yuyutei','torecacamp'].map(source=>({source,...from(`data/${source}-stock-summary.json`)?.cards?.[id]}));
  const entries=[{source:'みんトレ',value:card.price,kind:'参考価格',updatedAt:card.priceObservedAt||meta.updatedAt,valid:evidence?.status!=='unbacked'},
    ...sources.map(r=>({source:r.source,value:r[r.source+'Price'],kind:'販売価格',updatedAt:model.shopObservation(r).priceAt,valid:true}))];
  const dateSensitivity=['2026-10-13','2026-10-14'].map(date=>{const a=model.aggregatePrices(entries,{asOfDate:date});return {date,value:a.value,
    spread:a.spreadPct,conflicted:a.conflicted,included:a.included.map(r=>r.source),outliers:a.outliers.map(r=>r.source),excluded:a.excluded.map(r=>({source:r.source,reasons:r.excludedReasons}))};});
  return {at,commit,metaDate:meta.updatedAt,card,evidence,sources,dateSensitivity,
    limitation:'時点直前にGitへ保存された原票。取得瞬間と候補評価瞬間の完全一致は保証せず、日付感度は再現試験として区別。'};
}
const cycles=read('data/search-profile-cycle-progress.json').cycles;
const departure=cycles.find(c=>c.profiles?.some(p=>p.id==='A'&&p.lost?.includes(id)));
const report={version:1,id,at:new Date().toISOString(),candidateRecord:{at:baseline.at,
  profiles:baseline.profiles.map(p=>({id:p.id,qualified:p.ids.includes(id),row:p.rows.find(r=>r.id===id)||null}))},
  departureRecord:departure?{at:departure.recordedAt,baselineAt:departure.baselineAt,profiles:departure.profiles.map(p=>({id:p.id,lost:p.lost?.includes(id),reasons:p.lostReasons?.find(r=>r.id===id)?.reasons}))}:null,
  historical:[historical(baseline.at),...(departure?[historical(departure.recordedAt)]:[])],
  currentSourceEvidence:read('data/state-a-price-evidence.json').cards[id],
  sameDataCodeComparison:'./price-comparison-audit.json',
  interpretation:'旧価格集計に含む参考値・古値と、新鮮な店舗価格同士の対立を分離。過去の候補記録と異なる設定の全体日次監査は同条件比較へ流用しない。'};
fs.writeFileSync('data/price-departure-audit.json',JSON.stringify(report));
console.log(JSON.stringify({id,baseline:report.candidateRecord.at,departure:report.departureRecord?.at,commits:report.historical.map(r=>r.commit),dateSensitivity:report.historical[0].dateSensitivity}));
