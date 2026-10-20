const fs = require('node:fs'), path = require('node:path');
const access = require('./overseas_access_policy');
const retry = require('./acquisition_retry');
const identity = require('./card_identity');
const { buybackSupport } = require('../exploration-metrics');
const SCHEMA = 'private-overseas-analysis-v1';
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const timestamp = v => typeof v === 'string' ? Date.parse(v) : NaN;
const read = (root, file, fallback) => {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) return fallback;
  return JSON.parse(fs.readFileSync(target, 'utf8'));
};
function sameIdentity(a, b) {
  const keys = ['setCode', 'number', 'rarity', 'variant', 'language'];
  return a && b && keys.every(k => typeof a[k] === 'string' && a[k].length && a[k] === b[k])
    && a.language === 'JAPANESE';
}
function comparison(domestic, foreign, { now = Date.now(), neutralBandPct = 5, maxAgeHours = 48, maxSkewHours = 24 } = {}) {
  if (![neutralBandPct, maxAgeHours, maxSkewHours].every(Number.isFinite)
    || neutralBandPct < 0 || maxAgeHours <= 0 || maxSkewHours < 0) throw Error('Invalid comparison policy');
  const reasons = [];
  if (!sameIdentity(domestic?.identity, foreign?.identity)) reasons.push('仕様未確定・不一致');
  if (!['PSA10', 'RAW'].includes(domestic?.grade) || domestic.grade !== foreign?.grade) reasons.push('グレード不一致');
  if (domestic?.grade === 'RAW' && (domestic.condition !== foreign?.condition || domestic.condition !== 'mint')) reasons.push('素体状態が同等と確認できない');
  for (const [label, row] of [['国内', domestic], ['海外', foreign]]) {
    if (!positive(row?.value)) reasons.push(label + '価格未取得');
    if (!['actual-sale', 'provider-aggregate'].includes(row?.priceType)) reasons.push(label + '実成約・集計根拠未確認');
    if (row?.held || row?.priceConflict || row?.identityVerified !== true) reasons.push(label + '仕様保留・価格対立');
    if (!Number.isInteger(row?.count) || row.count <= 0) reasons.push(label + '採用件数未確認');
    const at = timestamp(row?.priceObservedAt), captured = timestamp(row?.capturedAt);
    if (!Number.isFinite(at)) reasons.push(label + '価格確認日未取得');
    else if (at > now || now - at > maxAgeHours * 3600000) reasons.push(label + '価格が古い・未来日');
    if (!Number.isFinite(captured) || captured > now || at > captured) reasons.push(label + '取得日時不整合');
    if (!row?.sourceUrl || !/^https:\/\//.test(row.sourceUrl)) reasons.push(label + '出典未取得');
    const start = timestamp(row?.period?.start), end = timestamp(row?.period?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end > now || end > at) reasons.push(label + '対象期間未確認');
  }
  if (domestic?.currency !== 'JPY') reasons.push('国内円価格未確認');
  let foreignJpy = null;
  if (foreign?.currency === 'JPY') foreignJpy = foreign.value;
  else {
    const fx = foreign?.fx, at = timestamp(fx?.rateDate);
    if (!['USD', 'EUR'].includes(foreign?.currency) || fx?.currency !== foreign.currency
      || !positive(fx?.jpyRate) || !Number.isFinite(at) || at > now
      || now - at > maxAgeHours * 3600000 || !/^https:\/\//.test(fx?.sourceUrl || '')) reasons.push('為替根拠・基準日不足');
    else foreignJpy = foreign.value * fx.jpyRate;
  }
  for (const field of ['priceObservedAt', 'period.start', 'period.end']) {
    const get = row => field.split('.').reduce((v, k) => v?.[k], row);
    const a = timestamp(get(domestic)), b = timestamp(get(foreign));
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > maxSkewHours * 3600000) reasons.push('比較時期不一致');
  }
  if (reasons.length || !positive(foreignJpy)) return { status: 'incomparable', label: '比較不可', gapPct: null, foreignJpy: null, reasons: [...new Set(reasons)], neutralBandPct };
  const gapPct = (foreignJpy / domestic.value - 1) * 100;
  const neutral = foreignJpy >= domestic.value * (1 - neutralBandPct / 100)
    && foreignJpy <= domestic.value * (1 + neutralBandPct / 100);
  return { status: 'comparable', gapPct, foreignJpy, neutralBandPct, reasons: [],
    label: neutral ? 'ほぼ同水準' : gapPct > 0 ? '海外高' : '国内高',
    reference: domestic.priceType !== 'actual-sale' || foreign.priceType !== 'actual-sale',
    note: '価格差の参考比較。値上がり・下落・購入GOの予測ではない' };
}
function metadata(root) {
  const catalog = read(root, 'data/pokemon-cards.json', []), byId = new Map(catalog.map(c => [c.id, c]));
  const manifest = read(root, 'data/pokedata/manifest.json', { sets: [] });
  const mappings = [], seen = new Set();
  for (const set of manifest.sets || []) {
    if (!/^data\/pokedata\/sets\/[a-zA-Z0-9_-]+\.json$/.test(set.file || '')) throw Error('Unsafe metadata shard');
    const shard = read(root, set.file, null);
    if (!shard) throw Error('Metadata shard missing');
    for (const link of shard.linkageRecords || []) {
      const c = byId.get(link.localCardId), row = shard.cards?.[link.localCardId], p = row?.pokedata;
      if (!c || !/^[a-z0-9]+-[a-z0-9]+$/i.test(c.id) || !row || !p || !['auto-confirmed', 'manual-confirmed'].includes(row.linkStatus)
        || !['auto-confirmed', 'manual-confirmed'].includes(link.status || link.linkStatus)
        || identity.canonicalIdentity({ name: row.localCardName }).key !== identity.canonicalIdentity(c).key
        || c.identityReviewRequired || p.language !== 'JAPANESE'
        || !Number.isInteger(Number(link.pokedataCardId)) || Number(link.pokedataCardId) <= 0) continue;
      const parsed = identity.canonicalIdentity(c);
      if (identity.normalizeToken(p.setCode) !== parsed.setCode || identity.normalizeToken(p.printedNumber) !== parsed.cardNumber
        || !parsed.setCode || !parsed.cardNumber || !parsed.rarity
        || !/^https:\/\/(?:www\.)?pokedata\.io\/card\//.test(row.sourceUrl || '')) continue;
      const key = c.id + ':' + link.pokedataCardId;
      if (seen.has(key)) continue;
      seen.add(key);
      mappings.push({ localCardId: c.id, providerId: Number(link.pokedataCardId), name: c.name,
        providerName: p.name, providerNumber: identity.normalizeToken(p.number || String(p.printedNumber).split('/')[0]), sourceUrl: row.sourceUrl,
        identity: { setCode: parsed.setCode, number: parsed.cardNumber, rarity: parsed.rarity, variant: parsed.variant || 'standard', language: 'JAPANESE' } });
    }
  }
  // Duplicate mappings are review cases, not separate evidence or extra coverage.
  const local = new Map(), remote = new Map();
  for (const m of mappings) {
    local.set(m.localCardId, (local.get(m.localCardId) || 0) + 1);
    remote.set(m.providerId, (remote.get(m.providerId) || 0) + 1);
  }
  const exact = mappings.filter(m => local.get(m.localCardId) === 1 && remote.get(m.providerId) === 1);
  return { catalog, mappings: exact, held: mappings.length - exact.length, representedSets: manifest.sets.length };
}
function verifyPayload(payload, mapping) {
  return Number(payload?.id) === mapping.providerId && payload.language === 'JAPANESE'
    && identity.normalizeToken(payload.set_code) === mapping.identity.setCode
    && identity.normalizeToken(payload.num) === mapping.providerNumber
    && typeof payload.name === 'string' && identity.normalizeToken(payload.name) === identity.normalizeToken(mapping.providerName);
}
function build(root, options = {}) {
  const now = options.now ?? Date.now(), meta = metadata(root), allowed = access.allowed(root);
  const input = read(root, '.private/overseas/analysis-input.json', { rows: [] });
  const summary = read(root, 'data/buyback-observation-summary.json', {});
  const byId = new Map(meta.catalog.map(c => [c.id, c])), mappings = new Map(meta.mappings.map(m => [m.localCardId, m]));
  const pending = [...(input.rows || [])], rows = [];
  if (allowed) for (const mapping of meta.mappings) {
    const saved = access.privatePath(root, 'prices/' + mapping.localCardId + '.json');
    if (!fs.existsSync(saved)) continue;
    const record = JSON.parse(fs.readFileSync(saved, 'utf8')), card = byId.get(mapping.localCardId);
    if (record.id !== mapping.providerId || !sameIdentity(record.identity, mapping.identity)) continue;
    for (const [key, grade] of [['psa10', 'PSA10'], ['raw', 'RAW']]) {
      const value = record[key];
      if (!value || pending.some(r => r.localCardId === mapping.localCardId && r.foreign?.grade === grade)) continue;
      pending.push({ localCardId: mapping.localCardId, providerId: mapping.providerId,
        domestic: { identity: mapping.identity, grade, condition: grade === 'RAW' ? 'mint' : 'PSA10',
          value: grade === 'PSA10' ? card.snkPsa10Price : null, currency: 'JPY', priceType: 'provider-aggregate',
          priceObservedAt: card.priceObservedAt || null, capturedAt: card.priceObservedAt || null, count: null, period: null,
          identityVerified: !card.identityReviewRequired, sourceUrl: card.sourceUrl || card.url || null },
        foreign: { ...value, identity: mapping.identity, identityVerified: true, grade, capturedAt: record.capturedAt,
          priceObservedAt: value.providerObservedAt, count: value.saleCount, period: null, sourceUrl: mapping.sourceUrl } });
    }
  }
  if (allowed) for (const row of pending) {
    const mapping = mappings.get(row.localCardId), card = byId.get(row.localCardId);
    const verified = mapping && row.providerId === mapping.providerId && row.foreign?.sourceUrl === mapping.sourceUrl && sameIdentity(mapping.identity, row.foreign?.identity)
      && sameIdentity(mapping.identity, row.domestic?.identity);
    const result = comparison(row.domestic, verified ? row.foreign : null, { ...input.comparisonPolicy, now });
    const selection = input.storeSelection || {};
    const demand = card ? buybackSupport(summary, card.id, selection.mode || 'all', selection.stores || [], now, card.snkPsa10Price, card.identityKey) : null;
    rows.push({ localCardId: row.localCardId, identityVerified: Boolean(verified), name: card?.name || '', domestic: row.domestic, foreign: row.foreign, result,
      domesticContext: { support: demand, psa10Trades7: card?.p10tv7 ?? null, psa10Trades30: card?.p10tv30 ?? null,
        note: '減額前の買取提示は支持の参考。実買取件数・オリパ需要の原因・将来の価格を保証しない' } });
  }
  const report = { schema: SCHEMA, usage: 'private-only', at: new Date(now).toISOString(), status: allowed ? 'internal-only' : 'permission-wait',
    policy: { neutralBandPct: input.comparisonPolicy?.neutralBandPct ?? 5, explanation: '正は海外高、負は国内高。中立幅は分析設定であり検証済み予測閾値ではない', decisionImpact: false },
    coverage: { domesticCatalog: meta.catalog.length, representedSets: meta.representedSets, exactMetadataMappings: meta.mappings.length,
      ambiguousMappings: meta.held, supportedSameSpecificationUniverse: null, supportedMatchingPct: null,
      denominatorStatus: '正規の対応セット全商品・仕様母集団未確認。取得済み分を分母に90%達成としない',
      acquired: new Set(rows.filter(r => r.identityVerified && positive(r.foreign?.value)).map(r => r.localCardId)).size,
      comparable: new Set(rows.filter(r => r.result.status === 'comparable').map(r => r.localCardId)).size },
    reason: allowed ? null : '未契約・用途許諾確認待ち。契約・API通信・問い合わせ送信は未実施', rows };
  const file = access.privatePath(root, 'analysis/report.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); retry.atomicWrite(file, report);
  return report;
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const report = build(root);
  console.log(JSON.stringify({ status: report.status, privateReportWritten: true, httpRequests: 0, publicDataChanged: false }));
}
module.exports = { SCHEMA, comparison, metadata, verifyPayload, build, sameIdentity };
