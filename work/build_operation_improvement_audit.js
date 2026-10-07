const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const outcomes = require('./audit_completion_outcomes');
const root = path.join(__dirname,'..');
const ref = process.env.REPORT_BASELINE_REF || 'e49231a3';
const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const before = file => JSON.parse(execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:64*1024*1024,encoding:'utf8'}));
const old = outcomes.unpack(before('work/completion-outcomes-last.json'));
const now = outcomes.snapshot(root);
const comparison = outcomes.compare(old,now);
const oldCompletion = before('data/card-catalog-completion.json').summary;
const current = read('data/card-catalog-completion.json').summary;
const cards = new Map(read('data/pokemon-cards.json').map(c=>[c.id,c]));
const queue = read('work/card-completion-queue.json').cards;
const result = { version:1, generatedAt:now.at, baseline:ref, basis:'同一カードIDの保存済み項目状態を比較。新規追加は別計数。コードによる計算式変更なし。',
  counts:{before:oldCompletion.total,after:current.total,listedAdded:comparison.addedCards,
    filledCards:comparison.filledCards,filledItems:comparison.filledItems,
    analyzableBefore:oldCompletion.analyzable,analyzableAfter:current.analyzable,
    newlyAnalyzable:comparison.newlyAnalyzable,lostAnalyzable:comparison.lostAnalyzable,
    analyzableNet:current.analyzable-oldCompletion.analyzable,pendingBefore:oldCompletion.priorityQueueRemaining,pendingAfter:current.priorityQueueRemaining},
  sources:comparison.sources,
  newlyAnalyzableIds:Object.keys(now.rows).filter(id=>old.rows[id] && now.rows[id].analysis && !old.rows[id].analysis),
  lostAnalyzable:Object.keys(now.rows).filter(id=>old.rows[id]?.analysis && !now.rows[id].analysis).map(id=>({id,name:cards.get(id)?.name,
    missingRequired:queue[id]?.m,fieldsLost:old.rows[id].fields.filter(f=>!now.rows[id].fields.includes(f))})),
  purchaseFreshness:read('data/purchase-price-recovery.json'),
  catchup:read('data/price-catchup-status.json'),
  discovery:read('data/state-a-url-discovery.json'),
  completion:{attempted:read('data/completion-acquisition.json').attempted,acquired:read('data/completion-acquisition.json').acquired,
    zeroTargetReason:read('data/completion-acquisition.json').zeroTargetReason,selection:read('data/completion-acquisition.json').selectionReasons},
  scheduledPsa:read('data/psa-pc-observation.json').lastScheduledState,
  periodicVerified:false,periodicReason:'今回の新処理はローカル小規模検証。修正後の定期・公開照合は通常監視で継続、手動成功を代用しない',
  llmCalls:0,codexCalls:0,fullDataComplete:false };
require('./acquisition_retry').atomicWrite(path.join(root,'data/operation-improvement-audit.json'),result,0);
console.log(JSON.stringify({counts:result.counts,sources:result.sources}));
