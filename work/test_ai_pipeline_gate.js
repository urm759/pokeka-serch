const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest, git, inspect, safePath } = require('./ai_pipeline_gate');

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gate-'));
const design = { scope: { allowed_paths: ['docs/**', 'data/**', '.github/**'], forbidden_paths: ['docs/private.md'] }, data_changes_allowed: true };

function change(file, body) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), body);
  git(repo, ['add', '-A']);
  const patch = git(repo, ['diff', '--cached', '--binary', '--no-renames']);
  git(repo, ['reset', '--hard', 'HEAD']);
  return patch;
}

function reject(file, body, message, allowData) {
  const patch = change(file, body);
  assert.throws(() => inspect(repo, patch, design, allowData), message);
  git(repo, ['reset', '--hard', 'HEAD']);
}

try {
  git(repo, ['init', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '--allow-empty', '-qm', 'base']);
  const patch = change('docs/valid.md', 'Some text\n');
  const accepted = inspect(repo, patch, design);
  assert.deepEqual(accepted.files, ['docs/valid.md']);
  assert.equal(accepted.patchSha256, digest(patch));
  assert.equal(accepted.tree, git(repo, ['write-tree']).toString().trim());
  git(repo, ['reset', '--hard', 'HEAD']);
  reject('outside.js', 'hello\n', /outside/);
  reject('docs/private.md', 'hello\n', /outside/);
  reject('docs/.env.local', 'hello\n', /Protected/);
  reject('.github/workflows/new.yml', 'hello\n', /Protected/);
  reject('data/price.json', '{}\n', /opt-in/);
  reject('data/broken.json', '{\n', /JSON|Unexpected|property/, true);
  reject('docs/binary.bin', Buffer.from([0, 2, 0, 3]), /Only text/);
  reject('docs/oversize.md', 'a'.repeat(1024 * 1024 + 5), /exceeds/);
  reject('docs/credential.md', ['sk', 'proj', 'A'.repeat(24)].join('-') + '\n', /credential/);
  const data = inspect(repo, change('data/price.json', '{}\n'), design, true);
  assert.equal(data.dataBytes, 3);
  assert.equal(safePath('../outside'), false);
  assert.equal(safePath('C:/outside'), false);
  console.log('PASS AI gate validates design scope, text, Git index, data consent and credential scanning');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
