export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  dailyKcalGoal: number | null;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  issues?: ApiIssue[];

  constructor(status: number, message: string, issues?: ApiIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

const API_BASE = '/api';

// Access token só em memória: some no F5 e volta pelo /auth/refresh (cookie httpOnly).
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpired = cb;
}

interface RequestOptions extends RequestInit {
  skipAuthRetry?: boolean;
}

// Refresh em voo compartilhado: o refresh token é rotacionado, então um 2º
// pedido simultâneo com o mesmo cookie seria recusado.
let refreshing: Promise<AuthResult | null> | null = null;

export function renewSession(): Promise<AuthResult | null> {
  refreshing ??= request<AuthResult>('/auth/refresh', { method: 'POST', skipAuthRetry: true })
    .then((res) => {
      setAccessToken(res.accessToken);
      return res;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  return toResult<T>(await authed(path, init));
}

/** Arquivo binário autenticado (ex.: foto da refeição, que um <img> não consegue buscar com token). */
export async function requestBlob(path: string): Promise<Blob> {
  const res = await authed(path, {});
  if (!res.ok) throw new ApiError(res.status, 'Não foi possível carregar o arquivo');
  return res.blob();
}

// Envia com o access token; num 401, renova a sessão uma vez e repete.
async function authed(path: string, init: RequestOptions): Promise<Response> {
  let res = await send(path, init);

  if (res.status === 401 && !init.skipAuthRetry && !path.startsWith('/auth/')) {
    const renewed = await renewSession();
    if (renewed) res = await send(path, init);
    else onSessionExpired?.();
  }

  return res;
}

async function send(path: string, init: RequestOptions): Promise<Response> {
  const { skipAuthRetry: _skip, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body && !(rest.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  // Lido a cada envio: na 2ª tentativa o token já é o novo.
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(`${API_BASE}${path}`, { ...rest, headers, credentials: 'include' });
}

async function toResult<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = 'Erro inesperado. Tente novamente.';
    let issues: ApiIssue[] | undefined;
    try {
      const data = await res.json();
      if (Array.isArray(data?.errors)) issues = data.errors;
      if (typeof data?.message === 'string') message = data.message;
    } catch {
      /* corpo vazio ou não-JSON */
    }
    throw new ApiError(res.status, message, issues);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface AuthConfig {
  googleClientId: string | null;
  passwordLogin: boolean;
}

export const authApi = {
  config: () => request<AuthConfig>('/auth/config'),

  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  google: (credential: string) =>
    request<AuthResult>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
};
