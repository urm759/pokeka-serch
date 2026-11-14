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
function rememberPage(index,proof,products,catalog) {
  const u=new URL(proof.url),page=Number(u.searchParams.get('page')),url=u.origin+u.pathname.replace(/\/products\.json$/,'');
  if(pageUrl({url},page)!==proof.url||!Number.isFinite(Date.parse(proof.observedAt))||!/^[a-f0-9]{64}$/.test(proof.payloadHash))throw Error('Invalid collection membership proof');
  const productsById=new Map(products.map(p=>[String(p.id),p.handle]));
  const members=catalog.filter(r=>productsById.get(String(r.productId))===String(r.detailUrl||'').split('/').pop()).map(r=>r.cardId);
  index[url]||={};const old=index[url][page];
  if(old&&Date.parse(old.observedAt)>Date.parse(proof.observedAt))return old;
  if(old&&old.observedAt===proof.observedAt&&old.payloadHash!==proof.payloadHash)throw Error('Conflicting same-time collection membership');
  index[url][page]={observedAt:proof.observedAt,payloadHash:proof.payloadHash,members:[...new Set(members)],productCount:products.length};
  return index[url][page];
}
function recoverPages(bulkState,catalog) {
  bulkState.pageMembership||={};let recovered=0;
  for(const p of bulkState.lastPages||[]){
    if(!p.rawGzipBase64||p.rawGzipBase64.length>8*1024*1024)continue;
    const raw=zlib.gunzipSync(Buffer.from(p.rawGzipBase64,'base64'),{maxOutputLength:4*1024*1024}).toString('utf8');
    if(hash(raw)!==p.payloadHash)throw Error('Saved collection membership hash mismatch');
    rememberPage(bulkState.pageMembership,p,parse(raw),catalog);recovered++;
  }
  return recovered;
}
function plan({routes, cards, catalog, requested = [], critical = [], fixed = [], retryByUrl = {}, state = {}, membership = {}, now, leadMs, due, signature, eligible, limit = 4}) {
  const byId = new Map(cards.map(c => [c.id,c])), wanted = new Set(requested), urgent = new Set(critical), fixedIds = new Set(fixed);
  const scores = new Map();
  for (const row of catalog) {
    const card = byId.get(row.cardId);
    if (!card || row.priceQuarantined || row.cardMismatchSuspected || row.identityHoldReason || row.referenceOnly || !eligible(retryByUrl[row.detailUrl], now) || !due(row, wanted.has(row.cardId) || fixedIds.has(row.cardId), now, leadMs)) continue;
    const set = signature(card).setCode;
    const score = scores.get(set) || {priority:0, targets:0, oldest:Infinity,maintenanceTargets:0,maintenanceDeadlineAt:Infinity,rows:[]};
    score.rows.push({id:row.cardId,at:Date.parse(row.observedAt)||0,maintenance:urgent.has(row.cardId)||fixedIds.has(row.cardId),critical:urgent.has(row.cardId)});
    score.priority += urgent.has(row.cardId) ? 500 : fixedIds.has(row.cardId) ? 100 : wanted.has(row.cardId) ? 20 : 1;
    score.targets++; score.oldest = Math.min(score.oldest, Date.parse(row.observedAt) || 0);
    if(urgent.has(row.cardId)||fixedIds.has(row.cardId)){
      score.maintenanceTargets++;
      const observed=Date.parse(row.observedAt);
      score.maintenanceDeadlineAt=Math.min(score.maintenanceDeadlineAt,Number.isFinite(observed)&&observed<=now?observed+6*3600000:0);
    }
    scores.set(set,score);
  }
  const pending = routes.map(r => ({...r, ...(scores.get(r.set) || {priority:0,targets:0,oldest:Infinity,rows:[]}), last:state[r.url] || {}}))
    .filter(r => eligible(r.last.retry, now) && (!r.last.checkedAt || now-Date.parse(r.last.checkedAt) >= (r.targets || (r.last.nextPage||1)>1 ? 2 : 48)*3600000));
  pending.sort((a,b) => b.priority-a.priority || a.oldest-b.oldest || (Date.parse(a.last.checkedAt)||0)-(Date.parse(b.last.checkedAt)||0) || a.url.localeCompare(b.url));
  // Keep the request budget fixed. Reserve turns for unfinished pagination and
  // the least recently checked route, so high-score sets cannot starve them.
  const capacity=Math.min(4,Math.max(0,limit)),chosen=[];
  const take=(row,lane)=>{if(row&&chosen.length<capacity&&!chosen.some(r=>r.url===row.url&&r.page===row.page))chosen.push({...row,lane});};
  const oldest=[...pending].sort((a,b)=>(Date.parse(a.last.checkedAt)||0)-(Date.parse(b.last.checkedAt)||0)||a.url.localeCompare(b.url));
  // A large set must not indefinitely outrank one overdue independent price.
  // Keep continuation/exploration slots and the same four-request budget.
  const pageCandidate=(r,page)=>{
    const proof=membership[r.url]?.[page],known=proof&&now-Date.parse(proof.observedAt)<=7*86400000;
    const members=new Set(known?proof.members:[]),rows=r.rows.filter(v=>members.has(v.id)),maintenance=rows.filter(v=>v.maintenance);
    const deadline=maintenance.length?Math.min(...maintenance.map(v=>v.at+6*3600000)):r.maintenanceDeadlineAt;
    return {...r,page,advanceCursor:page===(r.last.nextPage||1),coverageKnown:Boolean(known),expectedIds:rows.map(v=>v.id),maintenanceTargets:known?maintenance.length:r.maintenanceTargets,maintenanceDeadlineAt:deadline,
      deadlineBand:maintenance.some(v=>v.at+48*3600000<=now)?3:maintenance.some(v=>v.at+6*3600000<=now)?2:maintenance.length?1:0};
  };
  const candidates=pending.flatMap(r=>{const pages=[...new Set([r.last.nextPage||1,...Object.keys(membership[r.url]||{}).map(Number)])];return pages.map(page=>pageCandidate(r,page)).filter(p=>!p.coverageKnown||!membership[r.url]?.[p.page]?.observedAt||now-Date.parse(membership[r.url][p.page].observedAt)>=2*3600000);});
  const maintenance=candidates.filter(r=>r.maintenanceTargets>0).sort((a,b)=>Number(b.coverageKnown)-Number(a.coverageKnown)||b.deadlineBand-a.deadlineBand||
    (a.coverageKnown&&b.coverageKnown?Math.floor(a.maintenanceDeadlineAt/(2*3600000))-Math.floor(b.maintenanceDeadlineAt/(2*3600000))||b.maintenanceTargets-a.maintenanceTargets:a.maintenanceDeadlineAt-b.maintenanceDeadlineAt)||b.priority-a.priority||a.url.localeCompare(b.url)||a.page-b.page);
  take(maintenance[0]||candidates[0],'priority');
  const continuation=oldest.find(r=>(r.last.nextPage||1)>1);if(continuation)take(pageCandidate(continuation,continuation.last.nextPage),'continuation');
  const rotation=oldest.find(r=>!chosen.some(c=>c.url===r.url));if(rotation)take(pageCandidate(rotation,rotation.last.nextPage||1),'rotation');
  for(const row of maintenance)take(row,'priority');
  for(const row of candidates)take(row,'priority');
  return chosen;
}
function receipt(text, url, at, products) {
  return {url, observedAt:at, payloadHash:hash(text), productCount:products?.length ?? null,
    rawGzipBase64:zlib.gzipSync(Buffer.from(text)).toString('base64')};
}
module.exports = {navigation,pageUrl,parse,stateA,plan,receipt,rememberPage,recoverPages};
