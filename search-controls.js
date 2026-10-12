(function (root) {
  'use strict';
  const ids = text => new Set(text.split(/\s+/).filter(Boolean));
  const basic = ids('qInput diagnosticSearchInput year2020Input includeUnknownYearInput actualPurchaseMinInput actualPurchaseMaxInput psaMinInput psaMaxInput');
  const operations = ids('importSearchInput importFavoritesInput favoriteSearchInput actualCardIdInput actualBaseDateInput actualSpecimenInput actualInspectionInput actualGradeInput actualSalePriceInput actualGradingFeeInput actualSaleFeeInput importGradeHistoryInput');
  const settings = ids(`psaPlanInput feeInput psaCapitalInput lockedCapitalInput gradingReserveInput submissionCountInput maxCapitalShareInput lockDaysInput minExpectedProfitInput minExpectedRoiInput minAnnualEfficiencyInput saleFeeRateInput saleExtraCostInput buybackDeductionRateInput exitPolicyInput buybackStoreModeInput selectedBuybackStoresInput storeTravelCostInput efficiencyBuyInput efficiencyScenarioInput efficiencySaleDaysInput efficiencyPayoutDaysInput efficiencyManualPriceInput currentMarketManualPriceInput snkrRawFeeRateInput snkrRawShippingInput snkrRawOtherCostInput snkrRawMaxAgeInput`);
  const context = ids('profitSearchBasisInput includePeriodReferenceInput sortInput catalogScopeInput currentMarketSearchKindInput lowRiskAvailabilityInput includeAggressiveInput snkrRawIncludeReferenceInput');
  const protectedFilters = ids('showSkippedInput efficiencyIncludeReferenceInput observationIncludeReferenceInput psa9RatioAggregateInput psa9RatioEstimateInput psa9RatioMarketInput');
  const currentIgnored = ids('profitSearchBasisInput includePeriodReferenceInput stressExpectedProfitFilterInput stressExpectedRoiFilterInput purchaseLimitRatioMinInput fundingOnlyInput goConfidenceFilterInput');
  const capIgnored = ids('roiInput expectedProfitFilterInput expectedRoiFilterInput psa9RatioMinInput psa9RatioMaxInput psa9RatioAggregateInput psa9RatioEstimateInput psa9RatioMarketInput');
  const optionalZero = ids('roiInput expectedProfitFilterInput expectedRoiFilterInput stressExpectedProfitFilterInput stressExpectedRoiFilterInput efficiencyMinInput actualPurchaseMinInput actualPurchaseMaxInput purchaseHeadroomMinInput purchaseHeadroomMaxInput currentMarketCapMinInput');
  const zeroNoOp = ids('saleTxMinInput saleTx7MinInput psaTxMinInput psaTx7MinInput buyback7MinInput buyback30MinInput buyback90MinInput buybackShopsMinInput psaMinInput minExitLiquidityInput minEconomicsInput minMarketStabilityInput minSupplyRiskInput minFuturePriceScoreInput');
  const sharedEarly = ids('qInput diagnosticSearchInput year2020Input includeUnknownYearInput actualPurchaseMinInput actualPurchaseMaxInput purchaseHeadroomMinInput purchaseHeadroomMaxInput purchaseBelowCurrentCapInput postingRate30MinInput postingShops30MinInput postingDaysMinInput postingCoverageMinInput psa9RatioMinInput psa9RatioMaxInput psa9RatioAggregateInput psa9RatioEstimateInput psa9RatioMarketInput catalogScopeInput efficiencyMinInput efficiencyIncludeReferenceInput');
  const labels = {basic:'基本検索', advanced:'詳細検索', calculation:'仕入れ判定・計算設定', context:'探索基準・表示', audit:'データ監査・記録操作'};
  function category(id, inSearch = true) {
    if (!inSearch || operations.has(id)) return 'audit';
    if (basic.has(id)) return 'basic';
    if (settings.has(id)) return 'calculation';
    if (context.has(id)) return 'context';
    return 'advanced';
  }
  function applicable(id, state) {
    const mode = state.purchaseMode;
    if (id.startsWith('observation')) return true;
    if (id.startsWith('snkrRaw')) return mode === 'snkr-raw';
    if (id.startsWith('currentMarket')) return mode === 'current-market';
    if (id === 'lowRiskAvailabilityInput') return mode === 'low-risk';
    if (id === 'includeAggressiveInput') return mode === 'combined';
    if (mode === 'snkr-raw' && id.startsWith('efficiency')) return false;
    if (id === 'efficiencyScenarioInput' && (mode === 'current-market' || state.efficiencyBuy === 'current-cap' || state.efficiencyBuy === 'auto' && state.profitSearchBasis === 'current-cap')) return false;
    if (id === 'efficiencyManualPriceInput' && state.efficiencyBuy && state.efficiencyBuy !== 'manual') return false;
    if (mode === 'snkr-raw' && ['basic','advanced'].includes(category(id)) && !sharedEarly.has(id)) return false;
    if (mode === 'normal' && state.catalogScope && state.catalogScope !== 'analysis' && ['basic','advanced'].includes(category(id)) && !sharedEarly.has(id)) return false;
    if (mode !== 'current-market') return true;
    if (currentIgnored.has(id)) return id === 'profitSearchBasisInput' && state.profitSearchBasis === 'current-cap';
    if (state.currentMarketSearchKind === 'cap' && capIgnored.has(id)) {
      return state.profitSearchBasis === 'current-cap' && ['roiInput','expectedProfitFilterInput','expectedRoiFilterInput'].includes(id);
    }
    return true;
  }
  function removable(id, inSearch = true) {
    return inSearch && category(id) === 'advanced' && !protectedFilters.has(id);
  }
  function active(el) {
    if (el.id === 'observationIncludeReferenceInput') return true;
    if (['hidden','file'].includes(el.type)) return false;
    if (el.type === 'checkbox') return el.checked;
    const value = String(el.value ?? '');
    if (!value || value === 'all') return false;
    if (el.tagName === 'SELECT') return category(el.id) === 'advanced' || String(el.value) !== String(el.dataset.searchInitialValue);
    return value !== '0' || optionalZero.has(el.id) || !zeroNoOp.has(el.id);
  }
  function clear(el) {
    if (!removable(el.id)) return false;
    if (el.type === 'checkbox') el.checked = false;
    else if (el.tagName === 'SELECT') {
      if (![...el.options].some(o => o.value === 'all')) return false;
      el.value = 'all';
    } else el.value = '';
    return true;
  }
  function describe(id) {
    if (id.startsWith('observation')) return {purpose:'国内PSA10の日次観測平均との乖離で参考探索',basis:'現相場÷7/30/90/200暦日観測平均−1。欠測補完なし・複数期間AND',effect:'指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効',overlap:'実成約平均・将来予測・仕入れ上限・購入GOとは別'};
    if (operations.has(id)) return {purpose:'保存条件の読み込み／お気に入り検索／実鑑定・実売記録',basis:'利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない',effect:'操作しない限り検索・安全条件は変わらない。記録は削除対象にしない',overlap:'日次取得・自動探索・本番モデルの変更とは別'};
    if (settings.has(id)) return {purpose:'計算の費用・出口・資金・仮定を設定', basis:'選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映', effect:'カードの計算値・安全判定に影響。検索条件だけの解除では変更しない', overlap:'検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別'};
    if (id.includes('Ratio') && id.includes('psa9')) return {purpose:'国内PSA9価格との買値比率で探索', basis:'実店舗または明示した参考買値÷国内PSA9。実成約・集計・推定は別', effect:'選択した根拠と上下限に不適合なら除外', overlap:'費用込みPSA9赤字回避上限・GOとは別'};
    if (id.includes('Headroom') || id === 'purchaseBelowCurrentCapInput') return {purpose:'購入価格と現相場損益分岐上限を比較', basis:'新鮮な状態A在庫価格と算出可能な現相場上限', effect:'欠損・古値・在庫なし・比較条件外を除外。PSA9日時不明のみは参考比較', overlap:'余裕率は利益率ではない。厳密な小なりチェックと率0%以上は同額境界が異なる'};
    if (id.startsWith('efficiency')) return {purpose:'カード単体の年換算資金効率で探索', basis:'指定買値・出口・シナリオの期待利益÷総投下額×365÷拘束日数', effect:'下限に満たない、計算不能、参考値非採用を除外', overlap:'判定用の最低年換算効率は別。新指標でGO昇格しない'};
    if (/Profit|Roi|roiInput/.test(id)) return {purpose:'選択中の採算で絞り込み', basis:'検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別', effect:'空欄は無効、0は非負。必要データ不足と赤字は別除外', overlap:'GOの最低利益条件とは独立。ストレス利益も中央利益とは別'};
    if (/Forecast|forecast|Floor|floor|Direction|Supply|supply|Stability|Demand/.test(id)) return {purpose:'予測・市場スコアを参考探索', basis:'表示された期間・履歴・供給吸収指標。履歴不足は未算出', effect:'指定値・分類に不適合または欠損なら除外', overlap:'実価格、期待利益、GOと同義ではない。発売年と成熟年数も別'};
    if (/buyback|posting/.test(id)) return {purpose:'利用可能な買取掲載・価格・観測量で探索', basis:'選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない', effect:'指定件数・カバー率・期間の不足で除外', overlap:'現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない'};
    if (/Tx|tx/.test(id)) return {purpose:'取引量の期間別検索', basis:'ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない', effect:'指定上下限外または未取得を除外', overlap:'PSA10／素体／スニダンを合算しない。買取掲載も別'};
    return {purpose:basic.has(id)?'日常検索の名称・発売年・価格帯を指定':'表示された属性・対象範囲で絞り込み／表示基準を選択', basis:'ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない', effect:context.has(id)?'探索・並び・参考値の採用基準を保持':'条件に不適合なカードを除外。欠損は0にしない', overlap:'似た名称でも市場／買値／時点が異なる条件は統合しない'};
  }
  const api = {category, labels, applicable, removable, active, clear, describe};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SearchControls = api;
})(typeof window === 'object' ? window : globalThis);
