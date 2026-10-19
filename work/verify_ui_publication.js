const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const codec = require('../ui-data-codec.js');
const base = 'https://urm759.github.io/pokeka-serch/';
function validatePublishedHtml(html, expected) {
  assert.equal(html.replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'),'published HTML and cache-version URLs must match the saved version');
  for (const feature of ['exploration-metrics.js','settings-disclosure.js','keyed-card-renderer.js','ui-data-codec.js','efficiencyMinInput','observation200MaxInput','value="current-target"','value="obs200"']) assert(html.includes(feature),`published feature missing: ${feature}`);
}
async function read(file) {
  const response = await fetch(base + file, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return response.text();
}
async function main() {
  const html = await read('index.html?verify=' + Date.now());
  validatePublishedHtml(html,fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'));
  const manifest = JSON.parse(await read('data/ui/manifest.json?verify=' + Date.now()));
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/ui/manifest.json'),'utf8'));
  assert.equal(manifest.revision, expected.revision, 'must verify the newly published revision');
  const verified = [];
  const disclosureScript = await read('settings-disclosure.js?verify=' + Date.now());
  assert.equal(disclosureScript.replace(/\r\n/g,'\n'), fs.readFileSync(path.join(__dirname,'../settings-disclosure.js'),'utf8').replace(/\r\n/g,'\n'));
  for (const file of ['data/settings-disclosure-acquisition-audit.json','data/settings-disclosure-browser-validation.json','data/card-efficiency-audit.json','data/card-efficiency-browser-validation.json']) {
    const text = await read(file+'?verify='+Date.now());
    assert.equal(crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex'),manifest.hashes[file],file);
    verified.push(file);
  }
  const coverageText = await read('data/buyback-posting-coverage.json?v=' + manifest.hashes['data/buyback-posting-coverage.json']);
  assert.equal(crypto.createHash('sha256').update(coverageText.replace(/\r\n/g,'\n')).digest('hex'), manifest.hashes['data/buyback-posting-coverage.json']);
  verified.push('data/buyback-posting-coverage.json');
  let completion, update, audit;
  for (const original of ['data/card-catalog-completion.json','data/update-status.json','data/card-catalog/analysis.json','data/daily-source-isolation.json','data/effective-price-cadence.json','data/psa-japan-services.json','data/operation-improvement-audit.json','data/torecacamp-stock-summary.json','data/source-recovery-audit.json','data/update-failure-audit.json','data/monitor-observation.json','data/update-health-banner.json','data/one-item-completion-audit.json','data/expansion-freshness-audit.json','data/psa10-period-summary.json','data/search-profit-consistency-audit.json']) {
    const file = manifest.aliases[original] || original;
    const text = await read(`${file}?v=${manifest.hashes[file]}`);
    assert.equal(crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex'), manifest.hashes[file], file);
    const data = codec.decode(JSON.parse(text));
    if (original.includes('card-catalog-completion')) completion = data;
    if (original.includes('update-status')) update = data;
    if (original.includes('operation-improvement')) audit = data;
    verified.push(file);
  }
  const localCompletion = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/card-catalog-completion.json'),'utf8'));
  assert.equal(completion.summary.analyzable, localCompletion.summary.analyzable);
  const referenceFile='data/search-first-reference-audit.json';
  const referenceText=await read(referenceFile+'?v='+manifest.hashes[referenceFile]);
  assert.equal(crypto.createHash('sha256').update(referenceText.replace(/\r\n/g,'\n')).digest('hex'),manifest.hashes[referenceFile]);
  const reference=JSON.parse(referenceText);
  assert(reference.financialCalculationsUnchanged && reference.specifiedUrl.idsUnchanged);
  verified.push(referenceFile);
  assert.equal(completion.summary.total, localCompletion.summary.total);
  const population = codec.decode(JSON.parse(await read((manifest.aliases['data/psa-population-summary.json'] || 'data/psa-population-summary.json') + '?verify=' + Date.now())));
  const localPopulation=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/psa-population-summary.json'),'utf8'));
  assert.equal(Object.keys(population.cards).length, Object.keys(localPopulation.cards).length);
  assert.equal(Object.keys(population.specificationHeld).length,Object.keys(localPopulation.specificationHeld).length);
  assert.equal(update.complete, false, 'partial data must not become all-complete');
  const performance=JSON.parse(await read('data/performance-guard.json?verify='+Date.now()));
  assert(performance.calculationValuesEqual);
  const efficiency=JSON.parse(await read('data/card-efficiency-audit.json?verify='+Date.now()));
  assert(efficiency.financialCalculationsUnchanged && efficiency.check.candidateIdsEqual);
  for (const file of ['app.js','exploration-metrics.js','search-index-model.js']) {
    const published=await read(file+'?verify='+Date.now());
    assert.equal(published.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n'),file);
  }
  for (const file of ['styles.css','search-controls.js','current-market-model.js','data/psa10-observation-receipt.json','data/observation-search-report.json','data/current-profit-guide-validation.json','data/current-guide-progress.json','data/current-guide-browser-validation.json','data/candidate-continuity-audit.json','data/runtime-availability-audit.json','data/runtime-improvement-outcomes.json','data/runtime-browser-validation.json','data/observation-efficiency-validation.json','data/four-period-efficiency-validation.json','data/four-period-checkpoint-recovery.json','data/search-profile-cycle-progress.json']) {
    const published=await read(file+'?verify='+Date.now());
    assert.equal(published.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n'),file);
    verified.push(file);
  }
  const supportFiles = ['data/trade-demand-audit.json','data/trade-demand-outcomes.json','data/buyback-support-audit.json','data/buyback-support-isolation.json','data/store-support-acquisition.json','data/purchase-issue-alias-audit.json',
    'data/domestic-trade-source-audit.json','data/modern-high-rarity-audit.json','data/pop-operations-outcomes.json',
    'data/psa-pop-coverage.json','data/psa-pop-recovery-audit.json','data/pop-resilience-outcomes.json',
    ...fs.readdirSync(path.join(__dirname,'../data/psa-pop-recovered')).filter(name=>name.endsWith('.json')).map(name=>'data/psa-pop-recovered/'+name),
    ...fs.readdirSync(path.join(__dirname,'../data/psa-pop-glance')).filter(name=>name.endsWith('.json')).map(name=>'data/psa-pop-glance/'+name),
    ...fs.readdirSync(path.join(__dirname,'../data/psa10-periods')).filter(name=>name.endsWith('.json')).map(name=>'data/psa10-periods/'+name),
    ...fs.readdirSync(path.join(__dirname,'../data/buyback-support-details')).filter(name=>name.endsWith('.json')).map(name=>'data/buyback-support-details/'+name)];
  for (const file of supportFiles) {
    const published=await read(file+'?verify='+Date.now());
    assert.equal(published.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n'),file);
    verified.push(file);
  }
  const supportFile=manifest.aliases['data/buyback-observation-summary.json'] || 'data/buyback-observation-summary.json';
  const supportText=await read(supportFile+'?verify='+Date.now());
  assert.equal(crypto.createHash('sha256').update(supportText.replace(/\r\n/g,'\n')).digest('hex'),manifest.hashes[supportFile],supportFile);
  verified.push(supportFile);
  if(process.argv.includes('--record-recovery')) {
    const commit=process.env.PUBLIC_COMMIT;
    assert(/^[a-f0-9]{40}$/.test(commit||''),'explicit verified publication commit required');
    const recovery=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/source-recovery-audit.json'),'utf8'));
    recovery.publicationStatus='取得元回収分の必須検証・Pages公開・公開JSON照合済み（退避全体の完了とは別）';
    recovery.publicationEvidence={commit,revision:manifest.revision,verifiedAt:new Date().toISOString(),verifiedFiles:verified};
    require('./acquisition_retry').atomicWrite(path.join(__dirname,'../data/source-recovery-audit.json'),recovery,0);
  }
  console.log(JSON.stringify({url:base,revision:manifest.revision,verified,
    total:completion.summary.total,analyzable:completion.summary.analyzable,
    filled:audit.counts.filledCards,newAnalyzable:audit.counts.newlyAnalyzable,
    psaLinked:Object.keys(population.cards).length,currentHeld:Object.keys(population.specificationHeld).length,allComplete:update.complete}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={validatePublishedHtml};
