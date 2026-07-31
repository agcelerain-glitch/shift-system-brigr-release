# Shifter — シフト管理システム テンプレート

React + Firebase + LINE Messaging API を使った、20名以上規模のシフト管理システムです。
このテンプレートをコピー・カスタマイズすることで、企業ごとのシフト管理システムを構築できます。

---

## 技術スタック

| 役割 | 技術 | デプロイ先 |
|------|------|-----------|
| フロントエンド | React + Vite + TypeScript + Tailwind CSS | Vercel |
| DB / 認証 | Firebase（Firestore + Firebase Auth） | Firebase |
| LINE連携バックエンド | Node.js + Express | Heroku |

---

## ⚠️ カスタマイズ必須項目（先に読んでください）

### `front/src/lib/config.ts` — 勤務帯・場所・件名の設定

このファイルがシステム固有の設定をすべて管理しています。**最初に必ず変更してください。**

```typescript
// ---- 勤務帯コード（A〜D 以外にしたい場合は TemplateCode 型も変更） ----
export type TemplateCode = 'A' | 'B' | 'C' | 'D';

// ---- 場所・拠点名（「指定なし」はUI側で先頭に自動追加） ----
// ↓ 企業の店舗・拠点名に書き換えてください
export const PLACE_OPTIONS = ['本店', '支店A', '支店B', '倉庫'] as const;

// ---- 勤務帯の表示ラベル ----
// ↓ 会社の呼び方（「早番」「遅番」「夜勤」など）に変更してください
export const TEMPLATE_LABELS: Record<TemplateCode, string> = {
  A: 'A帯',   // 例: '早番' / 'AM' / 'Morning'
  B: 'B帯',   // 例: '中番' / '昼番'
  C: 'C帯',   // 例: '遅番' / 'PM'
  D: 'D帯',   // 例: '夜番' / 'Night'
};

// ---- 勤務帯の目安時間（LINEの返答にも使用） ----
// ↓ 実際の勤務時間に合わせて変更してください
export const TEMPLATE_TIMES: Record<TemplateCode, { start: string; end: string }> = {
  A: { start: '09:00', end: '13:00' },
  B: { start: '13:00', end: '17:00' },
  C: { start: '17:00', end: '21:00' },
  D: { start: '21:00', end: '25:00' },
};
```

> **注意**: 勤務帯を3種類にする、または名前を変える場合は、`TemplateCode` 型の定義も合わせて変更してください。

### `back/src/app.js` — LINEバックエンドの勤務帯時間

`config.ts` と同じ内容を `TEMPLATE_TIMES` 定数で管理しています（LINEの日付問い合わせ返答で使用）。
`config.ts` を変更したら、`back/src/app.js` の以下の箇所も合わせて変更してください。

```javascript
const TEMPLATE_TIMES = {
  A: { start: '09:00', end: '13:00' },
  B: { start: '13:00', end: '17:00' },
  C: { start: '17:00', end: '21:00' },
  D: { start: '21:00', end: '25:00' },
};
```

---

## セットアップ チェックリスト

### Step 1: Firebase プロジェクト作成

- [ ] [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成
- [ ] **Firestore Database** を有効化（本番モードで開始）
- [ ] **Authentication** を有効化し、「メール/パスワード」プロバイダをオン
- [ ] Authentication で2つのアカウントを作成
  - user用: 全スタッフが共用するアカウント（例: `staff@yourcompany.com`）
  - admin用: 管理者専用アカウント（例: `admin@yourcompany.com`）
- [ ] プロジェクト設定 > ウェブアプリを追加 > APIキー等を取得
- [ ] `.firebaserc` のプロジェクトIDを `YOUR_FIREBASE_PROJECT_ID` → 実際のIDに変更
- [ ] `set-claims.js` 用に Firebase Admin SDK の秘密鍵（JSON）を取得
  - Firebase Console > プロジェクト設定 > サービスアカウント > 新しい秘密鍵を生成
  - ダウンロードしたJSONを `YOUR-PROJECT-firebase.json` に **リネームしてルートに配置**（.gitignoreで除外済み）
- [ ] `npm install`（ルートで実行）→ `node set-claims.js` でカスタムクレーム付与
  - user用アカウントに `role: 'user'` クレームを付与
  - admin用アカウントに `role: 'admin'` クレームを付与

### Step 2: Firestore Rules のデプロイ

- [ ] Firebase CLI インストール: `npm install -g firebase-tools`
- [ ] ログイン: `firebase login`
- [ ] ルールをデプロイ: `firebase deploy --only firestore:rules`

### Step 3: LINE Messaging API 設定

- [ ] [LINE Developers](https://developers.line.biz/) でチャンネル作成（Messaging APIタイプ）
- [ ] **Channel Secret** を取得（チャンネル基本設定）
- [ ] **Channel Access Token** を発行（Messaging API設定）
- [ ] Webhook URLを設定（Herokuデプロイ後に `https://your-app.herokuapp.com/line/webhook` を入力）
- [ ] 「応答メッセージ」と「あいさつメッセージ」をオフにする（Webhookで制御するため）

### Step 4: フロントエンド（Vercel）のデプロイ

- [ ] `front/.env.example` → `front/.env` にコピーし、すべての値を入力
- [ ] `front/` ディレクトリで `git init` → GitHubリポジトリにプッシュ
- [ ] [Vercel](https://vercel.com/) でプロジェクトを作成し、GitHubリポジトリと連携
- [ ] Vercel の環境変数に `front/.env` の内容を登録
- [ ] ルートディレクトリを `front` に設定してデプロイ

### Step 5: バックエンド（Heroku）のデプロイ

- [ ] `back/.env.example` → `back/.env` にコピーし、すべての値を入力
  - Firebase Admin SDK の認証情報も追加（`FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`）
- [ ] [Heroku](https://heroku.com/) で新規アプリを作成
- [ ] Heroku の環境変数（Config Vars）に `back/.env` の内容を登録
- [ ] Heroku にデプロイ（モノレポ構成の場合はルートから `git subtree` を使用）
  ```
  # ルートリポジトリから back/ サブツリーのみを Heroku に push する
  heroku git:remote -a your-heroku-app-name
  git subtree push --prefix back heroku main
  ```
  > `back/` 単独で git を管理する場合:
  > ```
  > cd back/
  > git init
  > heroku git:remote -a your-heroku-app-name
  > git add .
  > git commit -m "initial"
  > git push heroku main
  > ```
- [ ] フロントの `VITE_API_BASE_URL` を Heroku の URL に更新して再デプロイ

### Step 6: LINE グループ連携

- [ ] 作成した LINE Messaging API Bot を対象グループに招待
- [ ] グループ内で「**グループ登録**」と送信 → グループIDが自動登録される
- [ ] 管理者自身も Bot と友達になり「**名前登録 お名前**」と送信

### Step 7: 動作確認

- [ ] フロントにアクセスしてuserログイン・admin ログインが成功するか
- [ ] userログイン後にシフト申請が送信できるか
- [ ] adminログインで申請を許可・否認できるか
- [ ] LINEへのシフト連絡が届くか
- [ ] LINEで日付送信（例: `今日`）で確定シフトが返答されるか

---

## 環境変数一覧

### `front/.env`

| 変数名 | 内容 |
|--------|------|
| `VITE_FIREBASE_API_KEY` | Firebase Web App API キー |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth ドメイン |
| `VITE_FIREBASE_PROJECT_ID` | Firebase プロジェクトID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage バケット |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |
| `VITE_USER_EMAIL` | user共用アカウントのメールアドレス |
| `VITE_ADMIN_EMAIL` | admin専用アカウントのメールアドレス |
| `VITE_API_BASE_URL` | Heroku バックエンドの URL |

### `back/.env`（Heroku Config Vars）

| 変数名 | 必要性 | 内容 |
|--------|--------|------|
| `CHANNEL_SECRET` | **必須** | LINE Channel Secret（署名検証に使用） |
| `CHANNEL_ACCESS_TOKEN` | **必須** | LINE Channel Access Token（メッセージ送信に使用） |
| `LINE_SELF_USER_ID` | **必須** | 管理者自身の LINE User ID（エラー通知・自分への連絡用） |
| `ALLOWED_ORIGIN` | **必須** | CORSを許可するVercelのURL（例: `https://your-app.vercel.app`） |
| `FIREBASE_PROJECT_ID` | **必須** | Firebase プロジェクトID（Firestore接続に必要） |
| `FIREBASE_CLIENT_EMAIL` | **必須** | Firebase Admin SDK のクライアントEmail |
| `FIREBASE_PRIVATE_KEY` | **必須** | Firebase Admin SDK の秘密鍵（改行は `\n` でエスケープ） |
| `FRONTEND_URL` | 任意 | 名前未一致時のLINE返信内に表示するフロントURL。未設定でも動作する |
| `LINE_GROUP_ID` | 不要 | グループIDはFirestoreに自動保存される。env varはフォールバック専用のため通常設定不要 |
| `PORT` | **設定禁止** | Herokuが動的に割り当てるため設定してはいけない。固定値を入れるとアプリが起動しない |

---

## ファイル構成

```
shifter_template/
├── front/                        # フロントエンド（Vercel）
│   └── src/
│       ├── lib/
│       │   └── config.ts         # ★ 最初に編集 — 勤務帯・場所・件名
│       ├── pages/                # 各ページ
│       └── components/           # 共通コンポーネント
├── back/                         # LINEバックエンド（Heroku）
│   └── src/
│       └── app.js                # ★ TEMPLATE_TIMES を config.ts と合わせて編集
├── firestore.rules               # Firestore セキュリティルール
├── firebase.json                 # Firebase CLI 設定
├── .firebaserc                   # ★ Firebase プロジェクトIDを変更
├── set-claims.js                 # カスタムクレーム付与スクリプト（ローカル実行のみ）
└── README.md                     # このファイル
```

---

## カスタマイズ後の確認ポイント

変更が必要なファイルの優先度:

| 優先度 | ファイル | 変更内容 |
|--------|---------|---------|
| 🔴 必須 | `front/src/lib/config.ts` | 勤務帯名・時間・場所・件名 |
| 🔴 必須 | `back/src/app.js` | `TEMPLATE_TIMES` を config.ts と同期 |
| 🔴 必須 | `.firebaserc` | Firebase プロジェクトID |
| 🔴 必須 | `front/.env` | Firebase・Heroku の各種キー |
| 🔴 必須 | `back/.env` | LINE API キー・Firebase Admin SDK |
| 🟡 推奨 | `front/src/pages/ManualUserPage.tsx` | ユーザー向けマニュアルの文章 |
| 🟡 推奨 | `front/src/pages/ManualAdminPage.tsx` | 管理者向けマニュアルの文章 |
| 🟡 推奨 | `front/public/` | ファビコン・アイコン画像 |
| 🟢 任意 | `front/src/components/UserLayout.tsx` | ナビのアプリ名・アイコン |
| 🟢 任意 | `front/src/components/AdminLayout.tsx` | 管理者画面のタイトル |
