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
