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
  const response = await fetch(url, { headers: url.startsWith(API + '/') ? headers : {"User-Agent":"pokeka-update-watchdog"}, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return response.json();
}

async function main() {
  const [runs, safeRuns, pokeRuns, priceRuns] = await Promise.all([
    api(`${API}/actions/workflows/daily-fast-update.yml/runs?per_page=30`),
    api(`${API}/actions/workflows/safe-checkpoint-backfill.yml/runs?per_page=10`),
    api(`${API}/actions/workflows/backfill-data.yml/runs?per_page=10`),
    api(`${API}/actions/workflows/priority-price-refresh.yml/runs?per_page=10`),
  ]);
  const status = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "update-status.json"), "utf8"));
  fs.writeFileSync(path.join(ROOT,'data/refresh-cadence-audit.json'),JSON.stringify(require('./refresh_cadence').audit(priceRuns.workflow_runs||[])));
  // Verify saved run receipts without triggering acquisition or waiting for future runs.
  const cycleFile=path.join(ROOT,'data/scheduled-cycle-verification.json');
  let cycles=fs.existsSync(cycleFile)?JSON.parse(fs.readFileSync(cycleFile,'utf8')):{version:1,pipelines:{}};
  try {
    const receipts=await api('https://urm759.github.io/pokeka-serch/data/scheduled-cycle-receipts.json');
    const deployments=await api(`${API}/actions/runs?per_page=30`);
    const pages=deployments.workflow_runs?.find(r=>r.name==='pages build and deployment'&&r.conclusion==='success');
    for(const [key,list] of Object.entries({daily:runs,safe:safeRuns,pokedata:pokeRuns,priority:priceRuns})) {
      const latest=list.workflow_runs?.find(r=>r.event==='schedule'&&r.status==='completed');
      if(!latest || cycles.pipelines[key]?.runId===latest.id&&cycles.pipelines[key]?.confirmed)continue;
      const receipt=receipts.pipelines?.[key],texts={};
      if(receipt && String(receipt.runId)===String(latest.id)){
        for(const file of Object.keys(receipt.hashes||{})){
          if(!/^data\/[a-z0-9/-]+\.json$/i.test(file))throw new Error('Invalid receipt path');
          const response=await fetch('https://urm759.github.io/pokeka-serch/'+file+'?run='+latest.id,{signal:AbortSignal.timeout(15000)});
          if(response.ok)texts[file]=await response.text();
        }
      }
      const jobs=await api(`${API}/actions/runs/${latest.id}/jobs`);
      cycles.pipelines[key]=require('./scheduled_cycle_evidence').verify(latest,jobs,receipt,texts,pages);
    }
    cycles.checkedAt=new Date().toISOString();
    delete cycles.checkError;
  }catch(error){cycles.checkError=error.message;cycles.checkedAt=new Date().toISOString();}
  fs.writeFileSync(cycleFile,JSON.stringify(cycles));
  const evidenceFile=path.join(ROOT,'data/proactive-refresh-audit.json');
  if(fs.existsSync(evidenceFile)) {
    const evidence=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));
    const latest=priceRuns.workflow_runs?.find(r=>r.event==='schedule'&&r.status==='completed');
    const execution=JSON.parse(fs.readFileSync(path.join(ROOT,'data/priority-price-execution.json'),'utf8'));
    if(latest && execution.priceQueueModel==='deadline-v2' && String(execution.runId)===String(latest.id)
      && !(evidence.publicationEvidence?.runId===latest.id && evidence.publicationEvidence?.confirmed)) {
      try {
        const [jobs,publicExecution,deployments]=await Promise.all([api(`${API}/actions/runs/${latest.id}/jobs`),
          api('https://urm759.github.io/pokeka-serch/data/priority-price-execution.json'),api(`${API}/actions/runs?per_page=30`)]);
        const pages=deployments.workflow_runs?.find(r=>r.name==='pages build and deployment'&&r.status==='completed'&&r.conclusion==='success');
        evidence.publicationEvidence=require('./price_publication_evidence.js').verify(latest,jobs,publicExecution,pages);
        evidence.postChangeScheduledValidation=evidence.publicationEvidence.confirmed ? '期限順修正後の定期取得・保存push・公開JSON・Pages成功を確認' : '処理記録あり・保存/公開の照合未完了';
        fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
      } catch(error) {
        evidence.publicationCheckError=error.message;
        fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
      }
    }
  }
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
    ambiguousCandidates: read("pokedata-link-map.json", {}).ambiguousCandidates || [],
    recovery: (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "backfill-recovery.json"), "utf8")); } catch { return {}; } })(),
    previous: current || {} });
  const dailyIssues = health.reasons.map((reason) => ({
    key: reason.includes("連続失敗") ? "daily:workflow-failure"
      : reason.includes("みんトレ") ? "daily:source-stale" : "daily:run-stale",
    reason, url: health.latestRunUrl,
  }));
  const monitor = require("./source_monitor.js").build(ROOT, status.sources || {}, status.unifiedMonitor || {}, Date.now(), { savedOutcomes: true });
  const sourceIssues = Object.entries(monitor.rows).flatMap(([id, row]) => {
    const entries = [];
    if (row.stopReason && /403|認証|形式|曖昧|failed|失敗|競合|sign.?in|log.?in|cloudflare/i.test(row.stopReason)) entries.push({ key: `source:${id}:manual-wait`, reason: `${row.label}: ${row.stopReason}`, url: row.failureUrl });
    if (status.sources?.[id]?.stale && status.sources?.[id]?.automatic) entries.push({ key: `source:${id}:stale`, reason: `${row.label}: 更新期限超過（カード別鮮度 ${row.freshnessPct ?? "未記録"}%）`, url: row.failureUrl });
    return entries;
  });
  if (monitor.pc.health.status !== "観測受信済み") sourceIssues.push({ key: `pc:psa:${monitor.pc.health.status}`, reason: `PC側PSA: ${monitor.pc.health.status} / ${monitor.pc.health.reason}`, url: null });
  const prices = status.priorityPriceMonitor?.sources || {};
  const priceState = backfillModel.workflowState(priceRuns.workflow_runs || [], current?.priorityPriceRefresh || {},
    JSON.stringify(Object.values(prices).map((source) => (source.cards || []).map((card) => card.lastConfirmedAt).filter(Boolean).sort().at(-1) || null)),
    Object.values(prices).some((source) => source.overdue > 0 && !/403|認証|アクセス確認/.test(source.stopReason || "")));
  const priceIssues = [];
  if (["failure", "timed_out"].includes(priceState.conclusion)) priceIssues.push({ key: "priority-prices:workflow-failure", reason: "購入価格高速更新の保存・検証・公開失敗", url: priceState.runUrl });
  if (priceState.stuckRuns >= 3) priceIssues.push({ key: "priority-prices:stalled", reason: "購入価格高速更新が3回連続で進捗なし・期限超過あり", url: priceState.runUrl });
  const issues = [...dailyIssues, ...backfills.issues, ...sourceIssues, ...priceIssues].map(issue => ({ ...issue,
    category: require('../update-health-model.js').issueCategory(issue) }));
  const previousKeys = new Set(current?.activeAlertKeys || []);
  const newlyDetected = issues.filter((issue) => !previousKeys.has(issue.key));
  const samples = backfillRate.read().samples;
  const rateAudit = Object.fromEntries(["yuyutei", "priceEvidence", "torecacamp", "pokedata"].map((source) => {
    const recent = samples.filter((row) => row.source === source).slice(-2);
    return [source, { before: recent[0] || null, after: recent[1] || null }];
  }));
  const result = { ...health, status: issues.length ? "alert" : health.status,
    unifiedMonitor: monitor, priorityPriceRefresh: priceState,
    reasons: issues.map((issue) => issue.reason), issues,
    activeAlertKeys: issues.map((issue) => issue.key),
    backfills: { ...backfills.backfills, rateAudit } };
  const changed = JSON.stringify({ ...current, sourceAgeHours: null, runAgeHours: null })
    !== JSON.stringify({ ...result, sourceAgeHours: null, runAgeHours: null });
  if (changed) fs.writeFileSync(file, JSON.stringify(result), "utf8");
  status.unifiedMonitor = monitor;
  fs.writeFileSync(path.join(ROOT, "data", "update-status.json"), JSON.stringify(status), "utf8");
  console.log(JSON.stringify({ status: result.status, issues: result.issues,
    newIssueCount: newlyDetected.length, backfills: result.backfills }));
  if (newlyDetected.length) {
    console.error(`::error::${newlyDetected.map((issue) => issue.reason).join(" / ")}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
