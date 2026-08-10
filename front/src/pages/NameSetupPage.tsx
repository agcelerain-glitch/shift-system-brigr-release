// 名前入力画面: ログイン直後に名前を設定する
// savedName（localStorage）があれば自動でFirestore更新→遷移（ボタン操作不要）
// 開発者モード: ?dev=1 またはアイコン5回連続タップで有効化 → 別の名前を使う選択肢が出る

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, ArrowRight } from 'lucide-react';
import { useAuth, LS_SAVED_NAME_KEY } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button, Input } from '../components/ui';
import { upsertMember, verifyNameChangeToken, markNameChangeTokenUsed } from '../lib/db';

export function NameSetupPage() {
  const { setName, name, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const savedName = localStorage.getItem(LS_SAVED_NAME_KEY);

  // 開発者モード: ?dev=1 またはアイコン5回タップで有効化
  const [devMode, setDevMode] = useState(searchParams.get('dev') === '1');
  const [iconTapCount, setIconTapCount] = useState(0);
  const [useDifferent, setUseDifferent] = useState(false);
  const [value, setValue] = useState(name ?? '');
  const [saving, setSaving] = useState(false);

  // トークンモード: ?token=<token> で1時間限定の名前変更リンク
  const tokenParam = searchParams.get('token');
  const [tokenChecking, setTokenChecking] = useState(!!tokenParam);
  const [tokenMode, setTokenMode] = useState(false);
  const [tokenForMember, setTokenForMember] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenParam) return;
    (async () => {
      setTokenChecking(true);
      const result = await verifyNameChangeToken(tokenParam);
      if (result.valid) {
        setTokenMode(true);
        setTokenForMember(result.forMember);
      } else {
        const msg =
          result.error === 'expired' ? 'リンクの有効期限が切れています（発行から1時間）'
          : result.error === 'used' ? 'このリンクは既に使用済みです'
          : '無効なリンクです。管理者に再発行を依頼してください';
        setTokenError(msg);
      }
      setTokenChecking(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // savedNameがある場合はボタン操作なしで自動遷移（devMode・tokenParam は除外）
  useEffect(() => {
    if (!savedName || devMode || tokenParam) return;
    let cancelled = false;
    (async () => {
      try {
        await upsertMember(savedName, role ?? undefined);
      } catch {
        // ネットワーク不安定時も遷移を優先（次回ログイン時に更新される）
      }
      if (!cancelled) {
        setName(savedName);
        localStorage.setItem(LS_SAVED_NAME_KEY, savedName);
        navigate(role === 'admin' ? '/admin-shift' : '/');
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIconTap = useCallback(() => {
    if (devMode) return;
    const next = iconTapCount + 1;
    if (next >= 5) {
      setDevMode(true);
      setIconTapCount(0);
      toast.show('開発者モード有効', 'success');
    } else {
      setIconTapCount(next);
    }
  }, [devMode, iconTapCount, toast]);

  const handleConfirm = async (nameToSet: string) => {
    const trimmed = nameToSet.trim();
    if (!trimmed) { toast.show('名前を入力してください', 'error'); return; }
    setSaving(true);
    try {
      await upsertMember(trimmed, role ?? undefined);
      // トークンモードの場合は使用済みにしてから遷移
      if (tokenParam && tokenMode) {
        try { await markNameChangeTokenUsed(tokenParam); } catch { /* 消費失敗は続行 */ }
      }
    } catch (err) {
      toast.show(`名前の保存に失敗しました: ${(err as Error).message}`, 'error');
      setSaving(false);
      return;
    }
    setName(trimmed);
    localStorage.setItem(LS_SAVED_NAME_KEY, trimmed);
    toast.show(`${trimmed} さん、ようこそ`, 'success');
    navigate(role === 'admin' ? '/admin-shift' : '/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleConfirm(value);
  };

  const iconButton = (
    <button
      type="button"
      aria-label="アイコン"
      onClick={handleIconTap}
      className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 mb-3 focus:outline-none"
    >
      <User className="w-7 h-7" />
    </button>
  );

  // トークン検証中
  if (tokenChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">リンクを確認中…</p>
        </div>
      </div>
    );
  }

  // トークンエラー（期限切れ・使用済み・無効）
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center text-red-500 mx-auto mb-4">
            <User className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">リンクが無効です</h1>
          <p className="text-sm text-gray-500">{tokenError}</p>
        </div>
      </div>
    );
  }

  // savedNameあり・非devMode・非tokenMode → 自動遷移中のローディング表示
  if (savedName && !devMode && !tokenMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">ログイン中…</p>
        </div>
      </div>
    );
  }

  // トークンモード: savedNameあり & 別の名前入力前 → 名前確認UI
  if (tokenMode && savedName && !useDifferent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            {iconButton}
            <h1 className="text-xl font-bold text-gray-900">名前変更</h1>
            <p className="text-sm text-gray-500 mt-1">管理者から発行された変更リンクです</p>
            {tokenForMember && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2">
                このリンクは「{tokenForMember}」さん用に発行されました
              </p>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 space-y-4">
            <div className="bg-brand-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">現在の名前</p>
              <p className="text-2xl font-bold text-gray-900">{savedName}</p>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={saving}
              onClick={() => handleConfirm(savedName)}
            >
              {saving ? '確認中…' : `${savedName} のまま続ける`}
            </Button>
            <button
              type="button"
              onClick={() => { setUseDifferent(true); setValue(''); }}
              className="w-full text-sm text-brand-600 hover:text-brand-800 py-2 transition-colors"
            >
              名前を変更する →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 開発者モード: savedNameあり & 別の名前を使う選択前 → 名前確認UI
  if (devMode && savedName && !useDifferent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            {iconButton}
            <h1 className="text-xl font-bold text-gray-900">名前を確認</h1>
            <p className="text-sm text-gray-500 mt-1">前回の名前でそのまま続けられます</p>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 space-y-4">
            <div className="bg-brand-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">前回のログイン名</p>
              <p className="text-2xl font-bold text-gray-900">{savedName}</p>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={saving}
              onClick={() => handleConfirm(savedName)}
            >
              {saving ? '確認中…' : `${savedName} でログイン`}
              {!saving && <ArrowRight className="w-4 h-4" />}
            </Button>
            <button
              type="button"
              onClick={() => { setUseDifferent(true); setValue(''); }}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
            >
              別の名前を使う（開発者）
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 通常の名前入力フォーム（初回 or 開発者による名前切り替え）
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {iconButton}
          <h1 className="text-xl font-bold text-gray-900">お名前を教えてください</h1>
          <p className="text-sm text-gray-500 mt-1">シフト・掲示板はこの名前で紐づきます</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">名前</label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="例: 山田花子"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">LINEで名前登録するときと完全一致させてください</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? '保存中…' : '次へ'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </Button>
          {(devMode || tokenMode) && savedName && (
            <button
              type="button"
              onClick={() => setUseDifferent(false)}
              className="w-full text-sm text-brand-600 hover:text-brand-800 py-1 transition-colors"
            >
              ← {savedName} に戻る
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
