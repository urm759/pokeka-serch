const SOURCE_POLICIES = {
  toreca: { workflow: "Daily Fast Update", times: ["04:30", "17:00"], ttlHours: 30 },
  cardrush: { workflow: "Manual Full Refresh / Refresh Cardrush Stock", times: [], ttlHours: 72 },
  hareruya2: { workflow: "Manual Full Refresh", times: [], ttlHours: 72 },
  yuyutei: { workflow: "PCローカル更新（GitHub共有ランナーは403）", times: [], ttlHours: 72 },
  torecacamp: { workflow: "Incremental Data Backfill", times: ["05:30"], ttlHours: 48 },
  shopBuyback: { workflow: "Daily Fast Update", times: ["04:30", "17:00"], ttlHours: 30 },
  marketAnalysis: { workflow: "Daily Fast Update", times: ["04:30", "17:00"], ttlHours: 30 },
  psaOfficial: { workflow: "PCローカル PSA公式更新", times: ["04:30", "17:00"], ttlHours: 36, local: true },
  psaJapan: { workflow: "Daily Fast Update", times: ["04:30", "17:00"], ttlHours: 30 },
  pokedata: { workflow: "Incremental Data Backfill（公開分）", times: ["05:30"], ttlHours: 72 },
};

function jstParts(value = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
}

function addJstDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function scheduleFor(sourceId, now = new Date()) {
  const policy = SOURCE_POLICIES[sourceId] || { workflow: "自動更新なし", times: [], ttlHours: 72 };
  const automatic = policy.times.length > 0;
  if (!automatic) return { ...policy, automatic: false, scheduleLabel: "自動更新なし", nextScheduledAt: null, previousScheduledAt: null };
  const parts = jstParts(now);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const parsed = policy.times.map((time) => {
    const [hour, minute] = time.split(":").map(Number);
    return { time, minutes: hour * 60 + minute };
  });
  const nextToday = parsed.find((entry) => entry.minutes > minutes);
  const previousToday = [...parsed].reverse().find((entry) => entry.minutes <= minutes);
  const nextDate = nextToday ? date : addJstDays(date, 1);
  const nextTime = (nextToday || parsed[0]).time;
  const previousDate = previousToday ? date : addJstDays(date, -1);
  const previousTime = (previousToday || parsed.at(-1)).time;
  return {
    ...policy,
    automatic: true,
    scheduleLabel: policy.local ? `PC起動時 ${policy.times.join("／")} JST` : `${policy.times.join("／")} JST`,
    nextScheduledAt: `${nextDate}T${nextTime}:00+09:00`,
    previousScheduledAt: `${previousDate}T${previousTime}:00+09:00`,
  };
}

function consecutiveFailures(history = [], current = {}) {
  const rows = [...history];
  if (current.lastAttemptAt && (!rows.length || rows.at(-1)?.startedAt !== current.lastAttemptAt)) rows.push({ status: current.status });
  let count = 0;
  for (const row of rows.reverse()) {
    const failed = row.status === "failed" || (row.status === "partial" && Number(row.fetchFailureCount || 0) > 0);
    if (!failed) break;
    count += 1;
  }
  return count;
}

function sourceTiming(sourceId, run = {}, history = [], now = new Date()) {
  const schedule = scheduleFor(sourceId, now);
  const lastSuccessMs = Date.parse(run.lastSuccessAt || "");
  const ageHours = Number.isFinite(lastSuccessMs) ? (now.getTime() - lastSuccessMs) / 3600000 : null;
  const startedMs = Date.parse(run.startedAt || run.lastAttemptAt || "");
  const runSchedule = Number.isFinite(startedMs) ? scheduleFor(sourceId, new Date(startedMs + 1000)) : schedule;
  const plannedMs = Date.parse(runSchedule.previousScheduledAt || "");
  const githubActionsRun = run.executionEnvironment === "GitHub Actions" || Boolean(run.workflowRunId);
  return {
    workflow: schedule.workflow,
    automatic: schedule.automatic,
    scheduleLabel: schedule.scheduleLabel,
    nextScheduledAt: schedule.nextScheduledAt,
    previousScheduledAt: schedule.previousScheduledAt,
    actionsDelayMinutes: githubActionsRun && Number.isFinite(plannedMs) && Number.isFinite(startedMs) ? Math.max(0, Math.round((startedMs - plannedMs) / 60000)) : null,
    executionEnvironment: run.executionEnvironment || null,
    workflowRunId: run.workflowRunId || null,
    updateTtlHours: schedule.ttlHours,
    ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
    stale: ageHours == null || ageHours > schedule.ttlHours,
    consecutiveFailures: consecutiveFailures(history, run),
  };
}

module.exports = { SOURCE_POLICIES, scheduleFor, sourceTiming };
