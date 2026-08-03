'use strict';
/**
 * remind.js — シフト未提出リマインダー
 *
 * Heroku Scheduler 設定:
 *   コマンド: node src/remind.js
 *   頻度: Daily / 11:00 PM UTC（= JST 翌朝 8:00）
 *   ※ スクリプト内で金曜日 JST かどうかを確認し、金曜以外はスキップ
 *
 * 管理者通知先の管理（環境変数不要）:
 *   Firestore の config/notify ドキュメントの adminLineIds 配列で管理
 *   初回実行時に LINE_SELF_USER_ID を自動登録
 *   追加/削除は Firebase コンソールまたは AdminLinePage から変更可能
 *
 * ロジック:
 *   1. JST で今日が金曜でなければ即終了（--force で強制実行）
 *   2. 来週（月〜日）の日付範囲を計算
 *   3. config/notify から管理者LINE IDリストを取得（初回は自動初期化）
 *   4. members コレクションから全メンバーを取得
 *   5. shifts コレクションから来週のシフトを取得（ステータス問わず）
 *   6. 申請0件のメンバーを特定し LINE 個別通知
 *   7. 管理者全員にサマリーを通知
 *
 * オプション:
 *   --dry-run  : LINE 送信せず対象者のみ表示
 *   --force    : 金曜チェックをスキップ（テスト用）
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
      console.log('[remind] Firebase Admin 初期化成功 (GOOGLE_APPLICATION_CREDENTIALS)');
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = parseFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      if (!projectId || !clientEmail || !privateKey) {
        console.error('[remind] 必須環境変数未設定: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
        process.exit(1);
      }
      admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
      console.log('[remind] Firebase Admin 初期化成功 (env vars)');
    }
  } catch (e) {
    console.error('[remind] Firebase Admin 初期化失敗:', e?.message ?? e);
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

// ─── 管理者通知先リスト（Firestoreから取得） ─────────────

/**
 * config/notify.adminLineIds から管理者LINE IDを取得する。
 * ドキュメントが存在しない場合は LINE_SELF_USER_ID で自動初期化。
 * Firestore コンソールで adminLineIds 配列を編集することで管理者を追加/削除できる。
 */
async function getAdminNotifyIds() {
  const selfId = process.env.LINE_SELF_USER_ID ?? null;
  const configRef = db.collection('config').doc('notify');

  try {
    const snap = await configRef.get();

    if (!snap.exists) {
      // 初回: LINE_SELF_USER_ID を初期値として登録
      const initial = selfId ? [selfId] : [];
      await configRef.set({
        adminLineIds: initial,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[remind] config/notify を初期化 (adminLineIds: ${initial.length}件)`);
      return initial;
    }

    const ids = (snap.data()?.adminLineIds ?? []).filter(Boolean);
    console.log(`[remind] 管理者通知先: ${ids.length}件 (config/notify)`);
    return ids;
  } catch (e) {
    console.warn('[remind] config/notify 読み取り失敗、フォールバック:', e?.message);
    return selfId ? [selfId] : [];
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
    console.error(`[remind] LINE送信失敗 (${to}):`, e?.message ?? e);
    return false;
  }
}

// 管理者全員にサマリーを送信
async function notifyAdmins(client, adminIds, text) {
  if (DRY_RUN || adminIds.length === 0) return;
  const results = await Promise.allSettled(adminIds.map((id) => pushLine(client, id, text)));
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  console.log(`[remind] 管理者サマリー送信: ${ok}/${adminIds.length}件成功`);
}

// ─── メイン ──────────────────────────────────────────────

async function main() {
  const today = todayJST();
  const dow = today.getUTCDay();

  // 金曜チェック（--force でスキップ）
  if (!FORCE_RUN && dow !== 5) {
    console.log(`[remind] 今日は${WEEKDAYS_JP[dow]}曜日（JST）のためスキップ`);
    return;
  }

  const { start, end, label } = getNextWeekRange();
  const mode = DRY_RUN ? '[DRY-RUN] ' : '';
  console.log(`[remind] ${mode}開始 — 来週 ${label} のシフト未提出者を確認`);

  const lineClient = getLineClient();

  // 管理者通知先を Firestore から取得
  const adminIds = await getAdminNotifyIds();
  if (adminIds.length === 0) {
    console.warn('[remind] 管理者通知先が設定されていません (config/notify.adminLineIds が空)');
  }

  // 1. 全メンバー取得
  const membersSnap = await db.collection('members').get();
  if (membersSnap.empty) {
    console.log('[remind] メンバーなし — 終了');
    return;
  }
  const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`[remind] メンバー総数: ${members.length}名`);

  // 2. 来週のシフトを取得（ステータス問わず全申請）
  const shiftsSnap = await db.collection('shifts')
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();
  const submittedNames = new Set(shiftsSnap.docs.map((d) => d.data().memberName));
  console.log(`[remind] 来週シフト提出済み: ${submittedNames.size}名（${[...submittedNames].join('・') || 'なし'}）`);

  // 3. 未提出者を特定
  const unsubmitted = members.filter((m) => !submittedNames.has(m.name));

  if (unsubmitted.length === 0) {
    console.log('[remind] 全員提出済み — リマインド不要');
    await notifyAdmins(lineClient, adminIds, `[シフトリマインド]\n来週 ${label} は全員提出済みです ✅`);
    return;
  }

  // LINE 登録済み / 未登録に分類
  const withLine = unsubmitted.filter((m) => m.lineUserId);
  const withoutLine = unsubmitted.filter((m) => !m.lineUserId);
  console.log(`[remind] 未提出 ${unsubmitted.length}名（LINE有: ${withLine.length}名 / LINE未登録: ${withoutLine.length}名）`);

  // 4. 未提出メンバーへ LINE 個別通知
  const reminderText = `来週（${label}）のシフトがまだ提出されていません。\n\nお手数ですが取り急ぎ提出をお願いします。`;
  let sentCount = 0;

  if (DRY_RUN) {
    console.log(`[remind][DRY-RUN] 通知予定: ${withLine.map((m) => m.name).join('・')}`);
  } else {
    for (let i = 0; i < withLine.length; i += 5) {
      const chunk = withLine.slice(i, i + 5);
      const results = await Promise.allSettled(
        chunk.map((m) => pushLine(lineClient, m.lineUserId, reminderText))
      );
      results.forEach((r, idx) => {
        const name = chunk[idx].name;
        if (r.status === 'fulfilled' && r.value) { sentCount++; console.log(`[remind] 送信OK: ${name}`); }
        else { console.error(`[remind] 送信NG: ${name}`); }
      });
    }
  }

  if (withoutLine.length > 0) {
    console.log(`[remind] LINE未登録（通知不可）: ${withoutLine.map((m) => m.name).join('・')}`);
  }

  // 5. 管理者全員にサマリーを通知
  const summaryParts = [
    `[シフトリマインド${DRY_RUN ? '(DRY-RUN)' : '送信完了'}]`,
    `来週 ${label}`,
    '',
    `未提出 ${unsubmitted.length}名:`,
    ...withLine.map((m) => `✅ ${m.name}（LINE${DRY_RUN ? '対象' : '送信済'}）`),
    ...withoutLine.map((m) => `⚠️ ${m.name}（LINE未登録・手動連絡要）`),
  ];
  const summary = summaryParts.join('\n');
  console.log(`[remind] 管理者サマリー:\n${summary}`);
  await notifyAdmins(lineClient, adminIds, summary);

  console.log(`[remind] ${mode}完了 — LINE送信${DRY_RUN ? '(dry)' : `${sentCount}件`} / 管理者通知${adminIds.length}件 / LINE未登録${withoutLine.length}名`);
}

main().catch(async (e) => {
  const msg = e?.message ?? String(e);
  console.error('[remind] 予期しないエラー:', msg);
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  const selfId = process.env.LINE_SELF_USER_ID;
  if (token && selfId) {
    try {
      const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
      await client.pushMessage({
        to: selfId,
        messages: [{ type: 'text', text: `[リマインドジョブ失敗]\n${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\nエラー: ${msg}` }],
      });
    } catch {}
  }
  process.exit(1);
});
