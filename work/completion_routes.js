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
};
function itemState(detail, key) {
  const value = detail.i?.[key];
  return Array.isArray(value) ? { status: value[0], lastAttemptAt: value[1], lastSuccessAt: value[2], retryCount: value[3], reason: value[4], nextRetryAt: value[5] } : { status: value };
}
function needs(detail, key) { return itemState(detail, key).status !== "取得済み"; }
function routes(detail) {
  return Object.keys(ROUTES).filter((key) => needs(detail, key)).map((key) => {
    const [source, mode, reason] = ROUTES[key], state = itemState(detail, key);
    const held = state.status === "取得不能" || (key === "pokedata" && ["unsupported-or-unconfirmed", "supported-unmatched"].includes(detail.pk));
    return { key, source, mode: held ? "取得不能・存在未確認／照合待ち" : mode, reason: state.reason || reason,
      status: state.status || "未取得", required: REQUIRED.includes(key), nextRetryAt: state.nextRetryAt || null };
  });
}
function failureState(old = {}, record, now = Date.now()) {
  const success = record.status === "verified";
  const reason = record.error || null;
  const consecutiveSameCause = success ? 0 : old.reason === reason ? Number(old.consecutiveSameCause || 1) + 1 : 1;
  const held = !success && (consecutiveSameCause >= 2 || record.status === "manual-wait" || /HTTP (401|403)|同一カード|形式/.test(reason || ""));
  return { lastAttemptAt: record.startedAt, lastSuccessAt: success ? record.endedAt || new Date(now).toISOString() : old.lastSuccessAt || null,
    status: success ? "verified" : held ? "manual-wait" : record.status, failures: success ? 0 : Number(old.failures || 0) + 1,
    consecutiveSameCause, reason, held, nextRetryAt: held ? "9999-12-31T00:00:00Z" : new Date(now + (success ? 2 * 86400000 : 3600000 * 2 ** Math.min(3, old.failures || 0))).toISOString(),
    resumeCondition: held ? "原因確認・正規URLまたは認証の復旧後に該当項目だけ再開" : null };
}
module.exports = { REQUIRED, ROUTES, itemState, needs, routes, failureState };
