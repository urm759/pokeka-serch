const fs = require('node:fs');
const path = require('node:path');
function build(root, pc = {}) {
  const workflows = fs.readdirSync(path.join(root,'.github/workflows')).filter(file=>/\.ya?ml$/.test(file)).sort();
  const scripts = workflows.flatMap(file => {
    const target = path.join(root,'.github/workflows',file);
    if (!fs.existsSync(target)) return [];
    const text = fs.readFileSync(target,'utf8');
    return [{name:text.match(/^name:\s*(.+)/m)?.[1] || file, platform:'GitHub Actions',role:file==='weekly-full-tests.yml'?'回帰テスト':'取得・探索・監視',
      schedule:[...text.matchAll(/cron:\s*["']([^"']+)/g)].map(m=>`${m[1]} UTC`).join('／') || '自動更新なし・手動のみ',
      llmCalls:0,codexCalls:0,url:`https://github.com/urm759/pokeka-serch/blob/main/.github/workflows/${file}`}];
  });
  for (const task of pc.tasks || []) scripts.push({name:task.name,platform:'PCタスク',schedule:task.nextRun ? `最終観測に記載の次回 ${task.nextRun}` : 'ログオン時／次回時刻未観測',
    status:pc.health?.status || task.state,registered:task.registrationValid,lastRun:task.lastRun,observedAt:pc.observedAt,llmCalls:0,codexCalls:0});
  return {scripts,aiFollowup:{id:'automation',name:'価格高速更新と定期バックフィルの公開確認',status:'PAUSED・停止維持',checkedAt:'2026-10-06',
    originalRequestComplete:false,requiresApprovalToResume:true},pcObservation:{at:pc.observedAt || null,status:pc.health?.status || '未観測',
      independentObserverRegistered:pc.independentObserverRegistered ?? null,reason:pc.health?.reason || null},
    domesticPsa9:{individualSalesCards:0,status:'取得条件確認待ち・取得処理未実装',
      reason:'公開PSA9履歴20行は未採用。規約第7条1項13号の自動収集禁止を確認。正規データ提供・明示許諾が必要。同日同額の行は統合せず、安定IDがない観測同士は合算しない。国内集計・推定・海外成約は加算しない。',auditUrl:'./data/domestic-psa9-route-audit.json'}};
}
module.exports={build};
