# 2026-11-11 中央値の主計算・監視停止の復旧

前台帳 REQUEST_STATUS.md / 20261111_OPERATIONS.md を継承。前回の実店舗買値への統一は履歴として残し、今回の利用者指定で主計算を素体参考相場・中央値へ変更する。仕入れ上限の逆算式、採用10率、費用式、GO、海外凍結、撤廃店舗、通常AI呼出0、AI予定停止は不変。

## 今回の変更

- calcBuy=median は新鮮な独立2店舗以上・同一仕様/状態・対立なしの根拠から中央値を採用。期待利益/ROI/年換算・利益検索・順位・CSVは同じ買値/出口/売価シナリオ/費用/率。中央値不足では店舗価格/仕入れ目安に代用しない。中央値の確認日時は採用原票の最も古い確認時刻を示し、再集計時刻に付け替えない。
- 初期主計算は中央値。旧保存は買値モードだけ一度移行し、移行前全設定を端末内に退避。50%を含む率・費用・検索条件・中央値割合は保持。calcBuyを明示した旧URLは比較用として意味を保持し、新正式URLの中央値指定が保存より優先する。
- 利益確保の仕入れ目安は小さい補足で近くに残し、循環入力なし。実店舗採算は別表示。中央値の○%で購入する追加試算は同じ計算を再利用し、主検索/GOには不採用。
- 正式条件は work/priority-search-profiles.json の V-median-main-20261111 / B-median-main-20261111。旧正式条件・比較履歴は削除しない。他の価格範囲/PSA9参考採用等の条件は保持する。

## 監視の故障と検証

42944815043は公開照合成功後にwatch集計で停止。effective_price_cadence.js の Math.max(...全確認間隔) が引数上限へ達した。履歴を切り捨てず、分布計算を一度だけ行い末尾から最大値を採る。同様の実行空白集計もreduceへ変更。22,306,942bytes・185実行の保存履歴で集計成功、20万間隔の回帰でも最大/中央値・全履歴保持を検証。

直近定期Priority42942724115は共通2時間間隔内（経過5,720,737ms）でスキップ。取得・公開とも未実施で、正常取得へ加算しない。Watch失敗・公開失敗・公開後警告・実取得スキップを区別し、過去失敗は消さない。

## 同一データ・時計の候補差

2026-11-11T04:19:44.397Z、同じ保存データで旧実店舗バリュー26/プライオリティ22・独立44、新中央値21/19・独立37。追加6/離脱13は買値基準変更差。新規取得/不足解消/初適合として計上しない。離脱のうち9枚は新鮮な独立複数店舗の中央値不足、残り4枚は中央値買値へ変わった結果の比率/採算不合格。市場価格が今回悪化したという意味ではない。ID/前後値は work/20261111-median-main-results.json。

## 実データ・制約と次工程

主計算・監視改修時点では新規取得0・新規紐付け0・新基準日0・新規分析可能0（後続のGemRate新CSV成果は末尾）。保存済みの前回Daily成果を今回の取得へ再加算しない。既知取得元12,983枚は掲載100%、補足11枚を含む12,994枚の構造的分析可能2,596（19.98%）、必須公式POP鮮度込み0。全ポケカ網羅率ではない。95%には12,345枚・あと9,749枚。現行自動経路だけで最後まで補完可能0、保存再照合のみ126枚は根拠確認前。期間別件数未提供8,060枚等の理由別は重複あり。未提供への専用反復要求はしない。

GemRateは参考672枚/比較可能109枚/計算採用0を維持。11月11日12:46JSTの受領処理は成功したが、提供元確認0/10・新CSV0・基準日前進率未計測。元基準日は10月31日/11月1日のまま。止まっているのは新データ取得・確認証跡の入口で、受領後処理の再実行では更新しない。拡張導入済み/ONを未導入へ戻さず、稼働状態/hold/config読込/receipt転送をChrome拡張接続で確認する必要がある。403・提供元未更新・本人操作不足とは未確定。Chrome拡張接続は利用できることを後続確認した（ブラウザID3）。当初の操作ツール不在という記載は訂正。失敗したWindows画面認識は使用していない。PC-OFFのクラウド受領/公開と、PC-ON拡張のCSV新取得を分離する。

カードラッシュ/遊々亭は保存紐付けとHTTP取得停止を分離。停止原票/URLは保持し、過去403を規約禁止とは断定しない。新鮮価格が取れない間は古値を復活させず、利用可能店舗で独立根拠を補う。中央値不足の9枚は既存のreferenceMedian補完経路へ引き継ぐ。マリィ140/S-Pの元HTTP原票、期間別件数、PSA9直近実成約平均、POP正規継続取得、需給/返却時検証・91/119日比較も未完了。

## 性能・公開確認

固定予算は変更しない。PC/スマホ390px・通常/2倍の実DOMで、主買値・利益・ROI・CSV一致、候補ID一致、横はみ出しなし。追加割合変更後も小詳細を保持。ローカル同時計の初期表示はPC旧3.75秒/新3.93秒、スマホ旧3.69秒/新4.03秒、2倍約6.7秒（単発測定・ネットワーク実速度とは別）。詳細を開いた後の通信量を初期通信量へ混ぜない。原票/長期履歴の初期追加なし。

最終のPR/公開・実定期運転は、その実績を確認してから追記する。手動成功を複数周期の維持成功に読み替えない。

## 遊々亭の通常URL確認・誤解析隔離

11月11日13:31 JST、Cookieなしの既知URL svpromo-100/10062 はHTTP200・234,094bytes。現在商品は062/SV-P、12,800円、在庫3、cart_kizu=0。既存一覧パーサーは前後商品10061/10063のリンクに現在商品の価格を付けた2行を返した。採用0・停止解除0。商品ページは一覧として解析しない共通ガードを追加し、実原票と前後リンクfixtureで検証。正常な一覧解析は維持する。次工程は商品ID/言語/加工/状態を照合する直URLパーサー、既知URL更新枠、クラウド少数通常アクセスの順。PCの200をクラウド取得再開/継続更新成功とは扱わず、HTTP403や認証保留を一括解除しない。

## GemRateの新CSV受領（公開完了とは別）

Chromeで通常ページの表示と現在URL取得を確認。SV2Aの11月6日、S8B/SV4Aの11月7日基準を確認し、各1回の通常CSV出力で実ファイルを受領した。SV2Aの操作ツールdownload通知は30秒でタイムアウトしたが、同時刻の実CSVが存在し、全527行・PSA10合計742,567/総926,431が画面と一致。以後は同じ通知待ちを反復せず通常出力各1回と実ファイル/全行合計で確認した。GemRate403/本人操作不足には分類しない。SV2A119枚、S8B133枚は確定対応を再利用し新基準日の観測を非公開保存。新規紐付け/国内分析可能へは加算しない。原票/圧縮バックアップ/hash/仕様保留を保持。新規取得はPCの操作支援による単発であり、無人継続取得成立とは別。自動拡張の確認証跡0/10と今回の手動確認3/10を混ぜない。

3セット計1,317行の検証後、新基準日の観測341枚（既存対応再利用119+133+89、新規紐付け0）を保存。参考対象672枚不変、比較可能109→450枚の投影を検証し、6d17d0adへ公開キュー登録。キュー登録を公開完了とは数えず、実公開確認後に最終状態を追記する。国内新規分析可能0・計算採用0。

## 公開画面確認・13:47 JST

PR #40（76da2e69）はPages42959891091成功。Chromeで公開の正式URLに保存追加条件を一時不適用とする savedFilters=ignore を付け、バリュー21枚/プライオリティ19枚を現在時計で確認。端末保存条件は削除しない。利益/資金効率に同じ中央値、同じ期待利益を表示。PCで横はみ出しなし。公開Chromeの390px指定は実innerWidth1920のままで適用を確認できず、公開スマホ試験は未確認として残す。ローカルの独立390px試験は通過（同じ公開JS・PC/通常/2倍の値一致）。

[新正式バリュー](https://urm759.github.io/pokeka-serch/?fee=6980&tx=0&tx7=0&psaTx=0&psaTx7=0&roi=20&psaMin=10000&sort=cardEfficiency-desc&guide=80&cap=5000000&lock=175&expProfit=0&expRoi=10&annual=40&maxShare=120000&batch=10&reserve=1000000&sellFee=8&extraCost=0&psaPlan=value&bb7=0&bb30=0&bb90=0&bbShops=0&locked=3500000&priceMin=0&buyLimitRatio=0&buybackDeduction=5&preset=combined&psa9RatioMin=70&psa9Aggregate=1&psa9Estimate=0&psa9Market=1&exitPolicy=both&buybackStores=all&selectedStores=&storeTravel=0&snkrFee=7&snkrShip=210&snkrOther=0&snkrTx7=0&snkrTx30=3&snkrProfit=0&snkrRoi=0&snkrAge=48&year2020=0&includeUnknownYear=0&profitBasis=auto&periodReference=1&psa9RatioMax=120&marketSearch=cap&marketCapMin=0&filterStressRoi=0&filterStressProfit=0&buyBelowCap=0&purchaseMin=0&purchaseMax=30000&effMin=30&effManual=off&sellDays=7&payoutDays=3&effBuy=median&effScenario=current&effRef=1&headroomMin=-25&psa9AboveGuide=0&psa9Cost5=0&filterExpRoi=15&filterExpProfit=5000&psaMax=100000&bbRatioRef=0&calcBuy=median&medianBuyPct=off) / [新正式プライオリティ](https://urm759.github.io/pokeka-serch/?fee=12980&tx=0&tx7=0&psaTx=0&psaTx7=0&roi=20&psaMin=0&sort=cardEfficiency-desc&guide=70&cap=5000000&lock=91&expProfit=0&expRoi=10&annual=40&maxShare=120000&batch=10&reserve=1000000&sellFee=8&extraCost=0&psaPlan=priority&bb7=0&bb30=0&bb90=0&bbShops=0&locked=3500000&buyLimitRatio=0&buybackDeduction=5&preset=combined&psa9RatioMin=70&psa9Aggregate=1&psa9Estimate=0&psa9Market=0&exitPolicy=both&buybackStores=all&selectedStores=&storeTravel=0&snkrFee=7&snkrShip=210&snkrOther=0&snkrTx7=0&snkrTx30=3&snkrProfit=0&snkrRoi=0&snkrAge=48&year2020=0&includeUnknownYear=0&profitBasis=auto&periodReference=1&psa9RatioMax=120&filterExpRoi=15&marketSearch=cap&buyBelowCap=0&marketCapMin=0&filterStressRoi=0&filterStressProfit=0&storeDemand=normal-up&purchaseMin=25000&purchaseMax=99999&priceMin=26000&priceMax=99999&headroomMin=-25&effMin=30&effManual=off&sellDays=7&payoutDays=3&effBuy=median&effScenario=current&effRef=1&psa9AboveGuide=0&psa9Cost5=0&filterExpProfit=5000&psaMax=999999&calcBuy=median&medianBuyPct=off)
