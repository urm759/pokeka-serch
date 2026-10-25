const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./audit_search_profit_consistency');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const evaluationAt = process.argv.find(arg => arg.startsWith('--at='))?.slice(5) || '2026-10-24T20:25:57.880Z';
const epoch = Date.parse(evaluationAt);
assert(Number.isFinite(epoch), 'valid fixed evaluation time');
const ranking = '  marketModel.applyStoreDemandRelativeRanking(calculated, { strongShare: 0.3 });\n';
const intermediate = [
  '  // Store-demand labels are relative ranks and only become final after every',
  '  // card is calculated. Refresh the display classification without changing',
  '  // the already-computed stress price or applying another risk deduction.',
  '  calculated.forEach((card) => {',
  '    if (card.futurePriceForecast) card.supplyPipeline = buildSupplyPipeline(card);',
  '  });',
  '',
].join('\n');
const selection = '  const compareResults = resultSorter();\n';
assert.equal(source.split(ranking).length, 2);
assert.equal(source.split(selection).length, 2);
assert.equal(source.split('return compareResults(left, right);').length, 2);
assert(!source.includes(intermediate), 'intermediate pass must stay removed');

// Reverse only this optimization, keeping every other formula and input identical.
// No git baseline, network, browser, or generated data is needed by this test.
const baseline = source.replace(ranking, ranking + intermediate)
  .replace(selection, '').replace('return compareResults(left, right);', 'return resultSorter()(left, right);');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function instrument(text) {
  const marker = '// Browser event bindings start here;';
  assert.equal(text.split('function buildSupplyPipeline(card) {').length, 2);
  assert.equal(text.split(marker).length, 2);
  return 'let passTestBuilds = 0;\n' + text
    .replace('function buildSupplyPipeline(card) {', 'function buildSupplyPipeline(card) { passTestBuilds++;')
    .replace(marker, `Object.defineProperty(state, '__passTest', {value:{
      reset(){passTestBuilds=0;},get builds(){return passTestBuilds;},
      get expires(){return calculatedCardCache?.expires;},freshnessDeadline,resultSorter
    }});\n${marker}`);
}
function sortFrom(text) {
  const start = text.indexOf(selection) >= 0 ? text.indexOf(selection) : text.indexOf('  const enriched = calculated');
  const end = text.indexOf('  efficiencyAuditCards = calculated;', start);
  assert(start >= 0 && end > start);
  return new Function('calculated', 'state', 'normalizedQuery', 'resultSorter', 'cardSearchExclusions',
    text.slice(start, end) + '\nreturn enriched;');
}
const oldSort = sortFrom(baseline), newSort = sortFrom(source);
const pinnedData = new Map(), pinnedExistence = new Map();
const readFile = fs.readFileSync, exists = fs.existsSync;
const dataPath = file => {
  if (typeof file !== 'string') return null;
  const relative = path.relative(root, file).replace(/\\/g, '/');
  return relative.startsWith('data/') ? relative : null;
};
let before, after;
// Both loaders read the same immutable bytes, even if an external writer intervenes.
// Always restore the shared fs methods, including on a failed load.
try {
  fs.existsSync = file => {
    const relative = dataPath(file);
    if (!relative) return exists(file);
    if (!pinnedExistence.has(relative)) pinnedExistence.set(relative, exists(file));
    return pinnedExistence.get(relative);
  };
  fs.readFileSync = (file, options) => {
    const relative = dataPath(file);
    if (!relative) return readFile(file, options);
    if (!pinnedData.has(relative)) pinnedData.set(relative, readFile(file));
    const bytes = pinnedData.get(relative);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
  };
  before = load(instrument(baseline), evaluationAt);
  after = load(instrument(source), evaluationAt);
} finally {
  fs.readFileSync = readFile;
  fs.existsSync = exists;
}
const inputFiles = [...pinnedData].map(([file, bytes]) => ({file, sha256:sha(bytes)}))
  .sort((a,b) => a.file.localeCompare(b.file));
function assertSourcesStable() {
  for (const {file, sha256} of inputFiles) assert.equal(sha(readFile(path.join(root, file))), sha256,
    `source changed during equivalence run: ${file}`);
  for (const [file, present] of pinnedExistence) assert.equal(exists(path.join(root, file)), present,
    `source availability changed during equivalence run: ${file}`);
}
assertSourcesStable();
const sortedIds = (api, rows, sort) => Array.from(sort(rows, api.state, '',
  () => api.state.__passTest.resultSorter(), c => api.cardSearchExclusions(c)), c => c.id);

function compareCohort(oldInput, newInput) {
  assert.equal(JSON.stringify(oldInput), JSON.stringify(newInput), 'same ordered input cohort');
  before.state.__passTest.reset();
  const oldRows = before.prepareCalculatedCards(oldInput);
  const beforeBuilds = before.state.__passTest.builds;
  after.state.__passTest.reset();
  const newRows = after.prepareCalculatedCards(newInput);
  const afterBuilds = after.state.__passTest.builds;
  assert.equal(oldRows.length, newRows.length);
  const oldHash = crypto.createHash('sha256'), newHash = crypto.createHash('sha256');
  for (let i = 0; i < oldRows.length; i++) {
    const oldCard = JSON.stringify(oldRows[i]), newCard = JSON.stringify(newRows[i]);
    assert.equal(newCard, oldCard, `all serialized fields: ${oldRows[i].id}`);
    oldHash.update(oldCard + '\n'); newHash.update(newCard + '\n');
  }
  const oldIds = sortedIds(before, oldRows, oldSort), newIds = sortedIds(after, newRows, newSort);
  assert.deepEqual(newIds, oldIds, 'all candidate IDs and their order');
  assert.equal(beforeBuilds - afterBuilds, oldRows.filter(c => c.futurePriceForecast).length,
    'exactly one redundant pipeline build removed per forecast card');
  return {cards:oldRows.length, candidateCount:newIds.length,
    serializedBeforeSha256:oldHash.digest('hex'), serializedAfterSha256:newHash.digest('hex'),
    candidateIdsSha256:sha(JSON.stringify(newIds)), beforeBuilds, afterBuilds};
}

const analyzable = api => api.state.cards.filter(c => api.state.catalogCompletion?.cards?.[c.id]?.s === '分析可能');
console.log('Checking the complete analyzable cohort once, at a fixed model clock...');
const fullCohort = compareCohort(analyzable(before), analyzable(after));
assert(fullCohort.cards > 0, 'complete analyzable cohort must be nonempty');
console.log(`Full cohort equal: ${fullCohort.cards} cards; ${fullCohort.candidateCount} ordered candidates`);

const fixtureIds = new Set([
  ...analyzable(before).slice(0, 8),
  ...before.state.cards.filter(c => c.releaseDate === null || before.state.catalogCompletion?.cards?.[c.id]?.s !== '分析可能').slice(0, 4),
].map(c => c.id));
const fixture = api => api.state.cards.filter(c => fixtureIds.has(c.id));
const smallCases = [];
for (const mode of ['combined', 'specified']) {
  for (const planId of ['standard', 'priority', 'express']) {
    for (const days of [91, 119]) {
      for (const api of [before, after]) {
        const plan = api.state.psaServices.plans.find(p => p.id === planId);
        assert(plan, 'saved PSA plan is present');
        Object.assign(api.state, {purchaseMode:mode, psaPlan:planId,
          psaHandlingFee:Number(api.state.psaServices.handlingFee),
          fee:Number(plan.price) + Number(api.state.psaServices.handlingFee), lockDays:days});
      }
      smallCases.push({mode, plan:planId, days, ...compareCohort(fixture(before), fixture(after))});
    }
  }
}

// Exercise production cache identity immediately before and at its exact deadline.
const expiryCases = [];
for (const api of [before, after]) {
  const input = fixture(api);
  for (const mode of ['combined', 'specified']) {
    api.state.purchaseMode = mode;
    const hook = api.state.__passTest;
    const expiry = epoch + 10001;
    for (const field of ['updatedAt', 'inventoryAt']) {
      const offer = {updatedAt:new Date(epoch).toISOString(),
        inventoryAt:new Date(epoch).toISOString(), [field]:new Date(expiry - 48 * 3600000 - 1).toISOString()};
      assert.equal(hook.freshnessDeadline([{currentStoreOffer:offer}], epoch), expiry,
        `${field} expires independently at the exact boundary`);
    }
    const first = api.calculatedCardsForSearch(input, {force:true, now:epoch});
    const deadline = hook.expires;
    assert(deadline > epoch && deadline <= epoch + 60000);
    hook.reset();
    assert.strictEqual(api.calculatedCardsForSearch(input, {now:deadline - 1}), first);
    assert.equal(hook.builds, 0, 'cache hit performs no pipeline builds');
    const refreshed = api.calculatedCardsForSearch(input, {now:deadline});
    assert.notStrictEqual(refreshed, first, 'expiry forces a full calculation');
    assert(hook.builds > 0);
    assert.equal(JSON.stringify(refreshed), JSON.stringify(first),
      'cache deadline alone does not change values at the fixed model clock');
    expiryCases.push({version:api === before ? 'before' : 'after', mode, deadline});
  }
}

// Run the actual render sorting blocks without any DOM. Keep tie order and query ranks.
const tieCases = [];
for (const mode of ['combined', 'specified']) {
  for (const selectedSort of ['expectedProfit-desc', 'cardEfficiency-desc']) {
    after.state.purchaseMode = mode; after.state.sort = selectedSort;
    const selected = after.state.__passTest.resultSorter();
    assert.equal(typeof selected, 'function');
    if (mode === 'specified' || selectedSort === 'cardEfficiency-desc') assert.strictEqual(selected, after.sorters[selectedSort]);
    else assert.notStrictEqual(selected, after.sorters[selectedSort]);
    for (const query of ['', 'query']) {
      const rows = [{id:'a',score:2},{id:'b',score:1},{id:'c',score:2},{id:'d',score:2},{id:'excluded',score:0}];
      const state = {searchRankById:new Map([['a',1],['b',2],['c',1]])};
      const run = sort => {
        let selections = 0;
        const ids = sort(rows, state, query, () => {selections++; return (a,b) => b.score - a.score;},
          card => card.id === 'excluded' ? ['excluded'] : []).map(c => c.id);
        return {ids, selections};
      };
      const oldResult = run(oldSort), newResult = run(newSort);
      assert.deepEqual(newResult.ids, oldResult.ids);
      assert.deepEqual(newResult.ids, query ? ['a','c','b','d'] : ['a','c','d','b']);
      assert.equal(newResult.selections, 1, 'select comparator only once');
      assert(oldResult.selections >= 1, 'rank ties reach the selected comparator');
      if (!query) assert(oldResult.selections > 1);
      tieCases.push({mode, selectedSort, query:Boolean(query), ids:newResult.ids});
    }
  }
}

assertSourcesStable();
const report = {version:2, evaluationAt, status:'pass',
  scope:'Sequential Node correctness checks; no browser or runtime speed comparison. Baseline reverses only the two app optimizations.',
  sourceSha256:sha(source), baselineSha256:sha(baseline),
  sourceData:{pinnedInMemory:true, diskUnchangedBeforeAndAfter:true,
    fingerprint:sha(JSON.stringify(inputFiles)), files:inputFiles},
  fullCohort, smallCases, expiryCases, tieCases,
  allSerializedCardsAndOrderedCandidateIdsEqual:true,
  limitations:'Full analyzable cohort compared once under the saved audit URL settings. Small fixtures cover both modes, three PSA plans, 91/119 days, exact cache expiry, and query/tie ordering. Expiry cache calls use a fixed model clock.'};
if (process.argv.includes('--evidence')) {
  fs.writeFileSync(path.join(__dirname, '20261025-followup-calculation-equivalence.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`PASS calculation pass reuse: ${fullCohort.cards} analyzable cards, ${smallCases.length} small cases, ${expiryCases.length} expiry cases, ${tieCases.length} ordering cases; full pipeline builds ${fullCohort.beforeBuilds} -> ${fullCohort.afterBuilds}`);
