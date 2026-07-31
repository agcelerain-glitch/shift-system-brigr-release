// ルートガード: role別に閲覧制限。未認証・role不一致は適切なログインへ遷移

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../lib/types';

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { role: current, name, initializing } = useAuth();
  const loc = useLocation();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!current) {
    return <Navigate to={role === 'admin' ? '/admin-top' : '/login'} state={{ from: loc.pathname }} replace />;
  }
  if (current !== role) {
    return <Navigate to={current === 'admin' ? '/admin-shift' : '/'} replace />;
  }
  // user/admin ともに名前入力が必要
  if (!name) {
    return <Navigate to="/name-setup" replace />;
  }
  return <>{children}</>;
}
