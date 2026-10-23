# SeminarComment 0.3.0

日本語 | [English](README.en.md)

PowerPointへ匿名コメントを重ねるmacOS / Windows向けアプリです。
参加者はスマートフォンのブラウザーから、名前やログインなしで30文字までのコメントを送れます。
発表者はアプリを起動するだけで、コメントをスライド上へ流せます。
QRカードの移動、サイズ変更、タブへの折りたたみに対応しています。
発表者画面とスマホ画面は日本語／Englishの切り替えに対応し、初回は端末の言語に合わせます。
画面上部の「Language / 言語」で変更でき、選択は保存されます。
発表者と参加者は、それぞれ別の言語を選べます。

## ダウンロード

ソースコードのビルドやNode.jsのインストールは不要です。
対応するZIPをダウンロードして展開してください。

| 発表に使うPC | v0.3.0 |
| --- | --- |
| Mac：Apple Silicon（M1以降） | [Mac Apple Silicon版](https://github.com/haseren48-hue/SeminarComment/releases/download/v0.3.0/SeminarComment-0.3.0-mac-arm64.zip) |
| Mac：Intel | [Mac Intel版](https://github.com/haseren48-hue/SeminarComment/releases/download/v0.3.0/SeminarComment-0.3.0-mac-x64.zip) |
| Windows：x64 | [Windows版](https://github.com/haseren48-hue/SeminarComment/releases/download/v0.3.0/SeminarComment-0.3.0-win-x64.zip) |

[リリース一覧と検証範囲](https://github.com/haseren48-hue/SeminarComment/releases)

アプリは未署名です。起動がOSや組織の端末管理によって制限される場合があります。
Mac Apple Siliconで確認済みで、Windows、Intel Mac、複数画面の実機確認は残っています。
試験用のスマホ接続にはCloudflare Quick Tunnelを使用し、接続の稼働保証はありません。
本リポジトリでは共通のコメントサーバーを運用していません。発表者ごとにアプリを起動し、参加用QRを案内します。

アプリの見出しで「0.3.0」を確認できます。
旧版が起動中の場合は、その版を終了してから開きます。

## このPCで試す

1. アプリを開き、利用方法を「このPCで試す」のままにします。
2. セッション名を入力して「開始」を押します。URLや作成キーの設定は不要です。
3. 「参加ページを開く」を押し、ブラウザーからコメントを送信します。
4. 「5秒後にテスト」を押してからPowerPointを全画面表示にします。ショートカットはMacがCommand + Shift + T、WindowsがCtrl + Shift + Tです。

「このPCで試す」の参加ページは、同じPCのブラウザーからだけアクセスできます。
スマートフォンから試す場合は、次の接続方法へ切り替えます。

## スマートフォンから試す

1. 使用中のセッションがあれば「セッションを終了」を押します。
2. 利用方法を「スマホから参加（試験用）」に変更します。
3. セッション名を入力して「開始」を押します。一時的なHTTPS URLの準備を待ちます。
4. 「QRを表示」を押し、スマートフォンで読み取ってコメントを投稿します。

この接続はCloudflare Quick Tunnelを使います。
URLを知る人が参加でき、アプリを終了すると接続も閉じます。
この環境では公開側の確認に成功する回と失敗する回がありました。
セッション開始は内蔵サーバーで完了し、一時URLからの到達性は参加者側で確認します。
URLは接続のたびに変わり、稼働保証がないため、事前の動作確認用です。
安定したURLによる本番運用には「設置済みサーバーを使う」を選び、[サーバー設置手順](docs/deployment.md)で用意した接続先を設定します。

一時URLの名前解決に失敗する回線があります。
参加者側の回線で一時URLを解決できない場合は、別回線または本番用サーバーで確認します。

[Cloudflareの公式説明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)では、Quick Tunnelを開発用途とし、同時処理中リクエスト数に200の上限を設けています。
本番想定は40人・3時間です。
スマートフォン2台での投稿とロック解除後の投稿は確認済みです。
40台実機による3時間の連続運転は未確認です。

## 全画面中の操作

| 操作 | macOS | Windows |
|---|---|---|
| テストコメントを出す | Command + Shift + T | Ctrl + Shift + T |
| コメント表示を切替 | Command + Shift + C | Ctrl + Shift + C |
| QR表示を切替 | Command + Shift + Q | Ctrl + Shift + Q |
| 表示領域を編集 | Command + Shift + R | Ctrl + Shift + R |
| 領域編集をキャンセル | Esc | Esc |

テスト操作はコメント表示をONへ戻し、領域編集を閉じてからテストコメントを流します。
QR表示中のテストでもQRは閉じません。
設定画面の「テスト送信 ○回」で操作が届いたか確認できます。
登録できないショートカットがあれば、設定画面にキーを表示します。

文字サイズは24 / 36 / 48 / 60 / 72pxから選択でき、初期値は36pxです。
速度は表示領域の幅を横切る基準で、遅い13秒、普通9秒、速い6秒です。
QR表示中もコメントは流れ続けます。
QRは操作できる独立したカードに表示します。
カード上部の「参加QR」をドラッグして移動し、ウィンドウの端をドラッグするか「＋／−」でサイズを変更できます。
「▁」で小さなタブにしまい、「QRを表示」で元のサイズへ戻せます。
タブ左端の「⋮⋮」をドラッグすると、しまったまま移動できます。
「×」はQRだけを閉じ、セッションとコメント表示は継続します。
位置、サイズ、折りたたみ状態は端末へ保存します。
設定画面の「QRの位置・大きさを戻す」で右下の初期配置に戻せます。
QR操作はコメントを停止せず、カード外のスライド操作はそのまま行えます。
コメント領域の編集中だけ、QRを一時的に隠します。
コメントOFF中と領域編集中はコメントを隠し、移動を停止します。
新着は最新50件まで保持してFIFOで再開します。
停止時間を除いて2秒待ってもレーンが空かない場合は、最も空いているレーンへ表示します。

## 配布ファイル

MacはZIPを展開して`SeminarComment.app`を開きます。
Apple Siliconは`mac-arm64.zip`、Intelは`mac-x64.zip`です。
Windows x64は`win-x64.zip`を展開し、フォルダー内の`SeminarComment.exe`を開きます。
他のファイルも必要なので、フォルダーごと保持します。
Node.jsのインストールは不要です。

アプリは未署名です。
Gatekeeper、SmartScreen、組織の端末管理ポリシーによる起動制限があり得ます。
Windows実機、USB起動、複数ディスプレイは未検証です。
PowerPoint上での確認範囲は[検証記録](docs/verification-public.md)を参照してください。

## 保存する情報

コメント本文はDBやファイルへ保存しません。
表示中と待機中のコメントだけをメモリーに保持します。
参加者の名前やメールアドレスを要求せず、参加者IDも発行しません。
アプリと内蔵サーバーはコメント本文やIPアドレスのアクセスログを出しません。
Cloudflare経由の試験用接続では、通信はCloudflareを経由します。

セッションは12時間で失効し、手動終了も反映します。
内蔵サーバーのセッションはアプリ終了時に終了します。
サイズ、速度、領域、画面選択、QR配置、接続方法は端末へ保存します。
設置済みサーバーを使う場合の作成キーは、端末のユーザーデータフォルダーへ保存します。
内蔵サーバーの作成キーは起動時に生成し、メモリーだけで保持します。

## 開発と検証

Node.js 24以降とpnpm 11.25.0を使います。

```sh
pnpm install --frozen-lockfile
pnpm prepare:tunnel   # スマホ接続用バイナリーを公式配布元から取得しSHA-256を検証
pnpm prepare:licenses # 配布用の第三者ライセンス表示を準備
pnpm start
pnpm test
pnpm test:desktop
```

公開接続を含む検証は`SEMINAR_TEST_TUNNEL=1 pnpm test:desktop`で実行します。
一時URLを発行するためインターネット接続が必要です。
自動試験の設定ファイルはワークスペースの`work/electron-test/`へ分離します。

```sh
pnpm build:mac        # Apple Silicon / IntelのZIP
pnpm build:win:zip    # Windows x64のZIP
pnpm build:win        # Windows環境で単一EXEを作る設定
```

ビルド時にcloudflared 2026.10.3を公式GitHubリリースから取得し、固定したSHA-256と照合します。
ソースZIPにはその取得スクリプトとライセンスを含め、バイナリー自体は含めません。
配布用アプリには対象OSのバイナリーを同梱します。

| フォルダー | 内容 |
|---|---|
| `desktop/` | ウィンドウ、トレイ、設定、オーバーレイ、試験用接続 |
| `web/` | 参加者画面 |
| `server/` | 内蔵／単独運用共通のHTTP APIとWebSocket |
| `shared/` | 文字数判定とレーン／キュー制御 |
| `tests/` | 自動テスト |

## ライセンス

SeminarCommentの独自コードは[MIT License](LICENSE)です。
ライセンス表示を保持する条件で、無償利用、改変、再配布、商用利用ができます。
同梱するソフトウェアにはそれぞれのライセンスが適用されます。[第三者ソフトウェアの表示](THIRD_PARTY_NOTICES.md)を参照してください。

不具合は[Issues](https://github.com/haseren48-hue/SeminarComment/issues)へ、OS、アプリの版、再現手順を添えて報告してください。
セッション作成キーや個人情報は投稿しないでください。
