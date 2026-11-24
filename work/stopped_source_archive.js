// Read the archived original of an owner-stopped source (see apply_stopped_sources.js).
// Regression tests that need historical rows use it once the published file is emptied.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
function latest(root, source) {
  const dir = path.join(root, 'work/stopped-source-archive');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.startsWith(source + '-') && f.endsWith('.json.gz')).sort();
  return files.length ? JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, files.at(-1))))) : null;
}
// The published rows, or the archived rows when the owner stopped the source and emptied them.
function rows(root, file, source) {
  const value = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  if (value.stoppedByOwner && !Object.keys(value.cards || {}).length) return latest(root, source)?.cards || {};
  return value.cards || {};
}
module.exports = { latest, rows };
