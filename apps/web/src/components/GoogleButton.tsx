import { useEffect, useRef } from 'react';

interface GoogleId {
  initialize: (cfg: {
    client_id: string;
    callback?: (r: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    login_uri?: string;
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('google')));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.google?.accounts) {
      resolve();
    }
  });
}

interface Props {
  clientId: string;
  onCredential: (credential: string) => void;
  /** Linha "ou" acima do botão, quando há também o formulário de senha. */
  divider?: boolean;
}

/**
 * Celular usa redirecionamento: no iPhone o pop-up do Google ficava em branco
 * (a aba nova não conseguia devolver o login para a do app). No computador o
 * pop-up funciona e não tira a pessoa da página.
 */
const useRedirect = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * Navegador interno de app (Instagram, Facebook, WhatsApp no Android...): o
 * Google recusa login nesses navegadores, qualquer que seja o modo.
 */
export function isInAppBrowser() {
  return /Instagram|FBAN|FBAV|WhatsApp|Line\/|; wv\)/i.test(navigator.userAgent);
}

/**
 * Botão "Continuar com o Google" (Google Identity Services). Devolve um ID
 * token que a API valida. O client id vem de GET /auth/config (LoginPage).
 */
export function GoogleButton({ clientId, onCredential, divider = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !host.current || !window.google) return;
        window.google.accounts.id.initialize(
          useRedirect()
            ? {
                client_id: clientId,
                ux_mode: 'redirect',
                // Precisa estar em "URIs de redirecionamento autorizados" no Google Console.
                login_uri: `${window.location.origin}/api/auth/google/callback`,
              }
            : { client_id: clientId, callback: (r) => callback.current(r.credential) },
        );
        window.google.accounts.id.renderButton(host.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'pt-BR',
          width: Math.min(host.current.clientWidth || 320, 400),
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [clientId]);

  return (
    <>
      {divider && (
        <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
          <span className="h-px flex-1 bg-leaf-100" />
          ou
          <span className="h-px flex-1 bg-leaf-100" />
        </div>
      )}
      {isInAppBrowser() ? (
        <p className="rounded-xl bg-leaf-50 px-3 py-2 text-center text-sm text-leaf-900">
          Para entrar com o Google, abra esta página no Safari ou no Chrome (toque em ⋯ e em “Abrir
          no navegador”). O Google não permite login dentro de outros apps.
        </p>
      ) : (
        <div ref={host} className="flex min-h-11 w-full justify-center" />
      )}
    </>
  );
}
