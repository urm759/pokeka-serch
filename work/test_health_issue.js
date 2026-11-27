// 4-J T1: one GitHub issue for NEW monitor alerts only. No network: gh is replaced by a recorder.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { plan, run, LABEL } = require('./sync_health_issue');
const known = ['a', 'b'];
const alert = (key, reason = 'r-' + key) => ({ key, reason, category: '確認が必要' });
// Known alerts alone never notify; nothing open means nothing to do.
assert.deepEqual(plan([alert('a'), alert('b')], known, null), { action: 'none' });
// A new alert opens one issue with its keys recorded in the body.
const created = plan([alert('a'), alert('c')], known, null);
assert.equal(created.action, 'create'); assert.deepEqual(created.keys, ['c']); assert(created.body.includes('<!-- monitor-keys: c -->'));
// Same open set: no update (no repeated notification every hour).
assert.equal(plan([alert('c')], known, { number: 7, body: created.body }).action, 'none');
// A further new alert edits the body and comments only about the added one.
const more = plan([alert('c'), alert('d', 'second problem')], known, { number: 7, body: created.body });
assert.equal(more.action, 'update'); assert.equal(more.number, 7); assert(more.comment.includes('second problem')); assert(!more.comment.includes('r-c'));
// When only known alerts remain, the open issue is closed.
assert.deepEqual(plan([alert('a')], known, { number: 7, body: created.body }), { action: 'close', number: 7 });
// Run with a fake gh: create path calls label create (tolerated failure) then issue create.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-issue-'));
fs.mkdirSync(path.join(root, 'data')); fs.mkdirSync(path.join(root, 'work'));
fs.writeFileSync(path.join(root, 'data/update-health.json'), JSON.stringify({ issues: [alert('a'), alert('z')] }));
fs.writeFileSync(path.join(root, 'work/health-issue-baseline.json'), JSON.stringify({ acknowledged: known }));
const calls = [];
const exec = (cmd, args) => { calls.push(args.slice(0, 2).join(' ')); if (args[0] === 'label') return { status: 1, stderr: 'exists' }; if (args[1] === 'list') return { status: 0, stdout: '[]' }; return { status: 0, stdout: '' }; };
assert.equal(run({ root, exec, dryRun: false }).action, 'create');
assert.deepEqual(calls, ['issue list', 'label create', 'issue create']);
// The shipped baseline lists the alerts known when the notifier was added.
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'health-issue-baseline.json'), 'utf8'));
assert(Array.isArray(baseline.acknowledged) && baseline.acknowledged.length > 0 && new Set(baseline.acknowledged).size === baseline.acknowledged.length);
assert.equal(LABEL, 'monitor-alert');
const {pagesIssues} = require('./sync_health_issue');
const release = (id, conclusion) => ({display_title:'Pages release '+id+' '+'a'.repeat(40), head_branch:'main', conclusion, html_url:'https://github.com/example/run/'+id});
assert.equal(pagesIssues([release(12,'failure'),release(13,'success')]).length,0);
assert.equal(pagesIssues([release(15,'skipped'),release(14,'failure'),release(13,'success')])[0].url,release(14).html_url);
assert.equal(plan([alert('shop'), ...pagesIssues([release(15,'success')])], [], {number:7,body:plan([alert('shop'),...pagesIssues([release(14,'failure')])],[],null).body}).action,'update');
console.log('PASS monitor alert issue: known alerts silent, new alert opens one issue, no hourly repeats, additions comment, closes when resolved');
