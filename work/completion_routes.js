const REQUIRED = ["domesticPrice", "domesticTrades", "psa10Price", "psa10Trades", "psaOfficial", "identity"];
const ROUTES = {
  domesticPrice: ["toreca", "自動巡回中", "国内相場の一括差分更新"],
  domesticTrades: ["toreca", "自動巡回中", "全状態件数。状態A成約の代用は禁止"],
  psa10Price: ["toreca", "自動巡回中", "国内集計値の定期再確認"],
  psa10Trades: ["toreca", "自動巡回中", "PSA10取引集計の定期再確認"],
  psaOfficial: ["psaOfficial", "認証・手動確認待ち", "登録済み公式セットURLをPC取得へ。候補生成は取得ではない"],
  shopStateA: ["domesticShops", "自動巡回中", "同一仕様の確定URLから状態A価格を補完。403元は停止"],
  buyback: ["shopBuyback", "自動巡回中", "Web買取表の一括差分更新・未掲載も定期再確認"],
  rawActualSales: ["pokedataAuthenticated", "認証・手動確認待ち", "海外Raw成約。国内状態Aとは別"],
  psa10ActualSales: ["pokedataAuthenticated", "認証・手動確認待ち", "海外PSA10実成約のみ"],
  psa9Sales: ["pokedataAuthenticated", "認証・手動確認待ち", "海外PSA9実成約。国内PSA9の不足は埋まらない"],
  psa9Aggregate: ["toreca", "自動巡回中", "国内集計の再確認。推定値は実成約に含めない"],
  pokedata: ["pokedata", "自動巡回中", "確認済み対応セットの段階取得。未展開・曖昧は別管理"],
  release: ["release", "認証・手動確認待ち", "公式発売情報の確認。取得日で発売年を推定しない"],
  identity: ["identity", "認証・手動確認待ち", "仕様・番号・言語の曖昧一致を自動確定しない"],
  psa9Evidence: ["toreca", "自動巡回中", "PSA9集計の価格と個別再取得日時を一括更新で再確認。個別実成約日とは別"],
  buybackExitEvidence: ["shopBuyback", "自動巡回中", "複数店の新鮮な買取掲載をWeb表更新で再確認。未掲載や利用設定不一致は推定しない"],
};
function itemState(detail, key) {
  const evidenceIndex=['psa9Evidence','buybackExitEvidence'].indexOf(key);
  if (evidenceIndex >= 0 && Array.isArray(detail.e)) return {status:detail.e[evidenceIndex]===1?'取得済み':'定期再確認'};
  const value = detail.i?.[key];
  return Array.isArray(value) ? { status: value[0], lastAttemptAt: value[1], lastSuccessAt: value[2], retryCount: value[3], reason: value[4], nextRetryAt: value[5] } : { status: value };
}
function needs(detail, key) { return itemState(detail, key).status !== "取得済み"; }
function routes(detail, permissions) {
  if (!permissions) {
    const root = require('node:path').join(__dirname, '..');
    permissions = { psaAllowed: require('./psa_access_policy').decision(require('./psa_access_policy').read(root)).allowed,
      overseasAllowed: require('./overseas_access_policy').allowed(root) };
  }
  return Object.keys(ROUTES).filter((key) => needs(detail, key)).map((key) => {
    const [source, mode, reason] = ROUTES[key], state = itemState(detail, key);
    const permissionWait = source === 'psaOfficial' && !permissions.psaAllowed
      || ['pokedata', 'pokedataAuthenticated'].includes(source) && !permissions.overseasAllowed;
    if (permissionWait) return { key, source, mode: '許諾待ち',
      reason: `${source === 'psaOfficial' ? 'PSA自動取得・公開利用' : 'PokeDATA用途・API契約・公開利用'}の許諾確認待ち・新規取得停止。${state.reason || reason}`,
      status: state.status || '未取得', acquisitionStatus: 'permission-wait', required: REQUIRED.includes(key), nextRetryAt: null };
    const held = state.status === "取得不能" || (key === "pokedata" && ["unsupported-or-unconfirmed", "supported-unmatched"].includes(detail.pk));
    return { key, source, mode: held ? "取得不能・存在未確認／照合待ち" : mode, reason: state.reason || reason,
      status: state.status || "未取得", required: REQUIRED.includes(key), nextRetryAt: state.nextRetryAt || null };
  });
}
function failureState(old = {}, record, now = Date.now()) {
  const success = record.status === "verified";
  const reason = record.error || null;
  const consecutiveSameCause = success ? 0 : old.reason === reason ? Number(old.consecutiveSameCause || 1) + 1 : 1;
  const retry = require("./acquisition_retry.js").failure(old, { ...record, reason }, now);
  const held = !success && retry.held;
  return { lastAttemptAt: record.startedAt, lastSuccessAt: success ? record.endedAt || new Date(now).toISOString() : old.lastSuccessAt || null,
    status: success ? "verified" : retry.status, failures: success ? 0 : retry.attempts,
    consecutiveSameCause, reason, held, kind: success ? null : retry.kind, scope: retry.scope,
    maxAttempts: retry.maxAttempts, waitMs: success ? null : retry.waitMs,
    nextRetryAt: success ? new Date(now + 2 * 86400000).toISOString() : retry.nextRetryAt,
    resumeCondition: success ? null : retry.resumeCondition };
}
module.exports = { REQUIRED, ROUTES, itemState, needs, routes, failureState };
