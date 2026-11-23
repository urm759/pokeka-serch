// 4-J K: link counts taken before finalize must equal the final links. pendingDetachments()
// predicts exactly what build() detaches, without writing. Local copies only; no requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const q = require('./quarantine_shop_identity');
const repo = path.join(__dirname, '..');
const FILES = ['data/pokemon-cards.json', 'data/shop-identity-quarantine.json', 'work/shop-identity-quarantine-history.json',
  ...['cardrush', 'hareruya2', 'yuyutei', 'torecacamp'].flatMap(s => [`work/${s}_catalog.json`, `data/${s}-stock-summary.json`])];
const copy = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'link-final-'));
  for (const f of FILES) if (fs.existsSync(path.join(repo, f))) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.copyFileSync(path.join(repo, f), path.join(root, f)); }
  return root;
};
const readCards = root => JSON.parse(fs.readFileSync(path.join(root, 'data/pokemon-cards.json'), 'utf8'));
const fields = ['cardrush', 'hareruya2', 'yuyutei', 'torecacamp'];
const detachedBy = (before, after) => Object.fromEntries(fields.map(s => {
  const a = new Map(after.map(c => [c.id, c]));
  return [s, new Set(before.filter(c => c[`${s}Url`] && !a.get(c.id)?.[`${s}Url`]).map(c => c.id))];
}));
const same = (pending, actual) => { for (const s of fields) assert.deepEqual([...pending[s]].sort(), [...actual[s]].sort(), s); };

// 1) Real data, with every quarantined link put back the way the link updaters re-attach them.
const root = copy();
const audit = JSON.parse(fs.readFileSync(path.join(root, 'data/shop-identity-quarantine.json'), 'utf8'));
const cards = readCards(root), byId = new Map(cards.map(c => [c.id, c]));
let reattached = 0;
for (const row of audit.rows || []) { const c = byId.get(row.id); if (c && row.url && !c[`${row.source}Url`]) { c[`${row.source}Url`] = row.url; reattached++; } }
fs.writeFileSync(path.join(root, 'data/pokemon-cards.json'), JSON.stringify(cards));
assert(reattached > 100, 'the real quarantine re-attaches over a hundred links (4-E: about 188)');
const before = readCards(root), pending = q.pendingDetachments(root);
assert.deepEqual(readCards(root), before, 'prediction writes nothing');
q.build(root);
const actual = detachedBy(before, readCards(root));
same(pending, actual);
const predicted = fields.reduce((n, s) => n + pending[s].size, 0);
assert.equal(predicted, reattached, 'every re-attached quarantined link is predicted and then detached');
// After finalize nothing is left to detach.
for (const s of fields) assert.equal(q.pendingDetachments(root)[s].size, 0);
fs.rmSync(root, { recursive: true, force: true });

// 2) Published data as it is now: the prediction matches build() too (normally nothing pending).
const now = copy(); const nowBefore = readCards(now), nowPending = q.pendingDetachments(now);
q.build(now); same(nowPending, detachedBy(nowBefore, readCards(now)));
fs.rmSync(now, { recursive: true, force: true });

// 3) The coverage audit counts final links and shows what finalize will remove.
const src = fs.readFileSync(path.join(__dirname, 'audit_link_coverage.js'), 'utf8');
assert.match(src, /pendingDetachments\(ROOT\)/);
for (const s of fields) assert.match(src, new RegExp(`${s}: \\{ matched: linked\\("${s}"\\), heldBeforeFinalize: pending\\.${s}\\.size \\}`));
console.log(`PASS link counts before finalize equal the final links: ${predicted} re-attached quarantined links predicted exactly and detached; prediction writes nothing`);
