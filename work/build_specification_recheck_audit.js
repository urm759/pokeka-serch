const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),baseline=process.env.SPECIFICATION_BASELINE || '0bf966dc';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const old=file=>JSON.parse(execFileSync('git',['show',`${baseline}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:100000000}));
function build(){
  const before=old('data/psa-population-summary.json'),after=read('data/psa-population-summary.json');
  const beforeReview=old('data/psa-mapping-review.json'),review=read('data/psa-mapping-review.json');
  const beforeCompletion=old('data/card-catalog-completion.json'),completion=read('data/card-catalog-completion.json');
  const newlyLinked=Object.keys(after.cards).filter(id=>!before.cards[id]),lostLinked=Object.keys(before.cards).filter(id=>!after.cards[id]);
  const restored=beforeReview.rows.filter(row=>after.cards[row.id]).map(row=>({id:row.id,name:row.name,beforeCandidate:row.sourceName,adopted:after.cards[row.id]}));
  const filled=[],analyzed=[],lostAnalysis=[];
  for(const [id,row] of Object.entries(completion.cards)){
    const previous=beforeCompletion.cards[id];if(!previous)continue;
    const fields=Object.keys(row.i || {}).filter(field=>row.i[field]==='取得済み' && previous.i?.[field]!=='取得済み');
    if(fields.length)filled.push({id,fields});
    if(row.s==='分析可能' && previous.s!=='分析可能')analyzed.push(id);
    if(previous.s==='分析可能' && row.s!=='分析可能')lostAnalysis.push(id);
  }
  const raw=read('data/psa-official-populations.json');
  const sets={};for(const row of raw.rows)if(row.captureVersion>=2 && row.completeSnapshot){
    const key=`${row.setCode}|${row.sourceUrl}`;sets[key] ||= {set:row.setCode,url:row.sourceUrl,observedAt:row.fetchedAt,rows:0};sets[key].rows++;
  }
  const discovery=read('data/state-a-url-discovery.json'),acquisition=read('data/completion-acquisition.json');
  const summary={baselineCommit:baseline,generatedAt:new Date().toISOString(),beforeLinked:before.matched,afterLinked:after.matched,
    newLinked:newlyLinked.length,lostLinked:lostLinked.length,usableNet:newlyLinked.length-lostLinked.length,
    beforeHeld:beforeReview.count,restoredHeld:restored.length,originalStillUnresolved:beforeReview.count-restored.length,
    currentHeld:review.count,previouslyLinkedHeldRestored:old('data/recovery-completion-audit.json').psa.heldMappingIds.filter(id=>after.cards[id]).length,
    filledCards:filled.length,newAnalyzable:analyzed.length,lostAnalyzable:lostAnalysis.length,
    beforeAnalyzable:beforeCompletion.summary.analyzable,afterAnalyzable:completion.summary.analyzable,
    discoveryAttempted:discovery.attempted,discoveryLinked:discovery.newLinked,actualPriceAcquired:acquisition.acquired,
    actualNewPrice:acquisition.newAcquired,modelChanged:false,safetyRelaxed:false,llmCalls:0,codexCalls:0};
  const audit={summary,sets:Object.values(sets),newlyLinked,lostLinked,restored,filled,newlyAnalyzable:analyzed,lostAnalyzable:lostAnalysis,
    unresolvedOriginal:beforeReview.rows.filter(row=>!after.cards[row.id]),currentHeld:review.rows,
    historicalCounts:'旧仕様未確認の履歴はpsa-history各shardのquarantinedに保存。POP増加には使用しない',
    pricePipeline:{discovery,acquisition},scheduledVerification:'改修後の定期取得・保存・公開は別途Actions実績で確認。手動実行を定期成功と扱わない'};
  fs.writeFileSync(path.join(root,'data/specification-recheck-audit.json'),JSON.stringify(audit));
  console.log(JSON.stringify(summary));return audit;
}
if(require.main===module)build();module.exports={build};
