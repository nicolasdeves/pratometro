import { useEffect, useRef, useState } from 'react';
import { authApi } from '../lib/api';

interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
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
  onCredential: (credential: string) => void;
}

/**
 * Botão "Continuar com o Google" (Google Identity Services). Devolve um ID
 * token que a API valida. Some sozinho se a API não tiver GOOGLE_CLIENT_ID.
 */
export function GoogleButton({ onCredential }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    authApi
      .config()
      .then((c) => alive && setClientId(c.googleClientId))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !host.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => callback.current(r.credential),
        });
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

  if (!clientId) return null;
  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
        <span className="h-px flex-1 bg-leaf-100" />
        ou
        <span className="h-px flex-1 bg-leaf-100" />
      </div>
      <div ref={host} className="flex min-h-11 w-full justify-center" />
    </>
  );
}
