# Functional Baseline — Socialab (DirectorAi)

> Última atualização: 2026-03-18
> Testado por: Claude (opus)
> Status geral: 🟢

---

## 1. Identidade

### Propósito
Socialab (DirectorAi) é um **AI-powered growth toolkit para agências de marketing de poker**. Transforma conteúdo (transcrições, vídeos, posts) em campanhas de marketing completas — video clips, social media posts, ad creatives, tournament flyers e carrosséis.

### Público-alvo
Agências de marketing de poker e clubes de poker que precisam gerar conteúdo de marketing em escala.

### Core Value
Automação de criação de conteúdo visual e textual para marketing de poker usando IA generativa (texto, imagem, vídeo, áudio).

### MVP Features
1. **Campaign Generation** — upload de transcrição → geração automática de clips, posts, ads, carrosséis
2. **Image Studio** — geração e edição de imagens com IA (Gemini + fallback chain)
3. **Video Studio** — geração de vídeos com IA (Veo + FAL.ai)
4. **Tournament Flyers** — upload de planilha de torneios → geração de flyers diários/semanais
5. **Gallery** — biblioteca central de todos os assets gerados
6. **Calendar & Scheduling** — agendamento e publicação automática no Instagram
7. **AI Assistant** — chat com IA para criação de conteúdo (Vercel AI SDK + Claude Agent SDK)
8. **Brand Profile** — configuração de marca (cores, tom, logo) que influencia todas as gerações
9. **Admin Panel** — métricas, gestão de usuários, analytics de uso de IA

### Nice-to-have (Implementados)
- Multi-tenant com organizações (Better Auth organizations plugin)
- Provider chain para imagens (Gemini → Replicate → FAL.ai)
- Instagram multi-conta via Rube MCP
- Text-to-speech com Gemini TTS
- Extração de paleta de cores de imagens
- AI suggestions para erros no admin panel

### Stack
| Camada | Tecnologia |
|--------|-----------|
| Frontend | Vite 7 + React 19 + React Router 7 + TypeScript + Tailwind CSS 4 |
| Backend | Express 5 (Node.js/TypeScript), 57 módulos |
| Auth | Better Auth (self-hosted, cookie-based, organizations) |
| Database | PostgreSQL (Neon Serverless) |
| Storage | Vercel Blob |
| Queue | Redis + BullMQ (scheduled posts) |
| AI Text/Image | Google Gemini (`@google/genai`) |
| AI Chat | Vercel AI SDK (`ai` + `@ai-sdk/google`) |
| AI Agent | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| AI Video | Google Veo + FAL.ai |
| Instagram | Rube MCP (`https://rube.app/mcp`) |

---

## 2. Mapa Funcional

### 2.1 Dashboard / Campaign View (`/campaign`)

**Propósito:** Tela principal para criar e gerenciar campanhas de marketing a partir de transcrições.

**O que o usuário VÊ:**
- Upload form para transcrição/vídeo
- Tabs de campanha (Clips, Posts, Ads, Carousels)
- Preview cards dos assets gerados
- Status de geração
- Seletor de modelo de IA para imagens

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Criar campanha | POST | `/api/ai/campaign` | `{ transcript, options }` |
| Carregar campanha | GET | `/api/db/campaigns?id=X&include_content=true` | query params |
| Deletar campanha | DELETE | `/api/db/campaigns?id=X` | query params |
| Atualizar thumbnail clip | PATCH | `/api/db/campaigns?clip_id=X` | `{ thumbnail_url }` |
| Atualizar imagem de cena | PATCH | `/api/db/campaigns/scene?clip_id=X&scene_number=Y` | `{ image_url }` |
| Atualizar imagem de post | PATCH | `/api/db/posts?id=X` | `{ image_url }` |
| Atualizar imagem de ad | PATCH | `/api/db/ad-creatives?id=X` | `{ image_url }` |
| Gerar imagem IA | POST | `/api/ai/image` | `{ prompt, aspectRatio, size }` |
| Gerar texto IA | POST | `/api/ai/text` | `{ type, context }` |

**Dependências:** Auth (session), Brand Profile (opcional), dados de campanha
**Edge cases:** Campanha sem transcrição, geração falha parcialmente (alguns assets ok, outros não)

---

### 2.2 Campaigns List (`/campaigns`)

**Propósito:** Listar todas as campanhas do usuário com preview cards.

**O que o usuário VÊ:**
- Grid de campanhas com thumbnails
- Contagem de assets por campanha (clips, posts, ads, carousels)
- Botão de criar nova campanha

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar campanhas | GET | `/api/db/campaigns?user_id=X` | query params |
| Selecionar campanha | GET | `/api/db/campaigns?id=X&include_content=true` | query params |
| Deletar campanha | DELETE | `/api/db/campaigns?id=X` | query params |

**Dependências:** Auth (session)
**Edge cases:** Nenhuma campanha criada (empty state)

---

### 2.3 Carousels List (`/carousels`)

**Propósito:** Listar e gerenciar todos os carrosséis gerados.

**O que o usuário VÊ:**
- Lista de carrosséis com cover images
- Preview dos slides
- Nome da campanha associada
- Modal para criar carrossel via prompt IA

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar carrosséis | GET | `/api/db/carousels?user_id=X` | query params |
| Atualizar cover | PUT | `/api/db/carousels?carousel_id=X` | `{ cover_url }` |
| Atualizar slide image | PATCH | `/api/db/carousels?slide_id=X` | `{ image_url }` |
| Atualizar caption | PUT | `/api/db/carousels?carousel_id=X` | `{ caption }` |
| Gerar texto IA | POST | `/api/ai/text` | `{ type: "carousel_caption" }` |

**Dependências:** Auth (session), campanhas existentes
**Edge cases:** Carrossel sem slides, migration 007 não aplicada (coluna `carousel_image_urls`)

---

### 2.4 Tournament Flyers (`/flyer`)

**Propósito:** Gerenciar calendários de torneios e gerar flyers diários/semanais.

**O que o usuário VÊ:**
- Lista de schedules semanais
- Calendário semanal de torneios
- Placeholders para flyers diários
- Detalhes de eventos (jogos, buy-ins, payouts)
- Interface de geração de flyers

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar schedules | GET | `/api/db/tournaments/list?user_id=X` | query params |
| Criar schedule | POST | `/api/db/tournaments` | `{ events, schedule_data }` |
| Deletar schedule | DELETE | `/api/db/tournaments?id=X` | query params |
| Buscar eventos | GET | `/api/db/tournaments?schedule_id=X` | query params |
| Gerar flyer IA | POST | `/api/ai/flyer` | `{ event_data, brand_profile }` |
| Add event flyer | PUT | `/api/db/tournaments` (event_id) | `{ flyer_urls }` |
| Add daily flyer | PUT | `/api/db/tournaments` (schedule_id) | `{ daily_flyer_urls }` |
| Buscar daily flyers | GET | `/api/db/gallery/daily-flyers?week_schedule_id=X` | query params |

**Dependências:** Auth (session), Brand Profile (para geração), upload de planilha XLSX/CSV
**Edge cases:** Planilha com formato inesperado, evento sem horário

---

### 2.5 Calendar / Scheduling (`/calendar`)

**Propósito:** Agendar posts e publicar automaticamente no Instagram.

**O que o usuário VÊ:**
- Calendário mensal com posts agendados
- Preview dos posts por dia
- Status de publicação (scheduled, publishing, published, failed)
- Interface de agendamento

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar posts agendados | GET | `/api/db/scheduled-posts?user_id=X` | query params |
| Agendar post | POST | `/api/db/scheduled-posts` | `{ image_url, caption, scheduled_at }` |
| Editar post agendado | PUT | `/api/db/scheduled-posts?id=X` | `{ caption, scheduled_at }` |
| Deletar post agendado | DELETE | `/api/db/scheduled-posts?id=X` | query params |
| Retry post falho | POST | `/api/db/scheduled-posts/retry` | `{ id, user_id }` |

**Dependências:** Auth (session), conta Instagram conectada (via Rube), Redis (para queue)
**Edge cases:** Redis indisponível (fallback para polling), horário fora do range de publicação (7h-23:59 BRT), conta Instagram desconectada

---

### 2.6 Gallery (`/gallery`)

**Propósito:** Biblioteca central de todas as imagens geradas.

**O que o usuário VÊ:**
- Grid de imagens com metadata (prompt, modelo, fonte)
- Filtros por fonte/tipo
- Botões de ação rápida (post, schedule, style reference)
- Detalhes de aspecto ratio e tamanho

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar imagens | GET | `/api/db/gallery?user_id=X` | query params |
| Adicionar à galeria | POST | `/api/db/gallery` | `{ src_url, prompt, metadata }` |
| Atualizar metadata | PATCH | `/api/db/gallery?id=X` | `{ src_url, style_reference_name }` |
| Deletar imagem | DELETE | `/api/db/gallery?id=X` | query params |
| Marcar como publicada | PATCH | `/api/db/gallery?id=X` | `{ published: true }` |
| Definir como style reference | PATCH | `/api/db/gallery?id=X` | `{ style_reference_name }` |

**Dependências:** Auth (session)
**Edge cases:** Imagem com data URL em vez de HTTPS URL (migração antiga)

---

### 2.7 Image Studio (`/image-playground`)

**Propósito:** Geração avançada de imagens com IA — tópicos, batches, referências, estilos.

**O que o usuário VÊ:**
- Interface de geração de imagens
- Editor de prompts
- Upload de imagem de referência (estilo, produto, pessoa)
- Seletores de aspecto ratio e tamanho (1K/2K/4K)
- Histórico de gerações por tópico
- Preview com thumbnail
- Modos: Instagram, AI Influencer, Product Hero, Exploded Product, Brand Identity

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar tópicos | GET | `/api/image-playground/topics` | - |
| Criar tópico | POST | `/api/image-playground/topics` | `{ name }` |
| Atualizar tópico | PUT | `/api/image-playground/topics/:id` | `{ name }` |
| Deletar tópico | DELETE | `/api/image-playground/topics/:id` | - |
| Listar batches | GET | `/api/image-playground/topics/:id/batches` | - |
| Gerar imagem | POST | `/api/image-playground/generate` | `{ prompt, aspectRatio, size, references }` |
| Status da geração | GET | `/api/image-playground/status/:id` | - |
| Retry geração | POST | `/api/image-playground/generation/:id/retry` | - |
| Deletar geração | DELETE | `/api/image-playground/generation/:id` | - |
| Deletar batch | DELETE | `/api/image-playground/batch/:id` | - |
| Gerar título IA | POST | `/api/image-playground/generate-title` | `{ prompt }` |

**Dependências:** Auth (session), Brand Profile (opcional), Gemini API key
**Edge cases:** Geração com referência de 25MB+ (limite), safety block do Gemini, timeout em 4K

---

### 2.8 Video Studio (`/playground`)

**Propósito:** Geração de vídeos com IA — cenas, composições, preview.

**O que o usuário VÊ:**
- Interface de geração de vídeo
- Editor de cenas
- Preview de vídeo
- Seletor de modelo e aspecto ratio
- Opções de resolução (720p/1080p)

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar tópicos | GET | `/api/video-playground/topics` | - |
| Criar tópico | POST | `/api/video-playground/topics` | `{ name }` |
| Atualizar tópico | PUT | `/api/video-playground/topics/:id` | `{ name }` |
| Deletar tópico | DELETE | `/api/video-playground/topics/:id` | - |
| Listar sessions | GET | `/api/video-playground/topics/:id/sessions` | - |
| Gerar vídeo | POST | `/api/video-playground/generate` | `{ prompt, aspectRatio, resolution }` |
| Status da geração | GET | `/api/video-playground/generation/:id` | - |
| Atualizar geração | PUT | `/api/video-playground/generation/:id` | `{ status, metadata }` |
| Deletar geração | DELETE | `/api/video-playground/generation/:id` | - |
| Gerar título IA | POST | `/api/video-playground/generate-title` | `{ prompt }` |
| Gerar vídeo direto | POST | `/api/ai/video` | `{ prompt, aspectRatio }` |
| Gerar imagem de cena | POST | `/api/ai/image` | `{ prompt }` |

**Dependências:** Auth (session), Gemini/FAL.ai API keys, Brand Profile (opcional)
**Edge cases:** Geração de vídeo demora minutos, quota de Veo

---

### 2.9 AI Assistant (Chat lateral)

**Propósito:** Chat com IA para criação assistida de conteúdo — integrado a todas as views.

**O que o usuário VÊ:**
- Painel lateral de chat
- Mensagens com suporte a markdown
- Referência de imagens do gallery
- Geração inline de imagens/textos
- Content mentions (`@gallery:uuid`, `@campaign:uuid`, etc.)

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Chat streaming | POST | `/api/chat` | `{ messages, model }` |
| Agent stream (Studio) | POST | `/api/agent/studio/stream` | `{ message, threadId }` |
| Agent answer | POST | `/api/agent/studio/answer` | `{ threadId, answer }` |
| Histórico | GET | `/api/agent/studio/history?threadId=X` | query params |
| Reset thread | POST | `/api/agent/studio/reset` | `{ threadId }` |
| Content search | GET | `/api/agent/studio/content-search` | query params |
| Files list | GET | `/api/agent/studio/files` | query params |
| Legacy assistant | POST | `/api/ai/assistant` | `{ messages }` |

**Dependências:** Auth (session), Gemini API key (chat), Anthropic API key (Studio Agent)
**Edge cases:** Timeout de interação (60s), loop guard (8 chamadas iguais em 45s), client disconnect

---

### 2.10 Admin Panel (`/admin`)

**Propósito:** Painel administrativo para super admins — métricas, usuários, analytics.

**Sub-rotas:**

| Rota | Componente | Propósito |
|------|-----------|-----------|
| `/admin` | OverviewPage | Dashboard com métricas do sistema |
| `/admin/users` | UsersPage | Gestão de usuários |
| `/admin/organizations` | OrganizationsPage | Gestão de organizações |
| `/admin/usage` | UsagePage | Analytics de uso de IA |
| `/admin/logs` | LogsPage | Viewer de logs do sistema |

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Stats overview | GET | `/api/admin/stats` | - |
| Listar usuários | GET | `/api/admin/users` | query params (search, pagination) |
| Listar organizações | GET | `/api/admin/organizations` | query params |
| Usage analytics | GET | `/api/admin/usage` | query params (group_by, period) |
| Listar logs | GET | `/api/admin/logs` | query params (action, severity) |
| Detalhe do log | GET | `/api/admin/logs/:id` | - |
| AI suggestions para erro | POST | `/api/admin/logs/:id/ai-suggestions` | - |

**Dependências:** Auth (session), `SUPER_ADMIN_EMAILS` env var
**Edge cases:** Acesso negado se email não está na lista de super admins

---

### 2.11 Brand Profile (Onboarding / Settings)

**Propósito:** Configuração do perfil de marca que influencia todas as gerações de IA.

**O que o usuário VÊ:**
- Form de onboarding (primeira vez)
- Modal de settings
- Campos: nome, logo, cores, tom de voz, público-alvo

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Buscar perfil | GET | `/api/db/brand-profiles?user_id=X` | query params |
| Criar perfil | POST | `/api/db/brand-profiles` | `{ name, colors, tone }` |
| Atualizar perfil | PUT | `/api/db/brand-profiles?id=X` | `{ name, colors, tone }` |

**Dependências:** Auth (session)
**Edge cases:** Sem perfil criado (redireciona para onboarding)

---

### 2.12 Instagram Accounts (Settings)

**Propósito:** Conectar contas do Instagram para publicação automática.

**Ações disponíveis:**

| Ação | Método | Endpoint | Payload |
|------|--------|----------|---------|
| Listar contas | GET | `/api/db/instagram-accounts` | query params |
| Conectar conta | POST | `/api/db/instagram-accounts` | `{ rube_token }` |
| Atualizar token | PUT | `/api/db/instagram-accounts?id=X` | `{ rube_token }` |
| Desconectar conta | DELETE | `/api/db/instagram-accounts?id=X` | query params |

**Dependências:** Auth (session), Rube MCP token
**Edge cases:** Token inválido, conta já conectada

---

### 2.13 Endpoints Utilitários

| Ação | Método | Endpoint | Propósito |
|------|--------|----------|-----------|
| Health check | GET | `/health` | Status do servidor |
| DB health | GET | `/api/db/health` | Conectividade do banco |
| CSRF token | GET | `/api/csrf-token` | Token para requests mutantes |
| Init data | GET | `/api/db/init` | Fetch unificado de dados iniciais |
| Upload file | POST | `/api/upload` | Upload para Vercel Blob |
| Proxy video | POST | `/api/proxy-video` | Proxy de vídeo externo |
| Extract colors | POST | `/api/ai/extract-colors` | Extrai paleta de cores |
| Enhance prompt | POST | `/api/ai/enhance-prompt` | Melhora prompt de imagem |
| Convert prompt | POST | `/api/ai/convert-prompt` | Converte prompt para JSON |
| Speech | POST | `/api/ai/speech` | Text-to-speech |
| Edit image | POST | `/api/ai/edit-image` | Edição de imagem com IA |
| Rube proxy | POST | `/api/rube` | Proxy para Instagram API |
| Feedback | POST | `/api/feedback` | Enviar feedback |

---

## 3. Health Matrix

### Features Core

| # | Feature | Endpoint Principal | Handler | Validação | Error Handling | Status |
|---|---------|-------------------|---------|-----------|---------------|--------|
| 1 | Campaign Generation | `POST /api/ai/campaign` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 2 | Campaign CRUD | `/api/db/campaigns` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 3 | Image Generation | `POST /api/ai/image` | ✅ | ✅ Zod + 25MB | ✅ Retry + Sanitize | 🟢 OK |
| 4 | Image Studio Topics | `/api/image-playground/*` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 5 | Image Studio Generate | `POST /api/image-playground/generate` | ✅ | ✅ Zod + 25MB | ✅ Provider chain | 🟢 OK |
| 6 | Image Edit | `POST /api/ai/edit-image` | ✅ | ✅ Zod + 25MB | ✅ | 🟢 OK |
| 7 | Video Generation | `POST /api/ai/video` | ✅ | ✅ Zod | ✅ Retry + Quota | 🟢 OK |
| 8 | Video Studio Topics | `/api/video-playground/*` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 9 | Video Studio Generate | `POST /api/video-playground/generate` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 10 | Flyer Generation | `POST /api/ai/flyer` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 11 | Tournament CRUD | `/api/db/tournaments` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 12 | Gallery CRUD | `/api/db/gallery` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 13 | Scheduled Posts CRUD | `/api/db/scheduled-posts` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 14 | Scheduled Posts Publisher | BullMQ worker + polling | ✅ | ✅ | ✅ Retry 3x | 🟢 OK |
| 15 | Carousel Posts | `carousel_image_urls` + publisher | ✅ | ✅ | ✅ | 🟢 OK |
| 16 | Brand Profile CRUD | `/api/db/brand-profiles` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 17 | Instagram Accounts | `/api/db/instagram-accounts` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 18 | Rube MCP Proxy | `POST /api/rube` | ✅ | ✅ | ✅ Timeout 15s | 🟢 OK |
| 19 | AI Text Generation | `POST /api/ai/text` | ✅ | ✅ Zod | ✅ Retry | 🟢 OK |
| 20 | AI Chat (Vercel AI SDK) | `POST /api/chat` | ✅ | ✅ Zod | ✅ Streaming | 🟢 OK |
| 21 | Studio Agent (Claude SDK) | `POST /api/agent/studio/stream` | ✅ | ✅ Zod | ✅ Loop guard | 🟢 OK |
| 22 | Upload Files | `POST /api/upload` | ✅ | ✅ Content-type whitelist | ✅ | 🟢 OK |
| 23 | Text-to-Speech | `POST /api/ai/speech` | ✅ | ✅ Zod | ✅ | 🟢 OK |

### Admin & Infra

| # | Feature | Endpoint Principal | Handler | Validação | Error Handling | Status |
|---|---------|-------------------|---------|-----------|---------------|--------|
| 24 | Admin Stats | `GET /api/admin/stats` | ✅ | ✅ SuperAdmin | ✅ | 🟢 OK |
| 25 | Admin Users | `GET /api/admin/users` | ✅ | ✅ Zod + SuperAdmin | ✅ | 🟢 OK |
| 26 | Admin Organizations | `GET /api/admin/organizations` | ✅ | ✅ Zod + SuperAdmin | ✅ | 🟢 OK |
| 27 | Admin Usage | `GET /api/admin/usage` | ✅ | ✅ Zod + SuperAdmin | ✅ | 🟢 OK |
| 28 | Admin Logs | `GET /api/admin/logs` | ✅ | ✅ Zod + SuperAdmin | ✅ | 🟢 OK |
| 29 | CSRF Protection | `/api/csrf-token` | ✅ | ✅ HMAC-SHA256 | ✅ | 🟢 OK |
| 30 | Init Data | `GET /api/db/init` | ✅ | ✅ Zod | ✅ | 🟢 OK |
| 31 | Health Check | `GET /health` | ✅ | N/A | ✅ | 🟢 OK |
| 32 | DB Health | `GET /api/db/health` | ✅ | N/A | ✅ | 🟢 OK |

### Legacy / Deprecated

| # | Feature | Endpoint | Status |
|---|---------|----------|--------|
| 33 | Async Image Queue | `POST /api/ai/image/async` | 🟡 PARCIAL — retorna 503 (queue disabled) |
| 34 | Batch Image Queue | `POST /api/ai/image/async/batch` | 🟡 PARCIAL — retorna 503 (queue disabled) |
| 35 | Legacy AI Assistant | `POST /api/ai/assistant` | 🟡 PARCIAL — funcional mas deprecated em favor de /api/chat |

---

## 4. Issues Funcionais

### P0 — Core Quebrado
**Nenhum issue P0 encontrado.** Todas as features core estão funcionais.

### P1 — Importante (Atenção)

| # | Issue | Área | Impacto | Ação |
|---|-------|------|---------|------|
| P1-1 | `App.tsx` com ~2,571 linhas | Frontend | Manutenibilidade baixa, risco de regressão | Decompor em módulos menores (já iniciado com últimos commits) |
| P1-2 | `ClipCard.tsx` com ~5,500 linhas | Frontend | Mesmo problema, componente gigante | Extrair sub-componentes |
| P1-3 | `apiClient.ts` com ~1,726 linhas | Frontend | Difícil de manter | Já parcialmente resolvido com split em `src/services/api-client/` |
| P1-4 | 66+ usos de TypeScript `any` | Frontend/Backend | Perde type safety | Substituir por tipos corretos gradualmente |
| P1-5 | Rate limiter in-memory | Backend | Perdido no restart, não compartilhado entre instâncias | Migrar para Redis-based rate limiter |
| P1-6 | Provider chain simplificado | Backend | Só Gemini ativo, sem fallback real | FAL/Replicate adapters existem mas não estão na chain |

### P2 — Edge Cases

| # | Issue | Área | Impacto | Ação |
|---|-------|------|---------|------|
| P2-1 | Imagens data URL legadas no banco | Database | Performance de fetch | Scripts de migração existem (`scripts/migrate-all-data-urls-to-blob.mjs`) |
| P2-2 | Redis opcional para scheduled posts | Backend | Sem Redis, usa polling de 5 min (menos preciso) | Documentar requisito de Redis para publicação precisa |
| P2-3 | Publishing hours enforcement | Backend | Posts fora de 7h-23:59 BRT não são publicados pelo polling | Esperado por design, mas pode confundir |
| P2-4 | Gemini safety block | AI | Prompts bloqueados sem feedback claro ao usuário | Mensagem sanitizada existe ("Tente reformular o prompt") |
| P2-5 | 25MB limit em referências de imagem | AI | Upload grande falha silenciosamente | Validação existe, mas UX poderia ser melhor |

### P3 — Cosmético / Debt

| # | Issue | Área | Impacto | Ação |
|---|-------|------|---------|------|
| P3-1 | Async image endpoints retornam 503 | Backend | Endpoints legados confusos na API | Remover ou marcar como deprecated na docs |
| P3-2 | Legacy assistant endpoint | Backend | Dois endpoints de chat (antigo + novo) | Deprecar `/api/ai/assistant` formalmente |
| P3-3 | Feedback endpoint depende de serviço externo | Backend | Notes Capture API pode estar offline | Adicionar fallback ou logging |

---

## 5. Changelog

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-03-18 | Claude (opus) | Criação inicial do Functional Baseline |
