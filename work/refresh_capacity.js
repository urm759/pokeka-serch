function estimate({importantCount, eligibleCount, manualCount=0, retryCount=0, blocked=false,
  verifiedCount, durationMs, budgetMs=360000, intervalMs=7200000, freshnessMs=21600000, normalShare=0.25}) {
  const measuredRate=Number.isFinite(verifiedCount)&&verifiedCount>0&&durationMs>0 ? verifiedCount/durationMs : null;
  const slots=freshnessMs/intervalMs;
  const availablePerRun=blocked ? 0 : measuredRate==null ? null : Math.floor(measuredRate*budgetMs*(1-normalShare));
  const requiredPerRun=Math.ceil(importantCount/slots);
  const deficitPerRun=availablePerRun==null ? null : Math.max(0,requiredPerRun-availablePerRun);
  const queueOverflow=availablePerRun==null ? null : Math.max(0,eligibleCount-availablePerRun);
  const sustainable=blocked||manualCount>0||retryCount>0||intervalMs>=freshnessMs ? false : deficitPerRun==null ? null : deficitPerRun===0;
  return {importantCount,eligibleCount,manualCount,retryCount,measuredCardsPerMinute:measuredRate==null?null:measuredRate*60000,
    budgetMs,intervalMs,freshnessMs,normalShare,requiredPerRun,availablePerRun,deficitPerRun,queueOverflow,sustainable,
    reason:blocked?'アクセス停止・処理枠0':intervalMs>=freshnessMs?'実績成功間隔が6時間以上・取得速度だけでは期限維持不可':manualCount||retryCount?'手動待ち・再試行待ちがあり全対象の期限維持不可':measuredRate==null?'実測不足':deficitPerRun>0?'6時間目標に対し処理能力不足':queueOverflow>0?'平均能力は足りるが今回の対象が処理枠超過':'平均能力上は維持可能・実行間の実績確認が必要',
    basis:'実測成功件数/処理時間からの能力推計。Actions遅延・失敗変動を保証せず、固定群を減らして改善しない'};
}
module.exports={estimate};
