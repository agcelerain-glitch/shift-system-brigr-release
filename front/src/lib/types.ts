// 共通データ型定義: FirestoreモデルとUI間で共有する型
// 表示用定数（TEMPLATE_LABELS / PLACE_OPTIONS 等）は lib/config.ts を参照・編集

// TemplateCode は config.ts で定義（後方互換のため再エクスポート）
export type { TemplateCode } from './config';
export { TEMPLATE_LABELS, TEMPLATE_TIMES } from './config';

import type { TemplateCode } from './config';

export type Role = 'user' | 'admin';

export type ShiftStatus = 'plan' | 'confirmed' | 'reviewed' | 'delete_requested';
export type TimeType = 'none' | 'time' | 'template' | 'other';

// members: 名簿
export interface Member {
  id: string;
  name: string;
  createdAt: number; // 記入日
  updatedAt: number; // 最終更新日
  lineUserId?: string;
}

// shifts: シフト申請・確定
export interface Shift {
  id: string;
  memberName: string;
  date: string; // YYYY-MM-DD
  status: ShiftStatus;
  timeType: TimeType;
  timeStart?: string; // HH:mm
  timeEnd?: string; // HH:mm
  template?: TemplateCode;
  subject: string; // 件名
  place?: string;
  headcount?: number;
  createdAt: number; // 申請日
  updatedAt: number; // 最終修正日
  version: number; // 楽観ロック
}

// boardPublic: 全体掲示板
export interface BoardPublic {
  id: string;
  title: string;
  body: string;
  adminName: string;
  createdAt: number;
}

// boardPrivate: admin非公開メモ/通知
export interface BoardPrivate {
  id: string;
  adminName: string;
  body: string;
  type: 'memo' | 'notification';
  createdAt: number;
}

// approvalLogs: 承認ログ（7日復元用）
export interface ApprovalLog {
  id: string;
  shiftId: string;
  beforeState: Shift | null;
  action: 'approve' | 'deny' | 'adjust';
  adminName: string;
  createdAt: number;
}
