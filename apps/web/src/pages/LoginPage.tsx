import { Camera, MessageCircleQuestion, Mic } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoogleButton } from '../components/GoogleButton';
import { Wordmark } from '../components/Logo';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [params] = useSearchParams();
  // ?erro=google: a API devolveu para cá porque o login com Google (modo redirecionamento) falhou.
  const [error, setError] = useState<string | null>(
    params.get('erro') === 'google' ? 'Não foi possível entrar com o Google. Tente de novo.' : null,
  );
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      const issue = err instanceof ApiError ? err.issues?.[0]?.message : undefined;
      setError(issue ?? (err instanceof Error ? err.message : 'Erro inesperado.'));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() => (mode === 'login' ? login(email, password) : register(name, email, password)));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-leaf-600 p-10 text-cream lg:flex">
        <span className="[&_span]:text-cream">
          <Wordmark />
        </span>
        <div>
          <h1 className="text-4xl leading-tight font-extrabold">
            Fotografe o prato.
            <br />
            Conte como foi.
            <br />
            <span className="text-tomato-100">A IA faz as contas.</span>
          </h1>
          <ul className="mt-8 space-y-3 text-leaf-50">
            <li className="flex items-center gap-3">
              <Camera className="h-5 w-5" /> Foto da refeição
            </li>
            <li className="flex items-center gap-3">
              <Mic className="h-5 w-5" /> Descrição por áudio ou texto
            </li>
            <li className="flex items-center gap-3">
              <MessageCircleQuestion className="h-5 w-5" /> Perguntas quando algo não está claro
            </li>
          </ul>
        </div>
        <p className="text-sm text-leaf-100">
          Estimativas por IA — não substituem um nutricionista.
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h2 className="text-2xl font-extrabold">
            {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === 'login' ? 'Entre para registrar suas refeições.' : 'Leva menos de um minuto.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === 'register' && (
              <Field label="Nome" value={name} onChange={setName} autoComplete="name" />
            )}
            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <Field
              label="Senha"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {error && (
              <p className="rounded-xl bg-tomato-100 px-3 py-2 text-sm text-tomato-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-leaf-600 py-3 font-bold text-white transition hover:bg-leaf-700 disabled:opacity-60"
            >
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <GoogleButton onCredential={(c) => void run(() => loginWithGoogle(c))} />

          <p className="mt-6 text-center text-sm text-muted">
            {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              className="font-bold text-leaf-600 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}

function Field({ label, value, onChange, type = 'text', autoComplete }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl border border-leaf-100 bg-white px-4 py-3 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100"
      />
    </label>
  );
}
