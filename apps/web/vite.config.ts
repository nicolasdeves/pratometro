import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Roda no Node (config do dev server), não no browser: nada daqui vai pro bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:7720';
  const port = Number(env.PORT) || 7721;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port,
      strictPort: true,
      // Proxy pro Nest em dev: o navegador vê tudo same-origin, então o cookie
      // httpOnly de refresh funciona sem CORS. Em produção o ingress faz o mesmo.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
