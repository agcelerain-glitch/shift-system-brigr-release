# 過去分シフト申請の自動否認 — 設計書

- 日付: 2026-10-31
- 対象: `back/src/auto-deny.js`（新規）+ Heroku Scheduler
- 関連: `back/src/lock.js`（雛形）, `back/src/clean.js`, `back/src/remind.js`, `front/src/lib/db.ts`（否認ロジック）, `front/src/pages/AdminShiftPage.tsx`（承認待ち表示）

## 1. 背景と目的

現状、シフト申請は `shifts` コレクションに `status: 'plan'`（申請・未承認）として作られる。専用の「保留」コレクションは無く、管理者ページ `/admin-shift` はこの `plan` を「承認待ち」として表示する。そのため、**管理者が承認も否認もしないまま日付が過ぎた過去分の `plan` が、いつまでも承認待ちビューに残り続ける**。

本機能は、この過去分の未処理申請を毎日自動で「否認済み」に落とし、承認待ちビューから自然に外す。

## 2. 用語・前提（確定事項）

- このシステムの「否認」は**削除ではなく `status: 'reviewed'` への変更**（`front/src/lib/db.ts` の `approveShift`: `if (p.action === 'deny') next.status = 'reviewed'`）。`reviewed` のドキュメントは残り、22日後に `clean.js` が削除する。
- `/admin-shift` の既定フィルターは `['plan', 'delete_request']`（`AdminShiftPage.tsx:86`）。`reviewed` は「確認済」フィルターを押したときのみ表示される。したがって `plan → reviewed` にするだけで、承認待ちビューから外れ、「確認済」で後から確認できる。
- **フロント変更なし・Firestore Rules変更なし**（Admin SDK はルールをバイパスするため）。
- **Firestore 複合インデックス不要**: `status` の等価と `date` の範囲を同時にクエリ指定すると複合インデックス（現状 `firestore.indexes.json` は空）が必要になり実行時エラーになるため、クエリは `date < cutoff` の単一フィールドのみとし、`status === 'plan'` は**メモリ内でフィルタ**する（`clean.js` の単一フィールドクエリ／`app.js` の取得→絞り込みパターンと一貫）。

## 3. 要件（確定事項）

| 項目 | 決定 |
|---|---|
| 対象ステータス | `status === 'plan'` のみ（`confirmed` / `reviewed` / `delete_requested` は対象外） |
| 対象日付 | `date < today(JST)`（当日 `date == today` は対象外＝シフト日の翌日以降に初めて否認） |
| 否認後の状態 | `status: 'reviewed'`（手動否認と同一） |
| 復元 | `approvalLogs` に否認前スナップショットを記録し、7日以内は `/admin-shift` のログ確認から復元可能 |
| 正常時のLINE通知 | なし（`console.log` のみ） |
| 失敗時のLINE通知 | あり（開発者 `LINE_SELF_USER_ID` へ `[自動否認ジョブ失敗]`。既存3スクリプトと同じ安全策） |
| 実行方式 | 独立スクリプト `back/src/auto-deny.js` + Heroku Scheduler 新規ジョブ（Daily・曜日チェックなし） |

## 4. アーキテクチャ

- 新規1ファイル `back/src/auto-deny.js`。`lock.js` を雛形に以下を踏襲:
  - `parseFirebasePrivateKey()` と Firebase Admin 初期化（`GOOGLE_APPLICATION_CREDENTIALS` / 個別環境変数の両対応）
  - 日付ユーティリティ `todayJST()` / `toDateStr()` / `formatDateShort()`
  - LINE クライアント取得・開発者通知ヘルパー（失敗時通知にのみ使用）
- Heroku Scheduler に `node src/auto-deny.js` を **Daily** で追加（`remind.js`/`lock.js` のような曜日チェックは無く、毎日実行）。
- 実行時刻は既存ジョブと重ならない任意の毎日枠でよい（例: clean の 03:00 UTC とずらす）。日付判定は JST ベースなので実行時刻自体は挙動に影響しない。

## 5. 処理ロジック

```
1. today = todayJST()
   cutoff = toDateStr(today)              // 例 "2026-11-01"
2. 対象取得（単一フィールドクエリ＋メモリ内フィルタ。複合インデックス回避）:
   const snap = shifts.where('date','<',cutoff).get()
   const targets = snap.docs.filter(d => d.data().status === 'plan')
3. targets が0件なら console.log して正常終了（LINE通知なし）
4. バッチ更新（lock.js と同じく 500 オペ上限対応。1シフト=2オペなので 250 件ごとに分割）:
     各対象 doc について
       - batch.update(shiftRef, {
           status: 'reviewed',
           version: (現 version ?? 1) + 1,
           updatedAt: Date.now()
         })
       - batch.set(新 approvalLogs doc, {
           shiftId,
           beforeState: 否認前の Shift 全体（undefined フィールドは除去）,
           action: 'deny',
           adminName: '自動否認(システム)',
           createdAt: admin.firestore.FieldValue.serverTimestamp()
         })
5. console.log に「○件自動否認（日付・氏名の内訳）」を出力
```

### 競合・冪等性

- 対象は過去分であり管理者が同時に手動操作する可能性はほぼ無いため、`approveShift` のような1件ずつの `runTransaction`（version 楽観ロック）ではなく、`lock.js` と同じ**バッチ更新**を採用する（シンプルさと既存一貫性を優先）。
- メモリ内フィルタで対象を `status === 'plan'` に限定するため、翌日再実行しても既に `reviewed` のものは拾わず**二重処理しない**（冪等）。

### approvalLogs の整合

- `beforeState` は手動否認（`db.ts`）と同じ形の `Shift` オブジェクトとし、`undefined` フィールドを除去して保存する（不可シフトは `timeStart` 等が `undefined` のため）。
- `restoreShift`（`db.ts`）は `action` と `beforeState` を使って復元する。`action: 'deny'` / `beforeState.status: 'plan'` とすることで、既存の復元フローがそのまま `plan` に戻せる。

## 6. 運用オプション・エラー処理

- `--dry-run`: Firestore 更新・approvalLogs 書き込みをせず、対象件数と内訳のみ表示（既存3スクリプトと同じ）。`--force` は曜日チェックが無いため不要。
- トップレベル `main().catch(...)`: 既存スクリプトと同様に、失敗時は開発者 `LINE_SELF_USER_ID` へ `[自動否認ジョブ失敗]\n<JST時刻>\nエラー: <message>` を送信し `process.exit(1)`。

## 7. テスト / 動作確認

1. ローカルで `GOOGLE_APPLICATION_CREDENTIALS` を設定し `node src/auto-deny.js --dry-run` を実行。過去日の `plan` のみが対象に挙がり、`confirmed`/`reviewed`/当日分が含まれないことを確認。
2. 本実行後、`/admin-shift` の既定ビューから過去分 `plan` が消えること、「確認済」フィルターに `reviewed` として現れること、「ログ確認」から7日以内に復元できることを確認。
3. 再実行して追加の否認が発生しない（冪等）ことを確認。

## 8. デプロイ

1. `back/src/auto-deny.js` を追加しコミット（ルート git）。
2. Heroku へ `git subtree split --prefix back` 手順でデプロイ（CLAUDE.md 準拠）。
3. Heroku Scheduler に `node src/auto-deny.js` を Daily で追加（手動設定。ダッシュボードまたは `heroku addons:open scheduler`）。
4. CHANGELOG.md 更新。

## 9. スコープ外（YAGNI）

- `delete_requested` の自動処理（別性質のため管理者判断に委ねる）。
- 管理者全員への通知（正常時は通知しない方針）。
- フロント `/admin-shift` の表示ロジック変更（`reviewed` 化だけで要件充足のため不要）。
