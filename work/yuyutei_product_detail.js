// Exact direct-product parsing only. No requests, catalog writes or hold changes.
const identity = require('./card_identity');

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const key = match[1].toLowerCase();
    if (Object.hasOwn(result, key)) return null;
    result[key] = match[2] ?? match[3];
  }
  return result;
}
function text(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
function hasProductDetail(html) {
  for (const [tag] of String(html || '').matchAll(/<[a-z][^>]*\bproduct-detail\b[^>]*>/gi)) {
    // Isolation must remain fail-closed even when attributes are malformed or
    // duplicated: the strict offer parser can reject them independently.
    if (/\bid\s*=\s*(?:"product-detail"|'product-detail'|product-detail(?=\s|\/?>))/i.test(tag)) return true;
    for (const match of tag.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      if ((match[1] ?? match[2] ?? match[3]).split(/\s+/).includes('product-detail')) return true;
    }
  }
  return false;
}
function productUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.match(/^\/sell\/poc\/card\/([a-z0-9-]+)\/(\d+)$/);
    if (url.origin !== 'https://yuyu-tei.jp' || url.username || url.password || url.search || url.hash || !parts) return null;
    return { url: url.href, route: parts[1], cid: parts[2] };
  } catch { return null; }
}
function held(row) {
  return !row || row.manualReview || row.identityReviewRequired || row.identityHoldReason || row.reviewRequired
    || row.cardMismatchSuspected || row.matchStatus === 'mismatch' || row.identityVerified === false
    || row.priceQuarantined || row.referenceOnly || row.conditionAccepted === false;
}
function setCode(value) { return String(value).toLowerCase().replace(/([a-z]+)0+(\d)/i, '$1$2'); }
function number(value) { return String(value).split('/').map(p => /^\d+$/.test(p) ? String(Number(p)) : p).join('/'); }
function rarity(value) {
  const r = identity.extractRarity(value);
  return ['P', 'PR', 'PROMO'].includes(r) ? 'PROMO' : r;
}
function baseName(value) {
  return identity.normalizeToken(String(value).split('[')[0].replace(/^S-TD\s+/i,'')
    .replace(/(?:^|\s)(?:MUR|BWR|MA|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PROMO|PR|P|H|S|C|U|R)(?=\s|:|$)/gi, ' ')
    .replace(/(?:マスター|モンスター)ボールミラー|ミラー|1ED|旧裏|アンリミ|プロモ|スペシャルアート|(?:^|\s)SA(?=\s|$)/gi, ' '));
}
function sameCard(card, title, printedNumber, route) {
  if (held(card) || !card.id || !card.name) return false;
  const label = identity.normalizeWidth(card.name);
  const standard = label.match(/\[\s*([a-z0-9-]+)\s+(\d{1,4}(?:\/\d{1,4})?)\s*\]/i);
  const reverse = label.match(/\[\s*(\d{1,4})\s+([a-z0-9-]+-P)\s*\]/i);
  const expectedSet = setCode(reverse?.[2] || standard?.[1] || '');
  const expectedNumber = reverse?.[1] || standard?.[2];
  const promo = printedNumber.match(/^(\d{1,4})\/([a-z0-9-]+-P)$/i);
  const actualSet = setCode(promo?.[2] || route);
  if (!expectedSet || !expectedNumber || expectedSet !== actualSet || number(expectedNumber) !== number(promo?.[1] || printedNumber)) return false;
  const actualLabel = `${title} [${actualSet} ${promo?.[1] || printedNumber}]`;
  // Both comparators matter: extractVariant can prioritize mirror over 1ED.
  if (identity.extractVariant(label, card.variant || '') !== identity.extractVariant(actualLabel)
    || identity.variantFrom(`${label} ${card.variant || ''}`) !== identity.variantFrom(actualLabel)) return false;
  if (card.finish && (card.finish === 'normal'
    ? !['', 'promo'].includes(identity.extractVariant(actualLabel))
    : card.finish !== identity.extractVariant(actualLabel))) return false;
  if ((card.language && card.language !== 'ja') || identity.extractLanguage(label) !== 'ja' || identity.extractLanguage(title) !== 'ja') return false;
  if (/(?:PSA|BGS|CGC|ARS|ACE|TAG)\s*\d|鑑定品|未開封|セット商品|\d+枚セット|状態[A-D]|キズ|傷あり|特価/i.test(`${label.split('[')[0]} ${title}`)) return false;
  if (card.state && card.state !== 'A' || card.rawCondition && card.rawCondition !== 'mint') return false;
  const expectedRarity = rarity(label), actualRarity = rarity(title);
  if (expectedRarity && expectedRarity !== actualRarity) return false;
  if (card.rarity && rarity(card.rarity) !== actualRarity) return false;
  return Boolean(baseName(label)) && baseName(label) === baseName(title);
}

function parseYuyuteiProduct(html, requestedUrl, card) {
  const target = productUrl(requestedUrl), source = String(html || '');
  if (!target || held(card)) return null;
  // Exactly one complete section. Never scan through adjacent/recommended offers.
  const starts = [...source.matchAll(/<section\b[^>]*>/gi)].filter(([tag]) => hasProductDetail(tag));
  if (starts.length !== 1) return null;
  const sections = [...source.matchAll(/<section\b[^>]*>[\s\S]*?<\/section\s*>/gi)]
    .filter(([section]) => hasProductDetail(section.slice(0, section.indexOf('>') + 1)));
  if (sections.length !== 1) return null;
  const block = sections[0][0];
  if (!attributes(block.slice(0, block.indexOf('>') + 1))) return null;
  if ((block.match(/<section\b/gi) || []).length !== 1) return null;
  const hidden = {};
  for (const [tag] of block.matchAll(/<input\b[^>]*>/gi)) {
    const a = attributes(tag);
    if (!a) return null;
    for (const key of (a.class || '').split(/\s+/).filter(k => /^cart_(?:gid|ver|cid|kizu)$/.test(k))) {
      if (Object.hasOwn(hidden, key) || a.type !== 'hidden') return null;
      hidden[key] = a.value;
    }
  }
  if (hidden.cart_gid !== '31' || hidden.cart_ver !== target.route || hidden.cart_cid !== target.cid || hidden.cart_kizu !== '0') return null;
  const images = [...block.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => attributes(tag)?.src)
    .filter(src => src?.startsWith('https://card.yuyu-tei.jp/poc/front/'));
  const expectedImage = `https://card.yuyu-tei.jp/poc/front/${target.route}/${target.cid}.jpg`;
  if (!images.length || images.some(src => src !== expectedImage)) return null;
  const structured = [];
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1])?.type !== 'application/ld+json') continue;
    try { structured.push(JSON.parse(match[2])); } catch { return null; }
  }
  const products = structured.filter(row => row?.['@type'] === 'Product');
  const pages = structured.filter(row => row?.['@type'] === 'WebPage');
  if (products.length !== 1 || pages.length !== 1 || pages[0].url !== target.url) return null;
  const product = products[0];
  if (product.image !== expectedImage || typeof product.name !== 'string') return null;
  const numbers = [...block.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span\s*>/gi)]
    .map(m => text(m[1]).replace(/\s/g, '')).filter(v => /^\d{1,4}\/(?:\d{1,4}|[a-z0-9-]+-P)$/i.test(v));
  if (numbers.length !== 1 || numbers[0] !== product.description) return null;
  // Visible name is just before the section in the real page, inside #power.
  const heading = source.slice(Math.max(0, sections[0].index - 1500), sections[0].index)
    .match(/<div\b[^>]*\bid\s*=\s*["']power["'][^>]*>\s*<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<\/div>\s*$/i);
  const title = text(product.name);
  if (!heading || text(heading[1]) !== title || !sameCard(card, title, numbers[0], target.route)) return null;
  const prices = [...block.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4\s*>/gi)]
    .map(m => text(m[1]).match(/^([\d,]+)\s*円$/)).filter(Boolean).map(m => Number(m[1].replace(/,/g, '')));
  const stocks = [...block.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label\s*>/gi)]
    .map(m => text(m[1])).filter(v=>/^在庫\s*:/.test(v)).map(v=>/^在庫\s*:\s*×$/.test(v)?null:v.match(/^在庫\s*:\s*([\d,]+)\s*点$/)?.[1]).map(v=>v===null?null:typeof v==='string'?Number(v.replace(/,/g,'')):NaN);
  const offer = product.offers;
  if (prices.length !== 1 || !Number.isSafeInteger(prices[0]) || prices[0] <= 0 || !stocks.length
    || stocks.some(s => s!==null&&(!Number.isSafeInteger(s) || s < 0) || s !== stocks[0])
    || offer?.['@type'] !== 'Offer' || offer.priceCurrency !== 'JPY' || Number(offer.price) !== prices[0]
    || !['InStock', 'OutOfStock', 'https://schema.org/InStock', 'https://schema.org/OutOfStock'].includes(offer.availability)
    || /(?:^|\/)InStock$/.test(offer.availability) !== (stocks[0] > 0)) return null;
  return { cardId: card.id, detailUrl: target.url, setCode: target.route, cardNo: numbers[0], title,
    productId: target.cid, price: prices[0], stock: stocks[0], state: 'A', cartKizu: 0,
    language: 'ja', identityVerified: true, conditionAccepted: true, parser: 'yuyutei-product-v1',
    ...(stocks[0]===null?{available:false,inventoryEvidence:'visible-out-of-stock-mark-and-schema',quantityKnown:false}:{}) };
}

// Reuse an existing card/URL binding with a timestamped HTTP capture. Parsing
// time and old catalog prices are never substitutes for the capture's time.
function replayYuyuteiProduct(card, binding, capture, { now = Date.now() } = {}) {
  if (!yuyuteiProductRequestUrl(card, binding) || binding.detailUrl !== capture?.url) return null;
  const observed = Date.parse(capture?.fetchedAt || '');
  if (capture?.httpStatus !== 200 || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(capture.fetchedAt || '')
    || !Number.isFinite(observed) || observed > now || capture.finalUrl && capture.finalUrl !== capture.url) return null;
  const row = parseYuyuteiProduct(capture.html, capture.url, card);
  return row ? { ...row, observedAt: capture.fetchedAt } : null;
}

function yuyuteiProductRequestUrl(card, binding) {
  if (held(card) || held(binding) || binding.cardId !== card.id
    || card.yuyuteiUrl && card.yuyuteiUrl !== binding.detailUrl) return null;
  return productUrl(binding.detailUrl)?.url || null;
}

module.exports = { hasProductDetail, parseYuyuteiProduct, replayYuyuteiProduct, yuyuteiProductRequestUrl };
