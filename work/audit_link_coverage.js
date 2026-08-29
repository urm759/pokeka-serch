const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "data", "link-coverage.json");

function read(relativePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

function countProperties(value) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

const cards = read("data/pokemon-cards.json", []);
const psa = read("data/psa-population-summary.json", { matched: 0 });
const shopCatalog = read("work/shop_buyback_catalog.json", { shops: {} });
const shopUnmatched = read("work/shop_buyback_unmatched.json", { shops: {} });
const xCapture = read("work/x_buyback_capture.json", { posts: [] });
const xPending = read("work/x_buyback_pending.json", { posts: [] });
const itemMatches = read("work/shop_buyback_item_matches.json", {});
const sourceDiff = read("work/toreca_source_diff.json", { added: [], addedPromoCount: 0 });
const total = cards.length;
const directSnkr = cards.filter((card) => /^https?:\/\/(?:www\.)?snkrdunk\.com\/(?:apparels|trading-cards|products)\/\d+/i.test(card.snkUrl || "")).length;
const shops = {};
for (const shopId of new Set([...Object.keys(shopCatalog.shops || {}), ...Object.keys(shopUnmatched.shops || {})])) {
  shops[shopId] = {
    matched: Array.isArray(shopCatalog.shops?.[shopId]) ? shopCatalog.shops[shopId].length : 0,
    unmatched: Array.isArray(shopUnmatched.shops?.[shopId]) ? shopUnmatched.shops[shopId].length : 0,
  };
}
const partialPosts = (xCapture.posts || []).filter((post) => post.reviewComplete === false);
const current = {
  total,
  sites: {
    cardrush: { matched: cards.filter((card) => card.cardrushUrl).length },
    hareruya2: { matched: cards.filter((card) => card.hareruya2Url).length },
    snkrdunk: { matched: directSnkr },
    psaOfficial: { matched: Number(psa.matched || 0) },
  },
  shops,
  x: {
    capturedPosts: (xCapture.posts || []).length,
    capturedRows: (xCapture.posts || []).reduce((sum, post) => sum + (post.items || []).length, 0),
    partialPosts: partialPosts.length,
    unresolvedCells: partialPosts.reduce((sum, post) => sum + Number(post.unresolvedCells || 0), 0),
    pendingPosts: Number(xPending.pendingCount || 0),
  },
  confirmedItemMappings: countProperties(itemMatches),
  torecaAdded: (sourceDiff.added || []).length,
  torecaAddedPromos: Number(sourceDiff.addedPromoCount || 0),
};
for (const site of Object.values(current.sites)) site.unmatched = total - site.matched;

const previous = read("data/link-coverage.json", null)?.current || null;
fs.writeFileSync(OUTPUT, JSON.stringify({ updatedAt: new Date().toISOString(), previous, current }), "utf8");
console.log(JSON.stringify(current));
