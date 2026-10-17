# 検索・設定・一覧の棚卸し

使用履歴は未収集。項目を未使用とは断定せず、今回廃止した計算・検索機能はありません。
初期値はHTML既定値。公式プラン読込・URL・端末保存・プリセット操作後の値は画面の出所表示で区別します。モード表は分析可能範囲の条件。通常モードの全カード掲載探索ではPSA計算条件の一部が不適用です。
既存URL、保存キー、CSV、初期値を維持。追加条件の解除は明示操作のみ。費用・売却先・資金・GO条件・お気に入り・探索基準は保護します。
現相場の上限探索では購入利益条件等が不適用。条件は保存し、モードを戻すと適用されます。国内／海外、集計／実成約／推定は混合しません。

## 基本検索

| ID／項目 | 初期値 | 適用モード | 目的・基準 | 除外への影響／重複 |
| --- | --- | --- | --- | --- |
| `qInput` 検索 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `diagnosticSearchInput` 診断表示（検索カードだけ条件外でも表示） | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `year2020Input` 2020年以降 | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `includeUnknownYearInput` 年不明も含める | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `actualPurchaseMinInput` 現在買える状態A価格 下限（円） | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `actualPurchaseMaxInput` 現在買える状態A価格 上限（円） | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `psaMinInput` PSA10 下限 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `psaMaxInput` PSA10 上限 | 200000 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 日常検索の名称・発売年・価格帯を指定：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |

## 探索基準・表示

| ID／項目 | 初期値 | 適用モード | 目的・基準 | 除外への影響／重複 |
| --- | --- | --- | --- | --- |
| `sortInput` 並び順 | overall-desc | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `lowRiskAvailabilityInput` 候補内 | all | low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `snkrRawIncludeReferenceInput` 参考候補も含める | false | snkr-raw | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `includeAggressiveInput` おまかせ総合に攻め候補を含める | false | combined | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `currentMarketSearchKindInput` 現相場専用：探索方法 | cap | current-market（上限探索）／current-market（購入採算）／current-market（上限買値） | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `catalogScopeInput` 表示範囲 | analysis | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `profitSearchBasisInput` 利益検索・表示・並び順の買値 | auto | normal／combined／current-market（上限買値）／snkr-raw／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `includePeriodReferenceInput` 価格待ち探索に期間不一致の参考値を含める（GO不可） | true | normal／combined／snkr-raw／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 探索・並び・参考値の採用基準を保持。似た名称でも市場／買値／時点が異なる条件は統合しない |

## データ監査・記録操作

| ID／項目 | 初期値 | 適用モード | 目的・基準 | 除外への影響／重複 |
| --- | --- | --- | --- | --- |
| `importSearchInput` 条件CSV読込 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `importFavoritesInput` CSV読込 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `favoriteSearchInput` お気に入りを検索 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualCardIdInput` カードID | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualBaseDateInput` 判定日 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualSpecimenInput` 個体メモ | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualInspectionInput` 仕入れ時の目視判定 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualGradeInput` 鑑定結果 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualSalePriceInput` 実売価格（売却時だけ） | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualGradingFeeInput` 実鑑定費 | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `actualSaleFeeInput` 売却手数料% | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |
| `importGradeHistoryInput` 別ブラウザの記録を読み込む | 空欄 | 検索外操作 | 保存条件の読み込み／お気に入り検索／実鑑定・実売記録：利用者が選択したCSV・カード・日付・実結果。推定結果で実現利益を作らない | 操作しない限り検索・安全条件は変わらない。記録は削除対象にしない。日次取得・自動探索・本番モデルの変更とは別 |

## 詳細検索

| ID／項目 | 初期値 | 適用モード | 目的・基準 | 除外への影響／重複 |
| --- | --- | --- | --- | --- |
| `currentMarketCapMinInput` 現相場の期待損益分岐上限 下限（円） | 空欄 | current-market（上限探索）／current-market（購入採算）／current-market（上限買値） | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `snkrRawTx7MinInput` 素体7日取引 下限 | 0 | snkr-raw | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `snkrRawTx30MinInput` 素体30日取引 下限 | 3 | snkr-raw | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `snkrRawProfitMinInput` 最低利益額 | 0 | snkr-raw | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `snkrRawRoiMinInput` 最低利益率 | 0 | snkr-raw | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `snkrRawPurchaseMaxInput` 最大購入価格 | 空欄 | snkr-raw | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `snkrRawReleaseMonthsInput` 発売からの経過月数 上限 | 空欄 | snkr-raw | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `snkrRawCurrentOnlyInput` 現行レギュレーションのみ | false | snkr-raw | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `snkrRawRecentOnlyInput` 新しいカードのみ | false | snkr-raw | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `hideThinDemandInput` 取引・買取掲載ともにゼロのカードを通常候補から一時非表示 | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `observation7MinInput` 7日乖離率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation7MaxInput` 7日乖離率 上限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation30MinInput` 30日乖離率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation30MaxInput` 30日乖離率 上限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation75MinInput` 75日乖離率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation75MaxInput` 75日乖離率 上限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation200MinInput` 200日乖離率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observation200MaxInput` 200日乖離率 上限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `observationIncludeReferenceInput` 観測不足の参考平均を含める（乖離率・平均資金効率／購入GOとは別） | true | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 国内PSA10の日次観測平均との乖離で参考探索：現相場÷7/30/75/200暦日観測平均−1。欠測補完なし・複数期間AND | 指定期間のみ未取得／参考非採用／上下限外を除外。空欄無効、0有効。実成約平均・将来予測・仕入れ上限・購入GOとは別 |
| `purchaseHeadroomMinInput` 仕入れ余裕率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 購入価格と現相場損益分岐上限を比較：新鮮な状態A在庫価格と算出可能な現相場上限 | 欠損・古値・在庫なし・比較条件外を除外。PSA9日時不明のみは参考比較。余裕率は利益率ではない。厳密な小なりチェックと率0%以上は同額境界が異なる |
| `purchaseHeadroomMaxInput` 仕入れ余裕率 上限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 購入価格と現相場損益分岐上限を比較：新鮮な状態A在庫価格と算出可能な現相場上限 | 欠損・古値・在庫なし・比較条件外を除外。PSA9日時不明のみは参考比較。余裕率は利益率ではない。厳密な小なりチェックと率0%以上は同額境界が異なる |
| `purchaseBelowCurrentCapInput` 現在買える状態A価格 ＜ 現相場の期待損益分岐上限 | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 購入価格と現相場損益分岐上限を比較：新鮮な状態A在庫価格と算出可能な現相場上限 | 欠損・古値・在庫なし・比較条件外を除外。PSA9日時不明のみは参考比較。余裕率は利益率ではない。厳密な小なりチェックと率0%以上は同額境界が異なる |
| `efficiencyMinInput` 単体・年換算資金効率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |
| `efficiencyIncludeReferenceInput` 資金効率の参考値も検索・順位に含める PSA9日時未確認・平均の欠測ありなど。観測乖離率検索の参考採用とは別設定。価格対立・仕様不一致・古い購入価格・買取出口不足は通しません。購入GOとは別です。 | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |
| `roiInput` PSA10時利益率 下限 | 40 | normal／combined／current-market（購入採算）／current-market（上限買値）／low-risk | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `expectedRoiFilterInput` 期待利益率 下限 | 0 | normal／combined／current-market（購入採算）／current-market（上限買値）／low-risk | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `expectedProfitFilterInput` 期待利益額 下限 | 0 | normal／combined／current-market（購入採算）／current-market（上限買値）／low-risk | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `postingRate30MinInput` 30日買取掲載率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `postingShops30MinInput` 30日平均掲載店舗数 下限 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `postingDaysMinInput` 買取掲載の最低観測日数 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `postingCoverageMinInput` 買取掲載取得カバー率 下限 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `stressExpectedRoiFilterInput` 安全側利益率 下限 | 0 | normal／combined／low-risk | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `stressExpectedProfitFilterInput` 安全側利益額 下限 | 0 | normal／combined／low-risk | 選択中の採算で絞り込み：検索買値・出口・現在／中央／ストレスを分離。PSA10利益率と期待利益率は別 | 空欄は無効、0は非負。必要データ不足と赤字は別除外。GOの最低利益条件とは独立。ストレス利益も中央利益とは別 |
| `psa9RatioMinInput` 仕入れ値／国内PSA9 下限 % | 空欄 | normal／combined／current-market（購入採算）／snkr-raw／low-risk | 国内PSA9価格との買値比率で探索：実店舗または明示した参考買値÷国内PSA9。実成約・集計・推定は別 | 選択した根拠と上下限に不適合なら除外。費用込みPSA9赤字回避上限・GOとは別 |
| `psa9RatioMaxInput` 仕入れ値／国内PSA9 上限 % | 空欄 | normal／combined／current-market（購入採算）／snkr-raw／low-risk | 国内PSA9価格との買値比率で探索：実店舗または明示した参考買値÷国内PSA9。実成約・集計・推定は別 | 選択した根拠と上下限に不適合なら除外。費用込みPSA9赤字回避上限・GOとは別 |
| `psa9RatioAggregateInput` 国内PSA9集計値を含める | false | normal／combined／current-market（購入採算）／snkr-raw／low-risk | 国内PSA9価格との買値比率で探索：実店舗または明示した参考買値÷国内PSA9。実成約・集計・推定は別 | 選択した根拠と上下限に不適合なら除外。費用込みPSA9赤字回避上限・GOとは別 |
| `psa9RatioEstimateInput` PSA9推定値を含める（素体由来は検索対象外） | false | normal／combined／current-market（購入採算）／snkr-raw／low-risk | 国内PSA9価格との買値比率で探索：実店舗または明示した参考買値÷国内PSA9。実成約・集計・推定は別 | 選択した根拠と上下限に不適合なら除外。費用込みPSA9赤字回避上限・GOとは別 |
| `psa9RatioMarketInput` 購入価格未取得時の相場参考買値を含める | false | normal／combined／current-market（購入採算）／snkr-raw／low-risk | 国内PSA9価格との買値比率で探索：実店舗または明示した参考買値÷国内PSA9。実成約・集計・推定は別 | 選択した根拠と上下限に不適合なら除外。費用込みPSA9赤字回避上限・GOとは別 |
| `saleTxMinInput` みんトレ素体・全状態件数 直近30日 | 30 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `saleTxMaxInput` みんトレ素体・全状態件数 直近30日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `saleTx7MinInput` みんトレ素体・全状態件数 直近7日 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `saleTx7MaxInput` みんトレ素体・全状態件数 直近7日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `psaTxMinInput` PSA10件数 直近30日 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `psaTxMaxInput` PSA10件数 直近30日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `psaTx7MinInput` PSA10件数 直近7日 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `psaTx7MaxInput` PSA10件数 直近7日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 取引量の期間別検索：ラベルの市場・グレード・7／30日。素体全状態は状態A限定成約ではない | 指定上下限外または未取得を除外。PSA10／素体／スニダンを合算しない。買取掲載も別 |
| `priceMinInput` 素体参考相場（中央値）の価格帯 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `priceMaxInput` 素体参考相場（中央値）の価格帯 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `purchaseLimitRatioMinInput` 現実的な仕入れ上限 相場比下限 | 空欄 | normal／combined／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `buyback7MinInput` 買取表掲載日数 直近7日 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buyback7MaxInput` 買取表掲載日数 直近7日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buyback30MinInput` 買取表掲載日数 直近30日 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buyback30MaxInput` 買取表掲載日数 直近30日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buyback90MinInput` 買取表掲載日数 直近90日 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buyback90MaxInput` 買取表掲載日数 直近90日 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buybackShopsMinInput` 買取表掲載ショップ数 下限 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buybackPriceMinInput` 現在のPSA10買取価格帯 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `buybackPriceMaxInput` 現在のPSA10買取価格帯 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 利用可能な買取掲載・価格・観測量で探索：選択対象店舗、指定7／30／90日。掲載回数は実買取件数ではない | 指定件数・カバー率・期間の不足で除外。現在掲載、継続掲載、正常店舗日分母は別。失敗を未掲載にしない |
| `psaRateMinInput` PSA10公式取得率 下限 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `overallFilterInput` 銘柄品質で絞る | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `minExitLiquidityInput` 売りやすさ 下限点 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `minEconomicsInput` 利益条件 下限点 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `minMarketStabilityInput` 銘柄品質内・従来価格安定 下限点 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minSupplyRiskInput` 供給リスク耐性 下限点 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `stockDemandInput` 在庫減少ペースで絞る | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `dataQualityFilterInput` データ分類で絞る | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `goConfidenceFilterInput` GO信頼度で絞る | all | normal／combined／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `showSkippedInput` 見送りも表示 | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `hideReviewInput` 手動確認を除外 | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `fundingOnlyInput` 今回の仕入れGOのみ | false | normal／combined／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `officialOnlyInput` PSA公式取得済みのみ | false | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `floorStateInput` 下値状態 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `priceDirectionInput` 価格方向 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `supplyStateInput` 需給状態 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minFloorScoreInput` 下値安定 下限点 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `storeDemandInput` 店舗需要 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minForecastPriceInput` 91日後の推計・中央価格 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `maxForecastPriceInput` 91日後の推計・中央価格 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minForecastDownsideInput` 予測下落余地 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `maxForecastDownsideInput` 予測下落余地 % | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minForecastGapInput` PSA10 ÷ 平均美品 倍率 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `maxForecastGapInput` PSA10 ÷ 平均美品 倍率 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minFuturePriceScoreInput` 将来価格評価 点数 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `maxFuturePriceScoreInput` 将来価格評価 点数 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 表示された属性・対象範囲で絞り込み／表示基準を選択：ラベルのカード属性・価格種別・選択モードを使用。取得日は発売年ではない | 条件に不適合なカードを除外。欠損は0にしない。似た名称でも市場／買値／時点が異なる条件は統合しない |
| `forecastPhaseInput` 予測局面 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `forecastConfidenceInput` データ充足度 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `forecastSupplyPressureInput` PSA10供給圧力 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `minForecastAgeInput` 発売からの経過年数 下限 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `forecastMaturityInput` 供給成熟度 | all | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |
| `maxForecastMonthlyIncreaseInput` PSA10 30日換算増加 上限枚数 | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | 予測・市場スコアを参考探索：表示された期間・履歴・供給吸収指標。履歴不足は未算出 | 指定値・分類に不適合または欠損なら除外。実価格、期待利益、GOと同義ではない。発売年と成熟年数も別 |

## 仕入れ判定・計算設定

| ID／項目 | 初期値 | 適用モード | 目的・基準 | 除外への影響／重複 |
| --- | --- | --- | --- | --- |
| `currentMarketManualPriceInput` 店舗価格未取得時の手入力試算買値（円） | 空欄 | current-market（上限探索）／current-market（購入採算）／current-market（上限買値） | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `snkrRawFeeRateInput` スニダン販売手数料率 | 7 | snkr-raw | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `snkrRawShippingInput` 発送・梱包費 | 210 | snkr-raw | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `snkrRawOtherCostInput` その他費用 | 0 | snkr-raw | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `snkrRawMaxAgeInput` データ取得からの経過時間 上限 | 48 | snkr-raw | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `psaPlanInput` PSA Japan 鑑定プラン | standard | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `feeInput` PSA Japan 鑑定プラン | 12980 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `psaCapitalInput` PSA運用の総資金 | 500000 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `lockedCapitalInput` ロック中資金 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `lockDaysInput` 資金ロック日数 | 91 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `minExpectedProfitInput` 最低期待利益 | 10000 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `minExpectedRoiInput` 最低期待利益率 | 30 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `minAnnualEfficiencyInput` 最低年換算資金効率 | 40 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `maxCapitalShareInput` 1枚の最大資金占有率 | 10 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `submissionCountInput` 同時提出予定枚数 | 10 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `gradingReserveInput` 返却時の鑑定費予備資金 | 129800 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `saleFeeRateInput` 売却手数料率 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `saleExtraCostInput` 送料など販売経費 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `buybackDeductionRateInput` PSA10買取店の減額リスク | 3 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `exitPolicyInput` 売却出口の方針 | buyback | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `buybackStoreModeInput` 利用する買取店 | selected | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `selectedBuybackStoresInput` 指定店舗ID（カンマ区切り） | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `storeTravelCostInput` 店頭交通費等／1枚 | 0 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／snkr-raw／low-risk | 計算の費用・出口・資金・仮定を設定：選択した鑑定プラン／出口／想定率。利益目標と資金は既存GO・上限計算へ反映 | カードの計算値・安全判定に影響。検索条件だけの解除では変更しない。検索の利益下限とは別。単体資金効率の待ち日数も判定用年換算とは別 |
| `efficiencyBuyInput` 資金効率の買値 | median | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |
| `efficiencyManualPriceInput` 手入力買値（円） | 空欄 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |
| `efficiencyScenarioInput` 資金効率の売値シナリオ | current | normal／combined／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |
| `efficiencySaleDaysInput` 売却待ち 日数 | 7 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |
| `efficiencyPayoutDaysInput` 入金待ち 日数 | 3 | normal／combined／current-market（上限探索）／current-market（購入採算）／current-market（上限買値）／low-risk | カード単体の期待資金効率を探索・比較：指定買値・出口・拘束日数。平均仮定ではPSA10だけ日次観測平均／非10は現在国内PSA9 | 資金効率の表示・検索・順位・CSVのみ。上限・購入GOの式へ反映しない。判定用年換算条件と観測乖離率の参考採用は別。欠測平均を採用する場合は参考値設定で明示 |

## ボタン・設定変更の入口

| ID／入口 | 分類 | 目的・影響 |
| --- | --- | --- |
| `curated` 厳選候補 従来のおまかせ同等の厳格条件 | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `combined` おまかせ総合 候補を重複なしでまとめる | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `current-market` 現相場採算で探す 現相場維持の仮定探索・購入GOとは別 | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `now` 今すぐ仕入れ 新しい在庫あり価格が上限以下 | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `aggressive` 攻め仕入れ圏 期待値は黒字・PSA9時赤字あり | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `low-risk` 低リスク候補 価格待ちを含む | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `turnover` 高回転候補 厳格AND条件・価格待ちを含む | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `bargain` 薄商い・高粗利 少数成約でも出口あり | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `snkr-raw` スニダン素体流し PSA判定とは別・手数料後の価格差 | 基本検索 | プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない |
| `exportSearchBtn` 条件をCSV保存 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `resetFiltersBtn` 従来の検索条件一括初期化（詳細操作） | 記録・表示操作 | 従来の広範囲検索初期化。年/名称/参考値採用も対象のため通常は追加条件だけ解除を使用 |
| `roiFocusButton` 利益率中心（最低利益額だけ0円） | 仕入れ判定・計算設定 | 明示操作で判定用の最低利益額だけ0円。計算利益・利益率・年換算・GO安全条件は維持 |
| `guide70Btn` 10率70%基準 | 仕入れ判定・計算設定 | 設定10率70%/50%を変更。公式取得率があるカードは公式優先。未知の実績率で自動補正しない |
| `guide50Btn` 10率50%基準 | 仕入れ判定・計算設定 | 設定10率70%/50%を変更。公式取得率があるカードは公式優先。未知の実績率で自動補正しない |
| `copyFavoritesBtn` メモ用にコピー | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `exportFavoritesBtn` CSV保存 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `exportFavoritePriorityBtn` 優先更新IDを保存 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `clearFavoritesBtn` すべて解除 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `button-18` 実鑑定結果を保存 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `exportGradeHistoryBtn` 鑑定記録をJSONで書き出す | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `openFavoritesBtn` 仕入れ候補 0 枚 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `copyLinkBtn` この条件をURLに反映 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `benchmarkSearchButton` 同条件で3回ずつ比較 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `loadMoreBtn` さらに60枚表示 | 記録・表示操作 | ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別 |
| `data-clear-extra-conditions` 追加検索条件だけ解除 | 基本検索 | 利用者の明示操作のみ。費用・出口・資金・GO基準・参考採用・基本の年/価格帯・お気に入りは保持 |
| `data-clear-condition` 個別の追加条件 × | 基本検索 | その検索フィルターだけ解除。計算値や安全判定を0に置換しない |

## かんたん絞り込み・入口

| プリセット | 目的・基準／初期状態 |
| --- | --- |
| 厳選候補 | 従来の厳格な国内出口・上限・ストレス・信頼性のAND条件。購入GOとは別 |
| おまかせ総合 | 今すぐ／低リスク／高回転／安全条件を満たす価格待ちを重複なく集約 |
| 現相場採算で探す | 現在出口相場維持の仮定。上限探索と実購入黒字探索を分離、購入GOへ昇格しない |
| 今すぐ仕入れ | 新鮮な状態A在庫価格で再判定し、全購入条件を満たす対象のみ |
| 攻め仕入れ圏 | ストレス期待黒字でもPSA9損失ありを通常GOと分離 |
| 低リスク候補 | 超低リスク上限の候補。価格待ちを含み、購入可能と同義ではない |
| 高回転候補 | PSA10の30日15件・素体全状態30日20件・利用可能買取30日1店・売りやすさ70点のAND |
| 薄商い・高粗利 | 少数成約でも国内出口・安全条件のある探索。見送りを含めない |
| スニダン素体流し | PSA提出と別採算。許諾待ちと古値を利益候補にしない |

追加条件はプリセットとAND。プリセット変更で費用・売却先・年条件・保存条件を自動解除しない。初期モードは従来normalを維持。

## 統合・廃止候補

- 入口のみ統合：鑑定プラン・出口・費用は計算設定、採算フィルターは詳細検索。並び順は基本画面へ。
- PSA10利益率と期待利益率、現在価格と予測、検索下限とGO条件は意味が違うため存続。
- 素体参考相場と購入可能価格、掲載回数と実買取件数も存続。類似スコアの廃止は影響検証と明示移行なしには行わない。
- 従来の全条件初期化入口は名称を明確化し詳細に残す。追加条件のみ解除を別操作として用意。

## 一覧表示

主表示：判定／購入先・価格／PSA10現在相場／安定上限／現相場損益分岐上限（推奨値ではない）／想定10率／検索と同じ採算／重要警告。
常時表示：7/30/75/200暦日観測平均・現相場との乖離・観測日数。中央値/欠測/利益計算の根拠は展開表示。買取掲載・PSA9比率・補完優先理由・モデル比較・監査・取引履歴は必要時に開く。取得元・鮮度・価格対立・仕様保留・期間不一致の警告は隠さない。
