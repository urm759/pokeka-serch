# PC不要の独立起動（無料Worker配置・secret登録・Cron有効化済み）

Cloudflare Workers Cronで15分ごとにGitHubの更新状況だけ確認し、直近のPriority作成から2.5時間以上空き、Daily/Priority/Safe/Watch/GemRate公開等が待機・実行中でない場合に限り、既存Watchのmainを起動する。取得・保存原票回収・検証・公開は既存の非AI処理を再利用する。通常取得のLLM/ChatGPT/Codex呼出0、API/403/仕様保留を維持する。

## 実装と制約

- `worker.mjs` と `wrangler.jsonc` を準備し、Node単体試験で初期OFF・重複抑制・保留・不確かな応答を検証済み。Cloudflare本人認証と無料Worker/SQLite DO/Cron配置は完了（初期OFF）。限定GitHub secret登録と有効化を待つ。外部起動・実取得・公開・複数周期は未実証。
- UTCの07/22/37/52分（1日96確認）。起動回数を増やす目的ではなく、GitHub scheduleの実行作成前の空白を補う。Cronの待機時間そのものに保証はなく、GitHub API/runner全体の障害を回避するものでもない。
- Cloudflareの単一SQLite Durable Objectで確認と起動intentを直列化し、POST前にintentを保存する。不確かな応答でも即時再送しない。認証等は持続保留、通信障害は1時間待機する。既存更新がpendingなら追加起動しない。
- 受理は取得/公開の成功ではない。外部時計とrequest IDを任意入力として既存Watchへ渡すが、申告値だけで自然定期成功へ計上しない。外部ログ・実行API・公開hashを別に照合する。
- PC監視との同時照会では起動イベントが重なる可能性はある。最終的な同時実行枠と既存2/2.5時間ゲートも維持し、二重の価格HTTPを防ぐ。認証・取得停止を自動解除しない。
- 最新Priorityを専用一覧で取得し、queued/in_progress/waiting/pending/requestedの5状態は別々に確認。各状態が100件に達して古い待機を除外できない場合は `active-window-full-review`。完了履歴の多さだけで永久停止せず、待機不明時は起動しない。ログで解消工程を特定する。
- 公開HTTP起動口はなく、secretをログ・サイト・Gitへ出さない。保存するのは起動状況・時刻・run ID・直近672件の確認履歴。カード原票や価格をCloudflareへ送らない。

## 費用・権限（2026-11-14確認）

想定追加料金は無料枠内の0円。有料プランへ変更しない。1日96確認・最大概ね10起動intentで、Worker/DO各10万request/日、DOのSQLite読取500万/日・書込10万/日の無料枠より小さい設計。無料枠は同じアカウントの他の利用とも合算され、上限超過時はエラーで停止する。実CPU・duration・保存量は配置後の実測が必要。

- [Workers無料枠](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Objects無料枠・SQLite必須](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cronの仕様](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [GitHub dispatchに必要なActions書込権限](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

GitHubはfine-grained tokenを `urm759/pokeka-serch` 1リポジトリに限定し、**Actions: Read and write**（Metadataは付随するreadのみ）。Contents書込・アカウント全体のrepo権限・新しいGitHub Appは不要。tokenの期限と更新者も決める。既存Git認証を外部サービスへコピーしない。

## 本人操作が必要な部分

1. Cloudflare Workers Freeのアカウント作成/ログイン（既にあればそのアカウントを使う）。有料プランへ変更しない。
2. GitHubで上記1repo限定のfine-grained tokenを本人が発行する。tokenはチャットへ送らず、本人の端末でCloudflare secretへ入力する。
3. 導入・有効化は2026-11-14に利用者承認済み。本人認証・無料配置も完了し、リポジトリ限定tokenの発行とsecret入力が残る。再承認は不要。

承認後の実行手順はこのフォルダで `npx wrangler login` → `npx wrangler secret put GH_ACTIONS_TOKEN` → `npx wrangler deploy`。初回配置時も `ENABLED=false` のまま構成を確認し、本人承認後にtrueへ変更して配置する。登録/CLI取得/secret登録は未実行。不要なら何も登録しない。停止は `ENABLED=false` とcron削除、token失効。認証保留解除は原因を確認し、secret更新後に保存状態を本人のCloudflare管理画面から見直す。401/403保留を自動消去しない。

## 配置後の合格条件

- Cloudflareの確認実施、dispatch受理、GitHubの実行作成、共通枠待機、実取得、保存、公開、公開照合をそれぞれ記録。
- PCをOFFにしても外部起動が成立することを確認する。GemRateのChrome CSV新取得は引き続きPC ON依存で、起動タイマーを追加してもPC OFFでCSVを取得できたことにはならない。
- 複数周期、24時間/7日のカード別期限・新規探索枠・公開照合済み能力を測定。起動0/取得0/再利用は実取得成功に加算しない。登録だけで25%余力・6時間鮮度維持を達成扱いにしない。

## 2026-11-14の到達点

Wrangler 4.161.0を非公開作業領域に導入し、配布用dry-runを通過（7.98 KiB、gzip 3.07 KiB）。初期OFFと公開起動口なしを維持。OAuth要求はaccount/read・user/read・Workers/script/write・tail/readと更新用offline_accessへ限定し、OS keyring利用を準備。本人が今は操作できないためログイン待ちで停止し、Workerの配置・secret登録・有効化は未実施。再開時に期限切れOAuthを使い回さず、新しい本人認証を開始する。

## 同日再開後の実配置

利用者がCloudflareへログイン後、限定OAuthを接続。Workers初回メニューで無料サブドメインが作成されたことを画面確認し、`ENABLED=false`のままWorker/SQLite DO/Cronを配置成功。バージョン`4404fed8-f9ef-4a1e-9651-18fe040a19ac`。公開HTTPルートなし。有料プランへ変更していない。

GitHub tokenフォームは対象1repo（urm759/pokeka-serch）・Actions read/write・Metadata read・90日（2027-02-12まで）へ設定済み。GitHubでの発行とCloudflareの`GH_ACTIONS_TOKEN`への本人入力を待つ。Workerへのsecret登録完了を名前一覧だけで確認し、mainのWatch任意入力対応公開後に有効化する。token値をチャット・Git・ログへ出さない。配置成功は外部起動成功や鮮度維持の実証と別。

限定secretの本人登録完了を、CLIのname/type一覧だけで確認済み。token値は読み出していない。現在OFFのまま、Watch側の任意起動入力をmainへ公開してから有効化する。

## 稼働版の有効化

PR #66をマージし、mainのWatchにtimer_scheduled_at/timer_request_idと直列待機設定が存在することをAPIで確認した後、wrangler deploy --config ops/external-wakeup/wrangler.jsonc --var ENABLED:trueで有効化した。稼働バージョン652ce593-81b8-402b-a634-2b892607cbf5。repo既定はOFFを保持し、意図しない初回配置で起動しない。workers.devとpreview URLはいずれも無効、HTTPハンドラも404。無料範囲のログ記録を有効化。secret値は読まず、登録名/typeだけ確認。

有効化と自然Cron/dispatch/取得/公開成功は別。受信ログが揃うまで周期達成へ計上しない。停止は同じconfigでENABLED:falseを指定してdeployする。tokenは2027-02-12期限で、更新時は同じ限定権限を維持する。
