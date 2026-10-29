// Offline listing relevance only. Never imports GemRate observations or writes a master/mapping.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const STORE = path.resolve(ROOT, '..', 'private-research', 'gemrate');
const SET = 'Pokemon Japanese Sword & Shield Eevee Heroes';
const SCOPE = Object.freeze({ setCode: 'S6A', denominator: 69, language: 'Japanese', set: SET, year: 2021 });
const SOURCES = Object.freeze({
  cardrush: { file: 'cardrush_catalog.json', host: 'www.cardrush-pokemon.jp' },
  hareruya2: { file: 'hareruya2_catalog.json', host: 'www.hareruya2.com' },
  torecacamp: { file: 'torecacamp_catalog.json', host: 'torecacamp-pokemon.com' },
});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKC').trim();
const token = value => norm(value).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
const rarityPattern = /(?:^|[^A-Z])(MUR|BWR|SAR|SSR|CSR|CHR|RRR|UR|HR|SR|RR|AR|R|U|C|P)(?=$|[^A-Z])/g;
const regularFinish = rarity => ['C', 'U'].includes(rarity) ? 'non-holo'
  : ['R', 'RR', 'RRR'].includes(rarity) ? 'holo'
    : ['SR', 'HR', 'UR', 'SAR', 'SSR', 'CSR', 'CHR', 'AR', 'MUR', 'BWR'].includes(rarity) ? 'textured' : null;

function printedListing(row, source) {
  const label = norm(row.name || row.title);
  if (!SOURCES[source] || !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(label)) return null;
  if ((row.language && !['ja', 'Japanese'].includes(row.language))
      || /英語|韓国|中国語|インドネシア|ENGLISH|KOREAN|CHINESE|INDONESIAN/i.test(label)) return null;
  // Rejected/quarantined linkage cannot serve as affirmative identity evidence.
  if (row.cardMismatchSuspected || row.identityHoldReason || row.identityVerified === false
      || /mismatch|unresolved|ambiguous|quarantin|reject|hold/i.test(row.matchStatus || '')) return null;
  let url;
  try { url = new URL(row.detailUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== SOURCES[source].host
      || !/^\/(?:product|products)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;

  // Require the identity on the label itself, including the denominator.
  const identities = [];
  for (const m of label.matchAll(/\b([A-Za-z][A-Za-z0-9+-]*)\s+(\d{1,4})\s*\/\s*(\d{1,4})\b/g))
    identities.push([token(m[1]), Number(m[2]), Number(m[3])]);
  for (const m of label.matchAll(/[<{〈]\s*(\d{1,4})\s*\/\s*(\d{1,4})\s*[>}〉]\s*\[\s*([A-Za-z][A-Za-z0-9+-]*)\s*\]/g))
    identities.push([token(m[3]), Number(m[1]), Number(m[2])]);
  const distinct = [...new Set(identities.map(x => JSON.stringify(x)))];
  if (distinct.length !== 1) return null;
  const [setCode, number, denominator] = JSON.parse(distinct[0]);
  if (denominator < 1 || number < 1) return null;
  if ([...label.matchAll(/(\d+)\s*\/\s*(\d+)/g)].some(m => +m[1] !== number || +m[2] !== denominator)) return null;
  const printedSets = [...label.matchAll(/\[\s*([A-Za-z][A-Za-z0-9+-]*)\s*\]/g)].map(m => token(m[1]));
  if (printedSets.some(s => s !== setCode) || (row.setCode && token(row.setCode) !== setCode)) return null;
  for (const field of ['cardNo', 'cardNumber']) {
    if (row[field] == null) continue;
    const m = norm(row[field]).match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
    if (!m || +m[1] !== number || (m[2] && +m[2] !== denominator)) return null;
  }
  const rarities = [...new Set([...label.toUpperCase().matchAll(rarityPattern)].map(m => m[1]))];
  if (rarities.length !== 1 || (row.rarity && token(row.rarity) !== rarities[0])) return null;
  const rarity = rarities[0];
  // Unknown/error/parallel labels are deliberately held, never reduced to a normal card.
  if (/エラー|修正版|加工|テクスチャ|ミラー|マスボ|モンボ|パラレル|リバース|色違い|プロモ|未開封|鑑定|PSA|BGS|CGC|ARS|missing|texture|error|mirror|reverse|parallel|promo|sealed/i.test(label)) return null;
  const altArt = /(?:^|[^A-Z])SA(?:$|[^A-Z])|スペシャルアート/i.test(label);
  let finish = regularFinish(rarity);
  if (/ノンホロ|non[ -]?holo/i.test(label)) finish = 'non-holo';
  else if (/ホロ|holo|キラ/i.test(label)) finish = 'holo';
  if (!finish) return null;
  if (altArt) finish += '-alternate-art';
  if ((row.finish && norm(row.finish).toLowerCase() !== finish)
      || (row.variant && !(/^(?:sa|alternate-art)$/i.test(norm(row.variant)) && altArt))) return null;
  const japaneseName = token(label.split(/\[|【|\{|[<〈]|\(|:|\s/)[0]);
  if (!japaneseName) return null;
  return { setCode, number, denominator, rarity, finish, japaneseName,
    label, detailUrl: url.href, condition: norm(row.state || row.rawCondition) || null,
    observedAt: typeof row.observedAt === 'string' ? row.observedAt : null };
}

function validatePending(row, scope) {
  let identity;
  try { identity = JSON.parse(row.key); } catch { throw Error('Invalid pending identity'); }
  if (!Array.isArray(identity) || identity.length !== 6
      || identity[0] !== scope.language || identity[1] !== scope.set || identity[2] !== scope.year
      || identity[3] !== row.number || identity[4] !== row.name || identity[5] !== row.parallel
      || !/^\d+$/.test(row.number) || +row.number < 1 || !row.name) throw Error('Pending scope/identity mismatch');
  const standard = ['Base', 'Ultra Rare'].includes(row.parallel);
  if (row.status !== (standard ? 'domestic-catalog-unlisted' : 'special-finish-review'))
    throw Error('Only remaining, unaccepted specifications may be classified');
  if ((row.setCode && token(row.setCode) !== scope.setCode)
      || (row.denominator != null && Number(row.denominator) !== scope.denominator)) throw Error('Pending printed context mismatch');
  return standard;
}

function unreviewedPlan(plan, registry) {
  const reviewed=new Set(registry.map(r=>JSON.stringify([r.language,r.set,r.year,r.number,r.sourceName,r.parallel])));
  const rows=plan.rows.filter(row=>!reviewed.has(row.key));
  return {...plan,rows,previouslyRegistered:plan.rows.length-rows.length};
}
function classify(plan, catalogs, scope = SCOPE) {
  if (!Array.isArray(plan.rows)) throw Error('Remaining plan required');
  const seen = new Set();
  const index = new Map();
  for (const source of Object.keys(SOURCES)) {
    if (!Array.isArray(catalogs[source])) throw Error('All saved catalogs required');
    catalogs[source].forEach((row, sourceRow) => {
      const parsed = printedListing(row, source);
      if (!parsed || parsed.setCode !== scope.setCode || parsed.denominator !== scope.denominator) return;
      const key = String(parsed.number);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ ...parsed, source, sourceRow: sourceRow + 1 });
    });
  }
  const counts = { pendingSpecifications: plan.rows.length, baseSpecifications: 0, baseParallel: 0,
    ultraRareParallel: 0, specialSpecifications: 0, specialFinishHeld: 0,
    domesticListingRelevant: 0, baseUnresolved: 0, baseAmbiguous: 0,
    conditionDuplicateRowsCollapsed: 0, independentSourceProofs: 0,
    acceptedRowsReviewed: 0, excludedRowsReviewed: 0, acceptedMappingChanges: 0,
    masterAdditions: 0, httpRequests: 0, publicRecords: 0, gemCountFieldsCopied: 0 };
  const rows = plan.rows.map((row, i) => {
    const standard = validatePending(row, scope);
    if (seen.has(row.key)) throw Error('Duplicate pending specification');
    seen.add(row.key);
    const output = { planRow: i + 1, name: row.name, number: row.number, parallel: row.parallel,
      setCode: scope.setCode, denominator: scope.denominator,
      publicationAllowed: false, acceptedMapping: false, evidence: [] };
    if (!standard) {
      counts.specialSpecifications++;
      counts.specialFinishHeld++;
      return { ...output, classification: 'special-finish-held', reason: 'No normal-card alias; original finish evidence required' };
    }
    counts.baseSpecifications++;
    counts[row.parallel === 'Base' ? 'baseParallel' : 'ultraRareParallel']++;
    const rarityConstraints = [row.rarity ? token(row.rarity) : null,
      row.parallel === 'Ultra Rare' ? 'UR' : null,
      /-Hyper$/i.test(row.name) ? 'HR' : /-Holo$/i.test(row.name) ? 'R' : null].filter(Boolean);
    const explicitRarity = rarityConstraints.length > 0;
    const candidates = (index.get(String(+row.number)) || []).filter(c => {
      if (rarityConstraints.some(r => c.rarity !== r)) return false;
      if (!explicitRarity && (c.rarity === 'UR' || c.rarity === 'HR')) return false;
      if (row.finish && norm(row.finish).toLowerCase() !== c.finish) return false;
      return c.finish === regularFinish(c.rarity);
    });
    const groups = new Map();
    for (const c of candidates) {
      // Condition and product URL are evidence, not part of the card specification.
      const key = [c.setCode, c.number, c.denominator, c.rarity, c.finish, c.japaneseName].join('|');
      if (!groups.has(key)) groups.set(key, { rarity: c.rarity, finish: c.finish, japaneseName: c.japaneseName, sources: new Map() });
      const g = groups.get(key);
      if (!g.sources.has(c.source)) g.sources.set(c.source, []);
      g.sources.get(c.source).push({ sourceRow: c.sourceRow, label: c.label, detailUrl: c.detailUrl,
        condition: c.condition, observedAt: c.observedAt });
    }
    for (const g of groups.values()) for (const proofs of g.sources.values()) counts.conditionDuplicateRowsCollapsed += proofs.length - 1;
    output.evidence = [...groups.values()].map(g => ({ rarity: g.rarity, finish: g.finish,
      japaneseName: g.japaneseName, sources: [...g.sources].map(([source, listings]) => ({ source, listings })) }));
    if (groups.size !== 1) {
      counts[groups.size ? 'baseAmbiguous' : 'baseUnresolved']++;
      return { ...output, classification: groups.size ? 'listing-ambiguous' : 'listing-not-evidenced',
        reason: groups.size ? 'Conflicting printed name/rarity/finish' : 'No exact regular printed specification in saved catalogs' };
    }
    counts.domesticListingRelevant++;
    counts.independentSourceProofs += [...groups.values()][0].sources.size;
    return { ...output, classification: 'domestic-listing-relevant',
      rarityBasis: explicitRarity ? 'source-constraint-and-printed-catalog' : 'printed-catalog-consensus-only',
      reason: 'Domestic listing evidence only; English name equivalence and accepted mapping remain unasserted' };
  });
  return { version: 1, mode: 'offline-domestic-listing-relevance-only', publicationAllowed: false, counts, rows };
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

// Byte-identical replay is a no-op; any replaced bytes get a verified content-addressed backup.
function preserveWrite(file, value, backupDir) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('Output symlink refused');
  const prior = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (prior?.equals(bytes)) return false;
  if (prior) {
    const backup = path.join(backupDir, path.basename(file) + '.' + hash(prior) + '.gz');
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, zlib.gzipSync(prior), { flag: 'wx' });
    if (fs.lstatSync(backup).isSymbolicLink() || !zlib.gunzipSync(fs.readFileSync(backup)).equals(prior)) throw Error('Backup verification failed');
  }
  const temporary = file + '.' + process.pid + '.tmp';
  let created = false;
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    created = true;
    if (prior ? !fs.readFileSync(file).equals(prior) : fs.existsSync(file)) throw Error('Concurrent output change; preserved existing bytes');
    fs.renameSync(temporary, file);
  } finally { if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return true;
}

function run() {
  const realRoot = fs.realpathSync(ROOT), realStore = fs.realpathSync(STORE);
  if (inside(realRoot, realStore) || !fs.readFileSync(path.join(realStore, '.gitignore'), 'utf8').split(/\r?\n/).includes('*'))
    throw Error('Nonpublic deny-all store required');
  const backupDir = path.join(realStore, 'backups');
  if (!inside(realStore, fs.realpathSync(backupDir))) throw Error('Backup directory escapes private store');
  const inputs = [];
  const read = file => { const bytes = fs.readFileSync(file); inputs.push({ path: file, sha256: hash(bytes) }); return JSON.parse(bytes); };
  const planFile = path.join(realStore, 'remaining-specification-plan.json');
  const plan = read(planFile), manifest = read(path.join(realStore, 'manifest.json'));
  const receipts = manifest.files.filter(f => f.kind === 'list');
  for (const row of plan.rows) {
    const receipt = receipts.find(f => f.context?.pageUrl === row.sourcePage);
    const c = receipt?.context;
    if (!c || c.grader !== 'PSA' || c.language !== SCOPE.language || c.set !== SCOPE.set
        || c.year !== SCOPE.year || !c.contextProof) throw Error('Received set metadata required');
    const u = new URL(c.pageUrl);
    if (u.protocol !== 'https:' || !['gemrate.com', 'www.gemrate.com'].includes(u.hostname)
        || u.pathname !== '/item-details' || u.searchParams.get('set_name') !== SCOPE.set
        || u.searchParams.get('grader') !== 'psa' || u.searchParams.get('year') !== String(SCOPE.year)
        || u.searchParams.get('category') !== 'tcg-cards') throw Error('Received page context mismatch');
  }
  const catalogs = Object.fromEntries(Object.entries(SOURCES).map(([source, c]) => [source, read(path.join(ROOT, 'work', c.file))]));
  // The original plan is retained. Remove only explicit, evidence-reviewed registry
  // identities from the remaining work; never accept a row by count or number alone.
  const registry=require('./gemrate_reviewed_additions').entries(ROOT);
  const remaining=unreviewedPlan(plan,registry),result=classify(remaining,catalogs);
  const original=classify(plan,catalogs);
  if(original.counts.pendingSpecifications!==70||original.counts.baseSpecifications!==50||original.counts.specialSpecifications!==20
    ||result.counts.pendingSpecifications+remaining.previouslyRegistered!==70)throw Error('Unexpected remaining specification scope');
  result.counts.previouslyRegistered=remaining.previouslyRegistered;
  result.inputs = inputs;
  result.scope = { ...SCOPE, contextBasis: 'received Japanese PSA Eevee Heroes set; explicit S6a/069 printed catalog labels' };
  // Detect changing inputs before committing this deterministic snapshot.
  if (inputs.some(input => hash(fs.readFileSync(input.path)) !== input.sha256)) throw Error('Input changed during classification');
  result.counts.inputFilesUnchanged = inputs.length;
  preserveWrite(path.join(realStore, 'domestic-listing-relevance.json'), result, backupDir);
  preserveWrite(path.join(ROOT, 'work', '20261025-followup-gemrate-classification.json'), result.counts, backupDir);
  return result.counts;
}

if (require.main === module) {
  try { console.log(JSON.stringify(run())); }
  catch { console.error('Offline listing classification failed; no private identity data logged.'); process.exitCode = 1; }
}
module.exports = { classify, printedListing, preserveWrite, run, SCOPE, unreviewedPlan };
