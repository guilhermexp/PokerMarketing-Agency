# Referência da API — Socialab

Documentação completa de todos os endpoints da API REST do Socialab.

## Índice

- [Visão Geral](#visão-geral)
- [Autenticação](#autenticação)
- [Proteção CSRF](#proteção-csrf)
- [Formato de Resposta](#formato-de-resposta)
- [Rate Limiting](#rate-limiting)
- [Health & Sistema](#health--sistema)
- [Inicialização](#inicialização)
- [Usuários](#usuários)
- [Perfil de Marca](#perfil-de-marca)
- [Campanhas](#campanhas)
- [Posts](#posts)
- [Galeria](#galeria)
- [Posts Agendados](#posts-agendados)
- [Torneios](#torneios)
- [Contas Instagram](#contas-instagram)
- [IA — Texto](#ia--texto)
- [IA — Imagem](#ia--imagem)
- [IA — Vídeo](#ia--vídeo)
- [IA — Fala](#ia--fala)
- [IA — Campanha](#ia--campanha)
- [IA — Assistente](#ia--assistente)
- [Jobs de Geração](#jobs-de-geração)
- [Image Playground](#image-playground)
- [Video Playground](#video-playground)
- [Studio Agent](#studio-agent)
- [Upload](#upload)
- [Admin](#admin)
- [Rube (Instagram Publishing)](#rube-instagram-publishing)

---

## Visão Geral

A API é servida pelo Express 5 e segue estas convenções:

- **Base URL**: `/api`
- **Content-Type**: `application/json` (exceto uploads multipart)
- **Body limit**: 10MB para JSON
- **Autenticação**: Cookies de sessão (Better Auth)
- **CSRF**: Double Submit Cookie obrigatório para métodos mutantes (POST, PUT, DELETE, PATCH)

## Autenticação

A autenticação usa **Better Auth** com cookies de sessão. O frontend envia credenciais automaticamente com `credentials: "include"`.

Endpoints protegidos retornam `401 Unauthorized` quando a sessão é inválida ou ausente. Todos os prefixos `/api/db/*`, `/api/ai/*`, `/api/chat/*`, `/api/generate/*`, `/api/upload/*`, `/api/agent/*` e `/api/admin/*` exigem autenticação.

## Proteção CSRF

Todos os métodos mutantes (POST, PUT, DELETE, PATCH) exigem token CSRF:

1. Obtenha o token via `GET /api/csrf-token`
2. Inclua no header `X-CSRF-Token` de cada request mutante
3. O cookie `csrf-token` é enviado automaticamente

O `apiClient.ts` do frontend gerencia isso automaticamente. Tokens expiram em 24h e são renovados ao receber um 403.

## Formato de Resposta

Todas as respostas seguem o envelope padrão:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-03-24T12:00:00Z" }
}
```

Erros retornam:

```json
{
  "success": false,
  "error": {
    "message": "Descrição do erro",
    "code": "VALIDATION_ERROR"
  }
}
```

## Rate Limiting

| Categoria | Limite |
|---|---|
| Endpoints de IA (`/api/ai/*`) | 30 req/min por usuário |
| Geração de vídeo | 5 req/min por usuário |

Respostas com rate limit retornam `429 Too Many Requests`.

---

## Health & Sistema

### `GET /health`
Health check básico. Não requer autenticação.

**Resposta**: `200 OK`

### `GET /api/db/health`
Health check do banco de dados.

**Resposta**: `200 OK` com status da conexão.

### `GET /api/csrf-token`
Gera token CSRF para requests subsequentes.

**Resposta**: Token no cookie `csrf-token` e no body.

### `GET /api/db/stats`
Estatísticas de cache. Requer super admin.

### `POST /api/db/stats/reset`
Reseta estatísticas de cache. Requer super admin.

---

## Inicialização

### `GET /api/db/init`
Fetch unificado de todos os dados iniciais do usuário em uma única request, minimizando latência no carregamento.

**Query params**:
- `user_id` — ID do usuário
- `organization_id` — ID da organização

**Resposta**: Objeto contendo brand profile, galeria, posts agendados, campanhas, torneios e schedules.

---

## Usuários

### `GET /api/db/users`
Busca usuário por email ou ID.

**Query params**: `email` ou `id`

### `POST /api/db/users`
Cria ou atualiza (upsert) um usuário.

**Body**:
```json
{
  "email": "usuario@exemplo.com",
  "name": "Nome",
  "avatar": "https://..."
}
```

---

## Perfil de Marca

### `GET /api/db/brand-profiles`
Retorna o perfil de marca do usuário/organização.

### `POST /api/db/brand-profiles`
Cria um novo perfil de marca.

**Body**:
```json
{
  "name": "Nome da Marca",
  "primary_color": "#FF0000",
  "secondary_color": "#0000FF",
  "tone_of_voice": "Profissional",
  "logo_url": "https://...",
  "organization_id": "uuid"
}
```

### `PUT /api/db/brand-profiles/:id`
Atualiza o perfil de marca existente.

---

## Campanhas

### `GET /api/db/campaigns`
Lista todas as campanhas do usuário/organização.

### `POST /api/db/campaigns`
Cria uma nova campanha.

**Body**:
```json
{
  "name": "Campanha Torneio Maio",
  "description": "Descrição da campanha",
  "generation_options": { ... }
}
```

### `PATCH /api/db/campaigns/:id`
Atualiza uma campanha existente.

### `PATCH /api/db/campaigns/:id/status`
Atualiza o status de uma campanha.

### `DELETE /api/db/campaigns?id=uuid`
Remove uma campanha.

### `GET /api/db/carousels`
Lista todos os carousels.

### `PATCH /api/db/carousels/:id`
Atualiza um carousel.

---

## Posts

### `PATCH /api/db/posts/:id`
Atualiza um post (metadados, imagem, plataforma).

### `PATCH /api/db/posts/:id/text`
Atualiza apenas o texto de um post.

---

## Galeria

### `GET /api/db/gallery`
Lista imagens da galeria do usuário.

### `GET /api/db/gallery/:id`
Retorna uma imagem específica com metadados.

### `POST /api/db/gallery`
Adiciona uma nova imagem à galeria.

**Body**:
```json
{
  "image_url": "https://...",
  "prompt": "Prompt usado na geração",
  "model": "gemini-3-pro-image-preview",
  "aspect_ratio": "1:1",
  "source": "image-playground"
}
```

### `PATCH /api/db/gallery/:id`
Atualiza metadados de uma imagem (favorito, título, etc.).

### `DELETE /api/db/gallery/:id`
Remove uma imagem da galeria.

---

## Posts Agendados

### `GET /api/db/scheduled-posts`
Lista posts agendados do usuário.

### `POST /api/db/scheduled-posts`
Cria um novo post agendado.

**Body**:
```json
{
  "post_text": "Texto do post",
  "image_url": "https://...",
  "scheduled_date": "2026-04-01",
  "scheduled_time": "14:00",
  "timezone": "America/Sao_Paulo",
  "instagram_account_id": "uuid"
}
```

### `PUT /api/db/scheduled-posts/:id`
Atualiza um post agendado.

### `DELETE /api/db/scheduled-posts?id=uuid`
Remove um post agendado.

### `POST /api/db/scheduled-posts/retry`
Retenta publicação de um post que falhou.

---

## Torneios

### `GET /api/db/tournaments/list`
Lista torneios com lazy loading.

### `GET /api/db/tournaments`
Retorna um torneio com todos os seus eventos.

### `POST /api/db/tournaments`
Cria um novo torneio.

### `PATCH /api/db/tournaments/:id`
Atualiza um torneio.

### `PATCH /api/db/tournaments/:id/events`
Atualiza os eventos de um torneio.

### `DELETE /api/db/tournaments?id=uuid`
Remove um torneio.

---

## Contas Instagram

### `GET /api/db/instagram-accounts`
Lista contas Instagram conectadas.

### `POST /api/db/instagram-accounts`
Conecta uma nova conta Instagram.

### `PUT /api/db/instagram-accounts/:id`
Atualiza dados de uma conta.

### `DELETE /api/db/instagram-accounts`
Desconecta uma conta Instagram.

---

## IA — Texto

### `POST /api/ai/text`
Gera texto para redes sociais.

**Body**:
```json
{
  "platform": "instagram",
  "topic": "Torneio de poker semanal",
  "tone": "Casual",
  "brand_profile_id": "uuid"
}
```

### `POST /api/ai/flyer`
Gera texto otimizado para flyers de torneio.

### `POST /api/ai/enhance-prompt`
Melhora um prompt de geração de imagem com mais detalhes e qualidade.

### `POST /api/ai/convert-prompt`
Converte texto descritivo em prompt otimizado para geração de imagem.

---

## IA — Imagem

### `POST /api/ai/image`
Gera uma imagem de forma síncrona. Usa a cadeia de providers configurada em `IMAGE_PROVIDERS`.

**Body**:
```json
{
  "prompt": "Mesa de poker profissional com fichas douradas",
  "aspect_ratio": "1:1",
  "model": "gemini",
  "style_reference_url": "https://..."
}
```

**Resposta**: URL da imagem gerada (Vercel Blob).

### `POST /api/ai/edit-image`
Edita uma imagem existente usando IA (inpainting, style transfer, etc.).

### `POST /api/ai/extract-colors`
Extrai paleta de cores de uma imagem.

### `POST /api/ai/image/async`
Enfileira geração de imagem assíncrona.

### `POST /api/ai/image/async/batch`
Enfileira batch de gerações de imagem.

### `GET /api/ai/image/async/status/:jobId`
Verifica status de um job de geração assíncrona.

### `GET /api/ai/image/async/jobs`
Lista todos os jobs de geração de imagem.

### `DELETE /api/ai/image/async/cancel/:jobId`
Cancela um job de geração.

---

## IA — Vídeo

### `POST /api/ai/video`
Gera um vídeo usando Veo 3.1 ou FAL Sora.

**Body**:
```json
{
  "prompt": "Animação de fichas de poker caindo",
  "model": "veo-3.1-fast-generate-preview",
  "duration": 5
}
```

---

## IA — Fala

### `POST /api/ai/speech`
Gera narração em áudio a partir de texto para uso em clipes de vídeo.

**Body**:
```json
{
  "text": "Texto para narração",
  "voice": "alloy",
  "speed": 1.0
}
```

**Resposta**: URL do áudio gerado.

---

## IA — Campanha

### `POST /api/ai/campaign`
Gera uma campanha de marketing completa (posts, ads, clips, flyers) a partir de conteúdo de entrada.

**Body**:
```json
{
  "content": "Transcrição ou texto de entrada...",
  "campaign_name": "Torneio Maio 2026",
  "platforms": ["instagram", "facebook"],
  "include_clips": true,
  "include_ads": true,
  "brand_profile_id": "uuid"
}
```

---

## IA — Assistente

### `POST /api/ai/assistant`
Endpoint do assistente de IA para conversação.

---

## Jobs de Geração

### `POST /api/generate/queue`
Enfileira um job de geração (imagem, vídeo, etc.).

### `GET /api/generate/status?jobId=uuid`
Verifica status de um job.

### `POST /api/generate/cancel-all`
Cancela todos os jobs pendentes.

---

## Image Playground

Interface de experimentação para geração de imagens organizada por tópicos e batches.

### Tópicos

- `GET /api/image-playground/topics` — Lista tópicos
- `POST /api/image-playground/topics` — Cria tópico
- `PATCH /api/image-playground/topics/:id` — Atualiza tópico
- `DELETE /api/image-playground/topics/:id` — Remove tópico

### Batches

- `GET /api/image-playground/batches` — Lista batches de geração
- `DELETE /api/image-playground/batches/:id` — Remove batch

### Gerações

- `POST /api/image-playground/generate` — Gera imagens no playground
- `GET /api/image-playground/status/:generationId` — Status da geração
- `DELETE /api/image-playground/generations/:id` — Remove geração
- `PATCH /api/image-playground/generations/:id` — Atualiza geração
- `POST /api/image-playground/generations/:id/retry` — Retenta geração
- `POST /api/image-playground/generate-title` — Gera título com IA

---

## Video Playground

Interface de experimentação para geração de vídeos.

### Tópicos

- `GET /api/video-playground/topics` — Lista tópicos
- `POST /api/video-playground/topics` — Cria tópico
- `PATCH /api/video-playground/topics/:id` — Atualiza tópico
- `DELETE /api/video-playground/topics/:id` — Remove tópico

### Sessões e Gerações

- `GET /api/video-playground/sessions` — Lista sessões
- `POST /api/video-playground/generate` — Gera vídeo
- `DELETE /api/video-playground/sessions/:id` — Remove sessão
- `DELETE /api/video-playground/generations/:id` — Remove geração
- `PATCH /api/video-playground/generations/:id` — Atualiza geração
- `POST /api/video-playground/generate-title` — Gera título com IA

---

## Studio Agent

Assistente criativo com IA baseado no Claude Agent SDK, comunicação via Server-Sent Events (SSE).

### `POST /api/agent/studio/stream`
Inicia ou continua uma conversa com o Studio Agent via SSE.

**Body**:
```json
{
  "message": "Gere uma imagem de banner para o torneio",
  "thread_id": "uuid",
  "mentions": ["@gallery:uuid", "@campaign:uuid"]
}
```

**Resposta**: Stream SSE com eventos do agente (text, tool_use, tool_result, done).

### `POST /api/agent/studio/answer`
Submete uma resposta a uma pergunta do agente.

### `GET /api/agent/studio/history`
Retorna histórico de conversa de uma thread.

### `GET /api/agent/studio/content-search`
Busca conteúdo na galeria e campanhas para menções.

### `GET /api/agent/studio/files`
Lista arquivos disponíveis para o agente.

### `POST /api/agent/studio/reset`
Reseta a conversa do agente.

---

## Upload

### `POST /api/upload`
Upload de arquivo (imagem ou vídeo) para Vercel Blob.

**Content-Type**: `multipart/form-data`

**Tipos permitidos**: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `image/gif`, `video/mp4`, `video/webm`

**Resposta**:
```json
{
  "url": "https://blob.vercel-storage.com/..."
}
```

### `GET /api/proxy-video`
Proxy de streaming de vídeo para contornar restrições de CORS.

---

## Admin

Todos os endpoints admin requerem que o email do usuário esteja em `SUPER_ADMIN_EMAILS`. Acessível via `/admin` no frontend.

### `GET /api/admin/stats`
Dashboard de estatísticas (total de usuários, campanhas, imagens, etc.).

### `GET /api/admin/usage`
Analytics de uso de IA (calls por provider, modelo, custo estimado).

### `GET /api/admin/users`
Lista todos os usuários do sistema.

### `GET /api/admin/organizations`
Lista todas as organizações.

### `GET /api/admin/logs`
Query de logs com filtros.

### `GET /api/admin/logs/:id`
Detalhes de um log específico.

### `POST /api/admin/logs/retry-failed`
Retenta jobs que falharam.

---

## Rube (Instagram Publishing)

Endpoints proxy para publicação no Instagram via serviço Rube. Utilizados internamente pelo sistema de posts agendados.

---

## Códigos de Erro

| Código HTTP | Significado |
|---|---|
| `400` | Bad Request — Validação falhou ou dados inválidos |
| `401` | Unauthorized — Sessão ausente ou inválida |
| `403` | Forbidden — CSRF inválido ou sem permissão |
| `404` | Not Found — Recurso não encontrado |
| `413` | Payload Too Large — Body excede 10MB |
| `429` | Too Many Requests — Rate limit excedido |
| `500` | Internal Server Error — Erro interno do servidor |
