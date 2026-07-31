// 認証コンテキスト: パスワードのみ入力・固定メールでsignIn、role/nameを保持、ルートガード用

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  getIdTokenResult,
  type User as FbUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, USER_EMAIL, ADMIN_EMAIL } from '../lib/firebase';
import { mockStore } from '../lib/mockStore';
import type { Role } from '../lib/types';

const LS_NAME_KEY = 'shiftapp.name';
const LS_ROLE_KEY = 'shiftapp.role';
export const LS_SAVED_NAME_KEY = 'shiftapp.savedName'; // 次回ログイン時の名前自動補完用

interface AuthCtx {
  role: Role | null;
  name: string | null;
  initializing: boolean;
  signInUser: (password: string) => Promise<void>;
  signInAdmin: (password: string) => Promise<void>;
  setName: (name: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [name, setNameState] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // nameはローカルストレージから即時復元（ローディング中も表示を維持）
    const storedName = localStorage.getItem(LS_NAME_KEY);
    if (storedName) setNameState(storedName);

    if (!isFirebaseConfigured || !auth) {
      // モック時はローカルストレージのroleを使う
      const storedRole = localStorage.getItem(LS_ROLE_KEY) as Role | null;
      if (storedRole) setRole(storedRole);
      setInitializing(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u: FbUser | null) => {
      if (!u) {
        setRole(null);
        setNameState(null);
        localStorage.removeItem(LS_ROLE_KEY);
        localStorage.removeItem(LS_NAME_KEY);
        setInitializing(false);
        return;
      }
      // ページリフレッシュ時: カスタムクレームからロールを読み取り
      try {
        const result = await getIdTokenResult(u);
        const claimRole = result.claims['role'] as Role | undefined;
        if (claimRole === 'user' || claimRole === 'admin') {
          setRole(claimRole);
          localStorage.setItem(LS_ROLE_KEY, claimRole);
        } else {
          // クレームが未設定のアカウントはサインアウト
          await fbSignOut(auth);
        }
      } catch {
        // トークン取得失敗時はそのまま続行（roleはnull）
      }
      setInitializing(false);
    });
    return () => unsub();
  }, []);

  const doSignIn = async (email: string | undefined, password: string, expectRole: Role): Promise<void> => {
    if (!email) throw new Error('固定メールが未設定です。.envを確認してください。');
    if (!isFirebaseConfigured || !auth) {
      // モック: パスワードは何でも通す
      setRole(expectRole);
      localStorage.setItem(LS_ROLE_KEY, expectRole);
      return;
    }
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // カスタムクレームからロールを取得して検証
    const result = await getIdTokenResult(cred.user);
    const claimRole = result.claims['role'] as Role | undefined;
    if (claimRole !== expectRole) {
      await fbSignOut(auth);
      throw new Error('このアカウントにはアクセス権限がありません。set-claims.js でカスタムクレームを設定してください。');
    }
    setRole(claimRole);
    localStorage.setItem(LS_ROLE_KEY, claimRole);
  };

  const value = useMemo<AuthCtx>(
    () => ({
      role,
      name,
      initializing,
      signInUser: (pw) => doSignIn(USER_EMAIL, pw, 'user'),
      signInAdmin: (pw) => doSignIn(ADMIN_EMAIL, pw, 'admin'),
      setName: (n) => {
        setNameState(n);
        localStorage.setItem(LS_NAME_KEY, n);
        mockStore.upsertMember(n);
      },
      signOut: async () => {
        // 名前をキャッシュとして保持（次回ログイン時の自動補完用）
        if (name) localStorage.setItem(LS_SAVED_NAME_KEY, name);
        if (isFirebaseConfigured && auth) await fbSignOut(auth);
        setRole(null);
        setNameState(null);
        localStorage.removeItem(LS_ROLE_KEY);
        localStorage.removeItem(LS_NAME_KEY);
      },
    }),
    [role, name, initializing],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
