const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const access = require('./overseas_access_policy'), analysis = require('./private_overseas_analysis');
const escape = v => String(v ?? '未取得').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (v, suffix = '') => typeof v === 'number' && Number.isFinite(v) ? escape(v.toLocaleString('ja-JP', { maximumFractionDigits: 2 })) + suffix : '未取得';
function render(report) {
  const rows = report.rows.map(row => {
    const r = row.result, support = row.domesticContext?.support;
    const gap = r.gapPct == null ? '比較不可' : `海外比${r.gapPct > 0 ? '+' : ''}${number(r.gapPct, '%')} | ${escape(r.label)}`;
    return `<article><h2>${escape(row.name)}</h2><strong>${gap}</strong><p>国内 ${number(row.domestic?.value, '円')} / 海外円換算 ${number(r.foreignJpy, '円')}</p>
      <p>国内買取支持 ${support?.multiStoreSupport ? '複数店あり' : '未確認・単独支持と区別'} / 最高提示 ${number(support?.highestQuote?.ratio, '倍')} / 同店通常比 ${number(support?.highestQuote?.premium, '%')}</p>
      <p class="warn">${escape(r.reasons.join(' / ') || r.note)}</p><details><summary>根拠・日時・国内需要</summary><pre>${escape(JSON.stringify(row, null, 2))}</pre></details></article>`;
  }).join('');
  return `<!doctype html><html lang="ja" data-private-overseas="true"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>内部用・内外価格比較</title>
    <style>body{font-family:Georgia,serif;background:#101c25;color:#f1f5f9;margin:auto;padding:20px;max-width:980px;line-height:1.6}article{border:1px solid #486170;border-radius:10px;padding:16px;margin:16px 0}strong{color:#93d7fb}h1{font-size:24px}h2{font-size:19px}.warn{color:#ffd080}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;padding:10px}p{overflow-wrap:anywhere}</style>
    <h1>内部用・内外価格比較</h1><p>ローカル限定 / 公開GO・仕入れ式へ不使用 / ${escape(report.at)}</p>
    <p class="warn">${escape(report.reason || '価格差は将来の上昇・下落を保証しません')}</p><p>ほぼ同水準: ±${number(report.policy.neutralBandPct, '%')}以内。正は海外高、負は国内高。オリパ需要は未検証仮説です。</p>
    <p>照合済みメタデータ ${number(report.coverage.exactMetadataMappings)}枚 / 比較可能 ${number(report.coverage.comparable)}枚。対象内対応率の分母は未確定。</p>${rows || '<p>比較できる許諾済み入力はありません。取得日時を成約日・価格確認日に代用しません。</p>'}</html>`;
}
function createServer(root) {
  return http.createServer((req, res) => {
    const host = req.headers.host || '';
    if (host !== `127.0.0.1:${res.socket.localPort}` || req.headers.origin && req.headers.origin !== `http://${host}`
      || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end('Forbidden'); return; }
    if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      const report = JSON.parse(fs.readFileSync(access.privatePath(root, 'analysis/report.json'), 'utf8'));
      if (report.schema !== analysis.SCHEMA) throw Error('Invalid private schema');
      // Revoked permission hides old reports without deleting preserved evidence.
      const view = access.allowed(root) ? report : { ...report, rows: [], reason: '利用範囲・契約確認待ち。保存済み原票を保持し、分析値の表示を保留。' };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(render(view));
    } catch { res.writeHead(503); res.end('Private report unavailable; rebuild locally'); }
  });
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..'); analysis.build(root);
  const server = createServer(root);
  server.listen(8879, '127.0.0.1', () => console.log('Internal only: http://127.0.0.1:8879/ (stop with Ctrl+C)'));
}
module.exports = { render, createServer };
