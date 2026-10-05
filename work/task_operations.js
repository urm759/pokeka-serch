const fs = require('node:fs');
const path = require('node:path');
function build(root, pc = {}) {
  const workflows = ['priority-price-refresh.yml', 'daily-fast-update.yml', 'safe-checkpoint-backfill.yml', 'backfill-data.yml', 'watch-data-health.yml'];
  const scripts = workflows.flatMap(file => {
    const target = path.join(root,'.github/workflows',file);
    if (!fs.existsSync(target)) return [];
    const text = fs.readFileSync(target,'utf8');
    return [{name:text.match(/^name:\s*(.+)/m)?.[1] || file, platform:'GitHub Actions',
      schedule:[...text.matchAll(/cron:\s*["']([^"']+)/g)].map(m=>`${m[1]} UTC`).join('／') || '自動更新なし・手動のみ',
      llmCalls:0,codexCalls:0,url:`https://github.com/urm759/pokeka-serch/blob/main/.github/workflows/${file}`}];
  });
  for (const task of pc.tasks || []) scripts.push({name:task.name,platform:'PCタスク',schedule:task.nextRun ? `最終観測に記載の次回 ${task.nextRun}` : 'ログオン時／次回時刻未観測',
    status:pc.health?.status || task.state,registered:task.registrationValid,lastRun:task.lastRun,observedAt:pc.observedAt,llmCalls:0,codexCalls:0});
  return {scripts,aiFollowup:{id:'automation',name:'価格高速更新と定期バックフィルの公開確認',status:'PAUSED・停止維持',checkedAt:'2026-10-06',
    originalRequestComplete:false,requiresApprovalToResume:true},pcObservation:{at:pc.observedAt || null,status:pc.health?.status || '未観測',
      independentObserverRegistered:pc.independentObserverRegistered ?? null,reason:pc.health?.reason || null},
    domesticPsa9:{individualSalesCards:0,status:'公開表示確認・取得処理未実装',
      reason:'国内公開売買履歴でPSA9の20行を確認。安定成約ID・全期間取得範囲・自動取得/再利用条件は未確認のため未採用。国内集計・推定・海外成約は加算しない。',auditUrl:'./data/domestic-psa9-route-audit.json'}};
}
module.exports={build};
