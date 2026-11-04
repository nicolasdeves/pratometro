import { CalendarDays, Home, LogOut, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Wordmark } from './Logo';

const NAV = [
  { to: '/', label: 'Hoje', icon: Home },
  { to: '/diario', label: 'Diário', icon: CalendarDays },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-leaf-100 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link to="/">
            <Wordmark />
          </Link>
          {/* No computador a navegação fica no topo; no celular, na barra de baixo. */}
          <nav className="hidden flex-1 justify-center gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-semibold ${isActive ? 'bg-leaf-100 text-leaf-700' : 'text-muted hover:text-ink'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-9 w-9 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf-100 font-bold text-leaf-700">
                {initial}
              </span>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-leaf-50 hover:text-ink"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-leaf-100 bg-cream/95 backdrop-blur sm:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${isActive ? 'text-leaf-700' : 'text-muted'}`
            }
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
