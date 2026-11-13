# 2026-11-14：Cloudflare固有のfetch停止と公開確認

PR #68の孤立queued対策と在庫確認範囲は公開済み。Pages43507894213成功、PC1440/スマホ390・正式2条件ともValue17/Priority15、中央値/CSV一致、詳細開閉保持、横はみ出しなし、計算エラー0。追加表示による候補・金融値・GO変更0。旧モデル混在時は新しい共通関数の有無も初期検証し、不完全な候補を表示しない。

## 自然Cronで止まった工程

05:07 JSTはgeneric failure、05:22/05:37/05:52はbackoff、06:07:59.076 JSTもgithub-inventoryの最初のPriority一覧APIでTypeError。Cron到着・DO200と、起動受理/実取得を混同しない。06:07回の提供スケジュール時刻21:07:58.039Z、Worker開始21:07:59.076Z、申告遅延1,037ms。Cron名目の21:07:00Zとは区別する。dispatch/新しい取得は0。

Cloudflareの一時リモートランタイム（secretなし、dispatchなし）で元のfetchオプションを再現すると、GitHubとCloudflare自身の両方で同期的に次の原文を得た。

> Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code).

認証・GemRate403・本人操作不足が原因ではない。redirect:manualへ変更するとHTTP応答へ到達し、Cloudflare自身200、認証なし共有IPのGitHub403。後者は本番の限定token付き経路の成否とは別で、認証失敗とも断定しない。PCの通常GitHub同一URLは認証あり/なしとも200、redirectなし。原文/時刻/HTTP証拠は work/20261114-cloud-runtime-transport.json。

## 修正と安全性

Workerだけredirect:manualとし、3xxはLocationへ進まず保留。Authorizationを別URLへ転送せず、公開HTTP/preview起動口も追加しない。旧redirect:errorにより送信前に止まったgithub-inventoryのTypeError、未dispatch、認証holdなし、旧transport版、当該APIという全条件が揃う場合に限り、元failure/待機期限をmigration証拠へ保持して新transportへ進める。認証hold・保存済みdispatch intent・別工程/TimeoutErrorは解除しない。以後の通信失敗は通常backoffを維持。新しい実行IDをreturn_run_details:trueで保存する仕組みも維持。

本番配置697cf76d-84f6-457e-a34d-f47cb75a4fc3。次の自然Cronで復旧→孤立queued証拠照合→dispatch→GitHub実行作成→実取得/保存/公開照合を別々に確認する。リモート一時試験と自然周期を混ぜない。

在庫確認範囲、遊々亭2件200/厳密解析未採用、全体分析可能2,596/13,026と鮮度不足、GemRate761/12・計算採用0、25%余力未達、国内/PSA9実成約・マリィ原票・期間別件数・需給/返却時検証等は[直前台帳](20261114_ORPHAN_WAKEUP_STOCK_SCOPE.md)から継承。母数・検索・計算採用率・中央値主計算・GO・海外凍結・撤廃店舗・通常AI0・AI予定停止は変更しない。
