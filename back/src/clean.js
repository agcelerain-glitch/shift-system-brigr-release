'use strict';
/**
 * clean.js — Heroku Scheduler 実行スクリプト
 *
 * Heroku Scheduler 設定:
 *   コマンド: node src/clean.js
 *   頻度: Daily / 03:00 AM UTC (JST 12:00 PM)
 *
 * 削除対象（閾値日数を超えたもの）:
 *   - shifts              : date フィールド ("YYYY-MM-DD") で判定
 *   - boardPublicDeleted  : deletedAt Timestamp で判定
 *   - boardPrivateDeleted : deletedAt Timestamp で判定
 *   - approvalLogs        : createdAt Timestamp で判定
 *
 * 環境変数:
 *   CLEAN_THRESHOLD_DAYS  : 削除閾値（日数）。未設定時は 22 日
 *
 * オプション:
 *   --dry-run  : 削除せず対象件数のみ表示（動作確認用）
 */

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const THRESHOLD_DAYS = parseInt(process.env.CLEAN_THRESHOLD_DAYS ?? '22', 10);

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
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = parseFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) {
    console.error('[clean] 必須環境変数未設定: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
    process.exit(1);
  }
  try {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
    console.log('[clean] Firebase Admin 初期化成功');
  } catch (e) {
    console.error('[clean] Firebase Admin 初期化失敗:', e?.message ?? e);
    process.exit(1);
  }
}

const db = admin.firestore();

function toUTCDateStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function batchDelete(docs) {
  if (docs.length === 0) return;
  const commits = [];
  let batch = db.batch();
  let batchCount = 0;
  for (const docSnap of docs) {
    batch.delete(docSnap.ref);
    batchCount++;
    if (batchCount === 500) {
      commits.push(batch.commit());
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) commits.push(batch.commit());
  await Promise.all(commits);
}

// shifts: date フィールド (YYYY-MM-DD) で判定
async function processOldShifts(cutoffDate) {
  const cutoffStr = toUTCDateStr(cutoffDate);
  const snap = await db.collection('shifts').where('date', '<', cutoffStr).get();
  if (snap.empty) { console.log('[clean] shifts: 対象なし'); return 0; }
  if (DRY_RUN) {
    console.log(`[clean][DRY-RUN] shifts: ${snap.size}件が削除対象 (date < ${cutoffStr})`);
    snap.docs.forEach((d) => console.log(`  - ${d.id}: date=${d.data().date} name=${d.data().memberName}`));
    return snap.size;
  }
  await batchDelete(snap.docs);
  console.log(`[clean] shifts: ${snap.size}件削除 (date < ${cutoffStr})`);
  return snap.size;
}

// Timestamp フィールドで判定する汎用処理
async function processByTimestamp(collectionName, field, cutoffDate) {
  const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);
  const snap = await db.collection(collectionName).where(field, '<', cutoff).get();
  if (snap.empty) { console.log(`[clean] ${collectionName}: 対象なし`); return 0; }
  if (DRY_RUN) {
    console.log(`[clean][DRY-RUN] ${collectionName}: ${snap.size}件が削除対象 (${field} < ${cutoffDate.toISOString()})`);
    return snap.size;
  }
  await batchDelete(snap.docs);
  console.log(`[clean] ${collectionName}: ${snap.size}件削除`);
  return snap.size;
}

async function main() {
  const cutoffDate = new Date(Date.now() - THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const mode = DRY_RUN ? '[DRY-RUN] ' : '';
  console.log(`[clean] ${mode}開始 — ${THRESHOLD_DAYS}日以前 (${toUTCDateStr(cutoffDate)}) のデータを対象`);

  try {
    const [s, bp, bpv, al] = await Promise.all([
      processOldShifts(cutoffDate),
      processByTimestamp('boardPublicDeleted', 'deletedAt', cutoffDate),
      processByTimestamp('boardPrivateDeleted', 'deletedAt', cutoffDate),
      processByTimestamp('approvalLogs', 'createdAt', cutoffDate),
    ]);
    const label = DRY_RUN ? '対象' : '削除';
    console.log(`[clean] ${mode}完了 — 合計 ${s + bp + bpv + al}件${label} (shifts:${s} boardPublicDeleted:${bp} boardPrivateDeleted:${bpv} approvalLogs:${al})`);
  } catch (e) {
    console.error('[clean] エラー:', e?.message ?? e);
    process.exit(1);
  }
}

main();
