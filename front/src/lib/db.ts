// Firestore / モック両対応のDBアクセス関数を集約
// isFirebaseConfigured で実DBとモックを切り替え、リアルタイムリスナー(onSnapshot)互換の購読APIを提供

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  writeBatch,
  serverTimestamp,
  deleteField,
  type Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, API_BASE_URL } from './firebase';
import { mockStore } from './mockStore';
import type { Shift, Member, BoardPublic, BoardPrivate, ApprovalLog, DeletedBoardPublic, DeletedBoardPrivate, ShiftStatus, TimeType, TemplateCode, Role, ShiftRequest, ShiftRequestInvite, ShiftRequestStatus, InviteResponse } from './types';

const now = () => Date.now();
const toMs = (t: unknown): number => {
  if (typeof t === 'number') return t;
  if (t && typeof t === 'object' && 'seconds' in t) return (t as Timestamp).seconds * 1000;
  return 0;
};

// ---- 汎用 subscribe ヘルパ（実DBは onSnapshot / モックは疑似購読） ----
function subscribeReal<T>(
  q: ReturnType<typeof query>,
  mapFn: (raw: Record<string, unknown>) => T,
  cb: (items: T[]) => void,
): () => void {
  if (!db) throw new Error('db not init');
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => mapFn({ id: d.id, ...(d.data() as Record<string, unknown>) }))),
    (err) => console.error('subscribe error', err),
  );
}

// ---- members ----
export function subscribeMembers(cb: (items: Member[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('members', cb);
  return subscribeReal<Member>(
    query(collection(db!, 'members')),
    (r) => ({ id: r.id as string, name: r.name as string, createdAt: toMs(r.createdAt), updatedAt: toMs(r.updatedAt), lineUserId: r.lineUserId as string | undefined, role: r.role as Role | undefined }) as Member,
    cb,
  );
}

export async function upsertMember(name: string, role?: Role): Promise<void> {
  const payload: Record<string, unknown> = { name, updatedAt: serverTimestamp() };
  // adminの場合のみ書き込む。userではroleを書かず、setDoc mergeで既存adminフィールドを保持
  if (role === 'admin') payload.role = role;
  if (!isFirebaseConfigured) return mockStore.upsertMember(name, role);
  // nameで既存を探してupsert
  const q = query(collection(db!, 'members'), where('name', '==', name));
  const { getDocs } = await import('firebase/firestore');
  const snap = await getDocs(q);
  if (snap.empty) {
    await addDoc(collection(db!, 'members'), { ...payload, createdAt: serverTimestamp() });
  } else {
    await setDoc(snap.docs[0].ref, payload, { merge: true });
  }
}

// ---- shifts ----
export function subscribeShifts(cb: (items: Shift[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('shifts', cb);
  return subscribeReal<Shift>(
    query(collection(db!, 'shifts'), orderBy('date', 'asc')),
    (r) => ({
      id: r.id as string,
      memberName: r.memberName as string,
      date: r.date as string,
      status: r.status as ShiftStatus,
      timeType: r.timeType as TimeType,
      timeStart: r.timeStart as string | undefined,
      timeEnd: r.timeEnd as string | undefined,
      template: r.template as TemplateCode | undefined,
      subject: r.subject as string,
      place: r.place as string | undefined,
      headcount: r.headcount as number | undefined,
      createdAt: toMs(r.createdAt),
      updatedAt: toMs(r.updatedAt),
      version: (r.version as number) ?? 1,
    }) as Shift,
    cb,
  );
}

export async function findShiftByMemberDate(name: string, date: string): Promise<Shift | null> {
  if (!isFirebaseConfigured) return mockStore.findShift(name, date);
  const { getDocs } = await import('firebase/firestore');
  const q = query(collection(db!, 'shifts'), where('memberName', '==', name), where('date', '==', date));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const r: Record<string, unknown> = { id: snap.docs[0].id, ...snap.docs[0].data() };
  return {
    id: r.id as string,
    memberName: r.memberName as string,
    date: r.date as string,
    status: r.status as ShiftStatus,
    timeType: r.timeType as TimeType,
    timeStart: r.timeStart as string | undefined,
    timeEnd: r.timeEnd as string | undefined,
    template: r.template as TemplateCode | undefined,
    subject: r.subject as string,
    place: r.place as string | undefined,
    headcount: r.headcount as number | undefined,
    createdAt: toMs(r.createdAt),
    updatedAt: toMs(r.updatedAt),
    version: (r.version as number) ?? 1,
  } as Shift;
}

export interface CreateShiftInput {
  memberName: string;
  date: string;
  timeType: TimeType;
  timeStart?: string;
  timeEnd?: string;
  template?: TemplateCode;
  subject: string;
  place?: string;
  headcount?: number;
}

export async function createShift(input: CreateShiftInput): Promise<void> {
  // Firestoreはundefinedを拒否するため、undefinedプロパティを除外してから送信
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const payload = {
    ...clean,
    status: 'plan' as ShiftStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
  };
  if (!isFirebaseConfigured) return mockStore.createShift(input);
  await addDoc(collection(db!, 'shifts'), payload);
}

// planステータスのシフトのみキャンセル可（confirmed済みは不可）
export async function cancelShift(shiftId: string, expectedVersion: number): Promise<'ok' | 'conflict' | 'forbidden'> {
  if (!isFirebaseConfigured) {
    mockStore.deleteDoc('shifts', shiftId);
    return 'ok';
  }
  const shiftRef = doc(db!, 'shifts', shiftId);
  try {
    await runTransaction(db!, async (tx) => {
      const snap = await tx.get(shiftRef);
      if (!snap.exists()) throw new Error('not found');
      const data = snap.data() as Record<string, unknown>;
      if (data.status === 'confirmed' || data.status === 'delete_requested') throw new Error('FORBIDDEN');
      if ((data.version as number) !== expectedVersion) throw new Error('CONFLICT');
      tx.delete(shiftRef);
    });
    return 'ok';
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'CONFLICT') return 'conflict';
    if (msg === 'FORBIDDEN') return 'forbidden';
    throw e;
  }
}

// ユーザーが確定シフトの削除を申請（status = delete_requested に変更）
export async function requestDeleteShift(shiftId: string, expectedVersion: number): Promise<'ok' | 'conflict'> {
  if (!isFirebaseConfigured) return mockStore.requestDeleteShift(shiftId, expectedVersion);
  const shiftRef = doc(db!, 'shifts', shiftId);
  try {
    await runTransaction(db!, async (tx) => {
      const snap = await tx.get(shiftRef);
      if (!snap.exists()) throw new Error('not found');
      const data = snap.data() as Record<string, unknown>;
      if ((data.version as number) !== expectedVersion) throw new Error('CONFLICT');
      tx.set(shiftRef, {
        status: 'delete_requested' as ShiftStatus,
        updatedAt: serverTimestamp(),
        version: ((data.version as number) ?? 1) + 1,
      }, { merge: true });
    });
    return 'ok';
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'CONFLICT') return 'conflict';
    throw e;
  }
}

// admin: シフトをDBから完全削除（再申請可能になる）
export async function adminDeleteShift(shiftId: string): Promise<void> {
  if (!isFirebaseConfigured) {
    mockStore.deleteShift(shiftId);
    return;
  }
  await deleteDoc(doc(db!, 'shifts', shiftId));
}

// ---- トランザクションで安全に承認/否認/調整（version楽観ロック） ----
export interface ApproveParams {
  shiftId: string;
  action: 'approve' | 'deny' | 'adjust';
  adminName: string;
  // adjustの場合の上書きフィールド
  adjustFields?: Partial<Pick<Shift, 'timeStart' | 'timeEnd' | 'template' | 'subject' | 'place' | 'headcount' | 'timeType'>>;
  expectedVersion?: number;
}

export async function approveShift(p: ApproveParams): Promise<'ok' | 'conflict'> {
  if (!isFirebaseConfigured) return mockStore.approveShift(p);
  const shiftRef = doc(db!, 'shifts', p.shiftId);
  const logRef = doc(collection(db!, 'approvalLogs'));
  try {
    await runTransaction(db!, async (tx) => {
      const snap = await tx.get(shiftRef);
      if (!snap.exists()) throw new Error('shift not found');
      const data = snap.data() as Record<string, unknown>;
      const beforeState: Shift = {
        id: snap.id,
        memberName: data.memberName as string,
        date: data.date as string,
        status: data.status as ShiftStatus,
        timeType: data.timeType as TimeType,
        timeStart: data.timeStart as string | undefined,
        timeEnd: data.timeEnd as string | undefined,
        template: data.template as TemplateCode | undefined,
        subject: data.subject as string,
        place: data.place as string | undefined,
        headcount: data.headcount as number | undefined,
        createdAt: toMs(data.createdAt),
        updatedAt: toMs(data.updatedAt),
        version: (data.version as number) ?? 1,
      };
      if (p.expectedVersion != null && beforeState.version !== p.expectedVersion) {
        throw new Error('CONFLICT');
      }
      const next: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
        version: beforeState.version + 1,
      };
      if (p.action === 'approve') next.status = 'confirmed';
      if (p.action === 'deny') next.status = 'reviewed';
      if (p.action === 'adjust' && p.adjustFields) {
        Object.assign(next, p.adjustFields);
        next.status = 'confirmed';
      }
      tx.set(shiftRef, next, { merge: true });
      // beforeStateのundefinedフィールドを除去（不可シフトはtimeStart等がundefined）
      const cleanBeforeState = Object.fromEntries(Object.entries(beforeState).filter(([, v]) => v !== undefined));
      tx.set(logRef, {
        shiftId: p.shiftId,
        beforeState: cleanBeforeState,
        action: p.action,
        adminName: p.adminName,
        createdAt: serverTimestamp(),
      });
    });
    return 'ok';
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'CONFLICT') return 'conflict';
    throw e;
  }
}

// 7日以内の承認ログから復元
export async function restoreShift(logId: string): Promise<'ok' | 'expired' | 'conflict'> {
  if (!isFirebaseConfigured) return mockStore.restoreShift(logId);
  const logRef = doc(db!, 'approvalLogs', logId);
  try {
    await runTransaction(db!, async (tx) => {
      const logSnap = await tx.get(logRef);
      if (!logSnap.exists()) throw new Error('log not found');
      const log = logSnap.data() as { shiftId: string; beforeState: Shift | null; createdAt: Timestamp };
      if (Date.now() - toMs(log.createdAt) > 7 * 24 * 60 * 60 * 1000) throw new Error('EXPIRED');
      if (!log.beforeState) throw new Error('no beforeState');
      const shiftRef = doc(db!, 'shifts', log.shiftId);
      tx.set(shiftRef, { ...log.beforeState, updatedAt: serverTimestamp(), version: log.beforeState.version + 1 }, { merge: true });
      // 復元完了後はログ自体を削除（使用済みログの蓄積・バッジ誤表示を防ぐ）
      tx.delete(logRef);
    });
    return 'ok';
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'EXPIRED') return 'expired';
    throw e;
  }
}

export function subscribeApprovalLogs(cb: (items: ApprovalLog[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('approvalLogs', cb);
  // 7日以内のログのみ購読（課金削減 + 表示制限）
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return subscribeReal<ApprovalLog>(
    query(
      collection(db!, 'approvalLogs'),
      where('createdAt', '>=', sevenDaysAgo),
      orderBy('createdAt', 'desc'),
    ),
    (r) => ({
      id: r.id as string,
      shiftId: r.shiftId as string,
      beforeState: (r.beforeState as Shift | null) ?? null,
      action: r.action as ApprovalLog['action'],
      adminName: r.adminName as string,
      createdAt: toMs(r.createdAt),
    }) as ApprovalLog,
    cb,
  );
}

// ---- boardPublic ----
export function subscribeBoardPublic(cb: (items: BoardPublic[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('boardPublic', cb);
  return subscribeReal<BoardPublic>(
    query(collection(db!, 'boardPublic'), orderBy('createdAt', 'desc')),
    (r) => ({ id: r.id as string, title: r.title as string, body: r.body as string, adminName: r.adminName as string, createdAt: toMs(r.createdAt) }) as BoardPublic,
    cb,
  );
}

export async function createBoardPublic(title: string, body: string, adminName: string): Promise<void> {
  if (!isFirebaseConfigured) return mockStore.createBoardPublic(title, body, adminName);
  await addDoc(collection(db!, 'boardPublic'), { title, body, adminName, createdAt: serverTimestamp() });
}

// ソフトデリート: boardPublicDeleted に移動して元を削除
export async function deleteBoardPublic(item: BoardPublic): Promise<void> {
  if (!isFirebaseConfigured) { mockStore.softDeleteBoard('boardPublic', item); return; }
  const batch = writeBatch(db!);
  batch.set(doc(db!, 'boardPublicDeleted', item.id), { ...item, deletedAt: serverTimestamp() });
  batch.delete(doc(db!, 'boardPublic', item.id));
  await batch.commit();
}
export function subscribeBoardPublicDeleted(cb: (items: DeletedBoardPublic[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('boardPublicDeleted', cb);
  return subscribeReal<DeletedBoardPublic>(
    query(collection(db!, 'boardPublicDeleted'), orderBy('deletedAt', 'desc')),
    (r) => ({ id: r.id as string, title: r.title as string, body: r.body as string, adminName: r.adminName as string, createdAt: toMs(r.createdAt), deletedAt: toMs(r.deletedAt) }) as DeletedBoardPublic,
    cb,
  );
}
export async function restoreBoardPublic(item: DeletedBoardPublic): Promise<void> {
  if (!isFirebaseConfigured) { mockStore.restoreBoard('boardPublic', item); return; }
  const { deletedAt: _d, ...rest } = item;
  const batch = writeBatch(db!);
  batch.set(doc(db!, 'boardPublic', item.id), { ...rest, createdAt: serverTimestamp() });
  batch.delete(doc(db!, 'boardPublicDeleted', item.id));
  await batch.commit();
}
export async function permanentDeleteBoardPublic(id: string): Promise<void> {
  if (!isFirebaseConfigured) { mockStore.permanentDeleteBoard('boardPublicDeleted', id); return; }
  await deleteDoc(doc(db!, 'boardPublicDeleted', id));
}

// ---- boardPrivate ----
export function subscribeBoardPrivate(cb: (items: BoardPrivate[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('boardPrivate', cb);
  return subscribeReal<BoardPrivate>(
    query(collection(db!, 'boardPrivate'), orderBy('createdAt', 'desc')),
    (r) => ({ id: r.id as string, adminName: r.adminName as string, body: r.body as string, type: r.type as 'memo' | 'notification', createdAt: toMs(r.createdAt) }) as BoardPrivate,
    cb,
  );
}

export async function createBoardPrivate(body: string, type: 'memo' | 'notification', adminName: string): Promise<void> {
  if (!isFirebaseConfigured) return mockStore.createBoardPrivate(body, type, adminName);
  await addDoc(collection(db!, 'boardPrivate'), { body, type, adminName, createdAt: serverTimestamp() });
}

// ソフトデリート: boardPrivateDeleted に移動して元を削除
export async function deleteBoardPrivate(item: BoardPrivate): Promise<void> {
  if (!isFirebaseConfigured) { mockStore.softDeleteBoard('boardPrivate', item); return; }
  const batch = writeBatch(db!);
  batch.set(doc(db!, 'boardPrivateDeleted', item.id), { ...item, deletedAt: serverTimestamp() });
  batch.delete(doc(db!, 'boardPrivate', item.id));
  await batch.commit();
}
export function subscribeBoardPrivateDeleted(cb: (items: DeletedBoardPrivate[]) => void): () => void {
  if (!isFirebaseConfigured) return mockStore.subscribe('boardPrivateDeleted', cb);
  return subscribeReal<DeletedBoardPrivate>(
    query(collection(db!, 'boardPrivateDeleted'), orderBy('deletedAt', 'desc')),
    (r) => ({ id: r.id as string, adminName: r.adminName as string, body: r.body as string, type: r.type as 'memo' | 'notification', createdAt: toMs(r.createdAt), deletedAt: toMs(r.deletedAt) }) as DeletedBoardPrivate,
    cb,
  );
}
export async function restoreBoardPrivate(item: DeletedBoardPrivate): Promise<void> {
  if (!isFirebaseConfigured) { mockStore.restoreBoard('boardPrivate', item); return; }
  const { deletedAt: _d, ...rest } = item;
  const batch = writeBatch(db!);
  batch.set(doc(db!, 'boardPrivate', item.id), { ...rest, createdAt: serverTimestamp() });
  batch.delete(doc(db!, 'boardPrivateDeleted', item.id));
  await batch.commit();
}
export async function permanentDeleteBoardPrivate(id: string): Promise<void> {
  if (!isFirebaseConfigured) { mockStore.permanentDeleteBoard('boardPrivateDeleted', id); return; }
  await deleteDoc(doc(db!, 'boardPrivateDeleted', id));
}

// admin用: メンバーのLINE IDを手動設定（デバッグ・初期設定用）
export async function updateMemberLineId(memberId: string, lineUserId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await setDoc(doc(db, 'members', memberId), {
    lineUserId: lineUserId.trim() || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// admin用: メンバー削除
export async function deleteMember(memberId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await deleteDoc(doc(db!, 'members', memberId));
}

// config/lineConfig: LINEグループIDの購読・削除
export function subscribeLineConfig(cb: (data: { groupId?: string } | null) => void): () => void {
  if (!isFirebaseConfigured || !db) { cb(null); return () => {}; }
  return onSnapshot(doc(db!, 'config', 'lineConfig'), (snap) => {
    cb(snap.exists() ? (snap.data() as { groupId?: string }) : null);
  }, () => cb(null));
}

export async function deleteGroupId(): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await setDoc(doc(db!, 'config', 'lineConfig'), {
    groupId: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// フロントエンドエラーをバックエンド経由でDiscord/LINEへ報告
function reportFrontendError(source: string, context: string, errMsg: string): void {
  if (!API_BASE_URL) return;
  fetch(`${API_BASE_URL}/error/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, context, error: errMsg, userAgent: navigator.userAgent }),
  }).catch(() => {});
}

// LINE API（Heroku）へのfetchラッパー。トークンはフロントに置かない
export async function callLineApi(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  if (!API_BASE_URL) {
    // モック: 実際には投げず成功扱い
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, message: `[モック] ${path} へ送信しました` };
  }
  const doFetch = () => fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    const res = await doFetch();
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    return { ok: true, message: '送信しました' };
  } catch {
    // ネットワークエラー（Herokuスリープ起動中など）は3秒待って1回リトライ
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await doFetch();
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, message: '送信しました（再試行成功）' };
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      // 両回とも失敗 → バックエンド経由でDiscord/LINEへ自動報告
      reportFrontendError('frontend-line-api', path, msg);
      return { ok: false, message: 'サーバーに接続できません。数秒後に再度送信してください。' };
    }
  }
}

// ---- shiftRequests ----
export function subscribeShiftRequests(cb: (items: ShiftRequest[]) => void): () => void {
  if (!isFirebaseConfigured || !db) { cb([]); return () => {}; }
  return subscribeReal<ShiftRequest>(
    query(collection(db!, 'shiftRequests'), orderBy('date', 'asc')),
    (r) => ({
      id: r.id as string,
      date: r.date as string,
      place: r.place as string,
      timeType: r.timeType as 'template' | 'time',
      template: r.template as TemplateCode | undefined,
      timeStart: r.timeStart as string | undefined,
      timeEnd: r.timeEnd as string | undefined,
      timeLabel: r.timeLabel as string,
      requiredCount: r.requiredCount as number,
      acceptedCount: r.acceptedCount as number,
      status: r.status as ShiftRequestStatus,
      createdAt: toMs(r.createdAt),
      createdBy: r.createdBy as string,
    }) as ShiftRequest,
    cb,
  );
}

export interface CreateShiftRequestInput {
  date: string;
  place: string;
  timeType: 'template' | 'time';
  template?: TemplateCode;
  timeStart?: string;
  timeEnd?: string;
  timeLabel: string;
  requiredCount: number;
  createdBy: string;
  comment?: string;
}

export async function createShiftRequest(input: CreateShiftRequestInput): Promise<string> {
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const payload = {
    ...clean,
    acceptedCount: 0,
    status: 'pending' as ShiftRequestStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db!, 'shiftRequests'), payload);
  return ref.id;
}

export async function deleteShiftRequest(requestId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await deleteDoc(doc(db!, 'shiftRequests', requestId));
}

// ---- shiftRequestInvites ----
export function subscribeShiftRequestInvites(cb: (items: ShiftRequestInvite[]) => void): () => void {
  if (!isFirebaseConfigured || !db) { cb([]); return () => {}; }
  return subscribeReal<ShiftRequestInvite>(
    query(collection(db!, 'shiftRequestInvites'), orderBy('sentAt', 'desc')),
    (r) => ({
      id: r.id as string,
      requestId: r.requestId as string,
      date: r.date as string,
      place: r.place as string,
      timeLabel: r.timeLabel as string,
      memberName: r.memberName as string,
      lineUserId: r.lineUserId as string,
      comment: r.comment as string | undefined,
      sentAt: toMs(r.sentAt),
      response: r.response as InviteResponse,
      adjustedTimeStart: r.adjustedTimeStart as string | undefined,
      adjustedTimeEnd: r.adjustedTimeEnd as string | undefined,
      respondedAt: r.respondedAt ? toMs(r.respondedAt) : undefined,
      resultShiftId: r.resultShiftId as string | undefined,
    }) as ShiftRequestInvite,
    cb,
  );
}

// 出勤依頼の個別送信（バックエンド経由でshiftRequestInvitesを作成しLINE通知）
export async function sendShiftRequestInvites(params: {
  requestId: string;
  date: string;
  place: string;
  timeLabel: string;
  targetMembers: { memberName: string; lineUserId: string }[];
  comment?: string;
  sendToGroup?: boolean;
  groupMessage?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, message: '[モック] 出勤依頼を送信しました' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/shift-request/send-invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    return json;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// 出勤依頼回答（バックエンド経由でconfirmedシフト作成 + 管理者通知）
export async function respondToShiftRequestInvite(params: {
  inviteId: string;
  requestId: string;
  memberName: string;
  response: 'accepted' | 'rejected' | 'adjusted';
  adjustedTimeStart?: string;
  adjustedTimeEnd?: string;
  userComment?: string;
}): Promise<{ ok: boolean; result?: 'accepted' | 'rejected' | 'full' | 'already'; message: string }> {
  if (!API_BASE_URL) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, result: params.response === 'rejected' ? 'rejected' : 'accepted', message: '[モック] 回答しました' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/shift-request/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    return json;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export { now };

// ---- nameChangeTokens ----

export type NameChangeTokenResult =
  | { valid: true; forMember: string | null }
  | { valid: false; forMember: null; error: 'not_found' | 'expired' | 'used' };

export async function verifyNameChangeToken(token: string): Promise<NameChangeTokenResult> {
  if (!isFirebaseConfigured || !db) return { valid: false, forMember: null, error: 'not_found' };
  const snap = await getDoc(doc(db, 'nameChangeTokens', token));
  if (!snap.exists()) return { valid: false, forMember: null, error: 'not_found' };
  const data = snap.data();
  if (data.used) return { valid: false, forMember: null, error: 'used' };
  if (data.expiresAt < Date.now()) return { valid: false, forMember: null, error: 'expired' };
  return { valid: true, forMember: (data.forMember as string | null) ?? null };
}

export async function markNameChangeTokenUsed(token: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  await updateDoc(doc(db, 'nameChangeTokens', token), { used: true });
}
