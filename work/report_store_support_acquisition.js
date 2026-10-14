const fs = require('node:fs'), cp = require('node:child_process'), outcomes = require('./audit_completion_outcomes');
const root = require('node:path').join(__dirname,'..'), read = file => JSON.parse(fs.readFileSync(file,'utf8'));
const before = read('work/search-profile-cycle-baseline-store-support-20261015.json'), delta = outcomes.compare(outcomes.unpack(before.snapshot),outcomes.snapshot(root));
const raw = read('data/pokemon-cards.json'), byId = new Map(raw.map(c=>[c.id,c]));
const oldShops = JSON.parse(cp.execFileSync('git',['show','fee875c4:data/shop-buyback-summary.json'],{maxBuffer:32e6}));
const current = read('data/shop-buyback-summary.json'), acquisitions = read('work/store-support-buyback-acquisition-20261015.json');
const newPairs = acquisitions.flatMap(a=>Object.entries(current.cards).filter(([id,c])=>c.shops[a.source] && !oldShops.cards[id]?.shops?.[a.source]).map(([id])=>({id,shop:a.source})));
const support = read('data/buyback-observation-summary.json'), model = require('../exploration-metrics');
const examples = raw.map(c=>({c,value:model.buybackSupport(support,c.id,'all',[],Date.now(),c.snkPsa10Price,c.identityKey)})).filter(r=>r.value.multiStoreSupport).sort((a,b)=>b.value.above-a.value.above).slice(0,5).map(r=>({id:r.c.id,name:r.c.name,
  median:r.value.median,max:r.value.max,atOrAbove:r.value.above,comparable:r.value.count,windows:r.value.windows,rows:r.value.rows}));
const cycle = read('data/search-profile-cycle-progress.json').cycles.find(r=>r.key==='store-support-20261015');
const previousReport = fs.existsSync('data/store-support-acquisition.json') ? read('data/store-support-acquisition.json') : null;
const report = {version:1,at:new Date().toISOString(),baseline:before.at,overall:delta,
  catalog:{newListed:delta.addedCards,total:raw.length,analysis:read('data/card-catalog-completion.json').summary.analyzable},
  profileResults:cycle.profiles.map(p=>({...p,lostReasons:p.lostReasons.map(r=>({...r,name:byId.get(r.id)?.name}))})),
  buyback:{acquiredRows:acquisitions.reduce((n,r)=>n+(r.metadata.fetched || 0),0),newPairs,distinctNewLinkedCards:new Set(newPairs.map(r=>r.id)).size,
    receipts:acquisitions.map(r=>({source:r.source,exitCode:r.status,lastSuccess:r.metadata.lastSuccess,newLinked:r.metadata.newLinked,
      fetched:r.metadata.fetched,rawReportedNet:r.metadata.usableNet,note:'取得元のactive件数差は、同一カード群の有効値純増とは別指標'}))},
  psa:{...Object.fromEntries(['attemptedCount','newAcquiredCount','changedCount','refreshedCount','durationMs','stopReason','lastSuccessAt'].map(k=>[k,read('work/psa-fetch-progress.json')[k]])),validNet:delta.sources.psaOfficial.usableNet},
  manualAcquisitionPsa:previousReport?.manualAcquisitionPsa || previousReport?.psa || null,
  savedPsaRecovery:{...read('data/psa-publication-handoff.json'),
    note:'PC実取得の原票と保存済み受け渡しの公開回収は別工程。この統合工程の追加取得は0。原票行の追加と国内有効POP純増を混同しない'},
  support:read('data/buyback-support-audit.json'),examples,
  fixedFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2,
  llmCalls:0,codexCalls:0,publication:'保存済み・公開JSON照合は別受領証',
  notes:['現相場支持は参考指標追加で、実取得/補完/初適合には数えない','A/B全項目・承認済み保存2項目・購入GO/式/鮮度を維持','手動取得と修正後定期実績は別。AI予定タスク停止','CardShop151公式郵送条件を確認したが商業再利用の許諾待ち。郵送の自動採用なし・同店二重計上なし']};
fs.writeFileSync('data/store-support-acquisition.json',JSON.stringify(report));
console.log(JSON.stringify({overall:delta,buybackNewPairs:newPairs.length,distinctNewLinkedCards:report.buyback.distinctNewLinkedCards,profiles:report.profileResults.map(p=>({id:p.id,before:p.before,after:p.after,first:p.firstQualified.length,filled:p.profileFilledCards,fresh:p.freshnessRestored.length,lost:p.lost.length}))}));
