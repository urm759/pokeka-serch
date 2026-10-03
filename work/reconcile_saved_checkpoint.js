const fs = require("node:fs");
const cp = require("node:child_process");
const read = (ref, file) => JSON.parse(cp.execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8", maxBuffer: 100e6 }).replace(/^\uFEFF/, ""));
const files = cp.execFileSync("git", ["diff", "--name-only", "--diff-filter=U"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
if (files.some((f) => !/^(data|work)\/.+\.json$/.test(f))) throw new Error("Non-data conflict needs manual review");
const generated = new Set(["data/acquisition-progress-audit.json", "data/candidate-availability-audit.json", "data/candidate-daily-audit.json", "data/card-catalog-completion.json", "data/hareruya2-stock-summary.json", "data/link-coverage.json", "data/market-research-summary.json", "data/pokedata-summary.json", "data/pokedata/manifest.json", "data/psa-linkage-priority.json", "data/purchase-limit-model-audit.json", "data/state-a-price-audit.json", "data/torecacamp-stock-summary.json", "data/update-status.json", "work/acquisition-progress-last.json", "work/card-completion-queue.json", "work/torecacamp_price_migration_audit.json"]);
const exactRows = (a = [], b = []) => [...new Map([...a, ...b].map((r) => [JSON.stringify(r), r])).values()];
const mapUnion = (a, b) => ({ ...a, ...b });
const checkedRemote = new Set(["data/candidate-shop-refresh.json", "data/psa-fetch-progress.json", "work/candidate-shop-refresh.json", "work/pokedata-fetch-metrics.json", "work/source-fetch-metrics.json", "work/source-update-runs.json", "work/torecacamp_sitemap_cache.json"]);
const mapFields = { "data/state-a-price-evidence.json": "cards", "work/pokedata-page-cache.json": "entries", "data/operational-limit-history.json": "cards", "data/shop-buyback-summary.json": "cards" };
const audit = [], writes = [];
for (const file of files) {
  const local = read("HEAD", file), remote = read("origin/main", file);
  let result, policy;
  if (generated.has(file) || file.startsWith("data/card-catalog/")) { result = remote; policy = "Regenerable projection; rebuild after merge"; }
  else if (["work/torecacamp_progress.json", "work/pokedata-progress-sm-p-promos.json"].includes(file)) {
    const oldPosition = file.includes("camp") ? [local.lastRun.currentSitemapIndex, local.lastRun.currentEntryIndex] : [local.processedCardIds.length];
    const newPosition = file.includes("camp") ? [remote.lastRun.currentSitemapIndex, remote.lastRun.currentEntryIndex] : [remote.processedCardIds.length];
    const difference = newPosition.findIndex((n, i) => n !== oldPosition[i]);
    if (difference >= 0 && newPosition[difference] < oldPosition[difference]) throw new Error(`${file}: remote position is older`);
    if (!file.includes("camp") && local.processedCardIds.some((id) => !remote.processedCardIds.includes(id))) throw new Error("PokeDATA checkpoint loses processed IDs");
    result = { ...remote, failures: exactRows(local.failures, remote.failures) }; policy = { oldPosition, newPosition, reason: "Verified monotonic checkpoint; failed entries retained without key collapse" };
  }
  else if (checkedRemote.has(file)) { result = file === "data/psa-fetch-progress.json" ? local : remote; policy = "Inspected latest run/cache metadata; full older version archived"; }
  else if (mapFields[file]) {
    const field = mapFields[file]; result = { ...remote, [field]: mapUnion(local[field], remote[field]) };
    if (file.includes("operational-limit")) result = local;
    if (file.includes("shop-buyback")) result.shops = { ...local.shops, ...remote.shops };
    policy = "Schema-specific map key union; full conflicting field versions archived";
  }
  else if (["data/update-history.json", "work/source-update-history.json"].includes(file)) {
    result = { ...remote, sources: {} };
    for (const id of new Set([...Object.keys(local.sources), ...Object.keys(remote.sources)])) result.sources[id] = exactRows(local.sources[id], remote.sources[id]);
    policy = "Keep every distinct source execution row; deduplicate byte-identical rows only";
  }
  else if (["work/candidate-daily-history.json", "work/candidate-availability-history.json"].includes(file)) {
    const field = file.includes("daily") ? "days" : "runs";
    result = { ...remote, [field]: exactRows(local[field], remote[field]) }; policy = "Keep all distinct candidate snapshots including same-day settings differences";
  }
  else if (file === "work/pokedata-link-map.json") { result = { ...remote, aliases: exactRows(local.aliases, remote.aliases), ambiguousCandidates: exactRows(local.ambiguousCandidates, remote.ambiguousCandidates) }; policy = "Keep every distinct alias and ambiguous candidate"; }
  else if (file === "data/pokedata/sets/sm-p-sm-p-promos.json") {
    result = { ...remote, cards: mapUnion(local.cards, remote.cards), linkageRecords: remote.linkageRecords };
    if (local.linkageRecords.some((r) => !remote.linkageRecords.some((b) => b.pokedataCardId === r.pokedataCardId))) throw new Error("Missing SM-P linkage identity");
    policy = "Confirmed 40/40 same-card SM-P checkpoint; no discarded linkage IDs";
  }
  else if (["work/hareruya2_catalog.json", "work/torecacamp_catalog.json", "data/pokemon-cards.json", "work/hareruya2_stock_history.json", "work/seasonality_history.json", "work/overseas_lead_history.json"].includes(file)) { policy = "Explicit catalog/date-index schema handled below"; }
  else throw new Error(`Unreviewed schema: ${file}`);
  if (["work/hareruya2_catalog.json", "work/torecacamp_catalog.json", "data/pokemon-cards.json"].includes(file)) {
    const rows = new Map();
    for (const row of [...local, ...remote]) {
      const key = row.id || `${row.cardId}|${row.detailUrl}`;
      const old = rows.get(key);
      if (!old || !row.observedAt || Date.parse(row.observedAt) >= Date.parse(old.observedAt || 0)) rows.set(key, row);
    }
    result = [...rows.values()]; policy = "Union source identities; freshest observed quote wins";
  }
  if (file === "work/hareruya2_stock_history.json") {
    const dates = [...new Set([...local.dates, ...remote.dates])].sort();
    const stocks = {};
    for (const id of new Set([...Object.keys(local.stocks), ...Object.keys(remote.stocks)])) {
      stocks[id] = dates.map((date) => remote.stocks[id]?.[remote.dates.indexOf(date)] ?? local.stocks[id]?.[local.dates.indexOf(date)] ?? null);
    }
    result = { ...remote, dates, stocks };
  }
  if (file === "work/seasonality_history.json") {
    const snapshots = new Map([...local.snapshots, ...remote.snapshots].map((s) => [s.date, s]));
    result = { ...remote, dates: [...new Set([...local.dates, ...remote.dates])].sort(), snapshots: [...snapshots.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  }
  if (file === "work/overseas_lead_history.json") {
    const cards = {};
    for (const id of new Set([...Object.keys(local.cards), ...Object.keys(remote.cards)])) cards[id] = [...new Map([...(local.cards[id] || []), ...(remote.cards[id] || [])].map((s) => [s[0], s])).values()].sort((a, b) => a[0].localeCompare(b[0]));
    result = { ...remote, cards, dates: [...new Set([...local.dates, ...remote.dates])].sort() };
  }
  audit.push({ file, policy }); writes.push([file, result]);
}
console.log(JSON.stringify(audit));
if (process.argv.includes("--apply")) {
  const recovery = "work/logs/merge-recovery-89883e9";
  fs.mkdirSync(recovery, { recursive: true });
  for (const file of files) for (const ref of ["HEAD", "origin/main"]) {
    const bytes = cp.execFileSync("git", ["show", `${ref}:${file}`], { maxBuffer: 100e6 });
    const target = `${recovery}/${ref.replace("/", "-")}-${file.replaceAll("/", "__")}`;
    fs.writeFileSync(target, bytes);
    if (!fs.readFileSync(target).equals(bytes)) throw new Error("Recovery copy verification failed");
  }
  fs.writeFileSync(`${recovery}/resolution-audit.json`, JSON.stringify(audit));
  for (const [file, result] of writes) { if (result == null) throw new Error(`No reviewed resolution: ${file}`); fs.writeFileSync(file, JSON.stringify(result), "utf8"); }
}
