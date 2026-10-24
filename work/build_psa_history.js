const fs = require("fs");
const path = require("path");

const ROOT = process.env.PSA_ACQUISITION_ROOT || path.join(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "pokemon-cards.json");
const POP_PATH = path.join(ROOT, "data", "psa-official-populations.json");
const ENGLISH_PATH = path.join(ROOT, "work", "snkr_english_names.json");
const PRIORITY_ROWS_PATH = path.join(ROOT, "work", "priority_psa_rows.json");
const SUMMARY_PATH = path.join(ROOT, "data", "psa-population-summary.json");
const HISTORY_DIR = path.join(ROOT, "data", "psa-history");
const SHARDS = 32;
const RETENTION_DAYS = Math.max(90, Number(process.env.PSA_HISTORY_DAYS || 400));

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; } }
function dayKey(date = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, ""); }
function normalizeNo(value) { const raw = String(value || "").replace(/^#/, "").trim().toUpperCase(); return raw.replace(/^0+(?=\d)/, ""); }
function shortSet(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^(?:SC-SHINY|XY-BEST|S8A-[PG]|(?:XY|SM|S|SV|M)-P)$/.test(raw)) return raw;
  return raw.split(/[-\s]/)[0];
}
function cardIdentity(card) {
  const match = String(card.name || "").match(/\[([^\]]+)\]/);
  if (!match) return null;
  const inside = match[1].trim().toUpperCase();
  const promoSet = inside.match(/(?:^|[\s/])((?:XY|SM|S|SV|M)-P)(?:$|[\s/])/i)?.[1];
  if (promoSet) {
    const withoutSet = inside.replace(new RegExp(promoSet.replace("-", "\\-"), "i"), " ");
    const promoNo = withoutSet.match(/(?:PROMO)?\s*0*(\d+)/i)?.[1] || "";
    return { set: shortSet(promoSet), no: normalizeNo(promoNo) };
  }
  const parts = inside.split(/\s+/);
  const numberToken = parts.slice(1).find((part) => /^\d/.test(part)) || parts[1] || "";
  const set=parts[0]==='SC' && /シャイニーコレクション/i.test(card.name || '') ? 'SC-SHINY'
    : parts[0]==='XY' && /THE BEST OF XY/i.test(card.name || '') ? 'XY-BEST' : shortSet(parts[0]);
  return { set, no: normalizeNo(numberToken.split("/")[0]) };
}
function cleanName(value) {
  return String(value || "").toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/shop with affiliates/gi, " ")
    .replace(/\[[^\]]+\]|\([^)]*\)/g, " ")
    .replace(/monster ball mirror(?:\s*\/?\s*special monster ball)?/g, " reverse holo ")
    .replace(/energy mark mirror/g, " reverse holo ")
    .replace(/team rocket mark mirror/g, " team rocket reverse holo ")
    .replace(/master ball mirror/g, " master ball reverse holo ")
    .replace(/chinese (?:text )?printing error/g, " incorrect texture ")
    .replace(/\b1ed\b/g, " 1st edition ")
    .replace(/\bsar\b/g, " special art rare ").replace(/\bmur\b/g, " mega ultra rare ")
    .replace(/\bsr\b/g, " secret rare ").replace(/\bar\b/g, " art rare ")
    .replace(/\bex\b/g, " ex ").replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(value) { return new Set(cleanName(value).split(/\s+/).filter((x) => x && !["pokemon", "japanese", "card", "rare"].includes(x))); }
function similarity(a, b) {
  const aa = tokens(a), bb = tokens(b); if (!aa.size || !bb.size) return 0;
  let common = 0; for (const token of aa) if (bb.has(token)) common += 1;
  return common / Math.max(aa.size, bb.size);
}
function baseSimilarity(a, b) {
  const ignored = new Set(["old", "back", "holo", "no", "rarity", "symbol", "first", "1st", "edition", "trainer", "normal", "style"]);
  const aa = new Set([...tokens(a)].filter((x) => !ignored.has(x)));
  const bb = new Set([...tokens(b)].filter((x) => !ignored.has(x)));
  if (!aa.size || !bb.size) return 0;
  let common = 0; for (const token of aa) if (bb.has(token)) common += 1;
  return common / Math.max(aa.size, bb.size);
}
function variantOf(value) {
  const name = String(value || "").toLowerCase().replace(/&#x27;|&#39;|&apos;/g, "'");
  if (/メタモンマーク|with ditto mark/.test(name)) return "ditto";
  if (/マスターボール/.test(name)) return "master-ball";
  if (/ロケット団(?:の)?マーク.*ミラー/.test(name)) return "team-rocket-reverse";
  if (/モンスターボール.*ミラー|オシャボ.*ミラー|monster ball mirror|special monster ball/.test(name)) return "poke-ball";
  if (/エネルギーマーク|energy mark mirror/.test(name)) return "energy-mark";
  if (/中国語.*エラー|中国語.*誤植/.test(name)) return "incorrect-texture";
  if (/テクスチャ(?:抜け|なし)|加工(?:抜け|なし)/.test(name)) return "missing-texture";
  if (/master ball (mirror|reverse holo)/.test(name)) return "master-ball";
  if (/monster ball mirror|special monster ball|poke ball reverse holo/.test(name)) return "poke-ball";
  if (/team rocket mark mirror|team rocket reverse holo/.test(name)) return "team-rocket-reverse";
  if (/energy mark mirror/.test(name)) return "energy-mark";
  if (/chinese (text )?printing error|incorrect texture/.test(name)) return "incorrect-texture";
  if (/missing texture/.test(name)) return "missing-texture";
  if (/normal (style|version|specification)/.test(name)) return "base";
  if (/ミラー/.test(name)) return "reverse-holo";
  if (/\bmirror\b|\breverse holo\b/.test(name)) return "reverse-holo";
  return "base";
}
function candidateVariant(row) {
  const name = String(row?.name || "").toLowerCase();
  if (/with ditto mark|ditto mark/.test(name)) return "ditto";
  if (/master ball (reverse holo|mirror)/.test(name)) return "master-ball";
  if (/team rocket reverse holo/.test(name)) return "team-rocket-reverse";
  if (/poke ball reverse holo/.test(name)) return "poke-ball";
  if (row?.set === "M2A" && /reverse holo/.test(name)) return "energy-mark";
  if (/^SV(?:2A|8A)$/.test(row?.set || "") && /reverse holo/.test(name)) return "poke-ball";
  if (/incorrect texture/.test(name)) return "incorrect-texture";
  if (/missing texture/.test(name)) return "missing-texture";
  if (/reverse holo|reverse foil/.test(name)) return "reverse-holo";
  return "base";
}
function suspicious(value) { return /missing texture|error|no rarity|misprint|stamp|mirror|reverse|1st edition|unlimited/i.test(String(value || "")); }
function variantsCompatible(cardName,englishName,row) {
  return candidateVariant(row)===variantOf(`${englishName || ''} ${cardName || ''}`);
}
function namesCompatible(englishName, row) {
  const qualifiers = new Set(['c','u','r','p','pr','rr','rrr','sr','sar','hr','ur','ssr','csr','chr','ar','mur','bwr','ma','sa','s','k',
    'full','art','secret','special','ultra','rare','double','holo','foil','reverse','master','poke','ball',
    'mirror','normal','style','version','specification','trainer','promo','1st','edition','first','unlimited','hyper','illustration']);
  const identity = value => [...tokens(String(value || '').split('|')[0]
    .replace(/&#x27;|&#39;|&apos;|[’‘]/gi,"'").replace(/'s\b/gi,''))].filter(token=>!qualifiers.has(token)).sort().join('|');
  const aliases=require('./psa-name-aliases.json').aliases;
  const canonical=value=>{
    const key=identity(value);
    return aliases.find(a=>a.evidence.length>=2 && identity(a.from)===key)?.to || value;
  };
  const wanted = identity(canonical(englishName)), actual = identity(canonical(row?.name));
  return Boolean(wanted && actual && wanted === actual);
}
function japaneseTitle(card) {
  return String(card.name || '').normalize('NFKC').split('[')[0]
    .replace(/(?<![a-z])\s*(?:SAR|SSR|CSR|SR|HR|UR|RRR|RR|AR|CHR|BWR|MUR|MA|C|U|R)(?:\s*:\s*SA)?\s*$/i, '').trim();
}
function savedNameIndex(cards, summary, sourceRows, english) {
  const originals = new Map(sourceRows.map(r => [`${r.set}|${r.no}|${r.url}|${r.name}`, r]));
  const index = new Map();
  for (const card of cards) {
    const saved = summary.cards?.[card.id], identity = cardIdentity(card);
    if (!saved || !identity || /【(?:中国語版|韓国語版|英語版)】/.test(card.name || '')) continue;
    const raw = originals.get(`${identity.set}|${identity.no}|${saved.u}|${saved.n}`);
    if (!raw || !/\/pokemon-japanese-/.test(raw.url) || observationTime(raw.fetchedAt) == null
      || raw.ten !== saved.ten || raw.total !== saved.total
      || !namesCompatible(english[card.id]?.englishName, raw)
      || !variantsCompatible(card.name, english[card.id]?.englishName, raw)) continue;
    const key = japaneseTitle(card), title = raw.name.split('|')[0].replace(/^Full Art\//i, '').trim();
    if (!key || !title) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ cardId: card.id, set: identity.set, no: identity.no, title,
      sourceUrl: raw.url, observedAt: raw.fetchedAt });
  }
  return index;
}
function resolvedEnglishName(card, englishName, index) {
  const identity=cardIdentity(card),denominator=String(card.name||'').match(/\d+\s*\/\s*(\d+)\s*\]/)?.[1];
  const printNames=require('./psa-name-aliases.json').verifiedPrintNames||[];
  const proof=printNames.find(r=>identity?.set===r.set&&identity.no===r.number&&denominator===r.denominator
    &&r.language==='ja'&&!/【(?:中国語版|韓国語版|英語版)】/.test(card.name||'')&&japaneseTitle(card)===r.catalogTitle
    &&r.evidence?.length>=2);
  if(proof)return {name:proof.englishTitle,method:'official-verified-print-name',evidence:proof.evidence,
    catalogTitle:proof.catalogTitle,officialTitle:proof.officialTitle};
  const evidence = (index.get(japaneseTitle(card)) || []).filter(r => r.cardId !== card.id);
  const prints = new Set(evidence.map(r => `${r.set}|${r.no}|${r.sourceUrl}`));
  if (prints.size >= 2 && evidence.every(r => namesCompatible(evidence[0].title, { name: r.title }))) {
    const distinct = [...new Map(evidence.map(r => [`${r.set}|${r.no}|${r.sourceUrl}`, r])).values()];
    return { name: evidence[0].title, method: 'verified-saved-japanese-title', evidence: distinct.slice(0, 2) };
  }
  // Repair omitted card mechanics, not species/trainer translations or variant labels.
  let name = String(englishName || '').split('[')[0].replace(/\s*(?:SAR|SSR|CSR|SR|HR|UR)(?:\s*:\s*SA)?\s*$/i, '').trim();
  name = name.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
  const suffix = japaneseTitle(card).match(/(VSTAR|VMAX|GX|ex|V)$/i)?.[1];
  if (suffix && /VSTAR/i.test(suffix)) name = name.replace(/\bVSATR\b/gi, 'VSTAR');
  if (suffix && name && !new RegExp(`\\b${suffix}$`, 'i').test(name)) name += ` ${suffix}`;
  return { name: name || englishName, method: 'mechanic-label-normalization', evidence: [] };
}
function reconciliationFingerprint(cards, english, priorityRows) {
  return require('node:crypto').createHash('sha256').update(fs.readFileSync(__filename))
    .update(fs.readFileSync(path.join(__dirname, 'psa-name-aliases.json')))
    .update(JSON.stringify(cards.map(c => [c.id, c.name])))
    .update(JSON.stringify(english)).update(JSON.stringify(priorityRows)).digest('hex');
}
function savedRematchProof(card, originalEnglishName, englishName, selected, candidates) {
  const identity = cardIdentity(card);
  return Boolean(identity && selected.set === identity.set && selected.no === identity.no
    && selected.captureVersion >= 2 && selected.completeSnapshot === true
    && observationTime(selected.fetchedAt) != null
    && /^https:\/\/www\.psacard\.com\/pop\/tcg-cards\/\d{4}\/pokemon-japanese-/.test(selected.url)
    && variantsCompatible(card.name, originalEnglishName, selected)
    && candidates.filter(row => namesCompatible(englishName, row)
      && variantsCompatible(card.name, englishName, row)
      && variantsCompatible(card.name, originalEnglishName, row)).length === 1);
}
function shardFor(id) { let hash = 2166136261; for (const ch of String(id)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) % SHARDS; }
function daysBetween(a, b) { return Math.max(1, Math.round((Date.UTC(+b.slice(0,4),+b.slice(4,6)-1,+b.slice(6,8))-Date.UTC(+a.slice(0,4),+a.slice(4,6)-1,+a.slice(6,8)))/86400000)); }
function observationTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
function appendObservation(history, selected, specificationIdentity = null) {
  const time = observationTime(selected.fetchedAt);
  if (time == null || !Number.isFinite(selected.ten) || !Number.isFinite(selected.total)
    || selected.ten < 0 || selected.total <= 0 || selected.total < selected.ten) return history;
  const point = [dayKey(new Date(time)), selected.ten, selected.total, {
    observedAt: selected.fetchedAt, sourceUrl: selected.url || null, specificationIdentity,
    captureVersion: selected.captureVersion || null, completeSnapshot: selected.completeSnapshot === true,
  }];
  const sameDayIndex = history.findIndex(row => row[0] === point[0]
    && observationTime(row[3]?.observedAt) != null && row[3]?.sourceUrl === point[3].sourceUrl);
  const result = [...history];
  if (sameDayIndex >= 0) {
    if (time <= observationTime(history[sameDayIndex][3].observedAt)) return history;
    result[sameDayIndex] = point;
  } else result.push(point);
  // Legacy points have no observation time; retain them without backfilling provenance.
  return result.sort((a, b) => a[0].localeCompare(b[0])
    || (observationTime(a[3]?.observedAt) ?? -Infinity) - (observationTime(b[3]?.observedAt) ?? -Infinity));
}
function previousConfirmation(history,selected,identity){
  const time=observationTime(selected.fetchedAt);
  if(time==null)return null;
  return [...history].filter(r=>r[3]?.sourceUrl===selected.url&&r[3]?.specificationIdentity===identity
    &&observationTime(r[3]?.observedAt)!=null&&observationTime(r[3].observedAt)<time
    &&Number.isInteger(r[1])&&Number.isInteger(r[2])&&r[1]>=0&&r[2]>=r[1])
    .sort((a,b)=>observationTime(a[3].observedAt)-observationTime(b[3].observedAt)).at(-1)||null;
}
function rememberPreviousConfirmation(store,id,history,selected){
  store.previousConfirmations||={};
  const identity=store.identities[id],previous=previousConfirmation(history,selected,identity);
  const latestKnown=Math.max(-Infinity,...history.filter(r=>r[3]?.sourceUrl===selected.url&&r[3]?.specificationIdentity===identity).map(r=>observationTime(r[3]?.observedAt)??-Infinity));
  if(previous&&observationTime(selected.fetchedAt)>latestKnown)store.previousConfirmations[id]=previous;
  const remembered=store.previousConfirmations[id];
  if(remembered&&(remembered[3]?.sourceUrl!==selected.url||remembered[3]?.specificationIdentity!==identity))delete store.previousConfirmations[id];
}
function windowChange(history, days, today) {
  const rows = history.filter(row => /^\d{8}$/.test(row[0]) && Number.isFinite(row[1])
    && Number.isFinite(row[2]) && row[1] >= 0 && row[2] >= row[1] && row[2] > 0)
    .sort((a, b) => a[0].localeCompare(b[0])
      || (observationTime(a[3]?.observedAt) ?? -Infinity) - (observationTime(b[3]?.observedAt) ?? -Infinity));
  if (rows.length < 2) return null;
  const latest = rows.at(-1), latestTime = observationTime(latest[3]?.observedAt);
  const known = rows.filter(row => observationTime(row[3]?.observedAt) != null && row[3]?.sourceUrl);
  if (new Set(known.map(row => row[3].sourceUrl)).size > 1
    || new Set(known.map(row => row[3].specificationIdentity).filter(Boolean)).size > 1) return null;
  const measured = latestTime != null && latest[3]?.sourceUrl && known.length >= 2
    && latestTime - observationTime(known[0][3].observedAt) >= 2 * 86400000;
  let fullWindowBase, base, actualDays;
  if (measured) {
    const cutoffTime = latestTime - days * 86400000;
    fullWindowBase = [...known].reverse().find(row => observationTime(row[3].observedAt) <= cutoffTime);
    base = fullWindowBase || known[0];
    actualDays = (latestTime - observationTime(base[3].observedAt)) / 86400000;
  } else {
    const anchor = today || latest[0];
    const cutoff = new Date(Date.UTC(+anchor.slice(0,4), +anchor.slice(4,6)-1, +anchor.slice(6,8))); cutoff.setUTCDate(cutoff.getUTCDate()-days);
    const cutoffKey = cutoff.toISOString().slice(0,10).replace(/-/g, "");
    fullWindowBase = [...rows].reverse().find(row => row[0] <= cutoffKey);
    base = fullWindowBase || rows[0];
    actualDays = daysBetween(base[0], latest[0]);
  }
  if (actualDays < 2) return null;
  const delta10 = latest[1]-base[1], deltaTotal = latest[2]-base[2];
  const rate = base[1] > 0 ? delta10/base[1] : 0, daily = delta10/actualDays;
  let status = "横ばい";
  if (delta10 > 0 && (daily >= 10 || rate >= .1)) status = "急増化";
  else if (delta10 > 0 && (daily >= 1 || rate >= .02)) status = "増加";
  else if (delta10 > 0) status = "少ない";
  const endpoint = row => ({ date: row[0], ten: row[1], total: row[2],
    observedAt: row[3]?.observedAt || null, sourceUrl: row[3]?.sourceUrl || null });
  return { d10: delta10, dt: deltaTotal, s: status, days: actualDays, partial: !fullWindowBase,
    reference: !measured, provenanceUnknown: !measured, base: endpoint(base), latest: endpoint(latest),
    monthlyExtrapolation: { d10: daily * 30, dt: deltaTotal / actualDays * 30, estimate: true } };
}

function compactRows(payload) {
  const source = Array.isArray(payload?.rows) ? payload.rows : Object.values(payload?.byQuery || {});
  const rows = source.map((row) => ({
    set: shortSet(row.setCode || String(row.sourceSet || row.setName || "").replace(/^\d{4}\s+Pokemon Japanese\s+/i, "")),
    no: normalizeNo(row.cardNo), name: String(row.cardName || "").replace(/Shop with Affiliates/gi, "").trim(),
    ten: row.psa10Count == null ? null : Number(row.psa10Count), total: row.psaTotal == null ? null : Number(row.psaTotal), url: row.sourceUrl || "", fetchedAt: row.fetchedAt || "",
    captureVersion: row.captureVersion || null, completeSnapshot: row.completeSnapshot === true,
  })).filter((row) => row.set && row.no && Number.isFinite(row.ten) && Number.isFinite(row.total) && row.total > 0 && row.total >= row.ten && row.ten >= 0);
  const deduped = new Map();
  for (const row of rows) {
    const key = `${row.set}|${row.no}|${cleanName(row.name)}|${row.url}`;
    const previous = deduped.get(key);
    const time = observationTime(row.fetchedAt), previousTime = observationTime(previous?.fetchedAt);
    if (!previous || (time != null && (previousTime == null || time > previousTime))) deduped.set(key, row);
  }
  return [...deduped.values()];
}
function compactWindow(change) {
  if (!change) return null;
  const { d10, dt, s, days, partial, reference, provenanceUnknown } = change;
  return { d10, dt, s, days, partial, reference, provenanceUnknown };
}

function authoritativeRows(rows) {
  const verified = new Map();
  for (const row of rows) if (row.captureVersion >= 2 && row.completeSnapshot) {
    const key = `${row.set}|${row.url}`;
    if (!verified.has(key) || row.fetchedAt > verified.get(key)) verified.set(key, row.fetchedAt);
  }
  return rows.filter(row => !verified.has(`${row.set}|${row.url}`) || row.captureVersion >= 2);
}
function reconcileHistory(store,id,history,selected,identity) {
  const provenance=`${identity.set}|${identity.no}|${cleanName(selected.name)}|${candidateVariant(selected)}|${selected.captureVersion>=2?'full-label-v2':'legacy-label'}`;
  store.identities ||= {};
  store.sources ||= {};
  const recordedSources = [...new Set(history.map(row => row[3]?.sourceUrl).filter(Boolean))];
  const sourceUrl = selected.url || null, previousSource = store.sources[id] || recordedSources.at(-1) || null;
  const sourceChanged = (previousSource && previousSource !== sourceUrl) || recordedSources.some(url => url !== sourceUrl);
  const specificationChanged = (selected.captureVersion >= 2 || store.identities[id]) && store.identities[id]!==provenance;
  if ((sourceChanged || specificationChanged) && history.length) {
    store.quarantined ||= {};store.quarantined[id] ||= [];
    store.quarantined[id].push({at:new Date().toISOString(),reason:sourceChanged ? 'source-url-changed' : '完全な仕様表記への再照合・旧履歴の仕様根拠未確定',
      previousIdentity:store.identities[id] || null, previousSource, sourceUrl, points:history});
    history=[];
  }
  store.identities[id]=provenance;
  store.sources[id]=sourceUrl;
  return history;
}

function main() {
  const cards = readJson(CARDS_PATH, []), population = readJson(POP_PATH, {}), english = readJson(ENGLISH_PATH, { cards: {} }).cards || {};
  const priorityRows = readJson(PRIORITY_ROWS_PATH, { rows: [] }).rows || [];
  const allSourceRows = compactRows({ ...population, rows: [...(population.rows || []), ...priorityRows] });
  const sourceRows = authoritativeRows(allSourceRows);
  const previousSummary = readJson(SUMMARY_PATH, { cards: {} });
  const nameIndex = savedNameIndex(cards, previousSummary, sourceRows, english);
  const groups = new Map();
  const setGroups = new Map();
  for (const row of sourceRows) {
    const key = `${row.set}|${row.no}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
    if (!setGroups.has(row.set)) setGroups.set(row.set, []); setGroups.get(row.set).push(row);
  }
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const shards = Array.from({ length: SHARDS }, (_, i) => readJson(path.join(HISTORY_DIR, `${String(i).padStart(2,"0")}.json`), { v: 1, cards: {} }));
  const today = dayKey(), cutoff = dayKey(new Date(Date.now()-RETENTION_DAYS*86400000));
  const summary = { v: 1, updatedAt: population.generatedAt || new Date().toISOString(), date: today, matched: 0, cards: {},
    reconciliationFingerprint: reconciliationFingerprint(cards, english, priorityRows) };
  const variantReview=[];
  for (const card of cards) {
    const identity = cardIdentity(card); if (!identity) continue;
    let candidates = identity.no ? (groups.get(`${identity.set}|${identity.no}`) || []) : (setGroups.get(identity.set) || []); if (!candidates.length) continue;
    const originalEnglishName = english[card.id]?.englishName || "";
    const alreadyCompatible = candidates.some(row => namesCompatible(originalEnglishName, row)
      && variantsCompatible(card.name, originalEnglishName, row));
    const mayRematch = !card.identityReviewRequired && !/-P$/.test(identity.set)
      && !/【(?:中国語版|韓国語版|英語版)】|未開封パック|BOX|複数枚セット/.test(card.name || '');
    const resolution = alreadyCompatible || !mayRematch ? { name: originalEnglishName, evidence: [] }
      : resolvedEnglishName(card, originalEnglishName, nameIndex);
    const englishName = resolution.name;
    let selected = null, method = "";
    const fullName = `${englishName} ${originalEnglishName} ${card.name || ""}`;
    if (/メタモンマーク|with ditto mark/i.test(fullName)) {
      const ditto = candidates.filter((row) => /ditto$/i.test(cleanName(row.name).replace(/\s+/g, "")) && !/reverse/i.test(row.name));
      if (ditto.length === 1) { selected = ditto[0]; method = "set-number-edition"; }
    }
    if (!selected && candidates.some((row) => /corrected/i.test(row.name))) {
      const wantsError = /エラー版|\berror\b/i.test(fullName) && !/修正版|corrected/i.test(fullName);
      const edition = candidates.filter((row) => wantsError ? !/corrected/i.test(row.name) : /corrected/i.test(row.name));
      if (edition.length === 1) { selected = edition[0]; method = "set-number-edition"; }
    }
    if (!selected && candidates.some((row) => /missing (?:gloss|texture)/i.test(row.name))) {
      const wantsMissing = /抜け|なし|missing (?:gloss|texture)/i.test(fullName);
      const edition = candidates.filter((row) => wantsMissing ? /missing (?:gloss|texture)/i.test(row.name) : !/missing (?:gloss|texture)/i.test(row.name));
      if (edition.length === 1) { selected = edition[0]; method = "set-number-edition"; }
    }
    if (!identity.no && identity.set === "PMCG1" && englishName) {
      const noRarity = /\[PMCG1-1\]/i.test(String(card.name || ""));
      candidates = candidates.filter((row) => noRarity === /no rarity symbol/i.test(row.name));
      const ranked = candidates.map((row) => ({ row, score: baseSimilarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
      if (ranked[0]?.score >= .75 && (!ranked[1] || ranked[0].score-ranked[1].score >= .2)) {
        selected = ranked[0].row; method = "set-name-edition";
      }
    }
    if (!selected && englishName) {
      const wantedVariant = variantOf(`${englishName} ${card.name || ""}`);
      const exactVariant = candidates.filter((row) => candidateVariant(row) === wantedVariant);
      const rankedPool = exactVariant.length ? exactVariant : candidates;
      const ranked = rankedPool.map((row) => ({ row, score: similarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
      if (ranked[0]?.score >= .5 && (!ranked[1] || ranked[0].score-ranked[1].score >= .12)) { selected = ranked[0].row; method = "set-number-english"; }
      if (!selected) {
        const variantCandidates = exactVariant
          .map((row) => ({ row, score: similarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
        if (variantCandidates.length === 1) {
          selected = variantCandidates[0].row; method = "set-number-variant";
        }
      }
    }
    if (!selected && candidates.length === 1 && candidateVariant(candidates[0]) === variantOf(card.name || "")) {
      selected = candidates[0]; method = "set-number-variant";
    }
    if (!selected && candidates.length === 1 && !suspicious(candidates[0].name)) { selected = candidates[0]; method = "set-number-unique"; }
    if (!selected) {
      if (variantOf(fullName)!=='base') variantReview.push({id:card.id,name:card.name,
        expectedVariant:variantOf(fullName),candidateVariant:null,sourceName:candidates.map(row=>row.name).join(' / '),
        sourceUrl:candidates[0]?.url,observedAt:candidates[0]?.fetchedAt,reason:'仕様一致の確定候補なし・POP採用保留'});
      continue;
    }
    if (englishName !== originalEnglishName && !savedRematchProof(card, originalEnglishName, englishName, selected, candidates)) {
      variantReview.push({ id: card.id, name: card.name, sourceUrl: selected.url,
        observedAt: selected.fetchedAt, reason: '保存原票の日時・日本語版・一意な仕様の証明不足・POP採用保留' });
      continue;
    }
    // A unique number or a similar name cannot establish a mirror/edition identity.
    const expectedVariant=variantOf(`${englishName} ${card.name || ''}`);
    if (!namesCompatible(englishName,selected) || !variantsCompatible(card.name,englishName,selected) || /pokemon-asia/i.test(selected.url)) {
      variantReview.push({id:card.id,name:card.name,expectedVariant,candidateVariant:candidateVariant(selected),
        sourceName:selected.name,sourceUrl:selected.url,observedAt:selected.fetchedAt,reason:/pokemon-asia/i.test(selected.url)?'日本語版の根拠不足・POP採用保留':!namesCompatible(englishName,selected)?'名称不一致または英語名未確認・POP採用保留':'仕様不一致・POP採用保留'});
      continue;
    }
    const shard = shardFor(card.id), store = shards[shard]; store.cards ||= {};
    let history = Array.isArray(store.cards[card.id]) ? store.cards[card.id].filter((row)=>row[0]>=cutoff) : [];
    history=reconcileHistory(store,card.id,history,selected,identity);
    rememberPreviousConfirmation(store,card.id,history,selected);
    history = appendObservation(history, selected, store.identities[card.id]);
    store.cards[card.id] = history;
    const latest = history.at(-1), selectedTime = observationTime(selected.fetchedAt);
    const newerSaved = selectedTime != null && observationTime(latest?.[3]?.observedAt) > selectedTime;
    const ten = newerSaved ? latest[1] : selected.ten, total = newerSaved ? latest[2] : selected.total;
    summary.cards[card.id] = { n: selected.name, e: englishName, ten, total, rate: total ? ten/total*100 : null, u: selected.url, m: method, f: newerSaved ? latest[3].observedAt : selected.fetchedAt || "", sh: String(shard).padStart(2,"0"), w7: compactWindow(windowChange(history,7)), w30: compactWindow(windowChange(history,30)), w90: compactWindow(windowChange(history,90)) };
    if (englishName !== originalEnglishName) summary.cards[card.id].nameResolution = {
      originalEnglishName, method: resolution.method, evidence: resolution.evidence };
    summary.matched += 1;
  }
  for (let i=0;i<SHARDS;i+=1) fs.writeFileSync(path.join(HISTORY_DIR, `${String(i).padStart(2,"0")}.json`), JSON.stringify(shards[i]), "utf8");
  summary.specificationHeld = Object.fromEntries(variantReview.map(row=>[row.id,{reason:row.reason,u:row.sourceUrl,f:row.observedAt}]));
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary), "utf8");
  fs.writeFileSync(path.join(path.dirname(SUMMARY_PATH),'psa-mapping-review.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:variantReview.length,rows:variantReview}),'utf8');
  fs.writeFileSync(POP_PATH, JSON.stringify({ v: 2, generatedAt: population.generatedAt || new Date().toISOString(), totalSets: population.totalSets || 0, totalRows: allSourceRows.length, rows: allSourceRows.map((row) => ({ setCode: row.set, cardNo: row.no, cardName: row.name, psa10Count: row.ten, psaTotal: row.total, sourceUrl: row.url, fetchedAt: row.fetchedAt, captureVersion:row.captureVersion,completeSnapshot:row.completeSnapshot })) }), "utf8");
  console.log(JSON.stringify({ matched: summary.matched, total: cards.length, english: Object.keys(english).length, date: today }));
}

if (require.main === module) main();
module.exports = { cardIdentity, compactRows, cleanName, shortSet, normalizeNo, variantsCompatible, namesCompatible, authoritativeRows, reconcileHistory, dayKey, observationTime, appendObservation, windowChange, compactWindow, previousConfirmation, rememberPreviousConfirmation, japaneseTitle, savedNameIndex, resolvedEnglishName, reconciliationFingerprint, savedRematchProof };
