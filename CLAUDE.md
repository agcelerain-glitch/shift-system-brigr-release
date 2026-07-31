# シフト管理システム（shiftsystem_bri_release）— 開発仕様書

## システム概要
20人以上の規模を想定したシフト管理システム。
フロントエンドにはVercel、バックエンドにはHeroku、DB兼認証にはFirebaseを利用する。
堅牢なシステム構築のため、DB兼ログインはFirebase（Firestore / Firebase Auth）で構築する。

## リポジトリ構成（モノレポ）
```
shiftsystem_bri_release/
├── front/              # React + Vite + TypeScript + Tailwind → Vercel
├── back/               # Node.js + Express（LINE連携）→ Heroku
├── firebase.json       # Firebase CLI設定（ルートに置きdeploy容易化）
├── .firebaserc
├── firestore.rules
├── firestore.indexes.json
├── set-claims.js       # カスタムクレーム付与スクリプト（ローカル実行のみ）
├── package.json        # firebase-admin（set-claims用）
└── CLAUDE.md
```

## 技術スタック（確定）
- フロント: React + Vite + TypeScript + Tailwind CSS（Vercelにデプロイ）
- DB兼認証: Firebase（Firestore / Firebase Auth）
- LINE連携バックエンド: Heroku上のNode/Express（`back/`ディレクトリ）
- Pythonは不採用（同期はFirestoreのtransaction/onSnapshotに任せる）

## 認証設計
- ログインはパスワードのみ入力、名前チェックはしない
- 固定メール＋入力パスワードでFirebase Authにサインイン（user用/admin用の2アカウント）
- roleはFirebase Authのカスタムクレーム（user/admin）で管理
  - 付与はローカルの `set-claims.js`（firebase-admin）で行う
  - `node set-claims.js` で実行（`YOUR-PROJECT-firebase.json` が必要）
- doSignInは `getIdTokenResult()` でclaimのroleを読む（実装済み）
- ログイン後に名前を入力させ、シフト・掲示板をその名前で紐づける
- パスワードはFirestoreに一切保存しない

## ページ構成

### userページ
| パス | 内容 |
|------|------|
| `/` | カレンダー（全員分）。予定タグ・確定タグで全員シフト確認 |
| `/board` | 掲示板。adminが投稿したお知らせを閲覧 |
| `/personal` | 自分のシフトのみ。予定/確定/当日の3パターン。件名コピー機能あり（個人カレンダー転記用） |
| `/request` | シフト申請。重複防止。不可/日付指定/時間指定/テンプレ(A〜D帯)/その他(給料受取のみ) |
| `/manual-user` | userマニュアル（userログイン時のみ閲覧可） |

### adminページ
| パス | 内容 |
|------|------|
| `/admin-top` | adminログイン |
| `/admin-shift` | シフト申請の許可/否認/調整。5タグ（場所/時間/名前/曜日/人数）でソート。名簿確認・ログ確認・LINEジャンプ |
| `/admin-line` | LINEグループ送信（シフト連絡/ポジション配置連絡）・自分への連絡・個別チャット連絡 |
| `/admin-board` | admin非公開メモ＋全体掲示板投稿/削除 |
| `/manual-admin` | adminマニュアル（adminログイン時のみ閲覧可） |

ロールごとに閲覧可否を厳密に分ける。

## Firestoreデータモデル
| コレクション | 内容 | アクセス |
|---|---|---|
| `members` | 名簿（name, createdAt, updatedAt, lineUserId） | 認証済みuser/admin読取、本人書込 |
| `shifts` | シフト申請・確定（memberName, date, status, timeType, subject, version…） | user書込、全員読取、admin承認操作 |
| `boardPublic` | 全体掲示板 | 全員読取、adminのみ書込/削除 |
| `boardPrivate` | admin非公開メモ/通知 | adminのみ読書 |
| `approvalLogs` | 承認ログ（7日復元用） | adminのみ読書 |

Security Rulesでrole別に読み書き権限を厳密分離。

## 同期・堅牢性
- シフト承認/更新は `runTransaction` ＋ `version` フィールドの楽観ロック
- 競合時は最新優先で上書き、または競合エラー表示
- 承認操作は `approvalLogs` に変更前スナップショットを保存し、7日以内は復元可能
- 同時アクセスは最低10人を堅牢に許容する
- adminログイン時、現在のログイン人数をwebアプリ上に表示させ、同期ミスがないようにする

## LINEバックエンド（back/）エンドポイント
| メソッド | パス | 機能 |
|---|---|---|
| POST | `/line/group/shift` | グループにシフト連絡送信 |
| POST | `/line/group/position` | グループに当日ポジション配置連絡送信 |
| POST | `/line/self` | 自分（管理者）への連絡 |
| POST | `/line/dm` | 個別チャット連絡（lineUserId指定） |
| POST | `/line/webhook` | LINEからのWebhook受信（双方向連携用） |

リクエストボディ: `{ message: string, lineUserId?: string }`
LINEトークンはHeroku環境変数で管理し、フロントに置かない。

## 環境変数

### front/.env（Vercel環境変数にも設定）
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USER_EMAIL=
VITE_ADMIN_EMAIL=
VITE_API_BASE_URL=https://your-heroku-app.herokuapp.com
```

### back/.env（Heroku環境変数にも設定）
```
CHANNEL_SECRET=
CHANNEL_ACCESS_TOKEN=
LINE_GROUP_ID=
LINE_SELF_USER_ID=
ALLOWED_ORIGIN=https://your-app.vercel.app
```

## デプロイフロー
1. **フロント**: `front/` をVercelにデプロイ。GitHubと連携してPushで自動デプロイ
2. **バックエンド**: `back/` をHerokuにデプロイ。`Procfile`でnode起動
3. **Firestore Rules**: ルートで `firebase deploy --only firestore:rules`

## セットアップ手順（リリース初回）
1. `front/.env.example` → `front/.env` にコピーして各値を入力
2. `back/.env.example` → `back/.env` にコピーして各値を入力
3. `.firebaserc` の `YOUR_FIREBASE_PROJECT_ID` を実際のFirebaseプロジェクトIDに変更
4. Firebase Admin SDKの秘密鍵JSONをルートに配置し、`set-claims.js` のファイル名参照を更新
5. `set-claims.js` のメールアドレスを実際のuser/adminメールに変更
6. `node set-claims.js` でカスタムクレーム付与
7. `firebase deploy --only firestore:rules` でFirestoreルールをデプロイ
8. `front/` でGitHub連携Vercelデプロイ
9. `back/` でHerokuデプロイ

## 開発ルール（Claude必読・毎回必ず守ること）

### 修正時の必須フロー
コードを1ファイルでも修正したら、必ず以下を全て実行する：

1. **CHANGELOG.md を更新**（`CHANGELOG.md`）
   - 日付・対象ファイル・変更内容を記録する
2. **フロント変更がある場合: git commit & push（Vercel自動デプロイ）**
   - gitリポジトリは `front/` ディレクトリにある
   - `front/` → `git add（対象ファイルのみ）` → `git commit` → `git push origin main`
   - ユーザーに「プッシュしますか？」と確認しない。修正後は自動でプッシュする
3. **バックエンド変更がある場合: Herokuにプッシュ**
   - gitリポジトリは `back/` ディレクトリにある
   - `back/` → `git add（対象ファイルのみ）` → `git commit` → Herokuにpush
4. **Firestore Rules変更がある場合: firebase deploy**
   - ルートディレクトリで `firebase deploy --only firestore:rules`
5. **セッション末尾にデプロイまとめをユーザーに報告**
   - Vercel（フロント）・Heroku（バック）・Firebase Rulesのどれを更新したか
   - リリースバージョン（Herokuはvxx）
   - 変更内容の要点

### CHANGELOG.md の記述フォーマット
```
## YYYY-MM-DD
### 変更内容
- [ファイルパス] 変更の概要
```

### git リポジトリの場所
- フロントエンドのgitは `front/` ディレクトリ（初回は `git init` が必要）
- バックエンドのgitは `back/` ディレクトリ（初回は `git init` が必要）
