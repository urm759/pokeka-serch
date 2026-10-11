const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const outcomes = require('./audit_completion_outcomes');
const root = path.join(__dirname, '..');
const previous = outcomes.unpack(JSON.parse(execFileSync('git', ['show', '582df944:work/completion-outcomes-last.json'], { cwd: root, maxBuffer: 32 * 1024 * 1024 })));
const current = outcomes.snapshot(root);
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const result = {
  generatedAt: current.at, baselineCommit: '582df944',
  scope: '前回公開後の非AI定期取得とPC保存済みPSA公開を統合。表示修正によるデータ増ではない。再取得なし。鮮度は48時間監査と6時間目標を区別',
  delta: outcomes.compare(previous, current),
  counts: read('data/card-catalog-completion.json').summary,
  fixedFreshness: read('data/priority-price-monitor.json').fixedCohortFreshness,
  scheduled: Object.fromEntries(Object.entries(read('data/scheduled-cycle-verification.json').pipelines).map(([key, value]) => [key, {
    runId: value.runId, confirmed: value.confirmed, partial: value.partial, stages: value.stages,
    runDelta: value.outcomes?.runDelta || null
  }])),
  psaPcObservation: read('work/psa_acquisition_result.json'),
  financialModelChanged: false, normalLlmCalls: 0, aiScheduledTasksResumed: false,
  residuals: { domesticPsa9IndividualSales: 0, authenticatedPokedata: '認証工程待ち・公開一覧と別',
    blockedSources: ['カードラッシュ403', '遊々亭403', '料金403', 'スニダン許諾待ち'],
    horizons: '42/91/119/147日の実証不足', returnBacktest: '最短2026-12-01まで時間待ち' }
};
fs.writeFileSync(path.join(root, 'data/settings-disclosure-acquisition-audit.json'), JSON.stringify(result));
console.log(JSON.stringify(result.delta));
