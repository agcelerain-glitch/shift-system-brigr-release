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
  role?: Role; // ログイン時のFirebase Authクレームと同期（通知用・情報目的のみ）
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
  irregular?: boolean; // 出勤依頼による特別申請フラグ
  createdAt: number; // 申請日
  updatedAt: number; // 最終修正日
  version: number; // 楽観ロック
  locked?: boolean; // 土曜cron後にtrueになり、ユーザーからの申請取消を禁止
}

// shiftRequests: 管理者による出勤依頼
export type ShiftRequestStatus = 'pending' | 'closed';
export interface ShiftRequest {
  id: string;
  date: string; // YYYY-MM-DD
  place: string;
  timeType: 'template' | 'time';
  template?: TemplateCode;
  timeStart?: string;
  timeEnd?: string;
  timeLabel: string; // 表示用ラベル（例: "A帯 20:00〜LAST"）
  requiredCount: number;
  acceptedCount: number;
  status: ShiftRequestStatus;
  createdAt: number;
  createdBy: string;
}

// shiftRequestInvites: 出勤依頼の個別送信記録
export type InviteResponse = 'pending' | 'accepted' | 'rejected' | 'adjusted';
export interface ShiftRequestInvite {
  id: string;
  requestId: string;
  date: string; // 検索・表示用
  place: string;
  timeLabel: string;
  memberName: string;
  lineUserId: string;
  comment?: string;
  sentAt: number;
  response: InviteResponse;
  adjustedTimeStart?: string;
  adjustedTimeEnd?: string;
  respondedAt?: number;
  resultShiftId?: string;
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

// 削除済み掲示板（ソフトデリート用）
export interface DeletedBoardPublic extends BoardPublic {
  deletedAt: number;
}
export interface DeletedBoardPrivate extends BoardPrivate {
  deletedAt: number;
}

// calendarEvents: 管理者設定のカレンダーイベント（定休日・臨時休業など）
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  subject: string;
  note?: string;
  createdAt: number;
  createdBy: string;
}
