# GemRateの受け取りのため、Windows PCを1日1回スリープから起こす

今の「Pokeka GemRate Private CSV Import」は起きている間に毎時動く。毎時のタスクにスリープ解除を付けると、寝ている間も毎時起きる可能性がある。スリープ解除は、次の1日1回のタスクだけに設定する。

### 設定

1. GemRate 拡張を入れた Chrome プロフィールで `chrome://settings/system` を開き、**Google Chrome を閉じた際にバックグラウンド アプリの処理を続行する**をオンにする。拡張の確認設定もオンのままにする。Chrome のウィンドウは閉じてもよいが、タスクトレイから完全終了した場合は次回までに同じプロフィールで起動する。
2. Windows の「タスク スケジューラ」を開く。「タスク スケジューラ ライブラリ」の **Pokeka GemRate Private CSV Import** を選び、次回実行時刻の「分」を確認する。「設定」や「操作」は変更せず、既存の毎時タスクのスリープ解除はオフのままにする。
3. **タスクの作成**で `Pokeka GemRate Daily Wake` を作る。「全般」で、普段 Chrome を使う Windows アカウントを選び、「ユーザーがログオンしているときのみ実行する」を指定する。ロックした状態でもセッションは残る。
4. 「トリガー」の「新規」で「毎日」を選ぶ。受け取りが毎時45分なら、たとえば毎日19:25にする。受け取りの開始より20分早い時刻にすると、Chrome がセットを確認する時間を取れる。
5. 「操作」で「プログラムの開始」を追加する。プログラムは `powershell.exe`、引数は下記。25分間だけタスクを実行中にして、Chrome の確認と既存の毎時取り込みに時間を渡す。

   ```text
   -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1500"
   ```

6. 「条件」で **タスクを実行するためにスリープを解除する** をオンにする。ノートPCなら、最初は電源につないで試す。スリープ解除タイマーで起きない場合は「電源オプション → プラン設定の変更 → 詳細な電源設定 → スリープ → スリープ解除タイマーの許可」の電源接続時を確認する。この項目の有無は機種による。設定後は Chrome のプロフィールを起動したまま Windows を**スリープ**にする。

### 翌日、三段階で確かめる

1. **PCが起きたか。** タスクスケジューラで `Pokeka GemRate Daily Wake` の「前回の実行時刻」と「前回の実行結果」を確認する。スリープから戻った直後に PowerShell で `powercfg /lastwake` を実行すると原因を確認できる場合がある。事前に `powercfg /waketimers` で次の解除予約を確認できる。画面が消えたままでも起きている場合がある。
2. **Chromeが確認したか。** 拡張のポップアップで、対象セットの確認時刻が起床後に進んでいるかを見る。GemRateの元データ日付が前回と同じ日は、確認時刻だけが進む。拡張の確認時刻が進まなければ、Chrome の完全終了、対象プロフィール、拡張の有効状態、ポップアップの保留理由の順に確認する。
3. **受け取りと公開が進んだか。** 既存の毎時タスクの実行時刻・終了結果を確認する。PC の `private-research/gemrate/last-reference-pipeline.json` で `at`、受領結果、公開処理の状態を確かめる。新しいCSVの受領と公開があった日は、公開サイトのGemRate欄の元データ日付も確かめる。未確認のセットや提供元の更新がない日は、受け取りや公開の件数が0でもよい。

復帰しなかった日は解除タイマー、電源接続、Windows がスリープだったかを先に調べる。1日1回の設定を外すときは `Pokeka GemRate Daily Wake` を無効にする。

[Microsoft のタスクによるスリープ解除](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-itasksettings-put_waketorun) · [Google の Chrome バックグラウンド動作](https://support.google.com/chrome/a/answer/2657289?hl=en)
