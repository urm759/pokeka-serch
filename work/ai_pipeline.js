const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { checkArtifactFile, digest, git, inspect, inspectIndex, safePath, safeText, validatePatch } = require('./ai_pipeline_gate');
const { schemaFor, validate } = require('./ai_pipeline_schema');

const rules = path.join(__dirname, '../ops/ai-pipeline');
const modes = ['real', 'stub'];
const scenarios = ['pass', 'revise_pass', 'unresolved', 'needs_decision', 'gate_reject'];
const contextNames = ['prepare', 'design', 'implement-1', 'verify-1', 'review-1', 'implement-2', 'verify-2', 'review-2'];
const env = process.env;
const namespace = () => env.AI_ARTIFACT_PREFIX || 'ai-local';
const exchange = () => env.AI_EXCHANGE || path.resolve('.ai-exchange');
const out = () => env.AI_OUT || path.resolve('.ai-output');
const at = (stage, file) => path.join(exchange(), namespace() + '-' + stage, file);

function load(file, optional = false) {
  if (optional && !fs.existsSync(file)) return null;
  const raw = checkArtifactFile(path.dirname(file), path.basename(file), 128 * 1024);
  return JSON.parse(safeText(raw.toString()));
}

function save(name, value) {
  fs.mkdirSync(out(), { recursive: true });
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(path.join(out(), name), safeText(data));
}

function output(key, value) {
  if (!env.GITHUB_OUTPUT) return;
  const boundary = 'END_' + randomUUID();
  fs.appendFileSync(env.GITHUB_OUTPUT, key + '<<' + boundary + '\n' + value + '\n' + boundary + '\n');
}

function prepare() {
  const request = safeText((env.AI_REQUEST || '').trim());
  if (!request || request.length > 3000 || /\x00/.test(request)) throw Error('Request must contain 1 to 3000 characters');
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
      || env.GITHUB_ACTOR !== env.AI_OWNER || env.GITHUB_TRIGGERING_ACTOR !== env.AI_OWNER) {
    throw Error('Only the repository owner may start this workflow from main');
  }
  const base = (env.AI_BASE || 'main').trim();
  if (base !== 'main') throw Error('Select main as the base in this version');
  const sha = env.GITHUB_SHA;
  const run = env.GITHUB_RUN_ID;
  const attempt = env.GITHUB_RUN_ATTEMPT;
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^\d+$/.test(run) || !/^\d+$/.test(attempt)
      || !modes.includes(env.AI_MODE) || !scenarios.includes(env.AI_SCENARIO)) throw Error('Invalid execution metadata');
  if (env.AI_MODE === 'real' && env.AI_REAL_ENABLED !== 'true') throw Error('Real mode has not been enabled');
  const manifest = {
    run_id: run, attempt, base_ref: base, base_sha: sha, branch: 'ai/' + run + '-' + attempt,
    request_sha256: digest(request), mode: env.AI_MODE, scenario: env.AI_SCENARIO,
    allow_data_changes: env.AI_ALLOW_DATA === 'true', started_at: new Date().toISOString(),
    limits: { claude: 3, codex: 2 }
  };
  save('run-manifest.json', manifest);
  save('request.md', request);
  output('base_sha', sha);
}

function manifest() {
  const m = load(at('prepare', 'run-manifest.json'));
  if (m.base_sha !== env.GITHUB_SHA || m.run_id !== env.GITHUB_RUN_ID || m.attempt !== env.GITHUB_RUN_ATTEMPT
      || m.base_ref !== 'main' || m.branch !== 'ai/' + m.run_id + '-' + m.attempt || !modes.includes(m.mode)
      || !scenarios.includes(m.scenario)) throw Error('Manifest does not match the current run');
  return m;
}

function designRecord() {
  return validateDesign(readStage('design', 'design'));
}

function validateDesign(d) {
  if (d.needs_user_decision.required) return d;
  const cleanRule = p => safePath(p.endsWith('/**') ? p.slice(0, -3) : p);
  if (!d.scope.allowed_paths.length || !d.acceptance_criteria.length
      || ![...d.scope.allowed_paths, ...d.scope.forbidden_paths].every(cleanRule)) throw Error('Invalid or empty design scope');
  if (new Set(d.acceptance_criteria.map(c => c.id)).size !== d.acceptance_criteria.length) throw Error('Duplicate design criteria');
  if (!d.tests_to_run.every(file => /^work\/test_[\w-]+\.js$/.test(file))) throw Error('Tests must be repo-relative Node test files');
  return d;
}

function readStage(stage, kind) {
  const data = load(at(stage, kind + '.json'));
  validate(kind, data);
  return data;
}

function patch(round) {
  return checkArtifactFile(path.dirname(at('implement-' + round, 'change.diff')), 'change.diff');
}

function prompt(kind, round, candidate) {
  const m = manifest();
  const request = fs.readFileSync(at('prepare', 'request.md'), 'utf8');
  if (digest(request) !== m.request_sha256) throw Error('Request checksum mismatch');
  const parts = [
    fs.readFileSync(path.join(rules, 'RULES.md'), 'utf8'),
    fs.readFileSync(path.join(rules, 'prompts', kind + '.md'), 'utf8'),
    'Pinned base: ' + m.base_sha + '\nRepository directory: ' + candidate,
    'Request data:\n' + request
  ];
  if (kind !== 'design') parts.push('Design record:\n' + JSON.stringify(designRecord(), null, 2));
  if (kind === 'review') {
    const g = readStage('verify-' + round, 'gate');
    const bytes = patch(round);
    if (!g.accepted || g.patchSha256 !== digest(bytes)) throw Error('Unverified review input');
    parts.push('Exact cumulative diff file (read it): ' + at('implement-' + round, 'change.diff'));
    parts.push('Run evidence:\n' + JSON.stringify({
      gate: g, tests: readStage('verify-' + round, 'tests'), implementation: readStage('implement-' + round, 'implementation')
    }, null, 2));
  }
  if (round === 2) {
    parts.push('Round 1 review:\n' + JSON.stringify(readStage('review-1', 'review'), null, 2));
    parts.push('Round 1 implementation:\n' + JSON.stringify(readStage('implement-1', 'implementation'), null, 2));
    if (kind === 'review') parts.push('Round 1 diff file: ' + at('implement-1', 'change.diff'));
  }
  const content = safeText(parts.join('\n\n'));
  if (kind === 'design' || kind === 'review') {
    output('prompt', content);
    output('schema', JSON.stringify(schemaFor(kind)));
  } else {
    save('prompt.md', content);
  }
}

function accept(kind, round) {
  let data;
  if (env.AI_RESULT !== undefined) data = JSON.parse(safeText(env.AI_RESULT));
  else data = load(path.join(out(), 'model-result.json'));
  validate(kind, data);
  if (kind === 'design') validateDesign(data);
  if (kind === 'implementation') {
    const expected = round === 2 ? readStage('review-1', 'review').findings.map(f => f.id) : [];
    if (data.findings.length !== expected.length || new Set(data.findings.map(f => f.id)).size !== expected.length
        || data.findings.some(f => !expected.includes(f.id))) throw Error('Implementation must address each prior finding');
  }
  if (kind === 'review') {
    const expected = new Set(designRecord().acceptance_criteria.map(c => c.id));
    if (data.criteria.length !== expected.size || new Set(data.criteria.map(c => c.id)).size !== expected.size
        || data.criteria.some(c => !expected.has(c.id))) throw Error('Review is missing a design criterion');
    if (data.verdict === 'pass' && (data.criteria.some(c => c.status !== 'met') || data.findings.length || data.unverified.length)) {
      throw Error('Review cannot pass with unmet or unverified criteria');
    }
    if (data.verdict === 'changes_required' && !data.findings.length) throw Error('A revision requires findings');
    if (round === 2) {
      const previous = readStage('review-1', 'review').findings.map(f => f.id);
      const reviewed = data.prior_findings;
      if (reviewed.length !== previous.length || new Set(reviewed.map(f => f.id)).size !== previous.length
          || reviewed.some(f => !previous.includes(f.id)) || (data.verdict === 'pass' && reviewed.some(f => f.status !== 'resolved'))) {
        throw Error('Round 2 must address each prior finding');
      }
    }
  }
  save(kind + '.json', data);
  if (kind === 'design') output('needs_decision', String(data.needs_user_decision.required));
  if (kind === 'review') output('verdict', data.verdict);
}

function restore(candidate, round) {
  if (round !== 2) return;
  const m = manifest();
  const g = readStage('verify-1', 'gate');
  const result = inspect(candidate, patch(1), designRecord(), m.allow_data_changes);
  if (!g.accepted || result.tree !== g.tree || result.patchSha256 !== g.patchSha256) throw Error('Round 1 patch mismatch');
  git(candidate, ['apply', '--whitespace=nowarn', '-'], { input: patch(1) });
}

function capture(candidate) {
  const m = manifest();
  if (git(candidate, ['rev-parse', 'HEAD']).toString().trim() !== m.base_sha) throw Error('Implementation changed its base commit');
  try {
    git(candidate, ['add', '-A', '--', '.']);
    const bytes = git(candidate, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-renames', m.base_sha, '--']);
    validatePatch(bytes);
    inspectIndex(candidate, bytes, designRecord(), m.allow_data_changes);
    save('change.diff', bytes.toString('utf8'));
  } catch {
    save('capture-rejected.json', { rejected: true });
  }
}

function verify(candidate, round) {
  const m = manifest();
  try {
    const bytes = patch(round);
    const result = inspect(candidate, bytes, designRecord(), m.allow_data_changes);
    git(candidate, ['apply', '--whitespace=nowarn', '-'], { input: bytes });
    save('gate.json', { accepted: true, ...result, reason: '' });
    output('accepted', 'true');
    output('data', result.files.some(file => file.startsWith('data/')) ? 'data' : 'no-data');
  } catch {
    save('gate.json', { accepted: false, patchSha256: '', tree: '', files: [], dataBytes: 0, reason: 'Patch rejected by scope, format, size, secret or Git checks' });
    output('accepted', 'false');
  }
}

function countAttempt(kind, round) {
  save('attempt.json', { role: kind, round, started_at: new Date().toISOString() });
}

function acceptTests() {
  const result = validate('tests', load(path.join(out(), 'tests-raw.json')));
  if (!result.checks.length || result.passed !== result.checks.every(check => check.exit_code === 0)) {
    throw Error('Inconsistent test result');
  }
  save('tests.json', result);
}

function documents() {
  return Object.fromEntries(contextNames.map(name => {
    const known = {
      prepare: ['run-manifest'], design: ['design', 'attempt'],
      implement: ['implementation', 'attempt'], verify: ['gate', 'tests'], review: ['review', 'attempt']
    };
    const files = known[name.replace(/-\d+$/, '')];
    return [name, Object.fromEntries(files.map(file => [file, load(at(name, file + '.json'), true)]))];
  }));
}

if (require.main === module) {
  const [action, kind, roundText, candidate] = process.argv.slice(2);
  const round = Number(roundText || 1);
  try {
    if (action === 'prepare') prepare();
    else if (action === 'prompt') prompt(kind, round, candidate);
    else if (action === 'accept') accept(kind, round);
    else if (action === 'attempt') countAttempt(kind, round);
    else if (action === 'restore') restore(candidate, round);
    else if (action === 'capture') capture(candidate);
    else if (action === 'verify') verify(candidate, round);
    else if (action === 'accept-tests') acceptTests();
    else throw Error('Unknown pipeline command');
  } catch (error) {
    console.error('AI pipeline step failed (' + action + '): ' + (error.name === 'SyntaxError' ? 'Invalid JSON' : error.message.split('\n')[0]));
    process.exitCode = 1;
  }
}

module.exports = { at, designRecord, documents, load, manifest, output, patch, readStage, save };
