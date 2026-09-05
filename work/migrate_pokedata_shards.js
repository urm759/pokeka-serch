const fs = require("fs");
const path = require("path");
const { writeSetState } = require("./pokedata_storage.js");

const root = path.join(__dirname, "..");
const summaryPath = path.join(root, "data", "pokedata-summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8").replace(/^\uFEFF/, ""));
const recordsBySet = new Map();
for (const record of summary.linkage?.records || []) {
  const setName = record.setName || "Unknown set";
  if (!recordsBySet.has(setName)) recordsBySet.set(setName, []);
  recordsBySet.get(setName).push(record);
}
const cardsBySet = new Map();
for (const [cardId, detail] of Object.entries(summary.cards || {})) {
  const setName = detail.pokedata?.setName || "Unknown set";
  if (!cardsBySet.has(setName)) cardsBySet.set(setName, {});
  cardsBySet.get(setName)[cardId] = detail;
}

const setNames = new Set([...recordsBySet.keys(), ...cardsBySet.keys()]);
const result = [];
for (const setName of setNames) {
  const records = recordsBySet.get(setName) || [];
  const cards = cardsBySet.get(setName) || {};
  const setCode = records.find((record) => record.setCode)?.setCode
    || Object.values(cards).find((detail) => detail.pokedata?.setCode)?.pokedata?.setCode
    || null;
  const written = writeSetState(root, summary, {
    setName, setCode, cards, records,
    sourceCount: records.length,
    updatedAt: summary.updatedAt || new Date().toISOString(),
  });
  result.push({ setName, file: written.entry.file, cards: written.entry.count, records: written.entry.linkageCount });
}
console.log(JSON.stringify({ migratedSets: result.length, sets: result }));
