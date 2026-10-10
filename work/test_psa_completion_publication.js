const assert = require('node:assert/strict'), path = require('node:path');
const { publicationEnvironment } = require('./psa_handoff.js');
const { planSets } = require('./psa_pending_sets.js');
const env = publicationEnvironment('/publication', { PSA_ACQUISITION_ROOT: '/pc-inbox', TOKEN: 'preserved' });
assert.equal(env.PSA_ACQUISITION_ROOT, '/publication');
assert.equal(env.PSA_MANIFEST_PATH, path.join('/publication', 'work/psa_set_urls.json'));
assert.equal(env.TOKEN, 'preserved');
const now = Date.parse('2026-10-11T00:00:00Z');
const args = { now, manifest: ['normal', 'missing', 'fresh', 'blocked'].map(url => ({url})), completed: ['missing', 'fresh', 'blocked'],
  priority: {rows: ['missing','fresh','blocked'].map(sourceSetUrl => ({sourceSetUrl}))},
  rows: [{sourceUrl:'missing',fetchedAt:'2026-10-08T00:00:00Z'}, {sourceUrl:'fresh',fetchedAt:'2026-10-10T23:00:00Z',captureVersion:2,completeSnapshot:true}],
  retries: {blocked:{status:'manual-wait',kind:'access'}} };
const plan = planSets(args);
assert.deepEqual(plan.pending.map(e=>e.url), ['normal','missing']);
assert.equal(plan.freshMissingSets, 1, 'a freshly complete but unmatched set is not refetched in an infinite loop');
assert.equal(plan.missingRecheckSets, 1, 'completed checkpoint must not hide missing cards forever');
assert.deepEqual(planSets({...args,reviews:[{sourceUrl:'fresh'}]}).pending.map(e=>e.url), ['normal','missing']);
assert.equal(planSets({...args,retries:{missing:{status:'retry-wait',nextRetryAt:'2026-10-12T00:00:00Z'}}}).pending.some(e=>e.url==='missing'),false);
console.log('PSA completion publication and set scheduling tests passed');
