const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CATALOG = path.join(DATA, "card-catalog");

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function writeIfChanged(filePath, value) {
  const next = JSON.stringify(value);
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (previous === next) return false;
  fs.writeFileSync(filePath, next, "utf8");
  return true;
}

function indexFields(card, previous) {
  return {
    ...previous,
    id: card.id,
    name: card.name,
    model: card.model || null,
    rarity: card.rarity || null,
    variant: card.variant || null,
    setCode: card.setCode || null,
    cardNumber: card.cardNumber || null,
    language: card.language || "ja",
    isNew: card.isNew ? 1 : 0,
    siteNew: card.isNew ? 1 : Number(previous?.siteNew || 0),
  };
}

function main() {
  const changedPath = path.join(__dirname, "changed-card-ids.json");
  const changed = new Set((readJson(changedPath, { ids: [] }).ids || []).map(String));
  const cards = readJson(path.join(DATA, "pokemon-cards.json"), []);
  const byId = new Map(cards.map((card) => [String(card.id), card]));
  const indexPath = path.join(CATALOG, "index.json");
  const index = readJson(indexPath, { cards: [] });
  const indexById = new Map((index.cards || []).map((card) => [String(card.id), card]));
  const existingIds = new Set(indexById.keys());
  const addedOrRemoved = [...changed].some((id) => !byId.has(id) || !existingIds.has(id));
  if (addedOrRemoved) {
    console.log(JSON.stringify({ fullRebuildRequired: true, reason: "catalog membership changed", changedCards: changed.size }));
    process.exitCode = 2;
    return;
  }

  const chunks = new Map();
  for (const id of changed) {
    const row = indexById.get(id);
    if (!row || !Number.isInteger(Number(row.chunk))) continue;
    const chunk = Number(row.chunk);
    if (!chunks.has(chunk)) chunks.set(chunk, []);
    chunks.get(chunk).push(id);
  }

  let regeneratedFiles = 0;
  for (const [chunk, ids] of chunks) {
    const filePath = path.join(CATALOG, "chunks", `${String(chunk).padStart(3, "0")}.json`);
    const rows = readJson(filePath, []);
    const positions = new Map(rows.map((row, position) => [String(row.id), position]));
    for (const id of ids) {
      const position = positions.get(id);
      if (position == null) continue;
      rows[position] = byId.get(id);
    }
    if (writeIfChanged(filePath, rows)) regeneratedFiles += 1;
  }

  index.cards = (index.cards || []).map((row) => changed.has(String(row.id)) ? indexFields(byId.get(String(row.id)), row) : row);
  if (writeIfChanged(indexPath, index)) regeneratedFiles += 1;
  console.log(JSON.stringify({ fullRebuildRequired: false, changedCards: changed.size, regeneratedFiles, chunks: chunks.size }));
}

main();
