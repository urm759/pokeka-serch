const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "pokemon-cards.json");
const UNMATCHED_PATH = path.join(__dirname, "shop_buyback_unmatched.json");
const MATCHES_PATH = path.join(__dirname, "shop_buyback_item_matches.json");

// Reviewed listings whose store-specific notation is too abbreviated for a generic matcher.
// Keep this list small: every entry has a matching card name, set/number, and edition checked.
const VERIFIED_OVERRIDES = {
  "torecabank:179": "pk-4309",
  "torecabank:55": "pk-6201",
  "bluerocket:1091": "x-128249",
  "bluerocket:1067": "x-93004",
  "bluerocket:1041": "x-128264",
  "bluerocket:1028": "x-120250",
  "bluerocket:956": "x-128245",
  "bluerocket:835": "pk-788",
  "bluerocket:678": "x-585230",
  "bluerocket:668": "x-128129",
  "bluerocket:603": "pk-4108",
  "bluerocket:540": "x-91132",
  "bluerocket:398": "pk-103",
  "shinsoku:IAP2300023205": "x-91106",
  "shinsoku:IAP2300025853": "pk-4303",
  "shinsoku:IAP2500000579": "x-408194",
  "shinsoku:IAP2500000578": "x-408193",
  "torecaclub:ca001_150-XY-P": "pk-576",
};

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function canonicalSet(value) {
  return String(value || "").normalize("NFKC").toUpperCase()
    .replace(/^SMP$/, "SM-P")
    .replace(/^SVP$/, "SV-P")
    .replace(/^SP$/, "S-P")
    .replace(/^XYP$/, "XY-P")
    .replace(/^BWP$/, "BW-P")
    .replace(/[^A-Z0-9+-]/g, "")
    // Shop listings often use P instead of the official plus sign, e.g. SM4p.
    .replace(/^SM(\d+)P$/, "SM$1+")
    .replace(/^SMP$/, "SM-P")
    .replace(/^SVP$/, "SV-P")
    .replace(/^SP$/, "S-P")
    .replace(/^XYP$/, "XY-P")
    .replace(/^BWP$/, "BW-P");
}

function canonicalNo(value) {
  const raw = String(value || "").normalize("NFKC").trim();
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw.toUpperCase();
}

function identity(value) {
  const text = String(value || "").normalize("NFKC").toUpperCase();
  let match = text.match(/(\d{1,3})\s*\/\s*((?:M|SV|S|SM|XY|BW)[A-Z0-9+\-]*-P)\b/);
  if (match) return { set: canonicalSet(match[2]), no: canonicalNo(match[1]) };
  match = text.match(/\b((?:M|SV|S|SM|XY|BW)[A-Z0-9+\-]*)\s+(\d{1,3})\s*\/\s*\d{1,3}\b/);
  if (match) return { set: canonicalSet(match[1]), no: canonicalNo(match[2]) };
  match = text.match(/(\d{1,3})\s*\/\s*\d{1,3}\s*\[\s*((?:M|SV|S|SM|XY|BW)[A-Z0-9+\-]*)/);
  if (match) return { set: canonicalSet(match[2]), no: canonicalNo(match[1]) };
  match = text.match(/\[\s*((?:M|SV|S|SM|XY|BW)[A-Z0-9+\-]*)\s+(\d{1,3})(?:\s*\/\s*\d{1,3})?\s*\]/);
  if (match) return { set: canonicalSet(match[1]), no: canonicalNo(match[2]) };
  match = text.match(/\[\s*(\d{1,3})\s+((?:M|SV|S|SM|XY|BW)[A-Z0-9+\-]*)\s*\]/);
  if (match) return { set: canonicalSet(match[2]), no: canonicalNo(match[1]) };
  match = text.match(/\[\s*((?:M|SV|S|SM|XY|BW)[A-Z0-9+\-]*)\s*\][^\d]{0,8}(\d{1,3})\s*\/\s*\d{1,3}/);
  if (match) return { set: canonicalSet(match[1]), no: canonicalNo(match[2]) };
  return null;
}

function fraction(value) {
  const match = String(value || "").normalize("NFKC").match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  return match ? `${canonicalNo(match[1])}/${canonicalNo(match[2])}` : "";
}

function title(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    // Catalogue numbers are compared separately, so they must not make a card-name match fail.
    .replace(/\d{1,3}\s*\/\s*[a-z0-9+\-]+|\b[a-z+\-]*\d+[a-z0-9+\-]*\b/gi, " ")
    .replace(/(?:PSA\s*10|PROMO|プロモ|SR仕様|SAR仕様|仕様|SRC|SAR|SR|UR|HR|AR|CHR|CSR|RRR|RR|\bP\b|\bS\b)/gi, " ")
    .replace(/[＆&]/g, "and")
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]/g, "");
}

function compatibleName(itemName, cardName) {
  const left = title(itemName);
  const right = title(cardName);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function isNonJapaneseListing(value) {
  return /中国語|英語版|英語カード|韓国語/.test(String(value || ""));
}

function matchesVariant(itemName, cardName) {
  const item = String(itemName || "");
  const card = String(cardName || "");
  if (/1ED/i.test(item) && !/1ED/i.test(card)) return false;
  // A store's single-card row must not be linked to a bundled listing with the same card name.
  if (!/セット/.test(item) && /\d+枚セット/.test(card)) return false;
  return compatibleName(item, card);
}

const cards = readJson(CARDS_PATH, []);
const unmatched = readJson(UNMATCHED_PATH, { shops: {} });
const matches = readJson(MATCHES_PATH, {});
const byIdentity = new Map();
const byFraction = new Map();
for (const card of cards) {
  if (!Number(card.snkPsa10Price) || /未開封/.test(card.name || "")) continue;
  const key = identity(`${card.model || ""} ${card.name || ""}`);
  if (!key) continue;
  const id = `${key.set}|${key.no}`;
  if (!byIdentity.has(id)) byIdentity.set(id, []);
  byIdentity.get(id).push(card);

  const cardFraction = fraction(`${card.model || ""} ${card.name || ""}`);
  if (!cardFraction) continue;
  if (!byFraction.has(cardFraction)) byFraction.set(cardFraction, []);
  byFraction.get(cardFraction).push(card);
}

let resolved = 0;
const report = {};
for (const [shopId, items] of Object.entries(unmatched.shops || {})) {
  let added = 0;
  let ambiguous = 0;
  for (const item of items || []) {
    const sourceKey = `${shopId}:${item.shopItemId}`;
    if (matches[sourceKey]) continue;
    if (VERIFIED_OVERRIDES[sourceKey]) {
      matches[sourceKey] = VERIFIED_OVERRIDES[sourceKey];
      resolved += 1;
      added += 1;
      continue;
    }
    if (isNonJapaneseListing(item.name)) continue;
    const itemName = String(item.name || "").replace(/MM/gi, "マスターボールミラー");
    const key = identity(itemName);
    const candidates = key ? (byIdentity.get(`${key.set}|${key.no}`) || []) : [];
    const named = candidates.filter((card) => matchesVariant(itemName, card.name));
    let selected = named.length === 1 ? named[0] : candidates.length === 1 && matchesVariant(itemName, candidates[0].name) ? candidates[0] : null;
    if (!selected) {
      // Some shops omit set code. A fraction is safe only when its card name also makes one candidate unique.
      const fractionCandidates = byFraction.get(fraction(itemName)) || [];
      const fractionNamed = fractionCandidates.filter((card) => matchesVariant(itemName, card.name));
      if (fractionNamed.length === 1) selected = fractionNamed[0];
    }
    if (!selected) {
      if (candidates.length || named.length > 1 || fraction(itemName)) ambiguous += 1;
      continue;
    }
    matches[sourceKey] = selected.id;
    resolved += 1;
    added += 1;
  }
  report[shopId] = { added, ambiguous, remaining: (items || []).length - added };
}
fs.writeFileSync(MATCHES_PATH, JSON.stringify(matches), "utf8");
console.log(JSON.stringify({ resolved, report }, null, 2));
