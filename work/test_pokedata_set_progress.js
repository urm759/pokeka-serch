const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { selectNextSet } = require("./select_pokedata_set.js");

const manifest = { sets: [{ setName: "Pokemon Card 151 Japanese", sourceCount: 516, linkageCount: 516 }] };
assert.equal(selectNextSet(manifest).setName, "SM-P Promos");
assert.equal(selectNextSet({ sets: [{ ...manifest.sets[0], linkageCount: 515 }] }).setName, "Pokemon Card 151 Japanese");
assert.equal(selectNextSet({ sets: [...manifest.sets, { setName: "SM-P Promos", sourceCount: 410, linkageCount: 410 }] }), null);
const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "backfill-data.yml"), "utf8");
assert(workflow.includes("select_pokedata_set.js"));
assert(workflow.includes("POKEDATA_SET_READY == '1'"));
const updater = fs.readFileSync(path.join(__dirname, "update_pokedata_batch.js"), "utf8");
assert(updater.includes('completionStatus: "no-progress"'));
console.log("PokeDATA set selection and no-progress tests passed");
