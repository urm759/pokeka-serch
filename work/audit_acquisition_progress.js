const fs = require("fs");
const path = require("path");
const { cardSignature } = require("./source_observability.js");
const { cardIdentity, compactRows, cleanName, shortSet } = require("./build_psa_history.js");
const ROOT = path.join(__dirname, "..");
const read = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
};
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), JSON.stringify(value));
const validPop = (row) => Number.isFinite(row?.ten) && Number.isFinite(row?.total) && row.total > 0 && row.ten >= 0 && row.ten <= row.total;
const ageHours = (date, now) => date && Number.isFinite(Date.parse(date)) ? (now - Date.parse(date)) / 3600000 : Infinity;
const compactKey = (value) => String(value).replace(/^https?:\/\/[^/]+\//, "");
const additions = (before, after) => { const known = new Set(before.map(compactKey)); return after.filter((id) => !known.has(compactKey(id))); };

function psaAudit(cards, rows, summary, urls) {
  const official = compactRows({ rows });
  const groups = new Map();
  for (const row of official) {
    const key = `${row.set}|${row.no}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const registeredSets = new Set(urls.filter((entry) => entry.url).map((entry) => shortSet(entry.setCode)));
  const acquiredSets = new Set(official.map((row) => row.set));
  const targets = cards.filter((card) => cardSignature(card) && Number(card.snkPsa10Price) > 0);
  const categories = { linked: [], acquiredUnmatched: [], setUrlUnregistered: [], registeredSetUnacquired: [], withinAcquiredSetUnacquired: [] };
  for (const card of targets) {
    const identity = cardIdentity(card);
    if (validPop(summary[card.id])) categories.linked.push(card.id);
    else if ((groups.get(`${identity?.set}|${identity?.no}`) || []).length) categories.acquiredUnmatched.push(card.id);
    else if (!registeredSets.has(identity?.set)) categories.setUrlUnregistered.push(card.id);
    else if (!acquiredSets.has(identity?.set)) categories.registeredSetUnacquired.push(card.id);
    else categories.withinAcquiredSetUnacquired.push(card.id);
  }
  const linkedKeys = new Set(Object.values(summary).filter(validPop).map((row) => `${row.u}|${cleanName(row.n)}`));
  const matchedOfficialRows = official.filter((row) => linkedKeys.has(`${row.url}|${cleanName(row.name)}`)).length;
  return { targetCount: targets.length, counts: Object.fromEntries(Object.entries(categories).map(([key, ids]) => [key, ids.length])), categories,
    acquiredRows: official.length, matchedOfficialRows,
    acquiredRowMatchPct: official.length ? Math.round(matchedOfficialRows / official.length * 10000) / 100 : null,
    targetCoveragePct: targets.length ? Math.round(categories.linked.length / targets.length * 10000) / 100 : null,
    notAcquired: categories.setUrlUnregistered.length + categories.registeredSetUnacquired.length + categories.withinAcquiredSetUnacquired.length,
    note: "旧94.85%は国内対象内の紐づけ枚数÷公式取得行数で母数が異なる。取得行の照合率は参照URL＋公式名称の一致行を数える。取得済みセット内の未取得は500枚閾値・ページ範囲・仕様未発見を含み、不存在とは断定しない。" };
}

function capture(now = Date.now()) {
  const cards = read("data/pokemon-cards.json", []);
  const pops = read("data/psa-population-summary.json").cards || {};
  const rows = read("data/psa-official-populations.json").rows || [];
  const manifest = read("data/pokedata/manifest.json");
  const result = { at: new Date(now).toISOString(), totalCards: cards.length, sources: {} };
  for (const id of ["cardrush", "hareruya2", "yuyutei", "torecacamp"]) {
    const catalog = read(`work/${id}_catalog.json`, []);
    const summary = read(`data/${id === "hareruya2" ? "hareruya2" : id}-stock-summary.json`).cards || {};
    const byUrl = new Map(catalog.map((entry) => [entry.detailUrl, entry]));
    const byId = new Map(catalog.map((entry) => [entry.cardId, entry]));
    const linkedIds = cards.filter((card) => card[`${id}Url`]).map((card) => card.id);
    const usable = [], fresh = [], purchasable = [];
    for (const card of cards) {
      const entry = byId.get(card.id) || byUrl.get(card[`${id}Url`]);
      const value = summary[card.id];
      const price = Number(value?.[`${id}Price`] ?? value?.price ?? entry?.price);
      if (!(price > 0) || !Number.isFinite(price) || value?.quarantined || value?.priceQuarantined || entry?.priceQuarantined || value?.conditionAccepted === false || entry?.state && entry.state !== "A") continue;
      usable.push(card.id);
      const date = value?.updatedAt === undefined ? entry?.observedAt : value.updatedAt;
      if (ageHours(date, now) <= 48) {
        fresh.push(card.id);
        if (Number(value?.stock ?? entry?.stock) > 0 || value?.available === true) purchasable.push(card.id);
      }
    }
    result.sources[id] = { acquiredKeys: [...new Set(catalog.map((entry) => compactKey(entry.detailUrl || entry.cardId)).filter(Boolean))], linkedIds,
      usableIds: usable, freshUsableIds: fresh, purchasableIds: purchasable };
  }
  const popIds = Object.keys(pops).filter((id) => validPop(pops[id]));
  result.sources.psaOfficial = { acquiredKeys: compactRows({ rows }).map((row) => `${row.set}|${row.no}|${cleanName(row.name)}`),
    linkedIds: Object.keys(pops), usableIds: popIds, freshUsableIds: popIds.filter((id) => ageHours(pops[id].f, now) <= 36) };
  const details = (manifest.sets || []).flatMap((set) => Object.entries(read(set.file).cards || {}));
  const domesticIds = new Set(cards.map((card) => card.id));
  const grades = { raw: [], psa10: [], psa9: [] };
  for (const [id, detail] of details) {
    for (const grade of Object.keys(grades)) {
      const stat = detail.markets?.[{ raw: "ebayRaw", psa10: "ebayPsa10", psa9: "ebayPsa9" }[grade]];
      if (stat?.usableIndividualMedian === true && Number(stat.adoptedCount) >= 3 && Number(stat.medianJpy) > 0) grades[grade].push(id);
    }
  }
  // The manifest is produced by the shared grade aggregation, not a second definition of sufficient sales.
  result.sources.pokedata = { acquiredKeys: (manifest.sets || []).flatMap((set) => (read(set.file).linkageRecords || []).map((row) => `${set.setCode}|${row.id ?? row.pokedataCardId ?? row.cardId}`)),
    linkedIds: [...new Set(details.map(([id]) => id).filter((id) => domesticIds.has(id)))], usableIds: grades.psa10,
    domesticBaseMissing: details.filter(([id]) => !domesticIds.has(id)).length,
    gradeCounts: { raw: manifest.acquisition?.usableRawMedianCards ?? null, psa10: manifest.acquisition?.usablePsa10MedianCards ?? null, psa9: manifest.acquisition?.usablePsa9MedianCards ?? null },
    sets: (manifest.sets || []).map((set) => ({ name: set.setName, acquired: set.linkageCount, target: set.sourceCount, usable: set.acquisition })) };
  result.psa = psaAudit(cards, rows, pops, read("work/psa_set_urls.json", []));
  result.availability = read("work/candidate-availability-history.json", { runs: [] }).runs.at(-1) || null;
  result.settings = read("data/candidate-daily-audit.json").profile || null;
  return result;
}

function progress(before, after) {
  if (!before) return { newAcquired: null, newLinked: null, usableAdded: null, usableLost: null, usableNet: null };
  const plus = additions(before.usableIds, after.usableIds), minus = additions(after.usableIds, before.usableIds);
  return { newAcquired: additions(before.acquiredKeys, after.acquiredKeys).length, newLinked: additions(before.linkedIds, after.linkedIds).length,
    usableAdded: plus.length, usableLost: minus.length, usableNet: plus.length - minus.length,
    freshUsableAdded: additions(before.freshUsableIds || [], after.freshUsableIds || []).length };
}

function main() {
  const current = capture();
  if (process.argv.includes("--baseline")) {
    write("work/acquisition-audit-baseline.json", current);
    console.log(JSON.stringify({ baselineAt: current.at, candidates: current.availability?.counts, psa: current.psa.counts }));
    return;
  }
  const baseline = read("work/acquisition-audit-baseline.json", null) || read("work/acquisition-progress-last.json", null);
  const runs = read("work/source-update-runs.json").sources || {};
  const shopRuns = read("work/candidate-shop-refresh.json").sources || {};
  const storedPsaRun = read("work/psa-fetch-progress.json");
  const observedPsaRun = read("data/psa-pc-observation.json").fetchProgress || {};
  const psaRun = Date.parse(observedPsaRun.startedAt || "") > Date.parse(storedPsaRun.startedAt || "") ? observedPsaRun : storedPsaRun;
  const sourceHistory = read("work/source-update-history.json").sources || {};
  const pokeProgress = fs.readdirSync(__dirname).filter((file) => /^pokedata-progress.*\.json$/.test(file))
    .map((file) => ({ file, ...read(`work/${file}`) })).filter((row) => row.lastRun)
    .sort((a, b) => String(b.lastSuccessfulCard?.at || "").localeCompare(String(a.lastSuccessfulCard?.at || "")))[0];
  const labels = { psaOfficial: "PSA公式Population", cardrush: "カードラッシュ", hareruya2: "晴れる屋2", yuyutei: "遊々亭", torecacamp: "トレカキャンプ", pokedata: "PokeDATA海外相場" };
  const sources = {};
  for (const [id, data] of Object.entries(current.sources)) {
    let run = id === "psaOfficial" ? psaRun : shopRuns[id] || runs[id] || {};
    if (id === "torecacamp") {
      const progress = read("work/torecacamp_progress.json").lastRun || {};
      if (Date.parse(progress.completedAt || "") > Date.parse(run.startedAt || "")) run = { ...progress, attemptedCount: progress.detailFetched, refreshedCount: progress.detailFetched,
        startedAt: progress.startedAt || progress.completedAt, endedAt: progress.completedAt,
        status: progress.fetchFailureCount ? "failed" : "partial", lastSuccessAt: progress.detailFetched > 0 && !progress.fetchFailureCount ? progress.completedAt : runs[id]?.lastSuccessAt,
        nextId: `${progress.currentCursor}/${progress.totalSitemaps}・${progress.currentEntryIndex}`, stopReason: progress.stoppingReason || null };
    }
    const delta = progress(baseline?.sources[id], data);
    const windowRuns = (sourceHistory[id] || []).filter((row) => baseline?.at && String(row.startedAt) >= baseline.at && Number.isFinite(row.attemptedCount));
    const freshBefore = baseline?.sources[id]?.freshUsableIds;
    const freshNet = freshBefore && data.freshUsableIds ? additions(freshBefore, data.freshUsableIds).length - additions(data.freshUsableIds, freshBefore).length : null;
    sources[id] = { label: labels[id], attempted: run.attemptedCount ?? null, refreshed: run.refreshedCount ?? null,
      ...delta, acquiredTotal: data.acquiredKeys.length, linkedTotal: data.linkedIds.length,
      usableValues: data.usableIds.length, freshUsableValues: data.freshUsableIds?.length ?? null,
      effectiveForDecision: id === "pokedata" ? 0 : data.freshUsableIds?.length ?? null,
      effectiveNet: id === "pokedata" ? 0 : freshNet,
      windowAttempted: windowRuns.length ? windowRuns.reduce((n, row) => n + row.attemptedCount, 0) : null,
      windowRefreshed: windowRuns.length ? windowRuns.reduce((n, row) => n + Number(row.refreshedCount || 0), 0) : null,
      purchasableValues: data.purchasableIds?.length ?? null, gradeCounts: data.gradeCounts,
      lastSuccessAt: run.lastSuccessAt || runs[id]?.lastSuccessAt || null, lastAttemptAt: run.startedAt || runs[id]?.lastAttemptAt || null,
      status: run.status || "未記録", stopReason: run.stopReason || run.lastError || null,
      durationMs: run.durationMs ?? null, checkpoint: run.nextUrl || run.nextId || null,
      manualWaitCount: run.manualWaitCount ?? 0,
      evidence: id === "psaOfficial" ? "./data/psa-fetch-progress.json" : id === "torecacamp" ? "./data/torecacamp-stock-summary.json" : "./data/candidate-shop-refresh.json",
      referenceOnly: id === "pokedata" };
    if (data.domesticBaseMissing != null) sources[id].domesticBaseMissing = data.domesticBaseMissing;
    if (id === "psaOfficial") sources[id].savedRecovery = { ...read("data/psa-saved-recovery.json"), evidence: undefined };
    if (id === "pokedata" && pokeProgress) {
      sources[id].attempted = pokeProgress.lastRun.attempted ?? null;
      sources[id].refreshed = pokeProgress.lastRun.fetched ?? null;
      sources[id].checkpoint = `${pokeProgress.setName}: ${pokeProgress.lastRun.currentCursor}/${pokeProgress.lastRun.targetCount}`;
      sources[id].evidence = `./data/acquisition-progress-audit.json`;
      const budget = read("work/pokedata-budget-progress.json");
      if (Date.parse(budget.endedAt || "") >= Date.parse(pokeProgress.lastSuccessfulCard?.at || "")) {
        Object.assign(sources[id], { attempted: budget.attempted, refreshed: budget.fetched, durationMs: budget.durationMs,
          lastAttemptAt: budget.startedAt, lastSuccessAt: budget.failed === 0 && budget.fetched > 0 ? budget.endedAt : sources[id].lastSuccessAt,
          status: budget.status, checkpoint: `${budget.checkpoint?.setName}: ${budget.checkpoint?.acquired}/${budget.checkpoint?.total}`,
          stopReason: budget.stopReason, evidence: "./data/pokedata-budget-progress.json" });
      }
    }
  }
  const beforeRows = baseline?.availability?.rows || {};
  const afterRows = current.availability?.rows || {};
  const modelSame = baseline?.availability?.modelVersion === current.availability?.modelVersion
    && JSON.stringify(baseline?.settings) === JSON.stringify(current.settings);
  const cohort = Object.keys(beforeRows);
  const currentCohort = read("work/candidate-cohort-current.json").rows || {};
  const effectRows = cohort.map((id) => ({ id, before: beforeRows[id], after: currentCohort[id] || afterRows[id] || null,
    change: !modelSame ? "モデル不一致・比較不可" : beforeRows[id].status === "価格待ち" && afterRows[id]?.status === "購入先確認済み" ? "購入先確認済みへ移行" : !afterRows[id] ? "条件外へ移行" : "購入可否変化なし" }));
  const audit = { version: 1, generatedAt: current.at, baselineAt: baseline?.at || null, sources,
    definitions: { attempted: "直近実行で通信したセット／商品数。履歴に項目がない過去実行は未記録。windowAttemptedは基準以降の記録済み実行の合計", newAcquired: "前回基準に存在しなかったソースID", newLinked: "前回基準に存在しなかった国内カード紐づけ", usableValues: "保存された検証可能な実値。PSAは有効POP、海外は採用3件以上のPSA10中央値、国内店は状態A価格。古い値はeffectiveForDecision（鮮度適合）から除く。PokeDATAは参考専用のため国内判定反映0", comparison: "固定カード群・同一モデルと設定。新規カタログ増加と既存価格再取得を区別。鮮度訂正の影響は取得効果と別記録" },
    psa: current.psa,
    shopEffect: { sameModel: modelSame, settings: current.settings, cohortCount: cohort.length, before: baseline?.availability?.counts || null,
      afterTimestampCorrection: baseline?.at === read("work/shop-provenance-correction.json").baselineAt
        ? read("work/shop-provenance-candidate-baseline.json").counts || null : null,
      after: current.availability?.counts || null, promoted: effectRows.filter((row) => row.change === "購入先確認済みへ移行").length, rows: effectRows },
    remaining: { domesticPsa9ActualCards: read("data/raw-psa9-gap-audit.json").counts?.domesticPsa9IndividualSales ?? null,
      priceVerification: read("data/state-a-price-audit.json").lastRun?.remaining ?? null, backtest: "2026年12月以降の返却時期検証待ち・完了ではない" } };
  const isolated = read("data/shop-refresh-isolated-effect.json", null);
  if (isolated?.baselineAt === baseline?.at) audit.shopEffect.isolated = { ...isolated, rows: undefined };
  write("data/acquisition-progress-audit.json", audit);
  write("data/psa-fetch-progress.json", { ...psaRun, canonicalNewAcquiredCount: sources.psaOfficial.newAcquired,
    counterNote: "正規化後の新規行はcanonicalNewAcquiredCount。生の番号ゼロ埋め差は新規カードではない。" });
  write("data/candidate-shop-refresh.json", read("work/candidate-shop-refresh.json"));
  write("work/acquisition-progress-last.json", current);
  console.log(JSON.stringify({ sources, psa: current.psa.counts, effect: { before: audit.shopEffect.before, after: audit.shopEffect.after, promoted: audit.shopEffect.promoted } }));
}
if (require.main === module) main();
module.exports = { psaAudit, progress, capture, validPop };
