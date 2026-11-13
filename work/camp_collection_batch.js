// Public, set-scoped Shopify lists. Never crawl /collections/all or infer absence
// from a partial page. Collection JSON uses JPY, unlike product .js minor units.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const ORIGIN = 'https://torecacamp-pokemon.com';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function navigation(html) {
  const routes = new Map();
  for (const m of String(html).matchAll(/<a\b[^>]*href=["']([^"']*\/collections\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)) {
    let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), ORIGIN); } catch { continue; }
    if (u.origin !== ORIGIN) continue;
    const slug = decodeURIComponent(u.pathname.split('/')[2] || '');
    // Old sets have Japanese-only URL slugs: use their explicit SM12a / ...
    // navigation label too. Every product still needs its own set/number match.
    const label=m[2].replace(/<[^>]*>/g,'').trim();
    const slugCode=slug.match(/^([a-z]{1,5}\d{1,3}[a-z]?)(?:-|$)/i)?.[1]?.toLowerCase();
    const labelCode=label.match(/^([a-z]{1,5}\d{1,3}[a-z]?)\s*\//i)?.[1]?.toLowerCase();
    if(slugCode&&labelCode&&slugCode!==labelCode)continue;
    const promo={'sv-promo':'sv-p','ソード-シールド-promo':'s-p','サン-ムーン-promo':'sm-p','xy-promo':'xy-p'}[slug];
    const code = slugCode || labelCode || promo;
    if (!code) continue;
    const url = ORIGIN + u.pathname.replace(/\/$/, '');
    if (!routes.has(code)) routes.set(code, new Set());
    routes.get(code).add(url);
  }
  return [...routes].filter(([, urls]) => urls.size === 1).map(([set, urls]) => ({set, url:[...urls][0]}));
}
function pageUrl(route, page = 1) {
  const u = new URL(route.url);
  if (u.origin !== ORIGIN || !/^\/collections\/[^/]+$/.test(u.pathname) || /\/all$/i.test(u.pathname)) throw Error('Unsupported collection');
  if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw Error('Collection page out of bounds');
  return u.origin + u.pathname + '/products.json?limit=250&page=' + page;
}
function parse(text) {
  if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw Error('Collection response too large');
  const data = JSON.parse(text);
  if (!Array.isArray(data.products) || data.products.length > 250) throw Error('Collection schema changed');
  const ids = new Set(), handles = new Set();
  for (const p of data.products) {
    if (!Number.isSafeInteger(p.id) || !/^[a-zA-Z0-9_%~-]+$/.test(p.handle || '') || !p.title || !Array.isArray(p.tags) || !Array.isArray(p.variants)) throw Error('Incomplete collection product');
    if (ids.has(p.id) || handles.has(p.handle)) throw Error('Duplicate product in collection page');
    ids.add(p.id); handles.add(p.handle);
  }
  return data.products;
}
function stateA(product, isStateA) {
  const variants = product.variants.filter(isStateA);
  if (variants.length !== 1) return null;
  const v = variants[0];
  // Do not silently turn unknown stock into false, or cents into yen.
  if (typeof v.available !== 'boolean' || !Number.isSafeInteger(v.id) || !/^\d+(?:\.0+)?$/.test(String(v.price))) return null;
  const price = Number(v.price);
  return price > 0 && Number.isSafeInteger(price) ? {price, available:v.available, variantId:String(v.id)} : null;
}
function plan({routes, cards, catalog, requested = [], critical = [], fixed = [], retryByUrl = {}, state = {}, now, leadMs, due, signature, eligible, limit = 4}) {
  const byId = new Map(cards.map(c => [c.id,c])), wanted = new Set(requested), urgent = new Set(critical), fixedIds = new Set(fixed);
  const scores = new Map();
  for (const row of catalog) {
    const card = byId.get(row.cardId);
    if (!card || row.priceQuarantined || !eligible(retryByUrl[row.detailUrl], now) || !due(row, wanted.has(row.cardId) || fixedIds.has(row.cardId), now, leadMs)) continue;
    const set = signature(card).setCode;
    const score = scores.get(set) || {priority:0, targets:0, oldest:Infinity};
    score.priority += urgent.has(row.cardId) ? 500 : fixedIds.has(row.cardId) ? 100 : wanted.has(row.cardId) ? 20 : 1;
    score.targets++; score.oldest = Math.min(score.oldest, Date.parse(row.observedAt) || 0); scores.set(set,score);
  }
  const pending = routes.map(r => ({...r, ...(scores.get(r.set) || {priority:0,targets:0,oldest:Infinity}), last:state[r.url] || {}}))
    .filter(r => eligible(r.last.retry, now) && (!r.last.checkedAt || now-Date.parse(r.last.checkedAt) >= (r.targets ? 2 : 48)*3600000));
  pending.sort((a,b) => b.priority-a.priority || a.oldest-b.oldest || (Date.parse(a.last.checkedAt)||0)-(Date.parse(b.last.checkedAt)||0) || a.url.localeCompare(b.url));
  return pending.slice(0, Math.min(4,Math.max(0,limit))).map(r => ({...r,page:r.last.nextPage || 1}));
}
function receipt(text, url, at, products) {
  return {url, observedAt:at, payloadHash:hash(text), productCount:products?.length ?? null,
    rawGzipBase64:zlib.gzipSync(Buffer.from(text)).toString('base64')};
}
module.exports = {navigation,pageUrl,parse,stateA,plan,receipt};
