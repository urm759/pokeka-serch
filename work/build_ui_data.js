const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const codec = require('../ui-data-codec.js');
const ROOT = path.join(__dirname, '..');
function project(name, input) {
  const value = structuredClone(input);
  if (name === 'card-catalog-completion') {
    for (const row of Object.values(value.cards)) delete row.i;
    delete value.unlistedIds; delete value.duplicateIds;
  }
  if (name === 'operational-limit-history') {
    for (const card of Object.values(value.cards)) for (const rows of Object.values(card)) {
      // All caps/dates remain for smoothing. Only the latest prior day's signals
      // affect limit-change checks; full older signals remain in the detail file.
      const previous = rows.filter(r => r.date < value.currentDataDate).at(-1);
      for (const row of rows) if (row !== previous && row !== rows.at(-1)) delete row.signals;
    }
  }
  if (name === 'market-research-summary') delete value.comparisons;
  return value;
}
const SUMMARY = ['card-catalog-completion', 'operational-limit-history', 'market-stability-summary', 'market-research-summary',
  'cardrush-stock-summary', 'hareruya2-stock-summary', 'yuyutei-stock-summary', 'torecacamp-stock-summary',
  'shop-buyback-summary', 'state-a-price-evidence', 'snkr-listing-summary', 'snkr-raw-flip-summary',
  'psa-population-summary', 'card-catalog/analysis', 'card-catalog/search-index', 'update-status'];
function build(root = ROOT) {
  const hashes = {}, aliases = {}, bytes = {};
  const write = (file, text) => {
    const target = path.join(root, file);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target + '.tmp', text); fs.renameSync(target + '.tmp', target);
  };
  for (const name of SUMMARY) {
    const original = `data/${name}.json`, file = `data/ui/${name}.json`;
    if (!fs.existsSync(path.join(root, original))) continue;
    const text = fs.readFileSync(path.join(root, original), 'utf8');
    const packed = JSON.stringify(codec.encode(project(name, JSON.parse(text))));
    write(file, packed); aliases[original] = file;
    bytes[original] = { original: Buffer.byteLength(text), summary: Buffer.byteLength(packed) };
  }
  function scan(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${e.name}`;
      if (e.isDirectory()) scan(file);
      else if (e.name.endsWith('.json') && file !== 'data/ui/manifest.json') {
        const canonical = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
        hashes[file] = crypto.createHash('sha256').update(canonical).digest('hex');
      }
    }
  }
  scan('data');
  const revision = crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
  const result = { version: 1, revision, hashes, aliases, bytes, hashNormalization: 'UTF-8 text; CRLF normalized to LF (Git checkout safe)',
    detailSources: SUMMARY.map(name => `data/${name}.json`),
    rule: 'SHA256を照合して同じ版だけ採用。元データ保持。履歴・海外詳細は必要時に取得。計算・鮮度基準は変更しない' };
  write('data/ui/manifest.json', JSON.stringify(result));
  return result;
}
if (require.main === module) console.log(JSON.stringify({ revision: build().revision }));
module.exports = { build, project, SUMMARY };
