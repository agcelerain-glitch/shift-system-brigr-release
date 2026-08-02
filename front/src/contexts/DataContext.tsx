// データコンテキスト: 認証済み時のみFirestore購読を開始・再接続する

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  subscribeMembers,
  subscribeShifts,
  subscribeBoardPublic,
  subscribeBoardPrivate,
  subscribeBoardPublicDeleted,
  subscribeBoardPrivateDeleted,
  subscribeApprovalLogs,
} from '../lib/db';
import { useAuth } from './AuthContext';
import type { Member, Shift, BoardPublic, BoardPrivate, ApprovalLog, DeletedBoardPublic, DeletedBoardPrivate } from '../lib/types';

interface DataCtx {
  members: Member[];
  shifts: Shift[];
  boardPublic: BoardPublic[];
  boardPrivate: BoardPrivate[];
  boardPublicDeleted: DeletedBoardPublic[];
  boardPrivateDeleted: DeletedBoardPrivate[];
  approvalLogs: ApprovalLog[];
  loaded: boolean;
  firestoreError: string | null;
  refresh: () => void;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { role, initializing } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [boardPublic, setBoardPublic] = useState<BoardPublic[]>([]);
  const [boardPrivate, setBoardPrivate] = useState<BoardPrivate[]>([]);
  const [boardPublicDeleted, setBoardPublicDeleted] = useState<DeletedBoardPublic[]>([]);
  const [boardPrivateDeleted, setBoardPrivateDeleted] = useState<DeletedBoardPrivate[]>([]);
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    // 認証初期化中は待つ。未ログインなら購読しない
    if (initializing || !role) {
      setShifts([]);
      setMembers([]);
      setBoardPublic([]);
      setBoardPrivate([]);
      setBoardPublicDeleted([]);
      setBoardPrivateDeleted([]);
      setApprovalLogs([]);
      setLoaded(false);
      return;
    }

    setFirestoreError(null);

    // 購読開始・エラーハンドリング付き
    const safeSubscribe = <T,>(
      subscribeFn: (cb: (items: T[]) => void) => () => void,
      setter: (items: T[]) => void,
      label: string,
    ) => {
      try {
        return subscribeFn((items) => {
          setter(items);
          setLoaded(true);
        });
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`${label} 購読エラー:`, msg);
        setFirestoreError(`データ読み込みエラー: ${msg}`);
        return () => {};
      }
    };

    const unsubs = [
      safeSubscribe(subscribeMembers, setMembers, 'members'),
      safeSubscribe(subscribeShifts, setShifts, 'shifts'),
      safeSubscribe(subscribeBoardPublic, setBoardPublic, 'boardPublic'),
      safeSubscribe(subscribeBoardPrivate, setBoardPrivate, 'boardPrivate'),
      safeSubscribe(subscribeApprovalLogs, setApprovalLogs, 'approvalLogs'),
    ];
    // admin専用コレクション（削除済み掲示板）
    if (role === 'admin') {
      unsubs.push(
        safeSubscribe(subscribeBoardPublicDeleted, setBoardPublicDeleted, 'boardPublicDeleted'),
        safeSubscribe(subscribeBoardPrivateDeleted, setBoardPrivateDeleted, 'boardPrivateDeleted'),
      );
    }
    setLoaded(true);

    return () => unsubs.forEach((u) => u());
  }, [role, initializing, refreshKey]); // auth状態またはrefreshKeyが変わるたびに再購読

  return (
    <Ctx.Provider value={{ members, shifts, boardPublic, boardPrivate, boardPublicDeleted, boardPrivateDeleted, approvalLogs, loaded, firestoreError, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used within DataProvider');
  return v;
}
