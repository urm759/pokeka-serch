const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { load } = require('./audit_search_profit_consistency');
const { cardFacts } = require('./profile_candidate_evidence');
const listings = require('../psa10-listing-counts');
const definitions = require('./digest-user-profiles.json');

function evaluate(root, profile, at, before) {
  const url = new URL(profile.url);
  const max = Number(url.searchParams.get('listingCurrentMax'));
  if (!url.searchParams.has('listingCurrentMax') || !Number.isInteger(max) || max < 0) {
    throw Error('マイ条件のPSA10出品数上限を確認してください');
  }
  url.searchParams.delete('listingCurrentMax');
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const api = load(source, at, {url: url.href});
  const payload = JSON.parse(fs.readFileSync(path.join(root, 'data/mintore-listing-summary.json'), 'utf8'));
  const catalog = fs.readFileSync(path.join(root, 'data/pokemon-cards.json'), 'utf8');
  const catalogHash = crypto.createHash('sha256').update(catalog.replace(/\r\n/g, '\n')).digest('hex');
  if (payload.catalogHash !== catalogHash) throw Error('みんトレ出品数とカード原票の版不一致');
  const options = { catalogHash, now: Date.parse(at) };
  const remaining = new Set(before);
  const selected = [], rows = [];
  for (const c of api.prepareCalculatedCards(api.state.cards)) {
    const previouslySelected = remaining.delete(c.id);
    const reasons = Array.from(api.cardSearchExclusions(c));
    if (!reasons.length || previouslySelected) {
      const views = listings.providerViews(payload, c, options);
      reasons.push(...listings.reasons(views.psa10, {listingCurrentMax: max, label: 'みんトレ掲載PSA10出品数'}));
    }
    if (!reasons.length) selected.push(c);
    else if (previouslySelected) rows.push({id: c.id, name: c.name, qualified: false, reasons});
  }
  for (const c of selected.sort(api.sorters[api.state.sort])) {
    const efficiency = api.cardEfficiency(c);
    rows.push({id: c.id, name: c.name, qualified: true, metrics: cardFacts(api, c),
      buy: efficiency.purchasePrice, profit: efficiency.profit, annual: efficiency.annual, go: c.purchaseDecision?.verdict});
  }
  for (const id of remaining) rows.push({id, qualified: false, reasons: ['現在のカード一覧に掲載なし']});
  return {...profile, originalUrl: profile.url, rows};
}

function build(root, at, baseline) {
  // Release each search's card graph before loading the next plan.
  return definitions.map(profile => JSON.parse(execFileSync(process.execPath, [__filename], {
    cwd: root, encoding: 'utf8', input: JSON.stringify({profile, at, before: baseline?.ids?.[profile.id] || []}),
    maxBuffer: 16 * 1024 * 1024, timeout: 180000
  })));
}

if (require.main === module) {
  const {profile, at, before} = JSON.parse(fs.readFileSync(0, 'utf8'));
  process.stdout.write(JSON.stringify(evaluate(process.cwd(), profile, at, before)));
}
module.exports = {build};
