# 過去分シフト申請の自動否認 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 毎日JSTで `date < today` の未処理シフト申請(`status==='plan'`)を自動で否認(`status='reviewed'`)する独立cronスクリプトを追加する。

**Architecture:** `back/src/auto-deny.js` を新規作成（`lock.js` を雛形）。純粋ヘルパー（否認対象判定・スナップショット構築）を分離して `node:test` でTDDし、副作用（Firestoreバッチ・LINE）を持つ `main()` は `--dry-run` で検証する。Heroku Scheduler に Daily ジョブを登録する。

**Tech Stack:** Node.js 22.x / firebase-admin / @line/bot-sdk / 組み込み `node:test`（新規依存なし）

## Global Constraints

- Node 22.x。**新規npm依存は追加しない**（テストは組み込みの `node:test` / `node:assert`）。
- 否認＝ `status: 'reviewed'`（削除ではない）。対象は `status==='plan'` **のみ**。
- 対象日付は `date < toDateStr(todayJST())`。当日(`date == today`)は対象外。
- Firestore **複合インデックスを作らない**: クエリは `shifts.where('date','<',cutoff)` の単一フィールドのみ。`status==='plan'` は**メモリ内でフィルタ**。
- `approvalLogs` へ1件記録: `{ shiftId, beforeState, action:'deny', adminName:'自動否認(システム)', createdAt: serverTimestamp() }`。`createdAt` は **Firestore Timestamp**（`clean.js` が `createdAt` Timestamp で22日後に削除するため）。
- `beforeState` は `front/src/lib/db.ts` の手動否認と**同一フィールド集合**（`id,memberName,date,status,timeType,timeStart,timeEnd,template,subject,place,headcount,createdAt(ms),updatedAt(ms),version`）で、`undefined` フィールドは除去。
- シフトの `updatedAt` は `Date.now()`（number。`lock.js` および `Shift.updatedAt: number` と一致）。`version` は `+1`。
- バッチは1シフト=2オペのため **250件ごと**に分割（Firestore 500オペ上限）。
- 正常時はLINE通知なし（`console.log` のみ）。**失敗時のみ**開発者 `LINE_SELF_USER_ID` へ通知。
- デプロイは **subtree split 手順**（`git push heroku main` は厳禁）。Heroku Scheduler 登録は手動作業。

---

## File Structure

- Create: `back/src/auto-deny.js` — cronスクリプト本体。純粋ヘルパーを `module.exports` で公開し、`require.main === module` のときのみ `main()` を実行。Firebase初期化は `main()` 内（テストで require しても副作用を起こさないため）。
- Create: `back/test/auto-deny.test.js` — `node:test` による純粋ヘルパーのユニットテスト。
- Modify: `back/package.json` — `scripts` に `"test": "node --test"` を追加。
- Modify: `CHANGELOG.md` — 変更記録（※ `.gitignore` 対象のためローカル記録のみ・コミット対象外）。
- 手動: Heroku Scheduler に `node src/auto-deny.js` を Daily 登録。

---

### Task 1: 純粋ヘルパー + ユニットテスト（TDD）

**Files:**
- Create: `back/src/auto-deny.js`（この時点ではヘルパーと `module.exports` のみ）
- Create: `back/test/auto-deny.test.js`
- Modify: `back/package.json`

**Interfaces:**
- Produces:
  - `isAutoDenyTarget(data: {status?:string, date?:string}, cutoffStr: string): boolean`
  - `toMs(v: number | {toMillis?:()=>number, _seconds?:number} | null | undefined): number | undefined`
  - `buildBeforeState(id: string, data: Record<string,unknown>): Record<string,unknown>`
  - `todayJST(): Date` / `toDateStr(d: Date): string`

- [ ] **Step 1: 失敗するテストを書く** — `back/test/auto-deny.test.js`

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isAutoDenyTarget, buildBeforeState, toMs } = require('../src/auto-deny');

const CUTOFF = '2026-11-01';

test('isAutoDenyTarget: plan かつ 過去日 → true', () => {
  assert.equal(isAutoDenyTarget({ status: 'plan', date: '2026-10-31' }, CUTOFF), true);
});
test('isAutoDenyTarget: plan かつ 当日 → false（当日は対象外）', () => {
  assert.equal(isAutoDenyTarget({ status: 'plan', date: '2026-11-01' }, CUTOFF), false);
});
test('isAutoDenyTarget: plan かつ 未来日 → false', () => {
  assert.equal(isAutoDenyTarget({ status: 'plan', date: '2026-11-02' }, CUTOFF), false);
});
test('isAutoDenyTarget: confirmed は過去でも false', () => {
  assert.equal(isAutoDenyTarget({ status: 'confirmed', date: '2026-10-31' }, CUTOFF), false);
});
test('isAutoDenyTarget: reviewed は過去でも false', () => {
  assert.equal(isAutoDenyTarget({ status: 'reviewed', date: '2026-10-31' }, CUTOFF), false);
});
test('isAutoDenyTarget: delete_requested は過去でも false', () => {
  assert.equal(isAutoDenyTarget({ status: 'delete_requested', date: '2026-10-31' }, CUTOFF), false);
});

test('toMs: number はそのまま返す', () => {
  assert.equal(toMs(1700000000000), 1700000000000);
});
test('toMs: Timestamp(toMillis) を ms に変換', () => {
  assert.equal(toMs({ toMillis: () => 1700000000000 }), 1700000000000);
});
test('toMs: _seconds 形式を ms に変換', () => {
  assert.equal(toMs({ _seconds: 1700000000 }), 1700000000000);
});
test('toMs: null/undefined は undefined', () => {
  assert.equal(toMs(null), undefined);
  assert.equal(toMs(undefined), undefined);
});

test('buildBeforeState: undefined フィールドを除去する', () => {
  const bs = buildBeforeState('abc', {
    memberName: '山田', date: '2026-10-31', status: 'plan', timeType: 'none',
    subject: '不可', version: 3,
    // timeStart/timeEnd/template/place/headcount は未定義（不可シフト）
  });
  assert.equal('timeStart' in bs, false);
  assert.equal('template' in bs, false);
  assert.equal('place' in bs, false);
  assert.equal(bs.id, 'abc');
  assert.equal(bs.version, 3);
  assert.equal(bs.status, 'plan');
});
test('buildBeforeState: version 未設定なら 1 を補完', () => {
  const bs = buildBeforeState('x', { memberName: 'a', date: '2026-10-31', status: 'plan', timeType: 'time', subject: 's' });
  assert.equal(bs.version, 1);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd back && node --test`
Expected: FAIL（`Cannot find module '../src/auto-deny'` または export未定義）

- [ ] **Step 3: `back/src/auto-deny.js` にヘルパーと exports を実装**

```js
'use strict';
/**
 * auto-deny.js — 過去分シフト申請の自動否認
 *
 * Heroku Scheduler 設定:
 *   コマンド: node src/auto-deny.js
 *   頻度: Daily（曜日チェックなし・毎日実行）
 *
 * ロジック:
 *   1. today(JST) から cutoff = toDateStr(today) を算出
 *   2. shifts.where('date','<',cutoff) を取得し status==='plan' をメモリ内で絞り込み
 *      （status等価 + date範囲 の複合インデックスを避けるため単一フィールドクエリ）
 *   3. 対象を status='reviewed' にバッチ更新 + approvalLogs に否認前スナップショット記録
 *      （1シフト=2オペ。500オペ上限のため 250 件ごとに分割）
 *   4. 正常時 LINE 通知なし（console.log のみ）。失敗時のみ開発者へ通知。
 *
 * オプション:
 *   --dry-run  : Firestore 更新・approvalLogs 書き込みをせず対象のみ表示
 */

const admin = require('firebase-admin');
const { messagingApi } = require('@line/bot-sdk');

const DRY_RUN = process.argv.includes('--dry-run');
const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

// ─── 日付ユーティリティ（lock.js と同一） ───────────────
function todayJST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function toDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS_JP[d.getUTCDay()]})`;
}

// ─── 純粋ヘルパー（テスト対象） ───────────────────────────
// 否認対象か: 未処理(plan) かつ シフト日が cutoff より前（当日は対象外）
function isAutoDenyTarget(data, cutoffStr) {
  return data.status === 'plan' && typeof data.date === 'string' && data.date < cutoffStr;
}

// Firestore Timestamp / number を ms(number) に正規化
function toMs(v) {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  return undefined;
}

// 否認前スナップショット（db.ts の beforeState と同一フィールド・undefined除去）
function buildBeforeState(id, data) {
  const bs = {
    id,
    memberName: data.memberName,
    date: data.date,
    status: data.status,
    timeType: data.timeType,
    timeStart: data.timeStart,
    timeEnd: data.timeEnd,
    template: data.template,
    subject: data.subject,
    place: data.place,
    headcount: data.headcount,
    createdAt: toMs(data.createdAt),
    updatedAt: toMs(data.updatedAt),
    version: typeof data.version === 'number' ? data.version : 1,
  };
  return Object.fromEntries(Object.entries(bs).filter(([, v]) => v !== undefined));
}

module.exports = { isAutoDenyTarget, buildBeforeState, toMs, todayJST, toDateStr, formatDateShort };
```

- [ ] **Step 4: `back/package.json` に test スクリプトを追加**

`scripts` を次のようにする（`main` 等はそのまま）:

```json
  "scripts": {
    "start": "node src/app.js",
    "dev": "node --watch src/app.js",
    "test": "node --test"
  },
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `cd back && node --test`
Expected: PASS（全テスト green。`tests 13` 前後 / `fail 0`）

- [ ] **Step 6: コミット**

```bash
# ルート(shiftsystem_bri_release)から
git add back/src/auto-deny.js back/test/auto-deny.test.js back/package.json
git commit -m "feat(back): 自動否認の純粋ヘルパーとユニットテストを追加"
```

---

### Task 2: スクリプト本体 `main()` 実装（Firestore バッチ・dry-run・失敗通知）

**Files:**
- Modify: `back/src/auto-deny.js`（Firebase初期化・LINE失敗通知・`main()`・`require.main` ガードを追記）

**Interfaces:**
- Consumes: Task 1 の `isAutoDenyTarget`, `buildBeforeState`, `todayJST`, `toDateStr`, `formatDateShort`（同一ファイル内の関数）
- Produces: `node src/auto-deny.js [--dry-run]` で実行可能なスクリプト

- [ ] **Step 1: Firebase初期化とLINE失敗通知ヘルパーを追記**

`module.exports = ...` の**直前**に以下を挿入する:

```js
// ─── Firebase Admin 初期化（lock.js と同一・main内で呼ぶ） ─────
function parseFirebasePrivateKey(raw) {
  if (!raw) return null;
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    try { key = JSON.parse(key); } catch { key = key.slice(1, -1); }
  }
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return key;
}

function initFirebase() {
  if (admin.apps.length) return;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    console.log('[auto-deny] Firebase Admin 初期化成功 (GOOGLE_APPLICATION_CREDENTIALS)');
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = parseFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    if (!projectId || !clientEmail || !privateKey) {
      console.error('[auto-deny] 必須環境変数未設定: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
      process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
    console.log('[auto-deny] Firebase Admin 初期化成功 (env vars)');
  }
}

// ─── LINE（失敗時通知のみ） ───────────────────────────────
async function notifyFailure(message) {
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  const selfId = process.env.LINE_SELF_USER_ID;
  if (!token || !selfId) return;
  try {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
    await client.pushMessage({
      to: selfId,
      messages: [{ type: 'text', text: `[自動否認ジョブ失敗]\n${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\nエラー: ${message}` }],
    });
  } catch (e) {
    console.error('[auto-deny] 失敗通知の送信に失敗:', e?.message ?? e);
  }
}
```

- [ ] **Step 2: `main()` と `require.main` ガードを追記**

同じく `module.exports = ...` の**直前**（Step 1 の続き）に以下を挿入する:

```js
// ─── メイン ──────────────────────────────────────────────
async function main() {
  initFirebase();
  const db = admin.firestore();

  const cutoff = toDateStr(todayJST());
  const mode = DRY_RUN ? '[DRY-RUN] ' : '';
  console.log(`[auto-deny] ${mode}開始 — date < ${cutoff} の未処理(plan)を否認`);

  // 単一フィールドクエリ + メモリ内フィルタ（複合インデックス回避）
  const snap = await db.collection('shifts').where('date', '<', cutoff).get();
  const targets = snap.docs.filter((d) => isAutoDenyTarget(d.data(), cutoff));

  if (targets.length === 0) {
    console.log('[auto-deny] 対象なし — 終了');
    return;
  }

  console.log(`[auto-deny] 否認対象: ${targets.length}件`);
  targets.forEach((d) => {
    const x = d.data();
    console.log(`  - ${x.date} ${formatDateShort(x.date)} ${x.memberName}（${x.subject ?? ''}）`);
  });

  if (DRY_RUN) {
    console.log(`[auto-deny][DRY-RUN] ${targets.length}件を否認対象として表示（Firestore更新スキップ）`);
    return;
  }

  // バッチ更新（1シフト=2オペ。500オペ上限 → 250件ごと）
  const CHUNK = 250;
  let denied = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = db.batch();
    const chunk = targets.slice(i, i + CHUNK);
    for (const d of chunk) {
      const data = d.data();
      batch.update(d.ref, {
        status: 'reviewed',
        version: (typeof data.version === 'number' ? data.version : 1) + 1,
        updatedAt: Date.now(),
      });
      const logRef = db.collection('approvalLogs').doc();
      batch.set(logRef, {
        shiftId: d.id,
        beforeState: buildBeforeState(d.id, data),
        action: 'deny',
        adminName: '自動否認(システム)',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    denied += chunk.length;
    console.log(`[auto-deny] バッチ更新: ${denied}/${targets.length}件`);
  }

  console.log(`[auto-deny] ${mode}完了 — ${denied}件を自動否認（reviewed）`);
}

if (require.main === module) {
  main().catch(async (e) => {
    const msg = e?.message ?? String(e);
    console.error('[auto-deny] 予期しないエラー:', msg);
    await notifyFailure(msg);
    process.exit(1);
  });
}
```

- [ ] **Step 3: 構文チェック**

Run: `node --check back/src/auto-deny.js`
Expected: エラーなし（出力なしで終了）

- [ ] **Step 4: ユニットテストが引き続き通ることを確認**

Run: `cd back && node --test`
Expected: PASS（`require.main` ガードにより require 時に `main()` は走らず、Firebase初期化も発生しない）

- [ ] **Step 5: （任意・認証情報がある場合）dry-run で対象を目視確認**

Run: `cd back && GOOGLE_APPLICATION_CREDENTIALS=../YOUR-PROJECT-firebase.json node src/auto-deny.js --dry-run`
Expected: 過去日の `plan` のみが対象として列挙され、`confirmed`/`reviewed`/当日分が含まれないこと。Firestoreは更新されないこと。
（認証情報が手元にない場合はこのステップをスキップし、本番Scheduler登録後の初回ログで確認する）

- [ ] **Step 6: コミット**

```bash
git add back/src/auto-deny.js
git commit -m "feat(back): auto-deny.js 本体（Firestoreバッチ否認・dry-run・失敗通知）を実装"
```

---

### Task 3: デプロイ & Heroku Scheduler 登録 & CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`（ローカル記録・コミット対象外）

- [ ] **Step 1: CHANGELOG.md を更新**（先頭 `# CHANGELOG` の直後に追記）

```
## 2026-10-31
### 変更内容
- [back/src/auto-deny.js] 過去分シフト申請の自動否認スクリプトを新規追加
  - date < today(JST) かつ status==='plan' のシフトを status='reviewed' にバッチ更新
  - approvalLogs に否認前スナップショット記録（action:'deny', adminName:'自動否認(システム)'）→7日以内復元可
  - 複合インデックス回避のため date<cutoff 単一クエリ+メモリ内 status フィルタ
  - 正常時LINE通知なし／失敗時のみ開発者通知。--dry-run 対応
  - [back/test/auto-deny.test.js] 純粋ヘルパーのユニットテスト追加（node:test）
  - [back/package.json] test スクリプト追加
```

- [ ] **Step 2: Herokuへデプロイ（subtree split 手順。ルートから実行）**

```bash
git subtree split --prefix back -b back-heroku-deploy
git push heroku back-heroku-deploy:main --force
git branch -D back-heroku-deploy
```
Expected: ビルドログに `Procfile declares types -> web` と `Released vXX` が出れば成功。

- [ ] **Step 3: GitHub(origin) にも push**

```bash
git push origin main
```

- [ ] **Step 4: Heroku Scheduler に Daily ジョブを登録（手動・ユーザー作業）**

- `heroku addons:open scheduler -a shift-system-brigr` でダッシュボードを開く（またはHeroku管理画面 → Resources → Heroku Scheduler）。
- 「Add Job」→ コマンド `node src/auto-deny.js` → Frequency `Every day at ...`（任意の時刻。既存 clean/lock の 03:00 UTC と重ならない枠を推奨、例 04:00 UTC）。
- 保存。日付判定はJSTベースのため実行時刻自体は挙動に影響しない。

- [ ] **Step 5: 初回動作確認**

- 登録後の初回実行ログ（`heroku logs --tail -a shift-system-brigr` または Scheduler のログ）で `[auto-deny] ... 完了 — N件を自動否認（reviewed）` もしくは `対象なし — 終了` を確認。
- `/admin-shift` の既定ビューから過去分 `plan` が消え、「確認済」フィルターに `reviewed` として現れること、「ログ確認」から7日以内に復元できることを確認。

---

## Self-Review

**1. Spec coverage:**
- 対象 `plan`/過去日/当日除外 → Task1 `isAutoDenyTarget` + テスト ✓
- `reviewed` 化・version+1・updatedAt → Task2 `main()` batch.update ✓
- approvalLogs 記録（action/adminName/serverTimestamp）・7日復元 → Task2 batch.set + `buildBeforeState` ✓
- 複合インデックス回避（単一クエリ+メモリフィルタ）→ Task2 `main()` ✓
- 正常時通知なし／失敗時のみ通知 → Task2 `notifyFailure` + `require.main` catch ✓
- `--dry-run` → Task2 ✓
- 独立スクリプト + Heroku Scheduler Daily → Task3 ✓
- フロント/Rules変更なし → 計画にフロント/Rulesタスクなし ✓

**2. Placeholder scan:** コード・コマンド・期待出力はすべて実体を記載。TBD/TODOなし ✓

**3. Type consistency:** `isAutoDenyTarget` / `buildBeforeState` / `toMs` / `todayJST` / `toDateStr` / `formatDateShort` の名称・引数は Task1 の exports と Task2 の呼び出しで一致 ✓。`beforeState` フィールド集合は spec の Global Constraints と一致 ✓。
