// アプリ全体のルーティング設定: ユーザー/管理者の各ルートを定義し、ルートガードで保護

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { ToastProvider } from './contexts/ToastContext';
import { RequireRole } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { NameSetupPage } from './pages/NameSetupPage';
import { CalendarPage } from './pages/CalendarPage';
import { BoardPage } from './pages/BoardPage';
import { PersonalPage } from './pages/PersonalPage';
import { RequestPage } from './pages/RequestPage';
import { ManualUserPage } from './pages/ManualUserPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminShiftPage } from './pages/AdminShiftPage';
import { AdminLinePage } from './pages/AdminLinePage';
import { AdminBoardPage } from './pages/AdminBoardPage';
import { ManualAdminPage } from './pages/ManualAdminPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/name-setup" element={<NameSetupPage />} />
      <Route path="/admin-top" element={<AdminLoginPage />} />

      {/* user専用: / はユーザーカレンダー（未認証・role不一致はRequireRoleが適切に遷移） */}
      <Route path="/" element={<RequireRole role="user"><CalendarPage /></RequireRole>} />
      <Route path="/board" element={<RequireRole role="user"><BoardPage /></RequireRole>} />
      <Route path="/personal" element={<RequireRole role="user"><PersonalPage /></RequireRole>} />
      <Route path="/request" element={<RequireRole role="user"><RequestPage /></RequireRole>} />
      <Route path="/manual-user" element={<RequireRole role="user"><ManualUserPage /></RequireRole>} />

      {/* admin専用 */}
      <Route path="/admin-shift" element={<RequireRole role="admin"><AdminShiftPage /></RequireRole>} />
      <Route path="/admin-line" element={<RequireRole role="admin"><AdminLinePage /></RequireRole>} />
      <Route path="/admin-board" element={<RequireRole role="admin"><AdminBoardPage /></RequireRole>} />
      <Route path="/manual-admin" element={<RequireRole role="admin"><ManualAdminPage /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <DataProvider>
            <AppRoutes />
          </DataProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
