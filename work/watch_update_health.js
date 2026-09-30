const fs = require("node:fs");
const path = require("node:path");
const { evaluate } = require("../update-health-model.js");
const backfillModel = require("./backfill_health_model.js");
const backfillRate = require("./backfill_rate.js");

const ROOT = path.join(__dirname, "..");
const API = "https://api.github.com/repos/urm759/pokeka-serch";
const headers = { "User-Agent": "pokeka-update-watchdog", Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function api(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return response.json();
}

async function main() {
  const [runs, safeRuns, pokeRuns] = await Promise.all([
    api(`${API}/actions/workflows/daily-fast-update.yml/runs?per_page=30`),
    api(`${API}/actions/workflows/safe-checkpoint-backfill.yml/runs?per_page=10`),
    api(`${API}/actions/workflows/backfill-data.yml/runs?per_page=10`),
  ]);
  const status = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "update-status.json"), "utf8"));
  const health = evaluate({ runs: runs.workflow_runs || [], sourceLastSuccessAt: status.sources?.toreca?.lastSuccessAt });
  const file = path.join(ROOT, "data", "update-health.json");
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const read = (name, fallback = null) => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, "work", name), "utf8")); } catch { return fallback; }
  };
  const pokeProgress = fs.readdirSync(path.join(ROOT, "work"))
    .filter((name) => /^pokedata-progress(?:-.*)?\.json$/.test(name))
    .map((name) => read(name)).filter(Boolean);
  const backfills = backfillModel.evaluate({ safeRuns: safeRuns.workflow_runs || [],
    pokeRuns: pokeRuns.workflow_runs || [], safeProgress: read("safe-backfill-progress.json", {}),
    pokeProgress, pokeHold: read("pokedata-access-hold.json"),
    discovery: read("pokedata-set-discovery.json", {}),
    ambiguousCandidates: read("pokedata-link-map.json", {}).ambiguousCandidates || [], previous: current || {} });
  const dailyIssues = health.reasons.map((reason) => ({
    key: reason.includes("連続失敗") ? "daily:workflow-failure"
      : reason.includes("みんトレ") ? "daily:source-stale" : "daily:run-stale",
    reason, url: health.latestRunUrl,
  }));
  const issues = [...dailyIssues, ...backfills.issues];
  const previousKeys = new Set(current?.activeAlertKeys || []);
  const newlyDetected = issues.filter((issue) => !previousKeys.has(issue.key));
  const samples = backfillRate.read().samples;
  const rateAudit = Object.fromEntries(["yuyutei", "priceEvidence", "torecacamp", "pokedata"].map((source) => {
    const recent = samples.filter((row) => row.source === source).slice(-2);
    return [source, { before: recent[0] || null, after: recent[1] || null }];
  }));
  const result = { ...health, status: issues.length ? "alert" : health.status,
    reasons: issues.map((issue) => issue.reason), issues,
    activeAlertKeys: issues.map((issue) => issue.key),
    backfills: { ...backfills.backfills, rateAudit } };
  const changed = JSON.stringify({ ...current, sourceAgeHours: null, runAgeHours: null })
    !== JSON.stringify({ ...result, sourceAgeHours: null, runAgeHours: null });
  if (changed) fs.writeFileSync(file, JSON.stringify(result), "utf8");
  console.log(JSON.stringify({ status: result.status, issues: result.issues,
    newIssueCount: newlyDetected.length, backfills: result.backfills }));
  if (newlyDetected.length) {
    console.error(`::error::${newlyDetected.map((issue) => issue.reason).join(" / ")}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
