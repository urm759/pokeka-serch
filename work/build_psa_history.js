const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "pokemon-cards.json");
const POP_PATH = path.join(ROOT, "data", "psa-official-populations.json");
const ENGLISH_PATH = path.join(__dirname, "snkr_english_names.json");
const SUMMARY_PATH = path.join(ROOT, "data", "psa-population-summary.json");
const HISTORY_DIR = path.join(ROOT, "data", "psa-history");
const SHARDS = 32;
const RETENTION_DAYS = Math.max(90, Number(process.env.PSA_HISTORY_DAYS || 400));

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; } }
function dayKey(date = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, ""); }
function normalizeNo(value) { const raw = String(value || "").replace(/^#/, "").trim().toUpperCase(); return raw.replace(/^0+(?=\d)/, ""); }
function shortSet(value) { return String(value || "").trim().toUpperCase().split(/[-\s]/)[0]; }
function cardIdentity(card) {
  const match = String(card.name || "").match(/\[([^\]]+)\]/);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) return null;
  return { set: shortSet(parts[0]), no: normalizeNo(parts[1].split("/")[0]) };
}
function cleanName(value) {
  return String(value || "").toLowerCase()
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/shop with affiliates/gi, " ")
    .replace(/\[[^\]]+\]|\([^)]*\)/g, " ")
    .replace(/monster ball mirror\s*\/?\s*special monster ball/g, " poke ball reverse holo ")
    .replace(/energy mark mirror/g, " reverse holo ")
    .replace(/team rocket mark mirror/g, " team rocket reverse holo ")
    .replace(/master ball mirror/g, " master ball reverse holo ")
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
function suspicious(value) { return /missing texture|error|no rarity|misprint|stamp|mirror|reverse|1st edition|unlimited/i.test(String(value || "")); }
function shardFor(id) { let hash = 2166136261; for (const ch of String(id)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) % SHARDS; }
function daysBetween(a, b) { return Math.max(1, Math.round((Date.UTC(+b.slice(0,4),+b.slice(4,6)-1,+b.slice(6,8))-Date.UTC(+a.slice(0,4),+a.slice(4,6)-1,+a.slice(6,8)))/86400000)); }
function windowChange(history, days, today) {
  if (history.length < 2) return null;
  const cutoff = new Date(Date.UTC(+today.slice(0,4), +today.slice(4,6)-1, +today.slice(6,8))); cutoff.setUTCDate(cutoff.getUTCDate()-days);
  const cutoffKey = cutoff.toISOString().slice(0,10).replace(/-/g, "");
  const base = [...history].reverse().find((row) => row[0] <= cutoffKey);
  const latest = history[history.length-1]; if (!base) return null;
  const actualDays = daysBetween(base[0], latest[0]);
  const delta10 = latest[1]-base[1], deltaTotal = latest[2]-base[2];
  const rate = base[1] > 0 ? delta10/base[1] : 0, daily = delta10/actualDays;
  let status = "横ばい";
  if (delta10 > 0 && (daily >= 10 || rate >= .1)) status = "急増化";
  else if (delta10 > 0 && (daily >= 1 || rate >= .02)) status = "増加";
  else if (delta10 > 0) status = "少ない";
  return { d10: delta10, dt: deltaTotal, s: status };
}

function compactRows(payload) {
  const source = Array.isArray(payload?.rows) ? payload.rows : Object.values(payload?.byQuery || {});
  return source.map((row) => ({
    set: shortSet(row.setCode || String(row.sourceSet || row.setName || "").replace(/^\d{4}\s+Pokemon Japanese\s+/i, "")),
    no: normalizeNo(row.cardNo), name: String(row.cardName || "").replace(/Shop with Affiliates/gi, "").trim(),
    ten: Number(row.psa10Count), total: Number(row.psaTotal), url: row.sourceUrl || "", fetchedAt: row.fetchedAt || payload.generatedAt || "",
  })).filter((row) => row.set && row.no && Number.isFinite(row.ten) && Number.isFinite(row.total) && row.total >= row.ten && row.ten >= 0);
}

function main() {
  const cards = readJson(CARDS_PATH, []), population = readJson(POP_PATH, {}), english = readJson(ENGLISH_PATH, { cards: {} }).cards || {};
  const sourceRows = compactRows(population);
  const groups = new Map();
  for (const row of sourceRows) { const key = `${row.set}|${row.no}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const shards = Array.from({ length: SHARDS }, (_, i) => readJson(path.join(HISTORY_DIR, `${String(i).padStart(2,"0")}.json`), { v: 1, cards: {} }));
  const today = dayKey(), cutoff = dayKey(new Date(Date.now()-RETENTION_DAYS*86400000));
  const summary = { v: 1, updatedAt: population.generatedAt || new Date().toISOString(), date: today, matched: 0, cards: {} };
  for (const card of cards) {
    const identity = cardIdentity(card); if (!identity) continue;
    const candidates = groups.get(`${identity.set}|${identity.no}`) || []; if (!candidates.length) continue;
    const englishName = english[card.id]?.englishName || "";
    let selected = null, method = "";
    if (englishName) {
      const ranked = candidates.map((row) => ({ row, score: similarity(englishName, row.name) })).sort((a,b)=>b.score-a.score);
      if (ranked[0]?.score >= .5 && (!ranked[1] || ranked[0].score-ranked[1].score >= .12)) { selected = ranked[0].row; method = "set-number-english"; }
    }
    if (!selected && candidates.length === 1 && !suspicious(candidates[0].name)) { selected = candidates[0]; method = "set-number-unique"; }
    if (!selected) continue;
    const shard = shardFor(card.id), store = shards[shard]; store.cards ||= {};
    let history = Array.isArray(store.cards[card.id]) ? store.cards[card.id].filter((row)=>row[0]>=cutoff) : [];
    const point = [today, selected.ten, selected.total];
    if (history.at(-1)?.[0] === today) history[history.length-1] = point;
    else if (!history.length || history.at(-1)[1] !== point[1] || history.at(-1)[2] !== point[2]) history.push(point);
    store.cards[card.id] = history;
    summary.cards[card.id] = { n: selected.name, e: englishName, ten: selected.ten, total: selected.total, rate: selected.total ? selected.ten/selected.total*100 : null, u: selected.url, m: method, sh: String(shard).padStart(2,"0"), w7: windowChange(history,7,today), w30: windowChange(history,30,today), w90: windowChange(history,90,today) };
    summary.matched += 1;
  }
  for (let i=0;i<SHARDS;i+=1) fs.writeFileSync(path.join(HISTORY_DIR, `${String(i).padStart(2,"0")}.json`), JSON.stringify(shards[i]), "utf8");
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary), "utf8");
  fs.writeFileSync(POP_PATH, JSON.stringify({ v: 2, generatedAt: population.generatedAt || new Date().toISOString(), totalSets: population.totalSets || 0, totalRows: sourceRows.length, rows: sourceRows.map((row) => ({ setCode: row.set, cardNo: row.no, cardName: row.name, psa10Count: row.ten, psaTotal: row.total, sourceUrl: row.url, fetchedAt: row.fetchedAt })) }), "utf8");
  console.log(JSON.stringify({ matched: summary.matched, total: cards.length, english: Object.keys(english).length, date: today }));
}

main();
