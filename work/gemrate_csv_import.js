// Offline validation only. No fetch, official-POP mutation, or public output.
const crypto = require('node:crypto');

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  const input = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error('invalid CSV quote');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        if (row.some(v => v !== '')) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error('characters after CSV quote');
      cell += c;
    }
  }
  if (quoted) throw new Error('unterminated CSV quote');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function count(value) {
  const s = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function day(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function key(row, context) {
  return JSON.stringify([context.language, context.set, context.year,
    row['Card #'], row.Name, row.Parallel]);
}
function importCsv(text, context, mappings, previous = []) {
  const page = new URL(context.pageUrl);
  if (page.protocol !== 'https:' || !['www.gemrate.com', 'gemrate.com'].includes(page.hostname)
    || page.pathname !== '/item-details' || page.searchParams.get('grader') !== 'psa'
    || page.searchParams.get('category') !== 'tcg-cards'
    || page.searchParams.get('set_name') !== context.set || page.searchParams.get('year') !== String(context.year)) {
    throw new Error('PSA set-page provenance mismatch');
  }
  if (context.grader !== 'PSA' || context.language !== 'Japanese'
    || !context.set || !Number.isInteger(context.year) || !day(context.sourceUpdatedDate)
    || !/^\d{4}-\d{2}-\d{2}T/.test(context.retrievedAt || '') || !Number.isFinite(Date.parse(context.retrievedAt))
    || !context.contextProof || context.sourceUpdatedDate > context.retrievedAt.slice(0, 10)) {
    throw new Error('PSA/Japanese/export context and original source date evidence required');
  }
  const rows = parseCsv(text), headers = rows.shift() || [];
  const required = ['Card #', 'Name', 'Parallel', 'Gems', 'Total'];
  if (new Set(headers).size !== headers.length || required.some(h => !headers.includes(h))) {
    throw new Error('missing or duplicate CSV columns');
  }
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  const staged = new Map(), quarantined = [], duplicates = [], blocked = new Set();
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i], row = Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
    const identity = key(row, context), candidates = mappings.filter(m => m.key === identity);
    const match = candidates.length === 1 ? candidates[0] : null;
    const psa10 = count(row.Gems), total = count(row.Total);
    const reason = cells.length !== headers.length ? 'column-count'
      : !match ? 'identity-unresolved' : match.hold ? 'source-discrepancy-hold'
        : !match.identityKey || !match.cardId || !match.specEvidence ? 'specification-evidence-missing'
          : psa10 === null || total === null || total === 0 || psa10 > total ? 'invalid-count' : null;
    if (reason) { quarantined.push({ line: i + 2, identity, reason }); continue; }
    const record = { source: 'GemRate', grader: 'PSA', cardId: match.cardId, identityKey: match.identityKey,
      identity, psa10, total, gemratePsa10Rate: psa10 / total, sourceUpdatedDate: context.sourceUpdatedDate,
      sourceDatePrecision: 'day', retrievedAt: context.retrievedAt, pageUrl: context.pageUrl,
      contextProof: context.contextProof, specEvidence: match.specEvidence, csvSha256: hash,
      publicationAllowed: false, officialObservedAt: null, populationDelta: null };
    const observation = JSON.stringify([match.cardId, match.identityKey, context.sourceUpdatedDate]);
    const existing = [...previous.filter(r => r.source === 'GemRate' && r.cardId === match.cardId && r.identityKey === match.identityKey
      && r.sourceUpdatedDate === context.sourceUpdatedDate), ...(staged.has(observation) ? [staged.get(observation)] : [])];
    if (blocked.has(observation) || existing.some(r => r.psa10 !== psa10 || r.total !== total)) {
      staged.delete(observation); blocked.add(observation);
      quarantined.push({ line: i + 2, identity, reason: 'same-day-conflicting-counts' });
    } else if (existing.length) duplicates.push({ line: i + 2, identity });
    else staged.set(observation, record);
  }
  return { version: 1, mode: 'private-offline-staging-only', csvSha256: hash,
    accepted: [...staged.values()], quarantined, duplicates,
    newOfficialObservations: 0, publicRecords: 0 };
}
module.exports = { parseCsv, importCsv, key, count };
