const fs=require('node:fs'),path=require('node:path');
const {snapshot,compare,unpack}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const before=unpack(read('work/search-organization-acquisition-before.json')),after=snapshot(root);
const monitor=read('data/priority-price-monitor.json');
const prices=read('work/candidate-shop-refresh.json').sources?.hareruya2;
const discovery=read('data/state-a-url-discovery.json');
const report={version:1,at:after.at,...compare(before,after),
  evidence:'今回の保存ベースラインからの実取得・必須項目・分析可能・48時間購入価格の鮮度を別集計。手動確認は定期維持の証明ではない。',
  priceRun:prices?{startedAt:prices.startedAt,endedAt:prices.endedAt,status:prices.status,attempted:prices.attemptedCount,confirmed:prices.refreshedCount,newLinked:prices.newLinkedCount,changed:prices.changedCount,httpRequests:prices.httpRequests,durationMs:prices.durationMs,stopReason:prices.stopReason,nextId:prices.nextId}:null,
  discovery:discovery,
  fixedCohortFreshness:monitor.fixedCohortFreshness,
  regularOperation:'既存非AI更新を維持。修正版定期実行は次回の取得・保存・公開受領証で確認。AI予定タスクは再開しない。',llmCalls:0,codexCalls:0};
fs.writeFileSync(path.join(root,'data/search-organization-outcomes.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
