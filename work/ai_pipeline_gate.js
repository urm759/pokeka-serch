const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const maxPatch = 2 * 1024 * 1024;
const maxFile = 1024 * 1024;
const credentials = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16})\b|(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{20,}["']/i;
const protectedPath = /(?:^|\/)(?:\.git[^/]*|\.private|private|\.aws|\.ssh|\.secrets|\.claude|\.codex|\.agents|node_modules|\.env(?:\.[^/]*)?)(?:\/|$)|(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|\.npmrc|[^/]+\.(?:pem|key|p12|pfx))$|^ops\/ai-pipeline(?:\/|$)|^work\/(?:ai_pipeline_|test_ai_|workflow_structure\.js$|operational_test_inventory\.js$|run_operational_regressions\.js$|update_validation\.js$)/i;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, args, opts = {}) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...opts
});

function safeText(value) {
  const s = String(value);
  if (credentials.test(s)) throw Error('Possible credential in pipeline input or output');
  return s;
}

function matches(file, rule) {
  return rule.endsWith('/**') ? file.startsWith(rule.slice(0, -2)) : file === rule;
}

function safePath(name) {
  return typeof name === 'string' && name.length <= 240
    && /^[\p{L}\p{N}_. /-]+$/u.test(name)
    && name.split('/').every(part => part.length && part !== '.' && part !== '..' && !part.startsWith('-'));
}

function enforcePath(file, scope, allowData) {
  if (!safePath(file) || protectedPath.test(file)) throw Error('Protected or invalid target path');
  if (!scope.allowed_paths.some(rule => matches(file, rule)) || scope.forbidden_paths.some(rule => matches(file, rule))) {
    throw Error('Target outside the approved design');
  }
  if (file.startsWith('data/') && !allowData) throw Error('Data changes require explicit dispatch opt-in and design approval');
}

function validatePatch(patch) {
  if (!patch.length || patch.length > maxPatch) throw Error('Empty or oversized patch');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(patch);
  if (text.includes('\0') || /^GIT binary patch$|^Binary files .* differ$/m.test(text)) throw Error('Only text patches are allowed');
  safeText(text);
}

function inspect(cwd, patch, design, allowData = false) {
  validatePatch(patch);
  if (git(cwd, ['status', '--porcelain']).length) throw Error('Verification checkout is not clean');
  git(cwd, ['apply', '--cached', '--whitespace=nowarn', '-'], { input: patch });
  return inspectIndex(cwd, patch, design, allowData);
}

function inspectIndex(cwd, patch, design, allowData = false) {
  const parts = git(cwd, ['diff', '--cached', '--raw', '--no-renames', '-z']).toString().split('\0');
  const files = [];
  let dataBytes = 0;
  for (let i = 0; i < parts.length - 1; i += 2) {
    const info = /^:(\d{6}) (\d{6}) [\da-f]+ [\da-f]+ ([AMD])$/.exec(parts[i]);
    const file = parts[i + 1];
    if (!info || !info.slice(1, 3).every(mode => ['000000', '100644', '100755'].includes(mode))) {
      throw Error('Non-regular file or unsupported change');
    }
    enforcePath(file, design.scope, allowData && design.data_changes_allowed === true);
    if (info[3] !== 'D') {
      const size = Number(git(cwd, ['cat-file', '-s', ':' + file]).toString().trim());
      if (size > maxFile) throw Error('Changed file exceeds byte limit');
      const contents = git(cwd, ['show', ':' + file]);
      safeText(new TextDecoder('utf-8', { fatal: true }).decode(contents));
      if (file.endsWith('.json')) JSON.parse(contents.toString());
      if (file.startsWith('data/')) dataBytes += size;
    }
    files.push(file);
  }
  if (!files.length || files.length > 40) throw Error('Invalid number of changed files');
  const tree = git(cwd, ['write-tree']).toString().trim();
  return { patchSha256: digest(patch), tree, files, dataBytes };
}

function checkArtifactFile(dir, name, limit = maxPatch) {
  const file = path.join(dir, name);
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.size > limit) throw Error('Invalid or oversized artifact: ' + name);
  return fs.readFileSync(file);
}

module.exports = { checkArtifactFile, credentials, digest, enforcePath, git, inspect, inspectIndex, maxPatch, safePath, safeText, validatePatch };
