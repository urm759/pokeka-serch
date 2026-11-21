# AI開発パイプライン

GitHub Actionsの **AI Dev Pipeline** を所有者が手動で起動します。Claudeが設計、Codexが実装し、回帰試験の証跡と差分をClaudeが確認します。要修正の場合は1回だけ修正と再確認を行います。実行結果は下書きPRとActionsのSummaryで確認できます。マージと本番公開は利用者が判断します。

## 初回の確認

1. この実装PRをレビューします。Actionsの実行試験は、別途承認された非公開の検証用リポジトリで行います。既存のデータ更新ワークフローとPagesを無効にしてから試験します。
2. 検証用の既定ブランチ `main` から `stub` を5通り実行します。 `pass` は合格の下書きPR、`revise_pass` は修正1回で合格、`unresolved` は未解決の下書きPR、`needs_decision` は実装前に停止、`gate_reject` は差分を拒否します。各回で `main` のSHAとPages実行履歴を確認します。
3. 本番の `stub` はSummaryと証跡を作ります。下書きPRの作成まで試す場合は検証用リポジトリを使用します。
4. 実モデルを使用する承認後、GitHubの `ai-pipeline` Environmentを `main` 専用に設定します。Claude用に `CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY`、Codex用に `OPENAI_API_KEY` を登録します。APIキーを用いた実行には各サービスの利用料金が適用されます。利用枠を確認してからリポジトリ変数 `AI_PIPELINE_REAL_ENABLED=true` を設定し、小さな依頼で試験します。

[Claude Code公式Actionsガイド](https://code.claude.com/docs/en/github-actions) · [Codex公式Action](https://github.com/openai/codex-action)

## 実行方法

Actions → **AI Dev Pipeline** → **Run workflow** で、ブランチと `base_ref` は `main` を選びます。`request` には公開可能な依頼だけを入れます。依頼・差分・実行証跡はリポジトリの公開範囲で閲覧できます。公開データを変更する場合は `allow_data_changes` を明示し、設計側でも個別に許可します。

初期値は `stub` です。実行時には `real` を明示します。ClaudeはOpus・High、CodexはAction既定モデル・Mediumです。 `AI_CLAUDE_MODEL`、`AI_CODEX_MODEL`、`AI_CODEX_EFFORT` でモデルやCodexのエフォートを設定できます。1回でClaude最大3工程、Codex最大2工程です。Summaryの回数はAI起動ステップ到達数で、課金・トークン実績はサービス側で確認します。

下書き作成にはリポジトリの **Allow GitHub Actions to create and approve pull requests** が必要です。付与した用途は下書き作成のみです。GitHubの標準トークンで作った下書きPRのCIに承認待ちが出た場合は、必要に応じてPR画面から承認します。パイプライン内の独立テストは先に実行されます。 [GitHubトークンの挙動](https://docs.github.com/en/actions/concepts/security/github_token)

## 証跡と障害の確認

- 開始時のコミットを固定し、設定・指示・検証スクリプトはそのコミットから取得します。差分ゲートで変更範囲、保護対象、ファイル形式、サイズ、資格情報のパターンを確認します。
- 独立テストはネットワークなしのコンテナで実行します。GitHub書込権限は最後の下書き作成ジョブだけに与えます。そのジョブでは差分と検証済みGitツリーを照合します。
- Summaryには合否、修正履歴、未確認項目、公開後の確認項目が出ます。テスト別の終了コードと時間は、同じ実行の `verify-1` または `verify-2` の成果物で見られます。証跡の保持期間は7日です。
- ゲート拒否では差分をアップロードせず、拒否の記録を残します。途中失敗時は実行ログとSummaryを確認して、新しい実行として開始します。旧実行の成果物や作業ブランチは再利用しません。
