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

// ─── 管理者通知先リスト ─────────────────────────────────

async function getAdminNotifyList() {
  const selfId = process.env.LINE_SELF_USER_ID ?? null;
  try {
    const snap = await db.collection('members').where('role', '==', 'admin').get();
    const admins = snap.docs
      .map((d) => ({ name: d.data().name, lineUserId: d.data().lineUserId }))
      .filter((a) => a.lineUserId);
    if (admins.length > 0) {
      console.log(`[lock] 管理者通知先: ${admins.length}件 — ${admins.map((a) => a.name).join('・')}`);
      return admins;
    }
    console.warn('[lock] members に role=admin のメンバーなし。LINE_SELF_USER_ID にフォールバック');
    return selfId ? [{ name: '開発者(fallback)', lineUserId: selfId }] : [];
  } catch (e) {
    console.warn('[lock] members 読み取り失敗、フォールバック:', e?.message);
    return selfId ? [{ name: '開発者(fallback)', lineUserId: selfId }] : [];
  }
}

// ─── LINE ヘルパー ────────────────────────────────────────

function getLineClient() {
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
}

async function pushLine(client, to, text) {
  if (!client || !to) return false;
  try {
    await client.pushMessage({ to, messages: [{ type: 'text', text }] });
    return true;
  } catch (e) {
    console.error(`[lock] LINE送信失敗 (${to}):`, e?.message ?? e);
    return false;
  }
}

async function notifyAdmins(client, adminList, text) {
  if (DRY_RUN || adminList.length === 0) return [];
  const results = await Promise.allSettled(adminList.map((a) => pushLine(client, a.lineUserId, text)));
  return results.map((r, i) => ({
    name: adminList[i].name,
    lineUserId: adminList[i].lineUserId,
    ok: r.status === 'fulfilled' && r.value,
  }));
}

async function notifyDeveloper(client, text) {
  const selfId = process.env.LINE_SELF_USER_ID;
  if (!selfId) return;
  if (DRY_RUN) {
    console.log(`[lock][DRY-RUN] 開発者通知(スキップ):\n${text}`);
    return;
  }
  await pushLine(client, selfId, text);
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
  const adminList = await getAdminNotifyList();

  // 1. 来週のシフト全件取得（ステータス問わず）
  const shiftsSnap = await db.collection('shifts')
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();

  const total = shiftsSnap.docs.length;
  console.log(`[lock] 対象シフト: ${total}件`);

  if (total === 0) {
    const msg = `[シフトロック完了]\n来週 ${label}\n\n対象シフトなし（提出0件）`;
    console.log('[lock] 対象シフトなし — 終了');
    await notifyAdmins(lineClient, adminList, msg);
    await notifyDeveloper(lineClient, `[開発者通知] ロックジョブ完了\n${label}\n\n対象シフト0件`);
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

  console.log(`[lock] 完了: ${lockedCount}件ロック / ${skippedCount}件スキップ（既ロック済み）`);

  // 3. 管理者に結果を通知
  const summaryLines = [
    `[シフトロック${DRY_RUN ? '(DRY-RUN)' : '完了'}]`,
    `来週 ${label}`,
    '',
    `対象: ${total}件`,
    `ロック: ${lockedCount}件`,
    ...(skippedCount > 0 ? [`スキップ（既ロック済み）: ${skippedCount}件`] : []),
    '',
    '来週分のシフト申請取り消しが\nユーザー側で不可になりました。',
  ];
  const summary = summaryLines.join('\n');
  console.log(`[lock] 管理者通知:\n${summary}`);

  const notifyResults = await notifyAdmins(lineClient, adminList, summary);
  const notifyOk = notifyResults.filter((r) => r.ok).length;

  // 4. 開発者にモニタリング通知
  const devParts = [
    `[開発者通知] ロックジョブ完了`,
    `${label}`,
    '',
    `▼ シフトロック結果`,
    `・対象: ${total}件`,
    `・ロック完了: ${DRY_RUN ? '(dry)' : `${lockedCount}件`}`,
    ...(skippedCount > 0 ? [`・既ロック済みスキップ: ${skippedCount}件`] : []),
    '',
    `▼ 管理者通知`,
    `${notifyOk}/${adminList.length}件成功`,
    ...notifyResults.map((r) => `${r.ok ? '✅' : '❌'} ${r.name}`),
  ];
  await notifyDeveloper(lineClient, devParts.join('\n'));

  console.log(`[lock] ${mode}完了 — ${lockedCount}件ロック / 管理者通知${notifyOk}/${adminList.length}件`);
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
