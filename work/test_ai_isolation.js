const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('./operational_test_inventory');
const { build } = require('./task_operations');

const root = path.join(__dirname, '..');
const folder = path.join(root, '.github/workflows');
const file = 'ai-dev-pipeline.yml';
const aiMarkers = /openai\/codex-action|anthropics\/claude-code-action|@openai\/codex|OPENAI_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|ai-dev-pipeline|environment:\s*ai-pipeline|\bcodex exec\b|\bclaude -p\b/i;
for (const name of fs.readdirSync(folder).filter(n => /\.ya?ml$/.test(n) && n !== file)) {
  assert(!aiMarkers.test(fs.readFileSync(path.join(folder, name), 'utf8')), 'AI path in ' + name);
}
const yaml = fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r\n/g, '\n');
assert.deepEqual([...yaml.match(/^on:\n([\s\S]*?)\n\n/m)[1].matchAll(/^  (\w+):/gm)].map(m => m[1]), ['workflow_dispatch']);
assert.match(yaml, /group: ai-dev-pipeline/);
const jobs = Object.fromEntries(yaml.split(/^  ([a-z_\d]+):\n/gm).slice(1).reduce((pairs, item, i, list) => {
  if (i % 2 === 0) pairs.push([item, list[i + 1]]);
  return pairs;
}, []));
assert.equal((yaml.match(/uses: openai\/codex-action@/g) || []).length, 2);
assert.equal((yaml.match(/uses: anthropics\/claude-code-action@/g) || []).length, 3);
for (const uses of yaml.matchAll(/^\s*- uses: (\S+)/gm)) assert.match(uses[1], /@[a-f0-9]{40}$/);
for (const job of ['verify_1', 'verify_2']) {
  assert.match(jobs[job], /docker run --rm --network none/);
  assert.doesNotMatch(jobs[job], /: write|\$\{\{\s*secrets\./);
}
for (const [name, contents] of Object.entries(jobs)) {
  if (name !== 'draft') assert.doesNotMatch(contents, /(?:contents|pull-requests): write/);
}
assert.match(jobs.draft, /contents: write\s+pull-requests: write/);
assert.doesNotMatch(jobs.draft, /candidate\/work|secrets\.|pages: write|--merge/);
assert.match(fs.readFileSync(path.join(__dirname, 'ai_pipeline_report.js'), 'utf8'), /base: m\.base_ref, draft: true/);
const development = build(root).scripts.find(x => x.name === 'AI Dev Pipeline');
assert.deepEqual(development.aiCallLimit, { claude: 3, codex: 2 });
assert.equal(development.llmCalls, null);
for (const row of build(root).scripts.filter(x => x !== development && x.name !== development.name)) {
  assert.equal(row.llmCalls, 0);
  assert.equal(row.codexCalls, 0);
}
for (const name of ['gate', 'flow', 'isolation']) assert(inventory(root).tests.includes('work/test_ai_' + (name === 'isolation' ? name : 'pipeline_' + name) + '.js'));
console.log('PASS AI workflow is manual, independent, bounded, pinned and draft-only');
