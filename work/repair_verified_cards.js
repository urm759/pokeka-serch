const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TODAY = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function write(file, value, pretty = false) {
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : 0), "utf8");
}

const verifiedCardrush = {
  "pk-731": { url: "https://www.cardrush-pokemon.jp/product/731", name: "シロナ【SR】{070/066} [SM5M]", stock: 11, price: 92800 },
  "pk-38029": { url: "https://www.cardrush-pokemon.jp/product/38029", name: "ピカチュウ【P】{323/S-P} [S-P]", stock: 0, price: 67800 },
  "pk-3123": { url: "https://www.cardrush-pokemon.jp/product/3123", name: "ブルーの探索【SR】{061/054} [SM9b]", stock: 11, price: 27800 },
  "pk-1180": { url: "https://www.cardrush-pokemon.jp/product/1180", name: "ひかるレックウザ【H】{057/072} [SM3+]", stock: 18, price: 94800 },
};

const verifiedShopLinks = {
  "pk-38029": {
    hareruya2Url: "https://www.hareruya2.com/products/9017672958272",
    hareruya2Name: "【未開封プロモ】 ピカチュウ(PROMO){雷}〈323/S-P〉[S-P]",
    hareruya2Price: 75000,
    yuyuteiUrl: "https://yuyu-tei.jp/sell/poc/card/spromo-400/10023",
    yuyuteiName: "PROMO ピカチュウ 323/S-P",
    yuyuteiPrice: 69800,
    yuyuteiStock: 0,
    torecacampUrl: "https://torecacamp-pokemon.com/products/rc_itgqj4n2remw_kyxs",
    torecacampName: "ピカチュウ PROMO 323/S-P 【KK】",
    torecacampPrice: 69800,
    torecacampAvailable: false,
  },
};

const cardsPath = path.join(ROOT, "data", "pokemon-cards.json");
const cards = read(cardsPath, []);
for (const card of cards) {
  const verified = verifiedCardrush[card.id];
  if (verified) card.cardrushUrl = verified.url;
  const shopLinks = verifiedShopLinks[card.id];
  if (shopLinks) Object.assign(card, {
    hareruya2Url: shopLinks.hareruya2Url,
    yuyuteiUrl: shopLinks.yuyuteiUrl,
    torecacampUrl: shopLinks.torecacampUrl,
  });
}
write(cardsPath, cards);

const catalogPath = path.join(__dirname, "cardrush_catalog.json");
const catalog = read(catalogPath, []);
for (const [id, verified] of Object.entries(verifiedCardrush)) {
  const index = catalog.findIndex((entry) => entry.detailUrl === verified.url);
  const next = {
    ...(index >= 0 ? catalog[index] : {}),
    name: verified.name,
    detailUrl: verified.url,
    state: "A",
    stock: verified.stock,
    price: verified.price,
    observedAt: TODAY,
    verifiedCardId: id,
  };
  if (index >= 0) catalog[index] = next; else catalog.push(next);
}
write(catalogPath, catalog);

function upsertCatalog(relativePath, entry) {
  const filePath = path.join(ROOT, relativePath);
  const rows = read(filePath, []);
  const index = rows.findIndex((row) => row.cardId === entry.cardId || row.detailUrl === entry.detailUrl);
  if (index >= 0) rows[index] = { ...rows[index], ...entry }; else rows.push(entry);
  write(filePath, rows);
}

for (const [id, shop] of Object.entries(verifiedShopLinks)) {
  upsertCatalog("work/hareruya2_catalog.json", { cardId: id, name: shop.hareruya2Name, detailUrl: shop.hareruya2Url, handle: shop.hareruya2Url.split("/").pop(), state: "A", price: shop.hareruya2Price, stock: null, available: true, observedAt: TODAY });
  upsertCatalog("work/yuyutei_catalog.json", { cardId: id, name: shop.yuyuteiName, detailUrl: shop.yuyuteiUrl, state: "A", price: shop.yuyuteiPrice, stock: shop.yuyuteiStock, observedAt: TODAY });
  upsertCatalog("work/torecacamp_catalog.json", { cardId: id, title: shop.torecacampName, detailUrl: shop.torecacampUrl, price: shop.torecacampPrice, available: shop.torecacampAvailable, observedAt: TODAY });
}

const stockHistoryPath = path.join(__dirname, "cardrush_stock_history.json");
const stockHistory = read(stockHistoryPath, { dates: [], stocks: {} });
let todayIndex = stockHistory.dates.indexOf(TODAY);
if (todayIndex < 0) {
  stockHistory.dates.push(TODAY);
  todayIndex = stockHistory.dates.length - 1;
  for (const values of Object.values(stockHistory.stocks)) values.push(null);
}
for (const [id, verified] of Object.entries(verifiedCardrush)) {
  stockHistory.stocks[id] = Array(stockHistory.dates.length).fill(null);
  stockHistory.stocks[id][todayIndex] = verified.stock;
}
write(stockHistoryPath, stockHistory);

const stockSummaryPath = path.join(ROOT, "data", "cardrush-stock-summary.json");
const stockSummary = read(stockSummaryPath, { cards: {} });
stockSummary.updatedAt = TODAY;
stockSummary.cards ||= {};
for (const [id, verified] of Object.entries(verifiedCardrush)) {
  stockSummary.cards[id] = {
    stock: verified.stock,
    cardrushPrice: verified.price,
    avg7: null,
    avg30: null,
    avg90: null,
    drop7: null,
    drop30: null,
    demand: "蓄積中",
    samples: 1,
  };
}
write(stockSummaryPath, stockSummary);

const hareruya2SummaryPath = path.join(ROOT, "data", "hareruya2-stock-summary.json");
const hareruya2Summary = read(hareruya2SummaryPath, { cards: {} });
hareruya2Summary.updatedAt = TODAY;
hareruya2Summary.cards ||= {};
hareruya2Summary.cards["pk-38029"] = { stock: null, hareruya2Price: 75000, avg7: null, avg30: null, avg90: null, drop7: null, drop30: null, demand: "蓄積中", samples: 0 };
write(hareruya2SummaryPath, hareruya2Summary);

const yuyuteiSummaryPath = path.join(ROOT, "data", "yuyutei-stock-summary.json");
const yuyuteiSummary = read(yuyuteiSummaryPath, { cards: {} });
yuyuteiSummary.updatedAt = TODAY;
yuyuteiSummary.stockType = "point";
yuyuteiSummary.cards ||= {};
yuyuteiSummary.cards["pk-38029"] = { stock: 0, yuyuteiPrice: 69800, samples: 1 };
write(yuyuteiSummaryPath, yuyuteiSummary);

const torecacampSummaryPath = path.join(ROOT, "data", "torecacamp-stock-summary.json");
const torecacampSummary = read(torecacampSummaryPath, { cards: {} });
torecacampSummary.updatedAt = TODAY;
torecacampSummary.stockType = "availability";
torecacampSummary.cards ||= {};
torecacampSummary.cards["pk-38029"] = { torecacampPrice: 69800, available: false, availabilityLabel: "在庫なし" };
write(torecacampSummaryPath, torecacampSummary);

const populationPath = path.join(ROOT, "data", "psa-official-populations.json");
const population = read(populationPath, { rows: [] });
population.rows = (population.rows || []).filter((row) => !(String(row.setCode).toUpperCase() === "SM3+" && String(row.cardNo).replace(/^0+/, "") === "57"));
population.rows.push({
  setCode: "SM3+",
  cardNo: "057",
  cardName: "Shining Rayquaza-Holo",
  psa10Count: 2095,
  psaTotal: 2897,
  sourceUrl: "https://www.psacard.com/pop/tcg-cards/2017/pokemon-japanese-sun-moon-strength-expansion-pack-shining-legends/151058",
  fetchedAt: new Date().toISOString(),
});
population.generatedAt = new Date().toISOString();
population.totalRows = population.rows.length;
write(populationPath, population);

const psaHistoryDir = path.join(ROOT, "data", "psa-history");
for (const file of fs.readdirSync(psaHistoryDir).filter((name) => name.endsWith(".json"))) {
  const filePath = path.join(psaHistoryDir, file);
  const shard = read(filePath, { v: 1, cards: {} });
  if (shard.cards?.["pk-1180"]) {
    delete shard.cards["pk-1180"];
    write(filePath, shard);
  }
}

console.log(`Verified card repair applied for ${Object.keys(verifiedCardrush).length} cards on ${TODAY}.`);
