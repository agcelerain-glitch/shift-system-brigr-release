'use strict';
/**
 * lock.js — 週次シフトロック処理
 *
 * Heroku Scheduler 設定:
 *   コマンド: node src/lock.js
 *   頻度: Daily / 03:00 UTC（= JST 12:00）
 *   ※ スクリプト内で土曜日 JST かどうかを確認し、土曜以外はスキップ
 *
 * ロジック:
 *   1. JST で今日が土曜でなければ即終了（--force で強制実行）
 *   2. 来週（月〜日）の日付範囲を計算
 *   3. その範囲のシフト全件を取得
 *   4. locked: true をバッチ更新（500件上限対応・既ロック済みはスキップ）
 *   5. 管理者全員に結果をLINE通知
 *
 * オプション:
 *   --dry-run  : Firestore更新・LINE送信せず対象のみ表示
 *   --force    : 土曜チェックをスキップ（テスト用）
 */

const admin = require('firebase-admin');
const { messagingApi } = require('@line/bot-sdk');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_RUN = process.argv.includes('--force');

const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

// ─── Firebase Admin 初期化 ───────────────────────────────

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

if (!admin.apps.length) {
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      console.log('[lock] Firebase Admin 初期化成功 (GOOGLE_APPLICATION_CREDENTIALS)');
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = parseFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      if (!projectId || !clientEmail || !privateKey) {
        console.error('[lock] 必須環境変数未設定: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
        process.exit(1);
      }
      admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
      console.log('[lock] Firebase Admin 初期化成功 (env vars)');
    }
  } catch (e) {
    console.error('[lock] Firebase Admin 初期化失敗:', e?.message ?? e);
    process.exit(1);
  }
}

const db = admin.firestore();

// ─── 日付ユーティリティ ──────────────────────────────────

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

function getNextWeekRange() {
  const today = todayJST();
  const dow = today.getUTCDay();
  const daysToMonday = (8 - dow) % 7 || 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + daysToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const start = toDateStr(monday);
  const end = toDateStr(sunday);
  return { start, end, label: `${formatDateShort(start)}〜${formatDateShort(end)}` };
}

// ─── LINE ヘルパー ────────────────────────────────────────

function getLineClient() {
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
}

async function notifyDeveloper(client, text) {
  const selfId = process.env.LINE_SELF_USER_ID;
  if (!selfId || !client) return;
  if (DRY_RUN) {
    console.log(`[lock][DRY-RUN] 開発者通知(スキップ):\n${text}`);
    return;
  }
  try {
    await client.pushMessage({ to: selfId, messages: [{ type: 'text', text }] });
  } catch (e) {
    console.error('[lock] LINE開発者通知失敗:', e?.message ?? e);
  }
}

// ─── メイン ──────────────────────────────────────────────

async function main() {
  const today = todayJST();
  const dow = today.getUTCDay();

  // 土曜チェック（--force でスキップ）
  if (!FORCE_RUN && dow !== 6) {
    console.log(`[lock] 今日は${WEEKDAYS_JP[dow]}曜日（JST）のためスキップ`);
    return;
  }

  const { start, end, label } = getNextWeekRange();
  const mode = DRY_RUN ? '[DRY-RUN] ' : '';
  console.log(`[lock] ${mode}開始 — 来週 ${label} のシフトをロック`);

  const lineClient = getLineClient();

  // 1. 来週のシフト全件取得（ステータス問わず）
  const shiftsSnap = await db.collection('shifts')
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();

  const total = shiftsSnap.docs.length;
  console.log(`[lock] 対象シフト: ${total}件`);

  if (total === 0) {
    console.log('[lock] 対象シフトなし — 終了');
    await notifyDeveloper(lineClient, `[ロック] ${label} 対象0件`);
    return;
  }

  // 2. locked: true をバッチ更新（既ロック済みはスキップ、500件/バッチ上限対応）
  let lockedCount = 0;
  let skippedCount = 0;

  if (DRY_RUN) {
    console.log(`[lock][DRY-RUN] ロック対象: ${total}件（Firestore更新スキップ）`);
    lockedCount = total;
  } else {
    const unlocked = shiftsSnap.docs.filter((d) => !d.data().locked);
    skippedCount = total - unlocked.length;

    const BATCH_SIZE = 500;
    for (let i = 0; i < unlocked.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = unlocked.slice(i, i + BATCH_SIZE);
      chunk.forEach((doc) => {
        batch.update(doc.ref, { locked: true, updatedAt: Date.now() });
      });
      await batch.commit();
      lockedCount += chunk.length;
      console.log(`[lock] バッチ更新: ${i + chunk.length}/${unlocked.length}件`);
    }
  }

  console.log(`[lock] ${mode}完了 — ${lockedCount}件ロック / ${skippedCount}件スキップ`);

  // 3. 開発者に簡易通知
  const devMsg = DRY_RUN
    ? `[ロック(dry)] ${label} ${total}件対象`
    : `[ロック完了] ${label} ${lockedCount}件`;
  await notifyDeveloper(lineClient, devMsg);
}

main().catch(async (e) => {
  const msg = e?.message ?? String(e);
  console.error('[lock] 予期しないエラー:', msg);
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  const selfId = process.env.LINE_SELF_USER_ID;
  if (token && selfId) {
    try {
      const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
      await client.pushMessage({
        to: selfId,
        messages: [{ type: 'text', text: `[ロックジョブ失敗]\n${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\nエラー: ${msg}` }],
      });
    } catch {}
  }
  process.exit(1);
});
