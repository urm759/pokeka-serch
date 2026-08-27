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
  "pk-38030": { url: "https://www.cardrush-pokemon.jp/product/38029", name: "ピカチュウ【P】{323/S-P} [S-P]", stock: 0, price: 67800 },
  "pk-3123": { url: "https://www.cardrush-pokemon.jp/product/3123", name: "ブルーの探索【SR】{061/054} [SM9b]", stock: 11, price: 27800 },
  "pk-1180": { url: "https://www.cardrush-pokemon.jp/product/1180", name: "ひかるレックウザ【H】{057/072} [SM3+]", stock: 18, price: 94800 },
};

const cardsPath = path.join(ROOT, "data", "pokemon-cards.json");
const cards = read(cardsPath, []);
for (const card of cards) {
  const verified = verifiedCardrush[card.id];
  if (verified) card.cardrushUrl = verified.url;
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
