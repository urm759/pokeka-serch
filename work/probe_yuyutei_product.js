// Explicit, single known-URL probe. Never scheduled; never releases source holds
// or writes a price/catalog/summary. Every HTTP response is retained separately.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { yuyuteiProductRequestUrl, replayYuyuteiProduct } = require('./yuyutei_product_detail');

async function probeYuyuteiProduct({ card, binding, rawDir, fetchImpl = fetch }) {
  const url = yuyuteiProductRequestUrl(card, binding);
  if (!url) throw new Error('Exact, unheld existing card/URL binding required');
  fs.mkdirSync(path.dirname(rawDir), { recursive: true });
  fs.mkdirSync(rawDir); // Existing captures are never overwritten or fetched again.
  const startedAt = new Date().toISOString();
  let receipt;
  try {
    // One request, no retry, no redirect following, no cookies/authentication.
    const response = await fetchImpl(url, {
      redirect: 'manual', headers: { 'user-agent': 'PokecaBuyingGuide/1.0 (+read-only; low-rate)' },
      signal: AbortSignal.timeout(15000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(rawDir, 'response.html'), bytes, { flag: 'wx' });
    const fetchedAt = new Date().toISOString();
    receipt = { startedAt, fetchedAt, url, finalUrl: response.url || url, httpStatus: response.status,
      bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      requestCount: 1, adopted: 0, holdsChanged: 0 };
    const parsed = replayYuyuteiProduct(card, binding, { ...receipt, html: bytes.toString('utf8') });
    receipt.result = parsed ? 'verified-not-adopted' : response.status === 200 ? 'identity-or-page-rejected' : 'http-error';
    if (parsed) fs.writeFileSync(path.join(rawDir, 'parsed.json'), JSON.stringify(parsed, null, 2), { flag: 'wx' });
  } catch (error) {
    receipt = { ...receipt, startedAt, endedAt: new Date().toISOString(), url,
      requestCount: 1, result: 'failed', error: error.message, adopted: 0, holdsChanged: 0 };
  }
  fs.writeFileSync(path.join(rawDir, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  return { ...receipt, rawDir };
}

async function main() {
  const root = path.join(__dirname, '..');
  const cardId = process.argv[2];
  if (!cardId || process.argv.length !== 3) throw new Error('Usage: node work/probe_yuyutei_product.js <one-existing-card-id>');
  const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/pokemon-cards.json'), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'yuyutei_catalog.json'), 'utf8'));
  const matches = cards.filter(c => c.id === cardId);
  const bindings = catalog.filter(c => c.cardId === cardId && c.detailUrl === matches[0]?.yuyuteiUrl);
  if (matches.length !== 1 || bindings.length !== 1
    || cards.some(c => c.id !== cardId && c.yuyuteiUrl === bindings[0].detailUrl)
    || catalog.some(c => c.cardId !== cardId && c.detailUrl === bindings[0].detailUrl)) throw new Error('Ambiguous/missing saved URL owner');
  const rawDir = path.join(root, '.private', 'yuyutei-product-detail-raw', new Date().toISOString().replace(/[:.]/g, '-'));
  const result = await probeYuyuteiProduct({ card: matches[0], binding: bindings[0], rawDir });
  console.log(JSON.stringify(result));
  if (result.result !== 'verified-not-adopted') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { probeYuyuteiProduct };
