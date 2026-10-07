const fs = require('node:fs'), path = require('node:path');
const { SOURCE_POLICIES } = require('./workflow_schedule');
const read = (root, file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(path.join(root,file),'utf8')); } catch { return fallback; } };
function classify({ enabled, implemented = true, running = false, hold, acquiredAt, savedAt, publishedAt,
  periodicSuccessAt, intervalMs, now = Date.now() }) {
  const timestamp = Date.parse(periodicSuccessAt || '');
  const overdue = enabled && (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > intervalMs);
  const states = [!implemented ? '未実装' : enabled ? '設定有効' : '自動更新なし'];
  if (hold) states.push(/403|アクセス/.test(hold) ? 'アクセス停止' : /認証|authentication|login|cloudflare/i.test(hold) ? '認証待ち' : '確認・許諾待ち');
  if (running) states.push('実行中');
  if (implemented && enabled && !hold) states.push(overdue ? '実行間隔未達' : '定期成功');
  return { states, configurationEnabled: Boolean(enabled), running, periodicVerified: Number.isFinite(timestamp),
    periodicSuccessAt: periodicSuccessAt || null, intervalOverdue: Boolean(overdue), intervalMs,
    acquiredAt: acquiredAt || null, savedAt: savedAt || null, publishedAt: publishedAt || null, stopReason: hold || null };
}
function build(root, sources, rows, now = Date.now()) {
  const pc = read(root,'data/psa-pc-observation.json');
  const cycles = read(root,'data/scheduled-cycle-verification.json').pipelines || {};
  const history = read(root,'work/source-update-history.json').sources || {};
  const runs = read(root,'work/source-update-runs.json').sources || {};
  const actual = read(root,'work/automatic-workflow-evidence.json');
  const route = { toreca:'daily',shopBuyback:'daily',marketAnalysis:'daily',psaJapan:'daily',cardrush:'priority',hareruya2:'priority',yuyutei:'safe',torecacamp:'safe',pokedata:'pokedata' };
  const result = {};
  for (const [id, source] of Object.entries(sources)) {
    const policy = SOURCE_POLICIES[id], row = rows[id] || {};
    const latest = id === 'psaOfficial' ? pc.acquisitionState || {} : runs[id] || {};
    const scheduled = id === 'psaOfficial' ? pc.lastScheduledState || {} : (history[id] || []).filter(r => r.workflowTrigger === 'schedule').at(-1) || {};
    const verification = cycles[route[id]];
    const positive = scheduled.acquiredCount > 0 && ['success','partial'].includes(scheduled.status) && !scheduled.lastError;
    // A receipt must identify this acquisition, not merely a successful unrelated workflow.
    const published = id === 'psaOfficial' ? scheduled.publishStatus === 'published' : [verification,cycles.catchup].some(v=>v?.confirmed && String(v.runId) === String(scheduled.workflowRunId));
    const scheduledAt = positive && published ? scheduled.endedAt || scheduled.lastSuccessAt : null;
    const event = (actual.runs || []).find(r => r.key === route[id]);
    const live = Date.parse(actual.checkedAt || '') <= now && now - Date.parse(actual.checkedAt || '') < 30*60000 && event?.status === 'in_progress';
    const savedAt = latest.endedAt && latest.acquiredCount > 0 && ['success','partial'].includes(latest.status) ? latest.recoveryAt || latest.savedAt || latest.endedAt : null;
    result[id] = { ...classify({ enabled: Boolean(policy?.times.length), implemented: true, running: live,
      hold: source.acquisitionStopped || id === 'snkrRaw' ? source.lastError || '許諾確認待ち・自動収集停止' : /403|認証切れ|authentication|login required|cloudflare/i.test(row.stopReason || '') ? row.stopReason : null,
      acquiredAt: row.lastSuccess, savedAt, publishedAt: id === 'psaOfficial' ? latest.publishedAt : row.publishedAt,
      periodicSuccessAt: scheduledAt, intervalMs: ['toreca','shopBuyback','cardrush','hareruya2'].includes(id) ? 2*3600000 : policy?.local ? 24*3600000 : 30*3600000, now }),
      latestScheduledStatus: scheduled.status || '未観測', scheduledError: scheduled.lastError ? String(scheduled.lastError).split(/\r?\n/)[0].slice(0,180) : null,
      publicationBasis: id === 'psaOfficial' ? 'PC公開ack（取得とは別）' : '公開mainの取得元ファイル反映日時。Pages照合は定期成功欄で別確認',
      workflow: policy?.workflow || '自動更新なし' };
  }
  return { version: 1, checkedAt: new Date(now).toISOString(), sources: result,
    domesticPsa9: {...classify({enabled:false,implemented:false,now}), reason:'正規の国内PSA9個別成約取得処理は未実装。海外・集計・推定を代用しない'},
    catchup: read(root,'data/price-catchup-status.json',null),
    constraints: '設定だけで正常扱いしない。定期成功は取得・保存・公開の証拠一致が必要。監視も未実行ならGitHub側の補完は動かない。PC経路にはPC起動・認証が必要。独立PC監視は権限不足で未登録。LLM/Codex呼出0・AI予定タスク停止。' };
}
module.exports = { classify, build };
