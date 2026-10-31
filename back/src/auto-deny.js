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

module.exports = { isAutoDenyTarget, buildBeforeState, toMs, todayJST, toDateStr, formatDateShort };
