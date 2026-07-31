// 名前入力画面: ログイン直後に名前を入力、members コレクションへ保存し以降の紐づけに使う
// 前回ログイン名がキャッシュされている場合はワンタップ確認UIを表示

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ArrowRight } from 'lucide-react';
import { useAuth, LS_SAVED_NAME_KEY } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button, Input } from '../components/ui';
import { upsertMember } from '../lib/db';

export function NameSetupPage() {
  const { setName, name, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const savedName = localStorage.getItem(LS_SAVED_NAME_KEY);
  const [useDifferent, setUseDifferent] = useState(false);
  const [value, setValue] = useState(name ?? '');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async (nameToSet: string) => {
    const trimmed = nameToSet.trim();
    if (!trimmed) {
      toast.show('名前を入力してください', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertMember(trimmed);
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

  // 前回の名前がキャッシュされており、かつ「別の名前を使う」を選択していない場合
  if (savedName && !useDifferent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 mb-3">
              <User className="w-7 h-7" />
            </div>
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
              別の名前を使う
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 通常の名前入力フォーム（初回 or 別の名前を使う場合）
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 mb-3">
            <User className="w-7 h-7" />
          </div>
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
          {savedName && (
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
