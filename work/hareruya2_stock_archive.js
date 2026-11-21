const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./acquisition_retry');

// Keep the original daily quantities before the rolling summary prunes them.
// Older rows may lack product-level evidence and must remain labeled as such.
function archiveAndTrim(history, root, keep = 91) {
  const excess = Math.max(0, history.dates.length - keep);
  if (!excess) return 0;
  const directory = path.join(root, 'work/hareruya2-stock-archive');
  fs.mkdirSync(directory, { recursive: true });
  for (const [index,date] of history.dates.slice(0,excess).entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Invalid Hareruya2 stock history day');
    const quantities = {}, evidence = {};
    for (const [id,series] of Object.entries(history.stocks)) {
      if (series[index] != null) quantities[id] = series[index];
      const proof = history.quantityEvidence?.[id]?.[date];
      if (proof !== undefined) evidence[id] = proof;
    }
    const file = path.join(directory,date+'.json');
    const original = { version:1, source:'hareruya2', date, quantities, evidence };
    if (fs.existsSync(file)) {
      const before = JSON.parse(fs.readFileSync(file,'utf8'));
      if (JSON.stringify(before)!==JSON.stringify(original)) throw Error('Conflicting archived stock observation for '+date);
    } else {
      atomicWrite(file,original,0);
    }
  }
  history.dates.splice(0,excess);
  for (const series of Object.values(history.stocks)) series.splice(0,excess);
  // Keep the existing quantity evidence ledger intact. The archive is a copy of
  // each original day and stays outside the storefront's summary inputs.
  return excess;
}

module.exports = { archiveAndTrim };
