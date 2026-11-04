import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  authApi,
  renewSession,
  setAccessToken,
  setOnSessionExpired,
  type AuthResult,
  type AuthUser,
} from './api';

interface AuthContextValue {
  user: AuthUser | null;
  /** true enquanto o refresh inicial (restaurar sessão) não terminou. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Atualiza campos do usuário em memória depois de uma alteração no perfil. */
  patchUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * No mount tenta um `/auth/refresh`: com cookie de refresh válido a sessão
 * volta sem novo login. Renovar o access token depois disso é papel do
 * `request()` (no 401), não daqui.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void renewSession().then((res) => {
      if (!alive) return;
      setUser(res?.user ?? null);
      setLoading(false);
    });
    setOnSessionExpired(() => setUser(null));
    return () => {
      alive = false;
      setOnSessionExpired(null);
    };
  }, []);

  const accept = useCallback((res: AuthResult) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => accept(await authApi.login(email, password)),
      register: async (name, email, password) =>
        accept(await authApi.register(name, email, password)),
      loginWithGoogle: async (credential) => accept(await authApi.google(credential)),
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        setAccessToken(null);
        setUser(null);
      },
      patchUser: (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
    }),
    [user, loading, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
