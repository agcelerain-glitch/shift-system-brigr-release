// Firestore / モック両対応のDBアクセス関数を集約
// isFirebaseConfigured で実DBとモックを切り替え、リアルタイムリスナー(onSnapshot)互換の購読APIを提供

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  setDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  deleteField,
  type Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, API_BASE_URL } from './firebase';
import { mockStore } from './mockStore';
import type { Shift, Member, BoardPublic, BoardPrivate, ApprovalLog, ShiftStatus, TimeType, TemplateCode } from './types';

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
    (r) => ({ id: r.id as string, name: r.name as string, createdAt: toMs(r.createdAt), updatedAt: toMs(r.updatedAt), lineUserId: r.lineUserId as string | undefined }) as Member,
    cb,
  );
}

export async function upsertMember(name: string): Promise<void> {
  const payload = { name, updatedAt: serverTimestamp() };
  if (!isFirebaseConfigured) return mockStore.upsertMember(name);
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
  return subscribeReal<ApprovalLog>(
    query(collection(db!, 'approvalLogs'), orderBy('createdAt', 'desc')),
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

export async function deleteBoardPublic(id: string): Promise<void> {
  if (!isFirebaseConfigured) return mockStore.deleteDoc('boardPublic', id);
  await deleteDoc(doc(db!, 'boardPublic', id));
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

export async function deleteBoardPrivate(id: string): Promise<void> {
  if (!isFirebaseConfigured) return mockStore.deleteDoc('boardPrivate', id);
  await deleteDoc(doc(db!, 'boardPrivate', id));
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

// LINE API（Heroku）へのfetchラッパー。トークンはフロントに置かない
export async function callLineApi(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  if (!API_BASE_URL) {
    // モック: 実際には投げず成功扱い
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, message: `[モック] ${path} へ送信しました` };
  }
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    return { ok: true, message: '送信しました' };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export { now };
