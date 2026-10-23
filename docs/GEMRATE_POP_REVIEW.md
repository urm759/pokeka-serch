# GemRate POP取得の確認（2026-10-23）

## 到達点

- 日本語版イーブイヒーローズのV・SR・SA 8種について、公開ページ上のセット・番号・名称を掲載済みIDへ一意に照合。通常SR・VMAX・外国語版は混在させない。
- PSAフィルターのPSA10・PSA総枚数・更新日、個別の週次推移を閲覧できた。これは公開ページの手動確認であり、API取得・新規POP補完・公開利用の実証ではない。
- セット一覧と個別推移で値が一致しない例が1枚ある。更新日だけで前後を接続せず、集計範囲・自動サイン等の仕様・取得時点を確認するまで既存PSA履歴へ混ぜない。
- 確認原票はGit外の非公開保管。公開JSONへPOP値・履歴を移植せず、保存済みの公式原票・チェックポイントは維持。

## 正規経路と停止理由

- [公式API](https://docs.gemrate.com/introduction)は全要求に `x-api-key` が必要。利用者は契約・キーなし、契約/登録/問い合わせ送信は保留。API呼出0、連続試行や公開ページへの代替自動収集なし。
- [Partner API](https://www.gemrate.com/partner)は日次更新とPOP/履歴の提供を案内しているが、料金は相談方式で公開価格を確認できない。無料・有料額を推測しない。
- [公開利用規約](https://www.gemrate.com/terms)は知的財産の帰属を記載。自動取得・継続保存・公開再利用を認める範囲は公開記載だけでは確認できない。非商用の意図だけで許可済みとしない。
- 再開条件は、カード単位POP/履歴へのアクセス権と、必要な保存・公開利用を確認できる条件。現時点で本人操作は求めず、承認待ち以外の国内補完を継続する。

## 利用可能になった場合の検証要件

- [カードPOP](https://docs.gemrate.com/api-reference/cards/get-population-for-a-card)：`GET /v1/cards/{gemrate_id}/population`。`by_grader.psa.grades.psa_10` と `by_grader.psa.total` を使用し、他社を含む `gem_total` /全社合計を使わない。PSAのspec ID、セットURL、日本語・番号・加工を照合する。
- 分母のグレード範囲・qualifier/authentic・サイン版の分離を確認し、PSA公式のTOTALと同一定義であると先に決めない。`data_last_updated` と `last_population_change` も区別する。
- [POP履歴](https://docs.gemrate.com/api-reference/cards/get-population-history-for-a-card)は別の履歴権限が必要。[エラー/上限](https://docs.gemrate.com/errors-and-limits)の401/403/429・利用枠・待機時間を遵守する。
- [FAQ](https://www.gemrate.com/faq)の `Updated` は取り込み/処理日であり、公式の実取得日時と同じとは限らない。日付しかなければ日精度のまま保持。週次記録を日次200点へ補完しない。
- 将来採用する場合も「GemRate集計」とデータ基準日を表示。取得元変更・再分類の差を市場のPOP純増へ数えず、公式履歴とは根拠別に保持する。

海外価格関連の凍結、PSA直接取得の独立した許諾待ち、既存の採算式・購入GO・検索条件は変更しない。
