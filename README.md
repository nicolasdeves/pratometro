# Pratômetro

Calorias e macros de uma refeição a partir da **foto do prato**, do que a pessoa **escreve ou fala** e, opcionalmente, do **plano alimentar em PDF** do nutricionista. A IA (Gemini) pode fazer perguntas antes de estimar e o resultado sai em tela e em PDF.

Trabalho da disciplina Sistemas Interativos e de Visualização (Univates).

## Estrutura

| Pasta | O quê |
|---|---|
| `apps/api` | NestJS: auth (e-mail/senha + Google), refeições, plano alimentar, chamadas ao Gemini, PDF |
| `apps/web` | React + Vite + Tailwind: wizard de refeição, diário, perfil |
| `packages/database` | Prisma (schema + migrações) |
| `tools/migrate` | Imagem que roda `prisma migrate deploy` (Job do ArgoCD) |
| `tools/fixtures` | Prato de teste, áudios pt-BR e plano alimentar fictício usados nos testes |

Os prompts enviados ao Gemini ficam em `apps/api/src/meals/*.prompt.ts` e `apps/api/src/plan/plan.prompts.ts`.

## Rodando local

```bash
npm install
cp .env.example .env                      # preencha GEMINI_API_KEY (e GOOGLE_CLIENT_ID, se quiser o login com Google)
echo "DATABASE_URL=postgresql://pratometro:pratometro@localhost:5442/pratometro" > packages/database/.env
docker compose up -d                      # Postgres na porta 5442
npm run db:deploy
npm run dev                               # API em :7720, web em :7721
```

## Deploy

Push na `main` → GitHub Actions (`deploy.yml`) publica `ghcr.io/nicolasdeves/pratometro/{api,web,migrate}` e atualiza o `newTag` em `nedev-gitops/pratometro/*/overlays/production`. O ArgoCD sincroniza o namespace `pratometro-production`.

Uma vez, no cluster:

```bash
kubectl -n pratometro-production create secret generic pratometro-secrets \
  --from-literal=GEMINI_API_KEY=... \
  --from-literal=GOOGLE_CLIENT_ID=... \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
```

No repositório do GitHub: secret `NEDEV_GITOPS_TOKEN` (token com escrita no nedev-gitops). O namespace também precisa do secret `ghcr` para puxar as imagens, como nos outros projetos.
