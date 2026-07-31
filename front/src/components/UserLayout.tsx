// ユーザー用レイアウト: ヘッダーナビ・テーマはブランド系（クリーン）

import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCalendarDays, faMessage, faCircleUser, faFileCirclePlus, faBookOpen,
  faArrowRightFromBracket, faCalendarCheck,
} from '@fortawesome/free-solid-svg-icons';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const navItems: { to: string; label: string; icon: IconDefinition; end?: boolean }[] = [
  { to: '/', label: 'カレンダー', icon: faCalendarDays, end: true },
  { to: '/board', label: '掲示板', icon: faMessage },
  { to: '/personal', label: '自分のシフト', icon: faCircleUser },
  { to: '/request', label: 'シフト申請', icon: faFileCirclePlus },
  { to: '/manual-user', label: 'マニュアル', icon: faBookOpen },
];

export function UserLayout({ children }: { children: ReactNode }) {
  const { name, signOut } = useAuth();
  const { refresh } = useData();
  const navigate = useNavigate();
  const { refreshing } = usePullToRefresh(refresh);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 hover:opacity-75 transition-opacity"
            aria-label="カレンダートップへ"
          >
            <div className="w-8 h-8 rounded-lg bg-[linear-gradient(to_bottom,#60a5fa,#2563eb_18%,#2563eb)] flex items-center justify-center text-white shadow-sm">
              <FontAwesomeIcon icon={faCalendarCheck} className="w-4 h-4" />
            </div>
            <span className="font-semibold text-gray-900">シフト管理</span>
            <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">ユーザー</span>
          </button>
          <div className="flex items-center gap-3">
            {name && <span className="text-sm text-gray-600 hidden sm:inline">{name}さん</span>}
            <button
              onClick={handleSignOut}
              className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-gray-100 transition-all duration-150"
              title="ログアウト"
              aria-label="ログアウト"
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <nav className="sticky top-14 z-20 bg-gray-100/95 backdrop-blur-md border-b-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto px-2 pt-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all duration-150 rounded-t-xl ${
                  isActive
                    ? 'bg-white text-brand-600 shadow-[0_-2px_6px_rgba(0,0,0,0.06),0_2px_0_#f3f4f6] border border-gray-200 border-b-0'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
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
          <div className="w-9 h-9 rounded-full bg-white shadow-cardLg flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-brand-500 animate-spin" />
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 animate-fadeIn">{children}</main>

      <footer
        className="mt-16 text-center"
        style={{ paddingBottom: 'max(2.5rem, calc(1.5rem + env(safe-area-inset-bottom)))' }}
      >
        <button
          onClick={async () => { await signOut(); navigate('/admin-top'); }}
          className="text-xs text-gray-300 hover:text-gray-500 transition-colors py-3 px-6"
          aria-label="管理者ログインページへ移動"
        >
          管理者ログイン
        </button>
      </footer>
    </div>
  );
}
