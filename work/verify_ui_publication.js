const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const codec = require('../ui-data-codec.js');
const base = 'https://urm759.github.io/pokeka-serch/';
async function read(file) {
  const response = await fetch(base + file, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return response.text();
}
async function main() {
  const html = await read('index.html?verify=' + Date.now());
  assert(html.includes('20261010-isolation-v1') && html.includes('psa-plan-model.js') && html.includes('ui-data-codec.js'));
  const manifest = JSON.parse(await read('data/ui/manifest.json?verify=' + Date.now()));
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/ui/manifest.json'),'utf8'));
  assert.equal(manifest.revision, expected.revision, 'must verify the newly published revision');
  const verified = [];
  let completion, update, audit;
  for (const original of ['data/card-catalog-completion.json','data/update-status.json','data/card-catalog/analysis.json','data/daily-source-isolation.json','data/effective-price-cadence.json','data/psa-japan-services.json','data/operation-improvement-audit.json','data/torecacamp-stock-summary.json']) {
    const file = manifest.aliases[original] || original;
    const text = await read(`${file}?v=${manifest.hashes[file]}`);
    assert.equal(crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex'), manifest.hashes[file], file);
    const data = codec.decode(JSON.parse(text));
    if (original.includes('card-catalog-completion')) completion = data;
    if (original.includes('update-status')) update = data;
    if (original.includes('operation-improvement')) audit = data;
    verified.push(file);
  }
  assert.equal(completion.summary.analyzable, audit.counts.analyzableAfter);
  assert.equal(completion.summary.total, audit.counts.after);
  const population = codec.decode(JSON.parse(await read((manifest.aliases['data/psa-population-summary.json'] || 'data/psa-population-summary.json') + '?verify=' + Date.now())));
  const localPopulation=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/psa-population-summary.json'),'utf8'));
  assert.equal(Object.keys(population.cards).length, Object.keys(localPopulation.cards).length);
  assert.equal(Object.keys(population.specificationHeld).length,Object.keys(localPopulation.specificationHeld).length);
  assert.equal(update.complete, false, 'partial data must not become all-complete');
  const performance=JSON.parse(await read('data/performance-guard.json?verify='+Date.now()));
  assert(performance.calculationValuesEqual);
  console.log(JSON.stringify({url:base,revision:manifest.revision,verified,
    total:completion.summary.total,analyzable:completion.summary.analyzable,
    filled:audit.counts.filledCards,newAnalyzable:audit.counts.newlyAnalyzable,
    psaLinked:Object.keys(population.cards).length,currentHeld:Object.keys(population.specificationHeld).length,allComplete:update.complete}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
