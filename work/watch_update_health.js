const fs = require("node:fs");
const path = require("node:path");
const { evaluate, fingerprint } = require("../update-health-model.js");

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
  const runs = await api(`${API}/actions/workflows/daily-fast-update.yml/runs?per_page=30`);
  const status = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "update-status.json"), "utf8"));
  const health = evaluate({ runs: runs.workflow_runs || [], sourceLastSuccessAt: status.sources?.toreca?.lastSuccessAt });
  const file = path.join(ROOT, "data", "update-health.json");
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const changed = fingerprint(current) !== fingerprint(health);
  if (changed) fs.writeFileSync(file, JSON.stringify(health), "utf8");
  console.log(JSON.stringify(health));
  if (changed && health.status === "alert") {
    console.error(`::error::${health.reasons.join(" / ")}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
