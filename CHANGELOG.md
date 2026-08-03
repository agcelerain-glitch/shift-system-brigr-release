# CHANGELOG

## 2026-08-03（46回目）
### 変更内容
- [front/src/lib/db.ts] `subscribeApprovalLogs` に `where('createdAt', '>=', 7日前)` フィルターを追加。8日以上前のログをDB購読段階で除外し、Firestore読み取り件数を削減（課金対策）
- [front/src/pages/AdminShiftPage.tsx] `doRestore` に try/catch を追加。楽観ロック競合時（conflict）に「競合: 別のadminが同時操作中です。画面を更新してから再試行してください」をトースト表示。その他例外もエラートーストで通知
- [back/src/clean.js] 新規作成・改良。Heroku Scheduler（UTC 3:00 AM / JST 12:00）で `node src/clean.js` として実行する22日自動削除スクリプト。`--dry-run` フラグで削除せず対象件数のみ表示。`CLEAN_THRESHOLD_DAYS` 環境変数で閾値変更可能（テスト用）
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）
- Heroku (back): プッシュ済み

## 2026-08-02（45回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] シフトカードの件名表示を `memberName · subject` から `subject` のみに修正（subjectに名前が含まれているため重複していた）
- [front/src/pages/AdminShiftPage.tsx] 並び替え時にソートキーのグループ区切り（「──8月2日──」「──場所名──」等）を挿入。日付・曜日・場所・時間・名前・人数の全ソートキーに対応
- [front/src/pages/AdminBoardPage.tsx] 「削除済」タブを追加。削除操作はソフトデリート（boardPublicDeleted / boardPrivateDeleted コレクションへ移動）に変更。削除済タブで復元（createdAt=復元時刻）・完全削除（2重確認）が可能
- [front/src/lib/types.ts] DeletedBoardPublic・DeletedBoardPrivate 型を追加
- [front/src/lib/db.ts] deleteBoardPublic/deleteBoardPrivateをソフトデリートに変更。restoreBoardPublic/Private・permanentDeleteBoardPublic/Private・subscribeBoardPublicDeleted/subscribeBoardPrivateDeleted を追加
- [front/src/lib/mockStore.ts] softDeleteBoard・restoreBoard・permanentDeleteBoard モック関数追加、boardPublicDeleted/boardPrivateDeleted ステートを追加
- [front/src/contexts/DataContext.tsx] boardPublicDeleted・boardPrivateDeleted をコンテキストに追加（admin専用）
- [firestore.rules] boardPublicDeleted・boardPrivateDeleted コレクションのルール追加（adminのみ読み書き）
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）
- Firebase Rules: デプロイ済み

## 2026-08-02（44回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] インラインプレビューのpivotDataフィルタに`status === 'confirmed'`を追加。予定シフトをプレビューから除外し、未承認シフトへの調整バッジ誤付与を防止
- [front/src/lib/db.ts] `restoreShift`のトランザクション内に`tx.delete(logRef)`を追加。復元成功後に承認ログ自体を削除し、使用済みログの蓄積・バッジ誤表示を防止
- [front/src/lib/mockStore.ts] モック版`restoreShift`も同様にログ削除処理を追加（`notify('approvalLogs')`含む）
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（43回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] weekSummaryでtoISOString()によるUTC日付ズレを修正。addDays()（ローカル日時ベース）に置き換えることで、サマリーボタンの日付とインラインプレビューの日付表記が一致するように修正
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（42回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] 調整マークを「名前のみ」から「日付+名前」の組み合わせキー（YYYY-MM-DD_名前）に変更。同じ名前でも別日付はマーク状態が独立
- [front/src/pages/AdminShiftPage.tsx] 復元ログのソートに「調整対象」ボタンを追加。タップするとマーク付きのログが上位に集まり、次いで新しい日付順で表示
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（41回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] 7日間サマリーの日付タップをモーダルからインラインプレビューに変更。カードの直下に場所→帯→名前のピボットテーブル形式でシフト詳細を展開表示
- [front/src/pages/AdminShiftPage.tsx] 名前バッジ機能を追加。プレビューの名前をタップすると「調整」マーク（オレンジ）がトグル付与され、複数名を調整対象としてマーキング可能
- [front/src/pages/AdminShiftPage.tsx] 復元ログモーダルに名前・場所・日付の検索テキストとソートボタン（日付/場所/名前）を追加
- [front/src/pages/AdminShiftPage.tsx] 復元ログに調整マークを反映。調整対象メンバーのログ行をオレンジ背景で強調表示し、名前に「調整」バッジを付与
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（40回目）
### 変更内容
- [front/src/pages/RequestPage.tsx] ユーザーの申請フォームから場所プルダウンを完全削除。場所は管理者が承認時に設定する設計に変更
- [front/src/pages/AdminShiftPage.tsx] メンバーごとの最終承認場所をlocalStorage（shiftapp.memberPlaces）で管理するヘルパー追加
- [front/src/pages/AdminShiftPage.tsx] 承認モーダル: 初回承認時に「場所を設定してください」警告を表示。2回目以降はlastPlaceを自動入力し「前回: 〇〇」をラベルに表示
- [front/src/pages/AdminShiftPage.tsx] 調整モーダル: シフトに場所がなければlastPlaceを自動入力。承認・調整完了後に場所を記憶（次回自動入力用）
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（39回目）
### 変更内容
- [front/src/pages/NameSetupPage.tsx] savedNameがある場合（非devモード）はボタン操作なしで自動遷移に変更。マウント時にupsertMember→setName→navigateを実行し、遷移中はスピナーを表示
- [front/src/pages/RequestPage.tsx] テンプレート（A〜D帯）選択時に「時間を調整する」トグルボタンを追加。有効時は開始・終了時刻セレクトが表示され、保存はtimeType:'time'（件名はテンプレート名のまま）
- [front/src/pages/RequestPage.tsx] 終了時刻の上限を26:00から32:45（翌8:45）に拡張。24:00以上の翌日時刻は開始時刻に関わらず有効と判定するバリデーションに修正
- [front/src/pages/RequestPage.tsx] テンプレート変更時に開始時刻をそのテンプレートのデフォルト値にリセット
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（38回目）
### 変更内容
- [front/src/lib/utils.ts] `toISOString()`のUTC変換による日付ズレを修正。ローカル日付文字列変換ヘルパー`toDateStr`を追加し、`todayStr`・`addDays`・`getMonthGrid`を修正
- [front/src/lib/utils.ts] `getWeekStart`・`getTwoWeekGrid`・`getWeekLabel`を追加（2週間カレンダー用）
- [front/src/components/MonthCalendar.tsx] 月表示カレンダーを今週+次週の2週間表示に変更。ナビゲーションを1週間単位移動に変更、今日ボタンは今日が属する週に戻る
- [front/src/components/MonthCalendar.tsx] ヘッダーを「8/2の週 ・ 8/9の週」形式の表示に変更。月をまたぐ月初は「8/1」表記で視認性確保
- [front/src/components/MonthCalendar.tsx] `DayShiftList`に確定>場所>帯>名前のソートを追加
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-02（37回目）
### 変更内容
- [front/src/pages/NameSetupPage.tsx] 「別の名前を使う」ボタンを通常UIから削除。savedNameがある場合は前回の名前で自動ログインのみに変更
- [front/src/pages/NameSetupPage.tsx] 開発者モード実装（C案）: URLに `?dev=1` を付けるか、アイコンを5回連続タップで有効化。有効時のみ「別の名前を使う（開発者）」ボタンと「← 前の名前に戻る」ボタンが表示される
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-08-01（36回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] 復元ログモーダルを「削除依頼・承認ログ」に改修。モーダル上部に削除依頼中のシフトを現行情報で一覧表示し、「削除せず修正」（調整モーダルを開きconfirmedに戻しつつ内容変更可）と「削除」の2択ボタンを追加。承認ログセクションとの視覚的な区別（ローズ背景・セクション見出し）も実装
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-07-31（35回目）
### 変更内容
- [front/src/pages/AdminLinePage.tsx] グループ送信②配置行を固定テンプレート方式に変更。付け回し/キャシャーン/フロント/ホール長/ホール/ストッカー/その他①②の8行が常時表示される順番固定レイアウトに
- [front/src/pages/AdminLinePage.tsx] 老眼対応UI: 配置名ラベルtext-base/bold、メンバーチップtext-sm+py-2.5（大タッチ領域）、直接入力欄text-base+py-3に拡大
- [front/src/pages/AdminLinePage.tsx] 配置行の状態管理: コンテンツありの行は左ボーダー青+背景青、行ごとのクリアボタン追加。空行はメッセージから自動スキップ
- [front/src/pages/AdminLinePage.tsx] 送信後は全行をクリーンな初期テンプレートにリセット
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-07-31（34回目）
### 変更内容
- [front/src/pages/AdminLinePage.tsx] グループ送信①タイトルを「シフト連絡など」に変更。FloatTextareaのプレースホルダーをLINE自動応答ヒントに変更
- [front/src/pages/AdminLinePage.tsx] グループ送信②を大幅改修: 場所プルダウン（4店舗+指定なし自由記入）・配置プルダウン8択（その他①②は自由記入）・複数人担当者セクション（確定メンバーチップ選択+自由入力）・追加メモ欄（任意）・送信プレビュー機能。日付を先頭に自動付与して送信
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-07-31（33回目）
### 変更内容
- [front/src/lib/config.ts] PLACE_OPTIONSを実店舗名に差し替え（本店/支店A/支店B/倉庫 → ブリジャール/ルチア/セラス/ルミ・ベガ）。RequestPage・AdminShiftPageのプルダウンは自動反映
- [front/src/lib/mockStore.ts] 開発用モックデータのplace値を'ブリジャール'に更新
- ManualUserPage・ManualAdminPage・AdminShiftPage・バックエンドはいずれも場所名ハードコードなし。Firestoreの既存レコードは旧名称のまま残存（判別可能）
### デプロイ
- GitHub (origin/main): プッシュ済み（Vercel自動デプロイ）

## 2026-07-31（32回目）
### 変更内容
- [back/src/app.js] parseFirebasePrivateKey()関数を追加。Herokuダッシュボードでのコピペ時に混入するダブルクォートや\\nリテラルを堅牢に除去し、OpenSSL 3.x（Node.js 22）でのデコードエラー（error:1E08010C）を修正
- [back/src/app.js] Firebase Admin初期化にtry-catchを追加。初期化失敗時に秘密鍵の先頭行をログ出力して診断を容易に
- [back/src/app.js] グループ参加（joinイベント）時に「グループ登録」を促す案内メッセージをグループへ返信するよう変更（従来はログのみ）
- [front/src/pages/AdminLinePage.tsx] GID表示を`********************`にマスク（実際のIDはFirestoreのみで管理）。削除確認ダイアログからも実際のGIDを除去
### デプロイ
- GitHub (origin/main): フロント変更をプッシュ（Vercel自動デプロイ）
- Heroku: back/をプッシュ（Firebase秘密鍵パース修正）

## 2026-07-31（31回目）
### 変更内容
- [front/src/lib/config.ts] TEMPLATE_TIMES更新（A:20:00-LAST / B:20:30-26:00 / C:21:30-LAST / D:22:00-26:00）。SUBJECT_OPTIONSのラベルにTEMPLATE_TIMESの時間帯を自動表示するよう変更
- [back/src/app.js] TEMPLATE_TIMESをconfig.tsと同期更新
- [front/src/pages/RequestPage.tsx] シフト申請を複数件まとめて申請できるよう全面改修（「申請を追加する」ボタンで申請エントリーを追加、各エントリーに日付・件名・時間・場所を個別設定可能）。時刻オプションを09:00始まりに変更、終了時刻は26:00（翌2:00）まで対応
- [front/src/pages/AdminShiftPage.tsx] timeSortValのテンプレートソート値を新時間帯に合わせて更新（A:2000/B:2030/C:2130/D:2200）
- [front/src/pages/ManualUserPage.tsx] テンプレ時間を新時間帯に更新、不可申請の説明から誤った「週単位」記述を削除、シフト申請セクションに複数申請の説明を追加
### デプロイ
- GitHub (origin/main): 全変更をプッシュ（Vercel自動デプロイ）
- Heroku: back/をプッシュ（TEMPLATE_TIMES同期）

## 2026-07-31（30回目）
### 変更内容
- [back/package.json] Node.jsバージョンを18.x（EOL）→ 22.x（現行LTS）に更新（Herokuビルド警告を解消）
- [back/.env.example] Firebase Admin SDK変数（FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY）を追加、FRONTEND_URLを追加、PORT=3000を削除（Heroku自動設定のため）、LINE_GROUP_IDにフォールバック専用である旨のコメントを追加
- [README.md] back/.env表にFRONTEND_URL・PORT設定禁止・各変数の必要性を追記。git push heroku master → git push heroku main に修正。モノレポ構成でのgit subtreeデプロイ手順を追記
### デプロイ
- GitHub (origin/main): プッシュ済み
- Heroku: back/をプッシュ（v8相当）

## 2026-07-31（29回目）
### 変更内容
- [front/public/favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png, android-chrome-192x192.png, android-chrome-512x512.png] faviconを差し替え
### デプロイ
- GitHub (origin/main): favicon変更をプッシュ（Vercel自動デプロイ）
- Heroku: back/をプッシュ（v7）

## 2026-07-21（28回目）
### 変更内容
- [front/src/pages/RequestPage.tsx] 不可モードの日付入力欄下テキストを曜日のみ表示に変更（Input表示との日付二重表示を解消）
- [front/src/components/UserLayout.tsx] navタブをrounded-t-xl+shadow構造で立体的なタブ型デザインに変更。ロゴボタンクリックでカレンダー(/)へ遷移。ヘッダーにshadow追加
- [front/src/components/AdminLayout.tsx] 同様にタブ立体化（ダークカラー）。ロゴボタンでシフト調整(/admin-shift)へ遷移

## 2026-07-21（27回目）
### 変更内容
- [back/src/app.js] 友達追加（follow）時のwebhookメッセージを簡略化。LINE公式側の挨拶と重複する冒頭を削除し、名前登録手順と注意事項・シフト確認の使い方のみをシンプルに案内する表記に変更

## 2026-07-21（26回目）
### 変更内容
- [front/src/pages/LoginPage.tsx] チェックボックス「パスワードを保存する」追加、localStorageへのパスワード保存・自動入力・ログイン日時記録（最新10件）実装
- [front/src/pages/AdminLoginPage.tsx] 同上（管理者用。ストレージキーは別管理）
- [front/src/pages/RequestPage.tsx] 不可モードを週単位→複数日指定に変更。「+日付を追加する」ボタンで複数日追加、個別削除ボタン付き。送信ボタンに選択日数を表示

## 2026-07-21（25回目）
### 変更内容
- [front/src/components/UserLayout.tsx] フッターのmt-8→mt-16・pb拡大・ボタンのpy-3 px-6でタップ余裕確保。プルトゥリフレッシュ（下スワイプで再取得）追加
- [front/src/components/AdminLayout.tsx] プルトゥリフレッシュ追加
- [front/src/contexts/DataContext.tsx] refresh関数を追加（refreshKeyでFirestore購読を再起動）
- [front/src/hooks/usePullToRefresh.ts] 新規作成: touchイベントベースのプルトゥリフレッシュフック
- [front/src/pages/AdminShiftPage.tsx] 申請表記を「申請 日時」のみに簡略化、修正履歴はv>1の場合のみ薄い小字で別行表示
- [front/src/pages/AdminLinePage.tsx] selfMsg・dmMsg送信成功時にテキストエリアをクリア。全Textareaをフローティングラベル形式（FloatTextarea）に置き換え
- [front/src/components/ui.tsx] FloatTextareaコンポーネント追加（フォーカス/入力時にラベルが枠上縁に移動するデザイン）、useState import追加

## 2026-07-21（24回目）
### 変更内容
- [front/index.html] viewport metaに viewport-fit=cover を追加（iPhoneのSafe Area対応）
- [front/src/index.css] ハイコントラストテーマCSS追加（data-theme=hc1: 橙・青系 / hc2: 高視認性）
- [front/src/components/ui.tsx] Badge に data-badge 属性追加（hc2での太枠・太字スタイリング用）
- [front/src/hooks/useColorTheme.ts] 新規作成: テーマ管理フック（normal→hc1→hc2→normalのループ、localStorage永続化）
- [front/src/pages/ManualUserPage.tsx] 表示カラー設定セクション追加（テーマ切替ボタン・バッジプレビュー・説明文）
- [front/src/components/UserLayout.tsx] フッターにSafe Area対応padding追加、管理者ログインボタンのタップ領域拡大・aria-label追加、ログアウトボタンのp-1.5→p-2拡大・aria-label追加
- [front/src/components/AdminLayout.tsx] ユーザーへ/ログアウトボタンのpaddingをp-2に統一・aria-label追加
- [front/src/pages/RequestPage.tsx] ゴミ箱ボタンをp-1→p-2に拡大・aria-label="申請を取り消す"追加
- [front/src/pages/PersonalPage.tsx] 申請取消・削除依頼ボタンに aria-label（日付付き）を追加

## 2026-07-21（23回目）
### 変更内容
- [front/src/pages/RequestPage.tsx] モードカードの順序を「シフト申請→不可→その他」に変更
- [front/src/pages/RequestPage.tsx] 不可申請のsubjectに名前を追加（`不可（シフトなし） {name}`形式）
- [front/src/pages/RequestPage.tsx] 給料受取などのsubjectに名前を追加（`給料受取など {name}`形式）
- [front/src/pages/RequestPage.tsx] 場所フィールドに「その他（自由記入）」選択肢を追加。選択時にテキスト入力欄が展開する
- [front/src/pages/PersonalPage.tsx] ShiftCardの日付にアンダーラインを追加（曜日色に合わせた薄い装飾線）

## 2026-07-21（22回目）
### 変更内容
- [back/src/app.js] 「今週」受信時の期間を月曜基準7日間から「今日から7日間」に変更（過去日を含まないよう修正）
- [back/src/app.js] fetchShifts の戻り値を `{ confirmed: [], plan: [] }` 構造に変更。不可（timeType:'none'）・否認済（reviewed）・削除申請（delete_requested）を除外
- [back/src/app.js] buildSingleDayReply / buildRangeReply を確定（confirmed）のみ詳細表示に変更。カッコ書きのステータスラベルを削除し、確定は✅アイコンのみで表示。未承認（plan + timeType:'none'以外）は件数のみヘッダーに「・未承認N件」として表示
- [back/src/app.js] 未使用になった statusMeta 関数を削除

## 2026-07-20（21回目）
### 変更内容
- [back/src/app.js] buildRangeReply の整形改善: 日付ヘッダー前に必ず空白行を挿入（`\n\n▸`）。時間・場所を同一行から改行+スペース5個のインデントに変更（`\n     ⏰ tl`・`\n     📍 place`）。headerの初期値から末尾`\n`を削除して空白行の二重挿入を防止

## 2026-07-20（20回目）
### 変更内容
- [front/src/pages/AdminShiftPage.tsx] 名簿詳細の「LINEへ」リンクを削除（LINE済バッジはそのまま残す）。MessageCircle importを削除
- [front/src/pages/AdminShiftPage.tsx] 週間サマリーの各日付カードをクリック可能なbuttonに変更。summarySelectedDate stateを追加。タップで詳細モーダルを表示（confirmed/plan/reviewed/delete_requested を確定→予定→確認済の順で表示、不可申請はセクション分けして下部表示）

## 2026-07-20（19回目）
### 変更内容
- [back/src/app.js] 日付問い合わせ返答に予定シフト（status=plan）を追加。fetchConfirmedShifts→fetchShiftsに改名しplan+confirmedを取得。statusMeta関数追加（確定=✅/予定=🔸のアイコン・ラベルを返す）。返答の各シフトに「（確定）」「（予定）」をカッコ書きで追加。日ヘッダーのカウントを「確定N・予定N名」形式に変更。日付内の表示順を確定→予定に固定

## 2026-07-20（18回目）
### 変更内容
- [back/src/app.js] LINE Webhook日付問い合わせ機能を実装。`parseDateMessage`（全角対応・7/21・7月21日・7.21・今日/明日/明後日/今週/来週/今月/来月を解析）・`fetchConfirmedShifts`（Firestoreからstatus=confirmedを取得）・`buildSingleDayReply`・`buildRangeReply`（レスポンス整形）を追加。`handleLineEvent`に日付クエリ処理ブロック③を統合。名前絞り込み対応（「7/21 山田太郎」形式）。LINEの5000字上限に合わせた文字数カット処理も追加。友達追加時の挨拶メッセージにシフト確認コマンドの説明を追記。名前登録成功時の返信に日付クエリ使い方を追記

## 2026-07-20（17回目）
### 変更内容
- [front/src/pages/ManualUserPage.tsx] SectionCardコンポーネント化でJSX body対応。開発者向け表記（plan/confirmed等）をJSXコメントに変換。キーワードを太文字化。「申請削除依頼」セクション追加（2段階手順・再申請の説明）。構成を読みやすくリライト
- [front/src/pages/ManualAdminPage.tsx] 同上。status=plan/boardPublic/runTransaction/VITE_API_BASE_URL等の開発表記をJSXコメントに変換。「申請削除依頼の処理」セクション追加（削除手順・取消不可の警告）。LINE操作・名簿・掲示板・メモの説明を運用視点でリライト
- [front/src/pages/AdminShiftPage.tsx] 初期フィルターをplan単独→plan+delete_requestの2つに変更（削除依頼を見逃さないよう初期表示に含める）

## 2026-07-20（16回目）
### 変更内容
- [firestore.rules] shiftsのupdateルールから`request.auth.token.name`チェックを削除（全ユーザーが共有アカウントのためtokenにnameクレームが存在せず削除依頼が常に拒否されていたバグを修正）
- [front/src/components/MonthCalendar.tsx] カレンダーセルのラベルを`${memberName}・${subject}`→`subject`のみに変更（subjectが既に「A帯 名前」形式のため名前重複を解消）。getTimeLabel関数追加（template/time別に時間を生成）。DayShiftList詳細にsubject+時間表示追加（memberName行を削除し名前重複解消、delete_requestedバッジ追加）

## 2026-07-20（15回目）
### 変更内容
- [front/src/lib/types.ts] ShiftStatusに`'delete_requested'`を追加
- [front/src/lib/mockStore.ts] requestDeleteShift・deleteShiftメソッド追加、deleteDocの型に`'shifts'`を追加
- [front/src/lib/db.ts] requestDeleteShift（確定シフトを削除依頼状態に変更）・adminDeleteShift（hard delete）を追加。cancelShiftでdelete_requestedもFORBIDDEN扱いに
- [front/src/pages/PersonalPage.tsx] 確定タブにdelete_requestedシフトを含め「削除依頼中」バッジ表示。確定シフトに「削除依頼」ボタン追加。2ステップ確認モーダル（1:説明→2:最終確認）追加
- [front/src/pages/AdminShiftPage.tsx] FilterStatusに`'delete_request'`追加。statusBadgeに「削除依頼」バッジ（赤）追加。フィルターボタンに「削除依頼」追加。doAdminDeleteでhard delete実行。ヘッダーに削除依頼件数表示
- [front/src/pages/RequestPage.tsx] 日付選択後の曜日表示が`formatDateJP`（既に曜日含む）と`weekdayJP`で2重表示になっていたのを修正（apply・otherモード両方）
- [front/src/pages/AdminLinePage.tsx] 「バックエンドAPI（Heroku）へ送信します」のp要素をJSXコメントに変換（フロント非表示・コードに保存）
- [firestore.rules] shiftsのupdateルールを拡張: userは自分の確定シフトをdelete_requestedに限り変更可。deleteルールをisAdmin ||（user＋plan）の形に更新


## 2026-07-20（14回目）
### 変更内容
- [front/src/lib/config.ts] 新規作成: TemplateCode型・PLACE_OPTIONS・TEMPLATE_LABELS・TEMPLATE_TIMES・SUBJECT_OPTIONSを一元管理（店舗名・件名変更時はここだけ修正）
- [front/src/lib/types.ts] TEMPLATE_LABELS・TEMPLATE_TIMES・TemplateCodeをconfig.tsに移動し再エクスポート（後方互換維持）
- [front/src/pages/AdminShiftPage.tsx] 承認時に場所指定モーダルを追加（許可ボタン→場所Select→確定の2ステップ）。PLACE_OPTIONSをconfig.tsから取得。local PLACE_OPTIONS定数削除
- [front/src/pages/RequestPage.tsx] 場所フィールドをTextInput→Select(プルダウン)に変更、指定なしを初期値。SUBJECT_OPTIONS・PLACE_OPTIONSをconfig.tsから取得
- [front/src/pages/AdminLinePage.tsx] 開発者向けメッセージ（トークン等の秘匿情報…）をJSXコメントに変換（UIから非表示・コードに保存）
- [注記] AdminLinePage全体カレンダーのフィルターボタンは13回目コミットで実装済み

## 2026-07-20（13回目）
### 変更内容
- [front/index.html] Googleフォント: Noto Sans JP → Zen Kaku Gothic New（Inter維持）
- [front/tailwind.config.js] fontFamily.sans: 'Zen Kaku Gothic New' に変更
- [front/package.json] Font Awesome 3パッケージ追加（fontawesome-svg-core/free-solid-svg-icons/react-fontawesome）
- [front/src/components/ui.tsx] Buttonコンポーネントをグラデーション化（上部18%シェーン効果）＋ホバーscale/shadow＋active縮小アニメーション
- [front/src/components/UserLayout.tsx] Lucide→Font Awesomeアイコンに刷新（ナビ全5項目・ロゴ・ログアウト）
- [front/src/components/AdminLayout.tsx] 同上（ナビ全4項目・ロゴ・ユーザーへボタン・ログアウト）
- [front/src/pages/AdminLinePage.tsx] 全体カレンダー上部に予定/確定/確認済/不可フィルタートグルボタン追加（複数選択）、useMemo追加

## 2026-07-20（12回目）
### 変更内容
- [front/src/components/MonthCalendar.tsx] シフト不可（timeType==='none'）をグレー表示（取り消し線なし）で追加、ラベルを「名前 不可」形式に。凡例を動的表示（データに存在するステータスのみ）
- [front/src/pages/CalendarPage.tsx] 全員表示は確定シフトのみに絞り込み（不可・予定・確認済は非表示）。説明文も更新
- [front/src/pages/AdminShiftPage.tsx] FilterStatus型追加（plan/confirmed/reviewed/unavailable）。フィルターをSelectからSet<FilterStatus>トグルボタン（複数選択・枠付き）に置き換え。不可フィルター追加。週間サマリーに不可人数カラム追加。不可申請の操作を「確認済に」のみに変更。statusBadgeが不可を判定

## 2026-07-20（11回目）
### 変更内容
- [front/src/contexts/AuthContext.tsx] signOut時に名前を`shiftapp.savedName`キーでLocalStorageに保持（次回ログイン自動補完用）
- [front/src/pages/NameSetupPage.tsx] savedNameがある場合はワンタップ確認UI（「{名前}でログイン」ボタン）を表示、パスワード必須はそのまま
- [front/src/pages/AdminShiftPage.tsx] 週間人数サマリー（今日〜7日間：確定/予定/確認済の人数）をページ上部に追加
- [front/src/pages/AdminShiftPage.tsx] 名簿モーダルから「記入日」を削除、「最終送信日」のみ表示
- [front/src/pages/AdminShiftPage.tsx] 調整モーダルの時間フィールドを常に初期非表示（+ボタンで展開する運用に統一）
- [front/src/pages/AdminLinePage.tsx] GID管理カードの上に本日のシフト人数・名前一覧を追加（メッセージ作成の参考用）

## 2026-07-20（10回目）
### 変更内容
- [front/src/lib/types.ts] `ShiftStatus`に`'reviewed'`（予定確認済）を追加
- [front/src/components/ui.tsx] `Badge`に`reviewed`カラーを追加（グレー系）
- [front/src/lib/db.ts] `approveShift`の`deny`をstatus=`reviewed`に変更（削除しない設計）
- [front/src/lib/mockStore.ts] モックの否認動作も`reviewed`に統一
- [front/src/components/MonthCalendar.tsx] グラデーション色サポート(`MemberColor`型・`memberColors`prop)追加、`reviewed`ステータス表示（グレー取消線）
- [front/src/pages/CalendarPage.tsx] フィルタを「自分/全員」の2項目に変更、デフォルト=自分、全員表示時はメンバー別グラデーション色
- [front/src/pages/RequestPage.tsx] 件名プルダウンを「A帯」「B帯」等の指定文字のみに変更、「給料受取のみ」→「給料受取など」
- [front/src/components/AdminLayout.tsx] ヘッダーに「ユーザーへ」ボタン追加（サインアウト後/loginへ遷移、パスワード再入力必須）
- [front/src/components/UserLayout.tsx] 管理者ログインリンクをサインアウト後遷移に変更（行き来時も必ずパスワード要求）
- [front/src/pages/AdminShiftPage.tsx] デフォルトソートを日付順に、日付ソートタブ追加、reviewedステータス表示・フィルタ追加、調整モーダルに＋/−時間指定トグル追加
- [front/src/pages/AdminLinePage.tsx] ページ下部に全体シフトカレンダー追加（日付クリックで詳細モーダル）
- [front/src/pages/PersonalPage.tsx] 予定タブにreviewedシフトを含め、「確認済」バッジ表示

## 2026-07-20（9回目）
### 変更内容
- [back/src/app.js] CORS: .vercel.app全サブドメイン＋localhost許可（プレビューURLのCORSブロック解消）
- [back/src/app.js] グループ送信: GROUP_IDをenv varではなくFirestore config/lineConfigから動的取得（getGroupId関数）
- [front/src/pages/AdminLinePage.tsx] 送信成功時にテキストエリアをクリア（onSuccessコールバック）、送信失敗時の案内文を全送信カードに追加

## 2026-07-20（8回目）
### 変更内容
- [front/src/lib/db.ts] deleteMember関数追加
- [front/src/pages/AdminShiftPage.tsx] 名簿詳細にメンバー削除ボタン追加（2段階確認UI）、Trash2 import追加
- [back/src/app.js] 名前登録の競合検知: 名前重複（別LINE ID）・LINE ID重複（別名前）・登録済み・正常登録の4パターンを分岐

## 2026-07-20（7回目）
### 変更内容
- [firestore.rules] config/{docId}ルール追加（isUserOrAdmin読取・isAdmin書込）
- [front/src/lib/db.ts] deleteField import追加、subscribeLineConfig・deleteGroupId関数追加
- [front/src/pages/AdminShiftPage.tsx] 手動LINE ID入力欄をコメントアウト→LINE IDは表示のみに
- [front/src/pages/AdminLinePage.tsx] GID管理セクション追加（登録状況表示・削除ボタン）、自分への連絡をadmin登録LINE IDへのDM送信に変更、(admin:名前)表示追加、グループ送信はGID登録時のみ有効化
- [back/src/app.js] グループ参加自動登録廃止→ログのみ。「グループ登録」メッセージで新規登録/競合検知し管理者DM通知

## 2026-07-20（6回目）
### 変更内容
- [front/src/lib/db.ts] approveShift: beforeStateのundefinedを除去（不可シフトのtimeStart等がundefinedでFirestoreエラーになる問題を修正）。updateMemberLineId関数追加（admin用LINE ID手動設定）
- [front/src/pages/NameSetupPage.tsx] setNameだけでなくupsertMember(Firestore書込)を実際に呼ぶよう修正（本番でmembersコレクションに書き込まれなかったバグを解消）
- [front/src/pages/AdminShiftPage.tsx] 名簿モーダル: LINE登録状況バッジ（LINE済/未登録）追加、手動LINE ID入力・保存欄追加

## 2026-07-20（5回目）
### 変更内容
- [front/src/lib/firebase.ts] API_BASE_URLの末尾スラッシュを除去（//line/selfの404エラー解消）
- [front/src/pages/AdminShiftPage.tsx] doApprove/doDeny/doAdjustにtry-catchを追加し、Firestoreエラーをトースト表示。doAdjustのadjustFieldsの型を明示的に構築

## 2026-07-20（4回目）
### 変更内容
- [front/src/lib/db.ts] createShiftでundefinedプロパティを除外してからaddDoc送信（place: undefined根本修正）
- [back/src/app.js] webhookログ強化: 一般メッセージ/名前登録試行/名前不一致/名前登録成功を個別にconsole.log、本番URL修正

## 2026-07-20（3回目）
### 変更内容
- [front/src/pages/RequestPage.tsx] 文字化け全修正、place: undefined → 条件付きspreadに変更（Firestoreエラー解消）
- [front/src/pages/AdminShiftPage.tsx] シフト一覧: timeType===time の場合のみ時間表示、不可(none)は時間非表示。調整モーダル: timeType===none の場合に時間フィールドを非表示、doAdjust の timeType/place を条件付きspreadで適切に設定
- [back/src/app.js] メンバー未発見時にVercel URL＋Firestoreの現在名簿をLINE返信

## 2026-07-20（2回目）
### 変更内容
- [front/src/contexts/DataContext.tsx] role/initializingに依存してFirestore再購読（auth前の空データ問題を根本解消）、firestoreErrorをコンテキストに追加
- [front/src/pages/PersonalPage.tsx] firestoreErrorを画面表示
- [front/src/pages/RequestPage.tsx] myRecentを全件表示（8件制限撤廃）、firestoreErrorを画面表示
- [front/src/pages/CalendarPage.tsx] メンバー名・ステータスのフィルタ追加
- [front/src/pages/AdminShiftPage.tsx] 調整モーダルの場所をInput→4択Select（PLACE_OPTIONS定数）に変更
- [back/src/app.js] 名前登録トリガーを「名前登録 名前」方式に変更（旧「登録:名前」も互換）、余分な言葉の検出、notifySelfErrorのenv変数チェック強化・JST時刻表記

## 2026-07-21
### 変更内容
- [front/src/components/ProtectedRoute.tsx] user/admin両方に名前入力を必須化
- [front/src/pages/NameSetupPage.tsx] ログイン後リダイレクト先をrole別に分岐（admin→/admin-shift）
- [front/src/pages/AdminBoardPage.tsx] hardcoded '管理者'をuseAuth().nameに置換
- [front/src/pages/AdminShiftPage.tsx] 同上 + useAuth import追加
- [front/src/components/AdminLayout.tsx] ヘッダーに管理者名バッジ表示
- [front/src/lib/db.ts] cancelShift関数追加（planのみ可・runTransaction版楽観ロック）
- [front/src/pages/PersonalPage.tsx] planシフトに「申請取消」ボタン追加
- [front/src/pages/RequestPage.tsx] テンプレートA-D（時間不要）+時間指定の5択に再設計、人数フィールド削除、件名表記を「件名A帯 名前」形式に明確化、キャンセルボタンを最近の申請にも追加
- [firestore.rules] planステータスのシフト削除をuser/adminに許可（デプロイ済み）
- [back/src/app.js] webhookエラーとAPIエラーを管理者LINEに通知するnotifySelfError関数追加
- [CLAUDE.md] デプロイ後まとめ報告ルール・バックエンドgitプッシュ手順を追加

## 2026-07-20
### 変更内容
- [front/vercel.json] 新規作成: SPA全ルートをindex.htmlにrewrite（お気に入り直接アクセスの404解消）
- [front/src/components/UserLayout.tsx] フッターに管理者ログインへの誘導リンクを追加
- [back/src/app.js] webhookハンドラを実装: LINEテキスト「登録:名前」でFirestore membersにlineUserId保存、グループ参加イベントでgroupIdをconfig/lineConfigに保存
- [back/package.json] firebase-admin ^12.0.0をdependenciesに追加
- [back/.gitignore] 新規作成: .envをgit管理から除外
- [back/] Heroku v10へデプロイ完了

## 2026-07-19
### 変更内容
- [front/src/contexts/AuthContext.tsx] doSignIn を getIdTokenResult() ベースに書き換え。onAuthStateChanged でもトークンからロール読み取り、クレーム未設定アカウントは自動サインアウト
- [firestore.rules] カスタムクレーム（request.auth.token.role）を使ったロールベースのセキュリティルールに全面更新
- [front/public/] ファビコン5ファイルを public/ に配置
- [front/index.html] favicon.ico / favicon-32x32.png / apple-touch-icon.png のリンクタグ追加
- [front/src/pages/RequestPage.tsx] シフト不可を週単位申請（月〜日まとめて7件送信）に変更。シフト申請の時間選択を15分刻みのセレクトに変更。件名をA帯〜D帯の選択式に変更し、送信時は「件名 名前」形式で保存
- [CLAUDE.md] 開発ルール（修正後の自動Push・CHANGELOG記録）を追記。残タスク更新
