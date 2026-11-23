// Owner-stopped sources (data/stopped-sources.json): keep their published file shape but no rows,
// so neither the site nor the audits use stale rows. Originals are archived once (gzip, outside
// data/ so they never enter the UI manifest). Idempotent; runs in finalize after every writer.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
function apply(root = path.join(__dirname, '..'), now = new Date()) {
  const configFile = path.join(root, 'data/stopped-sources.json');
  if (!fs.existsSync(configFile)) return { applied: [] };
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8')), applied = [];
  for (const [source, entry] of Object.entries(config.sources || {})) {
    if (!/^data\/[a-z0-9-]+\.json$/.test(entry.file || '')) throw new Error('stopped source file must be a data/*.json file: ' + source);
    const file = path.join(root, entry.file);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8'), value = JSON.parse(raw), rows = Object.keys(value.cards || {}).length;
    if (!rows && value.stoppedByOwner) continue;
    if (rows) {
      const dir = path.join(root, 'work/stopped-source-archive'); fs.mkdirSync(dir, { recursive: true });
      const archive = path.join(dir, `${source}-${now.toISOString().slice(0, 10)}.json.gz`);
      if (!fs.existsSync(archive)) fs.writeFileSync(archive, zlib.gzipSync(raw));
    }
    value.cards = {};
    value.stoppedByOwner = { decidedAt: config.decidedAt, reason: entry.reason, rowsRemoved: rows || value.stoppedByOwner?.rowsRemoved || 0 };
    fs.writeFileSync(file, JSON.stringify(value));
    applied.push({ source, rowsRemoved: rows });
  }
  return { applied };
}
if (require.main === module) console.log(JSON.stringify(apply()));
module.exports = { apply };
