// Private received files are read in place. Only set configuration and counts leave this module.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), zlib = require('node:zlib'), {isDeepStrictEqual} = require('node:util');
const csv = require('./gemrate_csv_import'), matcher = require('./gemrate_identity_match');
const inbox = require('./gemrate_private_inbox'), {outside} = require('./gemrate_private_store');
const load = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const FILES = ['work/gemrate-reviewed-sets.json','work/gemrate-collection-sets.json'];
const allowed = ['Base','Ultra Rare','Art Rare','Special Art Rare','Super Rare','Mega Ultra Rare'];
const MINIMUM = 20;
const errorPrint = row => /\b(?:error|misprint|miscut|missing texture)\b/i.test(row.Name+' '+row.Parallel);

function checkCoverage(matched, eligible) {
  if (matched < MINIMUM || matched*2 < eligible) {
    throw Error(`対象仕様の行（明示されたエラー品を除く）${eligible}行中、1対1は${matched}枚。必要数は${Math.max(MINIMUM,Math.ceil(eligible/2))}枚（20枚以上かつ半数以上）。`);
  }
}

function privateFile(store, file) {
  const resolved = fs.realpathSync(file);
  if (outside(fs.realpathSync(store), resolved)) throw Error('原票が非公開の保存場所にありません');
  return resolved;
}

function matchRows(bytes, context, set, cards, english, heldKeys, knownCards = new Map()) {
  const cells = csv.parseCsv(bytes.toString('utf8')), headers = cells.shift() || [];
  const required = ['Card #','Name','Parallel','Gems','Total'];
  if (new Set(headers).size !== headers.length || !required.every(k => headers.includes(k)) || cells.some(row => row.length !== headers.length)) throw Error('CSV列の不一致');
  const rows = cells.map(row => Object.fromEntries(headers.map((k,i) => [k,row[i]])));
  const byKey = new Map(rows.map(row => [csv.key(row,context),row]));
  if (byKey.size !== rows.length) throw Error('CSVの仕様キーが重複');
  const eligible = rows.filter(r => allowed.includes(r.Parallel) && !errorPrint(r)).length;
  const result = matcher.resolve(rows,context,cards,english,{...set,contextProof:context.contextProof,parallels:allowed,heldKeys});
  if (result.review.some(r => ['ambiguous-catalog','multiple-source-specifications'].includes(r.reason))) throw Error('候補または仕様の重複');
  const matches = result.mappings.filter(m => !m.hold);
  const parallels = new Set();
  for (const m of matches) {
    if (knownCards.has(m.cardId) && knownCards.get(m.cardId) !== m.key) throw Error('受領日をまたぐ仕様の重複');
    knownCards.set(m.cardId,m.key);
    const row = byKey.get(m.key);
    if (errorPrint(row)) throw Error('エラー品が通常仕様の照合に混入');
    if (row.Parallel === 'Mega Ultra Rare' && require('./card_identity').canonicalIdentity(cards.find(c => c.id === m.cardId)).rarity !== 'MUR') throw Error('MURのレア度不一致');
    parallels.add(row.Parallel);
  }
  const imported = csv.importCsv(bytes.toString('utf8'),context,result.mappings);
  if (imported.accepted.length !== matches.length || imported.duplicates.length) throw Error('1対1の照合数と取り込み数が不一致');
  return {rows:rows.length, eligible, matched:matches.length, parallels:[...parallels], date:context.sourceUpdatedDate};
}

function review(root, store, code) {
  const [reviewed,collection] = FILES.map(f => load(path.join(root,f)));
  const sets = collection.sets.filter(s => s.setCode === code);
  if (sets.length !== 1 || reviewed.sets.some(s => s.setCode === code) || code === 'S6A') throw Error('収集専用のセットを一意に選べません');
  const set = sets[0], receipts = load(path.join(store,'manifest.json')).files;
  const legacy = load(path.join(store,'verification-report.json')).receipts;
  const cards = load(path.join(root,'data/pokemon-cards.json')), english = load(path.join(root,'work/snkr_english_names.json')).cards;
  const held = legacy.filter(r => r.kind === 'list').flatMap(r => load(privateFile(store,r.parsedPath)).quarantined.filter(q => q.reason === 'source-discrepancy-hold').map(q => q.identity));
  const incoming = path.join(store,'incoming'), reports = [], knownCards = new Map();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-scope-'));
  let inboxCount = 0, legacyCount = 0;
  try {
    fs.mkdirSync(path.join(temporary,'work'));
    const promoted = {...set, automaticReference:{rule:'exact-reviewed-set-v1',parallels:[]}};
    reviewed.sets.push(promoted);
    collection.sets = collection.sets.filter(s => s !== set);
    for (const [i,value] of [reviewed,collection].entries()) fs.writeFileSync(path.join(temporary,FILES[i]),JSON.stringify(value));
    for (const r of receipts) {
      const bytes = fs.readFileSync(privateFile(store,r.storedPath));
      if (digest(bytes) !== r.sha256 || digest(zlib.gunzipSync(fs.readFileSync(privateFile(store,r.backupPath)))) !== r.sha256) throw Error('保存した原票またはバックアップの指紋不一致');
      if (path.dirname(r.originalPath) !== incoming) {
        if (!legacy.some(l => l.sha256 === r.sha256 && l.kind === r.kind && l.validationKey === r.validationKey && isDeepStrictEqual(l.context,r.context))) throw Error('従来の手動受領の証跡不一致');
        csv.validateContext(r.context, r.kind === 'trend' ? '/population-trend' : '/item-details');
        legacyCount++;
        continue;
      }
      const side = load(privateFile(store,r.originalPath+'.context.json'));
      if (!isDeepStrictEqual(side.context,r.context)) throw Error('保存済み受領とページ証跡の不一致');
      const proof = inbox.validate(side,bytes,store,temporary);
      inboxCount++;
      if (proof.setCode === code) reports.push(matchRows(bytes,proof.context,set,cards,english,held,knownCards));
    }
    if (!reports.length) throw Error('対象セットの受領なし');
    for (const r of reports) checkCoverage(r.matched,r.eligible);
    promoted.automaticReference.parallels = allowed.filter(p => reports.some(r => r.parallels.includes(p)));
    const last = reports.sort((a,b) => a.date.localeCompare(b.date)).at(-1);
    promoted.note = 'Received CSV '+last.date+': '+last.matched+' one-to-one matches / '+last.rows+' rows, zero duplicate identities. Other specifications remain unreviewed.';
    return {reviewed,collection,code,latest:last,inboxCount,legacyCount,targetReceipts:reports.length};
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
}

module.exports = {review, matchRows, checkCoverage, FILES};
