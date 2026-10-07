const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {audit} = require('./refresh_cadence');
const {lead} = require('./proactive_refresh');
const {project} = require('./build_ui_data');
const search = require('../search-index-model');
const root = path.join(__dirname,'..');
const now = Date.parse('2026-10-07T10:00:00Z');
const rows = [
  {id:1,event:'schedule',status:'completed',conclusion:'success',created_at:'2026-10-06T21:02:19Z',updated_at:'2026-10-06T21:09:40Z'},
  {id:2,event:'schedule',status:'completed',conclusion:'failure',created_at:'2026-10-07T01:38:01Z',updated_at:'2026-10-07T01:46:42Z'},
  {id:3,event:'schedule',status:'completed',conclusion:'success',created_at:'2026-10-07T08:49:08Z',updated_at:'2026-10-07T08:58:14Z'}
];
const result = audit(rows,{now});
assert.equal(result.lastSuccessfulIntervalMs,42514000);
assert(result.missingSlots>0);
assert.equal(result.failedRuns.length,1);
assert.equal(lead({observedSuccessfulIntervalMs:result.lastSuccessfulIntervalMs}).intervalMs,42514000);
assert.equal(lead({observedSuccessfulIntervalMs:result.lastSuccessfulIntervalMs}).leadMs,6*3600000-1);
assert(lead({observedSuccessfulIntervalMs:result.lastSuccessfulIntervalMs}).capacityWarning);
assert.equal(audit([],{now}).observedSuccessfulIntervalMs,null);
const index = JSON.parse(fs.readFileSync(path.join(root,'data/card-catalog/search-index.json')));
assert.deepEqual(search.hydrate(project('card-catalog/search-index',index).cards),index.cards,'all search fields/IDs restored exactly');
for(const q of ['M2 110/080','ブラッキー','2020','S9a 083/067']) {
  assert.deepEqual(search.search(search.hydrate(project('card-catalog/search-index',index).cards),q),search.search(index.cards,q));
}
const raw = JSON.parse(fs.readFileSync(path.join(root,'data/snkr-raw-flip-summary.json')));
const slim = project('snkr-raw-flip-summary',raw);
for(const [id,row] of Object.entries(raw.cards)) {
  const retained = {...row}; delete retained.identity; delete retained.http;
  assert.deepEqual(slim.cards[id],retained,'prices,identity-valid flags,dates and exclusions unchanged');
}
const health = require('../update-health-model');
const summary = health.summarizeIssue({reason:"Cannot find module './focus_monitor.js'\n"+'stack trace'.repeat(100)});
assert(summary.cause.includes('依存')); assert(JSON.stringify(summary).length<250);
assert.equal(health.summarizeIssue({reason:'HTTP 403'}).action.includes('回避しない'),true);
console.log('PASS cadence gaps, freshness unchanged, complete search equivalence, financial data retained, concise errors');
