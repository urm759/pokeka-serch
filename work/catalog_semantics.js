const releaseMaster = require("./set-release-dates.json");

const DAY_MS = 86400000;

function normalizeSetCode(value) {
  return String(value || "").toUpperCase().replace(/[\s_-]+/g, "");
}

function validDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) ? text : null;
}

function validYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1996 && year <= 2100 ? year : null;
}

function isPromo(card) {
  return /(?:^|[^A-Z0-9])(?:SM|S|SV|XY|BW|DP|DPt)?-?P(?:[^A-Z0-9]|$)|プロモ/i.test(`${card?.setCode || ""} ${card?.name || ""} ${card?.variant || ""}`);
}

function inferSeriesYear(setCode) {
  const code = normalizeSetCode(setCode);
  let match = code.match(/^M(\d+)/);
  if (match) return Number(match[1]) <= 2 ? 2025 : 2026;
  match = code.match(/^SV(\d+)/);
  if (match) return Number(match[1]) <= 4 ? 2023 : Number(match[1]) <= 8 ? 2024 : 2025;
  match = code.match(/^S(\d+)/);
  if (match) return Number(match[1]) <= 4 ? 2020 : Number(match[1]) <= 8 ? 2021 : 2022;
  match = code.match(/^SM(\d+)/);
  if (match) return Number(match[1]) <= 4 ? 2017 : Number(match[1]) <= 8 ? 2018 : 2019;
  match = code.match(/^XY(\d+)/);
  if (match) return Number(match[1]) <= 5 ? 2014 : Number(match[1]) <= 8 ? 2015 : 2016;
  match = code.match(/^CP(\d+)/);
  if (match) return Number(match[1]) <= 2 ? 2015 : 2016;
  return null;
}

function resolveRelease(card, auditRow = null) {
  const cardDate = validDate(card?.releaseDate || card?.releasedAt);
  if (cardDate) return { date: cardDate, year: Number(cardDate.slice(0, 4)), source: "カード固有発売日", precision: "date" };
  const auditDate = validDate(auditRow?.releaseDate);
  if (auditDate) return { date: auditDate, year: Number(auditDate.slice(0, 4)), source: "カード固有発売日", precision: "date" };
  const code = normalizeSetCode(card?.setCode);
  const setDate = !isPromo(card) ? validDate(releaseMaster.dates?.[code]) : null;
  if (setDate) return { date: setDate, year: Number(setDate.slice(0, 4)), source: "セット発売日から補完", precision: "date" };
  const explicitDate = String(card?.name || "").match(/((?:19|20)\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})/);
  if (explicitDate) {
    const date = validDate(`${explicitDate[1]}-${String(explicitDate[2]).padStart(2, "0")}-${String(explicitDate[3]).padStart(2, "0")}`);
    if (date) return { date, year: Number(explicitDate[1]), source: "カード固有発売日", precision: "date" };
  }
  const explicitYear = validYear(card?.releaseYear || auditRow?.releaseYear || String(card?.name || "").match(/((?:19|20)\d{2})年/)?.[1]);
  if (explicitYear) return { date: null, year: explicitYear, source: "発売年のみ判明", precision: "year" };
  const seriesYear = !isPromo(card) ? inferSeriesYear(code) : null;
  if (seriesYear) return { date: null, year: seriesYear, source: "発売年のみ判明", precision: "year" };
  return { date: null, year: null, source: "発売日不明", precision: "unknown" };
}

function daysSince(value, now = new Date()) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? Math.max(0, (now.getTime() - parsed) / DAY_MS) : Infinity;
}

function lifecycleFlags({ arrival, release, removedAt = null, reappearedAt = null, now = new Date(), siteNewDays = 30, recentReleaseDays = 365 }) {
  const siteNew = daysSince(arrival?.firstSeenAt, now) <= siteNewDays;
  const recentRelease = release?.date ? daysSince(release.date, now) <= recentReleaseDays : false;
  const relisted = Boolean(reappearedAt && removedAt && Date.parse(reappearedAt) >= Date.parse(removedAt));
  return { siteNew, recentRelease, relisted };
}

function classifyPsa9({ pokedataSummary = null, aggregatePrice = null, estimatedPrice = null }) {
  const adopted = Number(pokedataSummary?.adoptedCount || 0);
  if (adopted > 0) return { kind: "actual", label: "実成約", count: adopted };
  if (Number(aggregatePrice) > 0) return { kind: "aggregate", label: "集計値", count: 0 };
  if (Number(estimatedPrice) > 0) return { kind: "estimate", label: "推定値", count: 0 };
  return { kind: "missing", label: "未取得", count: 0 };
}

function retryAt(lastAttemptAt, days = 7) {
  const parsed = Date.parse(lastAttemptAt || "");
  return Number.isFinite(parsed) ? new Date(parsed + days * DAY_MS).toISOString() : new Date(0).toISOString();
}

module.exports = { normalizeSetCode, resolveRelease, lifecycleFlags, classifyPsa9, retryAt, isPromo, inferSeriesYear };
