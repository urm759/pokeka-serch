const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const codec = require('../ui-data-codec.js');
const { project, SUMMARY } = require('./build_ui_data.js');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
for (const v of [null, 0, -5, ['test', 'test'], { a: [], b: null, c: 0, d: -4, e: '取得不能', f: '取得不能' }]) {
  assert.deepEqual(codec.decode(codec.encode(v)), v, 'lossless codec including null/negative/zero');
}
const manifest = read('data/ui/manifest.json');
for (const [file, hash] of Object.entries(manifest.hashes)) {
  const text = fs.readFileSync(path.join(root, file),'utf8');
  assert.equal(crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex'), hash, `published revision mismatch: ${file}`);
  assert.equal(crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n').replace(/\r\n/g,'\n')).digest('hex'),hash,'Windows/Linux checkout must share a revision');
}
for (const name of SUMMARY) {
  const expected = project(name, read(`data/${name}.json`));
  const file = manifest.aliases[`data/${name}.json`];
  assert.deepEqual(codec.decode(read(file)), expected);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), manifest.hashes[file]);
}
const history = read('data/operational-limit-history.json');
const slim = project('operational-limit-history', history);
for (const [id, card] of Object.entries(history.cards)) for (const [condition, rows] of Object.entries(card)) {
  const original = rows.filter(r => r.date < history.currentDataDate);
  const compact = slim.cards[id][condition].filter(r => r.date < history.currentDataDate);
  assert.deepEqual(compact.at(-1), original.at(-1), 'previous-day signals remain for quarantine checks');
  assert.deepEqual(compact.map(r=>[r.date,r.operational,r.theoretical,r.calculationVersion]), original.map(r=>[r.date,r.operational,r.theoretical,r.calculationVersion]));
}
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert(source.includes('digest !== expected') && source.includes('if (uiDataInvalid) throw'));
const init = source.slice(source.indexOf('async function init()'));
for (const field of ['candidate-daily-audit', 'candidate-availability-audit', 'market-backtest-summary', 'update-history']) assert(!init.slice(0,init.indexOf('// Browser event bindings')).includes(`fetchJsonMaybe("./data/${field}.json")`), 'closed audits must not load at startup');
assert(fs.readFileSync(path.join(__dirname, 'finalize_update_status.js'), 'utf8').includes("require('./build_ui_data.js').build(ROOT)"));
const mtimes = Object.fromEntries(Object.values(manifest.aliases).map(file=>[file,fs.statSync(path.join(root,file)).mtimeMs]));
const rebuilt = require('./build_ui_data.js').build(root);
assert.equal(rebuilt.revision, manifest.revision, 'unchanged inputs must not create a new snapshot version');
for (const [file,mtime] of Object.entries(mtimes)) assert.equal(fs.statSync(path.join(root,file)).mtimeMs,mtime,'unchanged summaries must not be rewritten');
console.log(JSON.stringify({ summaryFiles: SUMMARY.length, nullPreserved: true, pinnedRevision: manifest.revision, olderCapsPreserved: true }));
codec.decodeAsync(codec.encode({ cards: Object.fromEntries(Array.from({length:500},(_,i)=>['pk-'+i,{value:i,missing:null}])) }))
  .then(v=>assert.equal(Object.keys(v.cards).length,500));
