// 管理者用レイアウト: ダークトーン・調整管理モード

import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faClipboardList, faPaperPlane, faMessage, faBookOpen,
  faArrowRightFromBracket, faShieldHalved, faCircleUser,
} from '@fortawesome/free-solid-svg-icons';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const navItems: { to: string; label: string; icon: IconDefinition }[] = [
  { to: '/admin-shift', label: 'シフト調整', icon: faClipboardList },
  { to: '/admin-line', label: 'LINE操作', icon: faPaperPlane },
  { to: '/admin-board', label: '掲示板管理', icon: faMessage },
  { to: '/manual-admin', label: 'マニュアル', icon: faBookOpen },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut, name } = useAuth();
  const { refresh } = useData();
  const navigate = useNavigate();
  const { refreshing } = usePullToRefresh(refresh);

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin-top');
  };

  // サインアウトしてからユーザーログイン画面へ（必ずパスワードを要求）
  const handleGoToUser = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-admin-50 bg-slate-50">
      <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-700 shadow-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/admin-shift')}
            className="flex items-center gap-2 hover:opacity-75 transition-opacity"
            aria-label="シフト調整ページへ"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shadow-sm">
              <FontAwesomeIcon icon={faShieldHalved} className="w-4 h-4" />
            </div>
            <span className="font-semibold">シフト管理 — 管理者</span>
            {name && (
              <span className="text-xs text-slate-300 bg-slate-700 px-2 py-0.5 rounded-full font-medium">
                {name}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handleGoToUser}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white px-2 py-2 rounded-lg hover:bg-slate-800 text-xs transition-all duration-150"
              title="ユーザーサイトへ（再ログイン必要）"
              aria-label="ユーザーサイトへ移動（再ログインが必要）"
            >
              <FontAwesomeIcon icon={faCircleUser} className="w-4 h-4" />
              <span className="hidden sm:inline">ユーザーへ</span>
            </button>
            <button
              onClick={handleSignOut}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-all duration-150"
              title="ログアウト"
              aria-label="ログアウト"
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <nav className="sticky top-14 z-20 bg-slate-950 border-b-2 border-slate-700 shadow-[0_2px_10px_rgba(0,0,0,0.3)]">
        <div className="max-w-6xl mx-auto px-2 pt-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all duration-150 rounded-t-xl ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-[0_-2px_8px_rgba(0,0,0,0.4),0_2px_0_#020617] border border-slate-600 border-b-0'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <FontAwesomeIcon icon={n.icon} className="w-3.5 h-3.5" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* プルトゥリフレッシュ インジケーター */}
      {refreshing && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-slate-700 shadow-cardLg flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-brand-400 animate-spin" />
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 animate-fadeIn">{children}</main>
    </div>
  );
}
