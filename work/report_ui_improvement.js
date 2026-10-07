const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const base = process.argv.find(a => a.startsWith('--base='))?.slice(7);
if (!base || !/^[a-f0-9]{7,40}$/i.test(base)) throw new Error('Pass the verified comparison commit with --base=');
const before = JSON.parse(execFileSync('git', ['show', `${base}:data/card-catalog-completion.json`], {cwd:root, maxBuffer:100*1024*1024}));
const after = read('data/card-catalog-completion.json');
const fields = {};
const newlyAnalyzable = [], lostAnalyzable = [];
for (const [id, row] of Object.entries(after.cards)) {
  const old = before.cards[id];
  if (old && row.s === '分析可能' && old.s !== '分析可能') newlyAnalyzable.push(id);
  if (old && row.s !== '分析可能' && old.s === '分析可能') lostAnalyzable.push(id);
  for (const [field, status] of Object.entries(row.i || {})) {
    const prior = old?.i?.[field];
    fields[field] ||= {filled:[], lost:[]};
    if (old && status === '取得済み' && prior !== '取得済み') fields[field].filled.push(id);
    if (old && status !== '取得済み' && prior === '取得済み') fields[field].lost.push(id);
  }
}
const median = rows => [...rows].sort((a,b)=>a-b)[Math.floor(rows.length/2)] ?? null;
const performance = Object.fromEntries(['desktop','mobile'].map(width => {
  const measured = read(`work/ui-browser-${width}-metrics.json`);
  return [width, {...measured, medians: measured.cases.map(c=>({scale:c.scale, mode:c.mode,
    parseMs:median(c.parseMs), decodeMs:median(c.decodeMs),
    initialDomMs:median(c.initialPaintMs.map(r=>r.domMs)), layoutMs:median(c.initialPaintMs.map(r=>r.layoutMs)),
    indexSearchMs:median(c.search.map(r=>r.indexMs)), conditionMs:median(c.filter.map(r=>r.filterMs))})),
    caveat:'同じPCの画面幅試験。2倍は合成負荷、通信量は推計を別記。rAFにはブラウザ抑制があるため実描画時間・高速化の証拠に使用しない。DOM生成とレイアウト実測を別集計。'}];
}));
const recovery = read('data/purchase-price-recovery.json');
const result = {version:1, generatedAt:new Date().toISOString(), baseCommit:base,
  comparison:'同じ既存ID群。手動の実取得・表示軽量化と、以前の定期取得成果を分離。',
  before:{total:before.summary.total, analyzable:before.summary.analyzable, mandatoryQueue:before.summary.priorityQueueRemaining},
  after:{total:after.summary.total, analyzable:after.summary.analyzable, mandatoryQueue:after.summary.priorityQueueRemaining},
  newListings:Object.keys(after.cards).filter(id=>!before.cards[id]), newlyAnalyzable, lostAnalyzable,
  filledCards:[...new Set(Object.values(fields).flatMap(r=>r.filled))], fieldChanges:fields,
  purchaseRecovery:recovery, acquisition:read('data/acquisition-progress-audit.json').sources,
  capacity:read('data/priority-price-monitor.json').sources.hareruya2.capacity,
  modelPerformance:read('data/ui-performance-audit.json'), browserPerformance:performance,
  runtimePerformance:Object.fromEntries(['desktop','mobile'].map(width=>[width,read(`work/ui-runtime-${width}-metrics.json`)])),
  financialModelChanged:false, safetyChanged:false, routineLlmCalls:0, routineCodexCalls:0,
  unfinished:'定期実績・PSA認証取得・国内PSA9/状態A個別実成約・期間実証等は未完了。軽量化は通信削減、CPU展開の追加コストも計測。'};
fs.writeFileSync(path.join(root, 'data/ui-improvement-audit.json'), JSON.stringify(result));
console.log(JSON.stringify({newListings:result.newListings.length, filledCards:result.filledCards.length,
  fieldChanges:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{filled:v.filled.length,lost:v.lost.length}])),
  newlyAnalyzable:newlyAnalyzable.length, recovered:recovery.freshnessRecovered, capacity:result.capacity,
  browser:Object.fromEntries(Object.entries(performance).map(([k,v])=>[k,v.medians]))}));
