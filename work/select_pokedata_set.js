const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SET_QUEUE = [
  { setName: "Pokemon Card 151 Japanese", verifiedSourceCount: 516 },
  { setName: "SM-P Promos", verifiedSourceCount: 410 },
];

function selectNextSet(manifest, queue = SET_QUEUE) {
  for (const target of queue) {
    const entry = (manifest.sets || []).find((row) => row.setName === target.setName);
    if (!entry || Number(entry.linkageCount || 0) < Number(entry.sourceCount || target.verifiedSourceCount)) {
      return { ...target, completed: Number(entry?.linkageCount || 0), sourceCount: Number(entry?.sourceCount || target.verifiedSourceCount) };
    }
  }
  return null;
}

if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pokedata", "manifest.json"), "utf8"));
  const next = selectNextSet(manifest);
  const values = next
    ? `POKEDATA_SET=${next.setName}\nPOKEDATA_TARGET=10000\nPOKEDATA_SET_READY=1\n`
    : "POKEDATA_SET_READY=0\n";
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, values, "utf8");
  console.log(next ? `PokeDATA next set: ${next.setName} ${next.completed}/${next.sourceCount}` : "PokeDATA configured set queue has no remaining Japanese cards");
}

module.exports = { selectNextSet, SET_QUEUE };
