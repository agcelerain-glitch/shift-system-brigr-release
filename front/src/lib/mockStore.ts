// モックデータストア: Firebase未接続時に onSnapshot 互換のリアルタイム購読を再現

import type { Shift, Member, BoardPublic, BoardPrivate, ApprovalLog, ShiftStatus, TimeType, TemplateCode } from './types';

export type Listener<T> = (items: T[]) => void;

const DAY = 24 * 60 * 60 * 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

interface StoreState {
  members: Member[];
  shifts: Shift[];
  boardPublic: BoardPublic[];
  boardPrivate: BoardPrivate[];
  approvalLogs: ApprovalLog[];
}

const seedMembers: Member[] = [
  { id: 'm1', name: '山田 花子', createdAt: Date.now() - 30 * DAY, updatedAt: Date.now() - 2 * DAY, lineUserId: 'U001' },
  { id: 'm2', name: '佐藤 健太', createdAt: Date.now() - 28 * DAY, updatedAt: Date.now() - 1 * DAY, lineUserId: 'U002' },
  { id: 'm3', name: '鈴木 美咲', createdAt: Date.now() - 25 * DAY, updatedAt: Date.now() - 5 * DAY, lineUserId: 'U003' },
  { id: 'm4', name: '高橋 涼介', createdAt: Date.now() - 20 * DAY, updatedAt: Date.now() - 3 * DAY, lineUserId: 'U004' },
  { id: 'm5', name: '渡辺 陽菜', createdAt: Date.now() - 15 * DAY, updatedAt: Date.now() - 1 * DAY, lineUserId: undefined },
];

const seedShifts: Shift[] = [
  {
    id: 's1', memberName: '山田 花子', date: todayStr(), status: 'confirmed', timeType: 'template', template: 'A',
    subject: 'レジ担当', place: '本店', headcount: 2, createdAt: Date.now() - 5 * DAY, updatedAt: Date.now() - 2 * DAY, version: 2,
  },
  {
    id: 's2', memberName: '佐藤 健太', date: todayStr(), status: 'confirmed', timeType: 'template', template: 'C',
    subject: '品出し', place: '本店', headcount: 1, createdAt: Date.now() - 4 * DAY, updatedAt: Date.now() - 1 * DAY, version: 2,
  },
  {
    id: 's3', memberName: '鈴木 美咲', date: addDays(1), status: 'plan', timeType: 'time', timeStart: '10:00', timeEnd: '15:00',
    subject: 'イベント準備', place: '別館', headcount: 3, createdAt: Date.now() - 1 * DAY, updatedAt: Date.now() - 1 * DAY, version: 1,
  },
  {
    id: 's4', memberName: '高橋 涼介', date: addDays(1), status: 'confirmed', timeType: 'template', template: 'B',
    subject: '品出し', place: '本店', headcount: 1, createdAt: Date.now() - 3 * DAY, updatedAt: Date.now() - 1 * DAY, version: 2,
  },
  {
    id: 's5', memberName: '渡辺 陽菜', date: addDays(2), status: 'plan', timeType: 'other',
    subject: '給料受取のみ', place: undefined, headcount: undefined, createdAt: Date.now() - 1 * DAY, updatedAt: Date.now() - 1 * DAY, version: 1,
  },
  {
    id: 's6', memberName: '山田 花子', date: addDays(3), status: 'plan', timeType: 'time', timeStart: '14:00', timeEnd: '19:00',
    subject: 'レジ担当', place: '本店', headcount: 2, createdAt: Date.now() - 1 * DAY, updatedAt: Date.now() - 1 * DAY, version: 1,
  },
  {
    id: 's7', memberName: '佐藤 健太', date: addDays(-1), status: 'confirmed', timeType: 'template', template: 'A',
    subject: 'レジ担当', place: '本店', headcount: 2, createdAt: Date.now() - 6 * DAY, updatedAt: Date.now() - 3 * DAY, version: 2,
  },
  {
    id: 's8', memberName: '鈴木 美咲', date: todayStr(), status: 'plan', timeType: 'time', timeStart: '12:00', timeEnd: '17:00',
    subject: '品出し', place: '本店', headcount: 1, createdAt: Date.now() - 1 * DAY, updatedAt: Date.now() - 1 * DAY, version: 1,
  },
];

const seedBoardPublic: BoardPublic[] = [
  { id: 'bp1', title: '本日は給料日です', body: '本日15時より給料のお渡しを行います。レジ横でお声がけください。', adminName: '管理者', createdAt: Date.now() - 1 * DAY },
  { id: 'bp2', title: 'シフト変更のお知らせ', body: '来週のA帯は品出し担当が追加になります。よろしくお願いします。', adminName: '管理者', createdAt: Date.now() - 3 * DAY },
];

const seedBoardPrivate: BoardPrivate[] = [
  { id: 'bpr1', adminName: '管理者', body: '山田さんは来週連休申請の可能性あり。', type: 'memo', createdAt: Date.now() - 2 * DAY },
  { id: 'bpr2', adminName: '管理者', body: 'シフト送信済み（7/15分）', type: 'notification', createdAt: Date.now() - 1 * DAY },
];

const state: StoreState = {
  members: seedMembers,
  shifts: seedShifts,
  boardPublic: seedBoardPublic,
  boardPrivate: seedBoardPrivate,
  approvalLogs: [],
};

const listeners: Record<string, Set<Listener<unknown>>> = {
  members: new Set(),
  shifts: new Set(),
  boardPublic: new Set(),
  boardPrivate: new Set(),
  approvalLogs: new Set(),
};

function notify<K extends keyof StoreState>(key: K) {
  const set = listeners[key] as Set<Listener<unknown>>;
  set.forEach((fn) => fn([...(state[key] as unknown[])] as never));
}

export const mockStore = {
  isMock: true,

  subscribe<T extends keyof StoreState>(key: T, cb: Listener<StoreState[T][number]>): () => void {
    const set = listeners[key] as Set<Listener<unknown>>;
    set.add(cb as Listener<unknown>);
    cb([...(state[key] as unknown[])] as never);
    return () => set.delete(cb as Listener<unknown>);
  },

  upsertMember(name: string) {
    const existing = state.members.find((m) => m.name === name);
    if (existing) {
      existing.updatedAt = Date.now();
    } else {
      state.members.push({ id: `m${Date.now()}`, name, createdAt: Date.now(), updatedAt: Date.now() });
    }
    notify('members');
  },

  findShift(name: string, date: string): Shift | null {
    return state.shifts.find((s) => s.memberName === name && s.date === date) ?? null;
  },

  createShift(input: {
    memberName: string; date: string; timeType: TimeType; timeStart?: string; timeEnd?: string;
    template?: TemplateCode; subject: string; place?: string; headcount?: number;
  }) {
    state.shifts.push({
      id: `s${Date.now()}`,
      ...input,
      status: 'plan' as ShiftStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    });
    notify('shifts');
  },

  approveShift(p: { shiftId: string; action: 'approve' | 'deny' | 'adjust'; adminName: string; adjustFields?: Partial<Shift> }): 'ok' | 'conflict' {
    const s = state.shifts.find((x) => x.id === p.shiftId);
    if (!s) return 'conflict';
    const before = { ...s };
    if (p.action === 'approve') s.status = 'confirmed';
    if (p.action === 'deny') s.status = 'reviewed';
    if (p.action === 'adjust' && p.adjustFields) Object.assign(s, p.adjustFields, { status: 'confirmed' });
    s.version += 1;
    s.updatedAt = Date.now();
    state.approvalLogs.unshift({
      id: `log${Date.now()}`,
      shiftId: s.id,
      beforeState: before,
      action: p.action,
      adminName: p.adminName,
      createdAt: Date.now(),
    });
    notify('shifts');
    notify('approvalLogs');
    return 'ok';
  },

  restoreShift(logId: string): 'ok' | 'expired' | 'conflict' {
    const log = state.approvalLogs.find((l) => l.id === logId);
    if (!log) return 'conflict';
    if (Date.now() - log.createdAt > 7 * DAY) return 'expired';
    if (!log.beforeState) return 'conflict';
    const s = state.shifts.find((x) => x.id === log.shiftId);
    if (s) {
      Object.assign(s, log.beforeState, { version: log.beforeState.version + 1, updatedAt: Date.now() });
    } else {
      state.shifts.push({ ...log.beforeState, version: log.beforeState.version + 1, updatedAt: Date.now() });
    }
    notify('shifts');
    return 'ok';
  },

  createBoardPublic(title: string, body: string, adminName: string) {
    state.boardPublic.unshift({ id: `bp${Date.now()}`, title, body, adminName, createdAt: Date.now() });
    notify('boardPublic');
  },

  requestDeleteShift(shiftId: string, expectedVersion: number): 'ok' | 'conflict' {
    const s = state.shifts.find((x) => x.id === shiftId);
    if (!s) return 'conflict';
    if (s.version !== expectedVersion) return 'conflict';
    s.status = 'delete_requested' as ShiftStatus;
    s.version += 1;
    s.updatedAt = Date.now();
    notify('shifts');
    return 'ok';
  },

  deleteShift(shiftId: string) {
    state.shifts = state.shifts.filter((s) => s.id !== shiftId);
    notify('shifts');
  },

  deleteDoc(key: 'boardPublic' | 'boardPrivate' | 'shifts', id: string) {
    state[key] = state[key].filter((x) => x.id !== id) as never;
    notify(key);
  },

  createBoardPrivate(body: string, type: 'memo' | 'notification', adminName: string) {
    state.boardPrivate.unshift({ id: `bpr${Date.now()}`, adminName, body, type, createdAt: Date.now() });
    notify('boardPrivate');
  },
};
