import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import { DiaryPage } from './pages/DiaryPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MealPage } from './pages/MealPage';
import { NewMealPage } from './pages/NewMealPage';
import { ProfilePage } from './pages/ProfilePage';

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/entrar" replace />;
  return <AppShell>{children}</AppShell>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-leaf-100 border-t-leaf-600" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/entrar"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/"
        element={
          <Private>
            <HomePage />
          </Private>
        }
      />
      <Route
        path="/refeicoes/nova"
        element={
          <Private>
            <NewMealPage />
          </Private>
        }
      />
      <Route
        path="/refeicoes/:id"
        element={
          <Private>
            <MealPage />
          </Private>
        }
      />
      <Route
        path="/diario"
        element={
          <Private>
            <DiaryPage />
          </Private>
        }
      />
      <Route
        path="/perfil"
        element={
          <Private>
            <ProfilePage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
