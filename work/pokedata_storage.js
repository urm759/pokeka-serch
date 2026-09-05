const fs = require("fs");
const path = require("path");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, filePath);
}

function setSlug(value) {
  return String(value || "unknown-set")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-set";
}

function manifestPath(root) {
  return path.join(root, "data", "pokedata", "manifest.json");
}

function shardPath(root, fileName) {
  return path.join(root, ...String(fileName || "").replace(/^\.?\//, "").split("/"));
}

function readManifest(root) {
  return readJson(manifestPath(root), { version: 1, updatedAt: null, totalCards: 0, sets: [] });
}

function findSetEntry(manifest, setName) {
  const key = String(setName || "").normalize("NFKC").toLowerCase();
  return (manifest?.sets || []).find((entry) => String(entry.setName || "").normalize("NFKC").toLowerCase() === key) || null;
}

function loadSetState(root, setName, legacySummary = {}) {
  const manifest = readManifest(root);
  const entry = findSetEntry(manifest, setName);
  const shard = entry ? readJson(shardPath(root, entry.file), null) : null;
  if (shard) {
    return {
      cards: shard.cards || {},
      records: shard.linkageRecords || [],
      manifest,
      entry,
    };
  }
  const records = (legacySummary.linkage?.records || []).filter((record) => !setName || record.setName === setName);
  const recordIds = new Set(records.map((record) => String(record.localCardId || "")).filter(Boolean));
  const cards = Object.fromEntries(Object.entries(legacySummary.cards || {}).filter(([cardId, detail]) => {
    return detail?.pokedata?.setName === setName || recordIds.has(cardId);
  }));
  return { cards, records, manifest, entry: null };
}

function compactSummary(summary, manifest) {
  const output = { ...summary };
  delete output.cards;
  output.linkage = {
    ...(summary.linkage || {}),
    records: [],
    recordsStorage: "set-shards",
    recordsManifest: "data/pokedata/manifest.json",
  };
  output.storage = {
    format: "set-shards-v1",
    manifest: "data/pokedata/manifest.json",
    setCount: manifest.sets.length,
    cardDetailCount: manifest.totalCards,
    lazyLoaded: true,
  };
  return output;
}

function writeSetState(root, summary, { setName, setCode, cards, records, sourceCount, updatedAt }) {
  const now = updatedAt || new Date().toISOString();
  const manifest = readManifest(root);
  const slug = setSlug(setCode ? `${setCode}-${setName}` : setName);
  const file = `data/pokedata/sets/${slug}.json`;
  const localCardIds = Object.keys(cards || {}).sort();
  const shard = {
    version: 1,
    setName,
    setCode: setCode || null,
    updatedAt: now,
    sourceCount: Number(sourceCount || records?.length || 0),
    count: localCardIds.length,
    linkageCount: Number(records?.length || 0),
    cards: cards || {},
    linkageRecords: records || [],
  };
  writeJson(shardPath(root, file), shard);

  const nextEntry = {
    setName,
    setCode: setCode || null,
    count: localCardIds.length,
    linkageCount: Number(records?.length || 0),
    sourceCount: Number(sourceCount || records?.length || 0),
    updatedAt: now,
    file,
    localCardIds,
  };
  const sets = (manifest.sets || []).filter((entry) => entry.setName !== setName);
  sets.push(nextEntry);
  sets.sort((left, right) => String(left.setName).localeCompare(String(right.setName), "en"));
  const nextManifest = {
    version: 1,
    updatedAt: now,
    totalCards: sets.reduce((total, entry) => total + Number(entry.count || 0), 0),
    totalLinkageRecords: sets.reduce((total, entry) => total + Number(entry.linkageCount || 0), 0),
    sets,
  };
  writeJson(manifestPath(root), nextManifest);
  writeJson(path.join(root, "data", "pokedata-summary.json"), compactSummary(summary, nextManifest));
  return { manifest: nextManifest, entry: nextEntry, shard };
}

function selectShardFiles(manifest, cardIds) {
  const wanted = new Set((cardIds || []).map(String));
  if (!wanted.size) return [];
  return (manifest?.sets || [])
    .filter((entry) => (entry.localCardIds || []).some((id) => wanted.has(String(id))))
    .map((entry) => entry.file);
}

module.exports = {
  compactSummary,
  findSetEntry,
  loadSetState,
  readManifest,
  selectShardFiles,
  setSlug,
  writeSetState,
};
