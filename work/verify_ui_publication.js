const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const codec = require('../ui-data-codec.js');
const base = 'https://urm759.github.io/pokeka-serch/';
async function read(file) {
  const response = await fetch(base + file, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return response.text();
}
async function main() {
  const html = await read('index.html?verify=' + Date.now());
  assert(html.includes('20261007-ui-summary-v1') && html.includes('ui-data-codec.js'));
  const manifest = JSON.parse(await read('data/ui/manifest.json?verify=' + Date.now()));
  const verified = [];
  let completion, update, audit;
  for (const original of ['data/card-catalog-completion.json','data/update-status.json','data/card-catalog/analysis.json','data/ui-improvement-audit.json']) {
    const file = manifest.aliases[original] || original;
    const text = await read(`${file}?v=${manifest.hashes[file]}`);
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'), manifest.hashes[file], file);
    const data = codec.decode(JSON.parse(text));
    if (original.includes('card-catalog-completion')) completion = data;
    if (original.includes('update-status')) update = data;
    if (original.includes('ui-improvement')) audit = data;
    verified.push(file);
  }
  assert.equal(completion.summary.total, audit.after.total);
  assert.equal(completion.summary.analyzable, audit.after.analyzable);
  assert.equal(update.complete, false, 'partial data must not become all-complete');
  assert(audit.modelPerformance.cases.every(c=>c.financialAndCandidateEquality));
  console.log(JSON.stringify({url:base,revision:manifest.revision,verified,
    total:completion.summary.total,analyzable:completion.summary.analyzable,
    filled:audit.filledCards.length,newAnalyzable:audit.newlyAnalyzable.length,
    recovered:audit.purchaseRecovery.freshnessRecovered,allComplete:update.complete}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
