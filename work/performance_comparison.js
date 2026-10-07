const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const metrics = {
  initialBytes: 65536, jsonParseMs: 10, searchMs: 2,
  fullCalculationMs: 100, cacheMs: 2, detailSummary25Ms: 2,
  doubleInitialBytes: 131072, doubleJsonParseMs: 20,
  doubleSearchMs: 4, doubleCalculationMs: 200,
};
function fingerprint(root, files) {
  const hash = crypto.createHash('sha256');
  for (const file of files.slice().sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex');
}
function compare(current, previous) {
  const comparable = previous && current.comparisonKey === previous.comparisonKey;
  if (!comparable) return { status: 'baseline-pending', reason: '同環境・同条件の前回記録なし', warnings: [], rows: [] };
  const dataChanged = current.dataFingerprint !== previous.dataFingerprint;
  const codeChanged = current.codeFingerprint !== previous.codeFingerprint;
  const attribution = codeChanged && dataChanged ? 'コードとデータの両方変更・原因の断定不可'
    : codeChanged ? 'コード変更（実行環境の雑音も含む）'
      : dataChanged ? 'データ変更（件数・内容・実行環境の雑音も含む）' : '同じコード・データ（実行環境の雑音を含む）';
  const rows = Object.entries(metrics).map(([metric, floor]) => {
    const before = previous[metric], after = current[metric];
    const valid = Number.isFinite(before) && before >= 0 && Number.isFinite(after) && after >= 0;
    const delta = valid ? after - before : null;
    const changePct = valid && before > 0 ? delta / before * 100 : null;
    return { metric, before: valid ? before : null, after: valid ? after : null, delta, changePct,
      warning: valid && delta > floor && after > before * 1.3 };
  });
  const perCard = metric => {
    const valid = current.cardCount > 0 && previous.cardCount > 0;
    return { metric, before: valid ? previous[metric] / previous.cardCount : null,
      after: valid ? current[metric] / current.cardCount : null };
  };
  return { status: rows.some(r => r.warning) ? 'warning' : 'stable', previousAt: previous.generatedAt,
    previousCards: previous.cardCount, currentCards: current.cardCount, dataChanged, codeChanged, attribution,
    threshold: '中央値が前回比30%超かつ絶対雑音幅超。固定予算/値不一致とは別の性能警告',
    warnings: rows.filter(r => r.warning).map(r => r.metric), rows,
    normalized: ['initialBytes', 'jsonParseMs', 'fullCalculationMs'].map(perCard) };
}
function append(history, current) {
  const rows = Array.isArray(history?.records) ? history.records : [];
  const previous = rows.slice().reverse().find(r => r.status === 'pass' && r.comparisonKey === current.comparisonKey);
  current.comparison = compare(current, previous);
  return { version: 1, records: rows.concat(current).slice(-90) };
}
module.exports = { compare, append, fingerprint };
