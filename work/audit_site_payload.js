const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const bytes = (file) => fs.existsSync(path.join(root, file)) ? fs.statSync(path.join(root, file)).size : null;
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const init = app.slice(app.indexOf("async function init()"));
const initialPaths = [...new Set([...init.matchAll(/fetchJsonMaybe\("(\.\/data\/[^\"]+)"\)/g)].map((match) => match[1].replace(/^\.\//, "")))];
const initial = initialPaths.map((file) => ({ file, bytes: bytes(file) }));
const pairs = [
  ["data/pokemon-cards.json", "data/pokemon-cards.js"],
  ["data/pokemon-cards-history.json", "data/pokemon-cards-history.js"],
  ["data/cardrush-catalog.json", "data/cardrush-catalog.js"],
].map(([json, js]) => ({ json, js, jsonBytes: bytes(json), jsBytes: bytes(js),
  action: "retain-until-consumer-and-recovery-audit" }));
const report = { auditedAt: new Date().toISOString(), type: "static-byte-audit-not-network-timing",
  initialFetchCandidates: initial,
  initialCandidateBytes: initial.reduce((sum, row) => sum + (row.bytes || 0), 0),
  defaultInitialBytesAfterIndexReuse: initial.reduce((sum, row) => sum + (row.file === "data/card-catalog/index.json" ? 0 : row.bytes || 0), 0),
  deferredFallbackFile: "data/card-catalog/index.json",
  largest: fs.readdirSync(path.join(root, "data"), { withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => ({ file: `data/${entry.name}`, bytes: bytes(`data/${entry.name}`) }))
    .sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  parallelFormats: pairs,
  psaTrialLazyLoad: { file: "data/psa-market-trial.json", bytes: bytes("data/psa-market-trial.json"),
    loadedFromMainPage: false },
  warning: "Static bytes are not transferred bytes or page-load time. No source file was removed." };
fs.writeFileSync(path.join(root, "data", "site-payload-audit.json"), JSON.stringify(report));
console.log(JSON.stringify({ initialCandidateBytes: report.initialCandidateBytes,
  largest: report.largest.slice(0, 3), psaTrialBytes: report.psaTrialLazyLoad.bytes }));
