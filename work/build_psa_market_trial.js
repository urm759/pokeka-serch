const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const normalize = (value) => String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
const listingKey = (value) => String(value || "").match(/\d{10,14}/)?.[0] || null;

function validateIdentity(card, cert) {
  if (!card || cert.language !== "Japanese" || ![9, 10].includes(cert.grade)) return false;
  const match = String(card.name || "").match(/\[([^\s\]]+)\s+(\d+)\/\d+\]/);
  if (!match) return false;
  return normalize(match[1]) === normalize(cert.setCode)
    && Number(match[2]) === Number(cert.cardNumber)
    && new RegExp(`\\b${cert.rarity}\\b`, "i").test(card.name);
}

function build({ cards, capture, pokedataRowsByCard = {} }) {
  if (!capture.fx || !Number.isFinite(capture.fx.rate) || capture.fx.rate <= 0) throw new Error("Valid dated FX rate required");
  const byId = new Map(cards.map((card) => [card.id, card]));
  const certificates = capture.certificates.map((cert) => {
    const card = byId.get(cert.cardId);
    const identityMatched = validateIdentity(card, cert);
    const pokedata = new Map((pokedataRowsByCard[cert.cardId] || [])
      .map((row) => [listingKey(row.listingId) || listingKey(row.listingUrl), row]).filter(([key]) => key));
    const seen = new Set();
    let duplicateWithinPsa = 0;
    const sales = cert.sales.map((sale) => {
      const key = listingKey(sale.listingId);
      if (!key || sale.marketplace !== "eBay" || !Number.isFinite(sale.usd) || sale.usd <= 0) throw new Error(`Invalid PSA sale ${cert.certNumber}`);
      const repeated = seen.has(key);
      if (repeated) duplicateWithinPsa++;
      seen.add(key);
      const previous = pokedata.get(key);
      return {
        date: sale.date, grade: `PSA${cert.grade}`, source: sale.marketplace,
        saleType: sale.saleType, usd: sale.usd, jpyAtReferenceFx: Math.round(sale.usd * capture.fx.rate),
        listingId: key, listingUrl: `https://www.ebay.com/itm/${key}`,
        psaSourceUrl: cert.url, duplicateWithinPsa: repeated,
        alsoInPokedata: Boolean(previous), pokedataStatus: previous?.status || null,
        identityStatus: identityMatched ? "cert-card-matched; sale-title-not-independently-verified" : "card-mismatch",
      };
    });
    const unique = sales.filter((sale) => !sale.duplicateWithinPsa);
    return {
      cardId: cert.cardId, cardName: card?.name || null,
      identity: { setCode: cert.setCode, cardNumber: cert.cardNumber, language: cert.language,
        rarity: cert.rarity, englishName: cert.englishName, grade: cert.grade, matched: identityMatched },
      certNumber: cert.certNumber, sourceUrl: cert.url,
      population: { type: "grade-specific-cert-snapshot", grade: cert.grade, count: cert.gradePopulation,
        note: "Card-wide POP total or PSA10 rate must come from the separate Population Report." },
      estimate: { type: "PSA Estimate, not a sale", usd: cert.estimateUsd,
        jpyAtReferenceFx: Math.round(cert.estimateUsd * capture.fx.rate) },
      salesHistory: { type: "Sales of Similar Items excerpt, not full Sales History",
        coverage: "partial", count30: null, count90: null,
        reason: "Full date-range coverage and individual sale titles are not available from the public excerpt.",
        excerptRows: unique.length, duplicateWithinPsa,
        overlapWithPokedata: unique.filter((sale) => sale.alsoInPokedata).length,
        overlapWithVerifiedPokedata: unique.filter((sale) => sale.pokedataStatus === "candidate").length,
        uniqueAcrossSources: unique.filter((sale) => !sale.alsoInPokedata).length,
        sales: unique },
      verifiedForTrading: false,
    };
  });
  return { generatedAt: new Date().toISOString(), dataStatus: "partial-trial-not-live-market",
    captureMethod: capture.captureMethod, capturedAt: capture.capturedAt,
    accessLimitation: capture.accessLimitation, fx: capture.fx,
    cardCount: certificates.length, psaExcerptRows: certificates.reduce((n, c) => n + c.salesHistory.excerptRows, 0),
    overlappedRows: certificates.reduce((n, c) => n + c.salesHistory.overlapWithPokedata, 0),
    tcgplayerNewAcquisitionStopped: false,
    note: "Overseas reference only; no purchase-limit, GO, or PSA10-rate input.",
    certificates };
}

function main() {
  const capture = read("work/psa_market_trial_capture.json");
  const cards = read("data/pokemon-cards.json");
  const pokedataRowsByCard = Object.fromEntries(capture.certificates.map((cert) => {
    const file = path.join(root, "data", "pokedata-sales", `${cert.cardId}.json`);
    return [cert.cardId, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).rows || [] : []];
  }));
  const output = build({ cards, capture, pokedataRowsByCard });
  const file = path.join(root, "data", "psa-market-trial.json");
  fs.writeFileSync(file, JSON.stringify(output));
  console.log(JSON.stringify({ cardCount: output.cardCount, psaExcerptRows: output.psaExcerptRows,
    overlappedRows: output.overlappedRows, file }));
}

if (require.main === module) main();
module.exports = { build, validateIdentity, listingKey };
