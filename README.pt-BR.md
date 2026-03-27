# Socialab — Toolkit de Marketing com IA para Poker

Socialab é um toolkit de crescimento potencializado por IA para agências de marketing de poker. Transforma conteúdo bruto (transcrições, vídeos, posts) em campanhas de marketing completas: clipes de vídeo, posts para redes sociais, criativos de anúncio e flyers de torneio.

## Índice

- [Quick Start](#quick-start)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Comandos de Desenvolvimento](#comandos-de-desenvolvimento)
- [Stack Tecnológica](#stack-tecnológica)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Funcionalidades Principais](#funcionalidades-principais)
- [Banco de Dados](#banco-de-dados)
- [Segurança](#segurança)
- [Testes](#testes)
- [Deploy em Produção](#deploy-em-produção)
- [Débito Técnico Conhecido](#débito-técnico-conhecido)

---

## Quick Start

```bash
# 1. Clone o repositório
git clone <url-do-repo>
cd poker-marketing-agency

# 2. Instale dependências (recomendado: bun)
bun install

# 3. Configure variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais (veja seção abaixo)

# 4. Execute as migrações do banco
node db/migrate.mjs

# 5. Inicie o servidor de desenvolvimento
bun dev
```

O servidor estará disponível em `http://localhost:5173` (frontend) com a API em `http://localhost:3000`.

## Requisitos

- **Node.js** >= 20
- **Bun** >= 1.0 (recomendado) ou npm
- **PostgreSQL** (Neon Serverless) — conta em [neon.tech](https://neon.tech)
- **Redis** (opcional) — necessário apenas para posts agendados. Use `bun run dev:redis` para iniciar via Docker
- **Contas de API**: Google Gemini (obrigatório), Replicate e FAL (opcionais, para fallback de imagens)

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | String de conexão PostgreSQL (Neon) |
| `GEMINI_API_KEY` | Sim | Chave da API do Google Gemini para geração de texto/imagem |
| `BETTER_AUTH_SECRET` | Sim | Segredo para assinatura de sessão (`openssl rand -hex 32`) |
| `CSRF_SECRET` | Sim | Segredo para proteção CSRF (`openssl rand -hex 32`) |
| `BLOB_READ_WRITE_TOKEN` | Sim | Token do Vercel Blob para armazenamento de imagens |
| `SUPER_ADMIN_EMAILS` | Sim | Emails com acesso ao painel admin (separados por vírgula) |
| `REDIS_URL` | Não | URL do Redis (para posts agendados via BullMQ) |
| `IMAGE_PROVIDERS` | Não | Ordem de fallback para geração de imagem (padrão: `gemini,replicate,fal`) |
| `REPLICATE_API_TOKEN` | Não | Token da API Replicate (fallback de imagens) |
| `FAL_KEY` | Não | Chave da API FAL.ai (fallback de imagens/vídeo) |

## Comandos de Desenvolvimento

### Servidor

```bash
bun dev                  # API + Vite (dev completo)
bun run dev:api          # Apenas servidor API
bun run dev:vite         # Apenas frontend Vite
bun run dev:local        # Stack completa com Redis local (Docker)
bun run dev:stop         # Para containers Docker
```

### Qualidade de Código

```bash
bun run test             # Testes unitários (Vitest)
bun run test:watch       # Testes em modo watch
bun run test:coverage    # Cobertura de testes
bun run test:e2e         # Testes end-to-end (Playwright)
bun run typecheck        # Verificação TypeScript (frontend + server)
bun run lint             # ESLint
bun run lint:fix         # ESLint com auto-fix
```

### Build e Produção

```bash
bun run build            # Build de produção (Vite)
bun run start            # Inicia servidor de produção
```

### Banco de Dados

```bash
node db/migrate.mjs                              # Aplicar migrações
node scripts/migrate-all-data-urls-to-blob.mjs   # Migrar base64 → Vercel Blob
node scripts/check-all-data-urls.mjs             # Diagnosticar URLs base64 restantes
```

## Stack Tecnológica

### Frontend
- **React 19** + **TypeScript 5.9** + **Vite 7**
- **TailwindCSS 4** para estilos
- **Radix UI** para componentes acessíveis
- **Zustand** para estado do cliente (15+ stores)
- **SWR** para estado do servidor com cache-first
- **Framer Motion** para animações
- **FFmpeg.js** para processamento de vídeo no browser
- **Tesseract.js** para OCR

### Backend
- **Express 5** (Node.js) — servidor modular com 24 arquivos de rotas
- **Neon Serverless Postgres** para banco de dados
- **Vercel Blob** para armazenamento de imagens
- **BullMQ** + **Redis** para fila de jobs (posts agendados)
- **Better Auth** para autenticação (cookie-based, com plugin de organizações)
- **Pino** para logging estruturado
- **Zod** para validação de schemas
- **Sharp** para processamento de imagens

### IA
- **Google Gemini** (`@google/genai`) — geração de texto e imagem (provider primário)
- **Vercel AI SDK** (`ai` + `@ai-sdk/google`) — streaming de chat
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — Studio Agent com 30+ ferramentas
- **Replicate** e **FAL.ai** — providers de fallback para imagem e vídeo

## Estrutura do Projeto

```
├── server/                    # Backend Express
│   ├── index.ts              # Orquestrador principal (~308 LOC)
│   ├── routes/               # 24 módulos de rotas
│   │   ├── health.ts         # Health check e CSRF token
│   │   ├── init.ts           # Fetch unificado de dados iniciais
│   │   ├── admin.ts          # Painel administrativo
│   │   ├── db-*.ts           # CRUD do banco (users, campaigns, gallery, etc.)
│   │   ├── ai-*.ts           # Geração de IA (texto, imagem, vídeo, campanha)
│   │   ├── agent-studio.ts   # Studio Agent SSE
│   │   ├── *-playground.ts   # Playgrounds de imagem e vídeo
│   │   └── upload.ts         # Upload e proxy de vídeo
│   ├── lib/                  # Bibliotecas core
│   │   ├── ai/              # Módulos de IA (models, text, image, video, providers)
│   │   ├── agent/claude/    # Studio Agent (runner, tools, MCP bridge, sessions)
│   │   ├── errors/          # Hierarquia de erros (AppError + subclasses)
│   │   ├── validation/      # Validação de content-type
│   │   ├── db.ts            # Cliente Neon Postgres
│   │   ├── auth.ts          # Autenticação e rate limiting
│   │   └── csrf.ts          # Proteção CSRF
│   ├── middleware/           # Middlewares (CSRF, logging, erros, validação)
│   └── helpers/              # Helpers (fila, publisher, usage tracking)
├── src/                       # Frontend React
│   ├── App.tsx               # Componente principal (~2.571 linhas)
│   ├── components/           # 208 componentes organizados por feature
│   │   ├── tabs/            # Tabs de campanha (clips, posts, ads, carousels, flyers)
│   │   ├── gallery/         # Galeria de imagens
│   │   ├── calendar/        # Calendário de posts
│   │   ├── studio-agent/    # Interface do Studio Agent
│   │   ├── playground/      # Playgrounds de geração
│   │   ├── admin/           # Dashboard admin
│   │   └── ui/              # Componentes base (Radix UI wrappers)
│   ├── hooks/                # ~30 hooks React
│   ├── stores/               # 15+ stores Zustand
│   ├── services/             # Clientes de API e serviços
│   └── types/                # Definições TypeScript
├── db/                        # Schema e migrações
│   ├── schema.sql            # Schema completo
│   └── migrations/           # Migrações SQL
├── docs/                      # Documentação (40+ arquivos)
└── scripts/                   # Scripts utilitários
```

## Funcionalidades Principais

### Campanhas de Marketing
Geração completa de campanhas a partir de conteúdo de entrada, incluindo: posts para redes sociais (Instagram, LinkedIn, Twitter, Facebook), criativos de anúncio (Facebook Ads, Google Ads), clipes de vídeo com roteiro de cenas e narração, e carousels multi-slide.

### Galeria de Imagens
Biblioteca centralizada de imagens geradas por IA com metadados (modelo usado, aspect ratio, estilo de referência, fonte). Suporta favoritos, busca e organização.

### Studio Agent
Assistente criativo com IA (Claude Agent SDK) para Image Studio e Video Studio. Oferece 30+ ferramentas via MCP para gerar/editar imagens, vídeos, flyers, acessar galeria, perfil da marca e campanhas. Suporta menções inline (`@gallery:uuid`, `@campaign:uuid`, etc.).

### Playgrounds
Interfaces dedicadas para experimentação com geração de imagens e vídeos, com sistema de tópicos, batches e histórico de gerações.

### Flyers de Torneio
Geração automatizada de flyers diários para torneios de poker, com sistema de schedules semanais e eventos por dia.

### Posts Agendados
Calendário com agendamento de posts para publicação automática no Instagram via integração com o Rube. Suporta retry de falhas e controle de status.

### Painel Admin
Dashboard em `/admin` (protegido por `SUPER_ADMIN_EMAILS`) com estatísticas de uso, analytics de IA, gestão de usuários e organizações, e visualização de logs.

## Banco de Dados

Utiliza **Neon Serverless Postgres**. O schema inclui as seguintes tabelas principais:

- `users` — Contas de usuário
- `brand_profiles` — Configurações de marca (cores, tom de voz, logo, organização)
- `campaigns` — Campanhas de marketing com opções de geração
- `video_clip_scripts` — Roteiros de vídeo com cenas e narração
- `posts` — Posts para redes sociais
- `ad_creatives` — Criativos de anúncio com métricas
- `gallery_images` — Imagens geradas com metadados completos
- `scheduled_posts` — Posts agendados com status de publicação
- `tournament_events` — Eventos de torneio de poker
- `week_schedules` — Schedules semanais com flyers diários
- `generation_jobs` — Jobs de geração assíncrona
- `ai_usage_logs` — Tracking de uso de IA (provider, modelo, tokens, custo)

Para detalhes completos do schema, veja `db/schema.sql`.

## Segurança

### Proteção CSRF
Implementa o padrão **Double Submit Cookie** com HMAC-SHA256. Tokens são enviados em cookie httpOnly (`csrf-token`) e header (`X-CSRF-Token`). Validação com comparação timing-safe. Tokens expiram em 24h.

### Autenticação
**Better Auth** com sessões baseadas em cookies. Suporta organizações e controle de acesso por recurso. O frontend envia credenciais automaticamente com `credentials: "include"`.

### Rate Limiting
Limites por usuário: 30 req/min para endpoints de IA, 5 req/min para vídeo. Usa Upstash Redis com fallback para in-memory.

### Upload Seguro
Validação de MIME type em whitelist: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `image/gif`, `video/mp4`, `video/webm`. Bloqueia HTML, SVG, JavaScript e executáveis.

### Outras Medidas
- Body limit: 10MB para requests JSON
- Helmet para headers de segurança
- CSP com nonce injection
- Cookies com `sameSite=strict` e `secure` em produção

## Testes

```bash
bun run test              # Unitários com Vitest
bun run test:e2e          # E2E com Playwright
bun run test:coverage     # Cobertura
```

Os testes ficam em `__tests__/` dentro de cada módulo. Testes E2E estão na pasta `e2e/`.

## Deploy em Produção

```bash
# 1. Build
bun run build

# 2. Configure as variáveis de ambiente de produção
#    (DATABASE_URL, GEMINI_API_KEY, BETTER_AUTH_SECRET, CSRF_SECRET, etc.)

# 3. Execute migrações
node db/migrate.mjs

# 4. Inicie
bun run start
```

Certifique-se de que `NODE_ENV=production` está definido para habilitar cookies seguros e otimizações.

## Débito Técnico Conhecido

- `src/App.tsx` com ~2.571 linhas — precisa de decomposição em componentes menores
- `src/components/tabs/clips/ClipCard.tsx` com ~5.500 linhas — componente monolítico
- `src/services/apiClient.ts` com ~1.726 linhas — deve ser dividido por domínio
- Rate limiter in-memory (não persiste entre restarts, não compartilha entre instâncias)
- 66+ usos de `any` no TypeScript
- Veja `docs/ARCHITECTURE-REVIEW-2026-02-11.md` para a revisão completa
