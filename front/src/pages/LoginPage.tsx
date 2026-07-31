// ユーザーログイン画面: パスワードのみ入力、名前チェックなし（固定メールでsignIn）

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, CalendarCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button, Input } from '../components/ui';
import { isFirebaseConfigured } from '../lib/firebase';

const SAVE_FLAG_KEY = 'shift_user_save_pw';
const SAVED_PW_KEY = 'shift_user_saved_pw';
const LOGIN_LOG_KEY = 'shift_user_login_log';

function loadSavedPassword(): string {
  try {
    if (localStorage.getItem(SAVE_FLAG_KEY) === 'true') {
      return localStorage.getItem(SAVED_PW_KEY) ?? '';
    }
  } catch { /* localStorageが使えない環境（プライベートモードなど） */ }
  return '';
}

function recordLoginLog() {
  try {
    const raw = localStorage.getItem(LOGIN_LOG_KEY);
    const log: { at: string }[] = raw ? JSON.parse(raw) : [];
    log.unshift({ at: new Date().toISOString() });
    if (log.length > 10) log.splice(10);
    localStorage.setItem(LOGIN_LOG_KEY, JSON.stringify(log));
  } catch { /* 記録失敗は無視 */ }
}

export function LoginPage() {
  const { signInUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState(() => loadSavedPassword());
  const [savePassword, setSavePassword] = useState(() => {
    try { return localStorage.getItem(SAVE_FLAG_KEY) === 'true'; } catch { return false; }
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    try {
      await signInUser(password);
      try {
        if (savePassword) {
          localStorage.setItem(SAVE_FLAG_KEY, 'true');
          localStorage.setItem(SAVED_PW_KEY, password);
        } else {
          localStorage.setItem(SAVE_FLAG_KEY, 'false');
          localStorage.removeItem(SAVED_PW_KEY);
        }
        recordLoginLog();
      } catch { /* Storage書き込み失敗は無視 */ }
      toast.show('ログインしました', 'success');
      navigate('/');
    } catch (err) {
      toast.show('ログイン失敗: パスワードを確認してください', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/30 mb-3">
            <CalendarCheck className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">シフト管理システム</h1>
          <p className="text-sm text-gray-500 mt-1">ユーザーログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">パスワード</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                className="pl-9"
                autoFocus={!password}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">名前は次の画面で入力します</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={savePassword}
              onChange={(e) => setSavePassword(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <span className="text-sm text-gray-600">パスワードを保存する</span>
          </label>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'ログイン中…' : 'ログイン'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => navigate('/admin-top')} className="text-xs text-gray-400 hover:text-gray-600">
            管理者ログインはこちら
          </button>
        </div>
        {!isFirebaseConfigured && (
          <p className="text-center text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg py-2">
            モックモードで動作中（Firebase未設定・パスワード任意で通過）
          </p>
        )}
      </div>
    </div>
  );
}
