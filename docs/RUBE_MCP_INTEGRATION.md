# Rube MCP - Integracaoo Instagram

Documentacao completa da integracao com o Rube MCP para publicacao no Instagram.

## Visao Geral

O **Rube MCP** (Model Context Protocol) e o servico intermediario que conecta o Socialab ao Instagram Graph API. Em vez de chamar a API do Instagram diretamente, todas as operacoes passam pelo Rube (`https://rube.app/mcp`), que gerencia autenticacao, sessoes e execucao de ferramentas.

```
Frontend (React) → POST /api/rube (Express Proxy) → https://rube.app/mcp → Instagram Graph API
```

### Por que usar o Rube?

- O Instagram Graph API exige tokens OAuth de longa duracao e fluxos complexos de autorizacao
- O Rube abstrai isso em um unico token (API key do Rube) por conta conectada
- Suporta multi-tenant: cada usuario tem seu proprio token armazenado no banco
- Protocolo JSON-RPC 2.0 padronizado

---

## Arquitetura

### Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│                                                             │
│  QuickPostModal ──→ rubeService.ts ──→ POST /api/rube      │
│  SchedulePostModal ──→ apiClient.ts ──→ POST /api/db/...   │
│  ConnectInstagramModal ──→ POST /api/db/instagram-accounts  │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     BACKEND (Express)                       │
│                                                             │
│  POST /api/rube (Proxy)                                     │
│    1. Autentica via Clerk (JWT)                             │
│    2. Valida CSRF token                                     │
│    3. Busca rube_token no banco (instagram_accounts)        │
│    4. Injeta ig_user_id nos argumentos                      │
│    5. Forward para https://rube.app/mcp                     │
│    6. Retorna resposta SSE ao frontend                      │
│                                                             │
│  Scheduled Publisher (BullMQ)                               │
│    - Roda a cada minuto                                     │
│    - Busca posts com scheduled_timestamp <= agora           │
│    - Publica via mesma logica do Rube                       │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     RUBE MCP SERVICE                        │
│              https://rube.app/mcp                           │
│                                                             │
│  - Recebe JSON-RPC 2.0 com Bearer token                    │
│  - Executa ferramentas do Instagram Graph API               │
│  - Retorna resposta em formato SSE                          │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   INSTAGRAM GRAPH API                       │
│                                                             │
│  - Cria containers de midia                                 │
│  - Publica posts, stories, reels, carousels                 │
│  - Retorna media_id e status                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Banco de Dados

#### Tabela `instagram_accounts`

Armazena tokens Rube por usuario/organizacao:

```sql
CREATE TABLE instagram_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id VARCHAR(50),       -- Clerk org ID (para contas compartilhadas)
    connected_by_user_id UUID,         -- Quem conectou (audit trail)

    instagram_user_id VARCHAR(255) NOT NULL,
    instagram_username VARCHAR(255),
    rube_token TEXT NOT NULL,          -- Token Rube armazenado no banco

    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,

    UNIQUE(user_id, instagram_user_id)
);
```

**Modos de propriedade:**
- **Pessoal**: `user_id` preenchido, `organization_id` nulo
- **Organizacional**: `organization_id` preenchido, acessivel por todos os membros

#### Tabela `scheduled_posts` (colunas Instagram)

```sql
instagram_content_type  -- 'photo' | 'reel' | 'story' | 'carousel'
instagram_media_id      -- ID da midia publicada
instagram_container_id  -- ID do container durante processamento
instagram_account_id    -- FK para instagram_accounts
publish_attempts        -- Numero de tentativas (max 3)
last_publish_attempt    -- Timestamp da ultima tentativa
```

---

## Ferramentas Rube MCP

Todas as chamadas usam o wrapper `RUBE_MULTI_EXECUTE_TOOL` que permite executar ferramentas do Instagram dentro de uma sessao Rube.

| Ferramenta | Proposito | Parametros Principais |
|---|---|---|
| `INSTAGRAM_GET_USER_INFO` | Validar token e obter dados do usuario | `fields: 'id,username'` |
| `INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT` | Verificar quota (25 posts/dia) | `fields: 'quota_usage,config'` |
| `INSTAGRAM_CREATE_MEDIA_CONTAINER` | Criar container para foto/video/reel/story | `ig_user_id, image_url, video_url, caption, media_type` |
| `INSTAGRAM_CREATE_CAROUSEL_CONTAINER` | Criar container de carousel | `ig_user_id, child_image_urls[], child_video_urls[], caption` |
| `INSTAGRAM_GET_POST_STATUS` | Verificar status de processamento | `creation_id` |
| `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` | Publicar foto/video/reel/story | `ig_user_id, creation_id` |
| `INSTAGRAM_CREATE_POST` | Publicar carousel | `ig_user_id, creation_id` |

### Formato da Requisicao (JSON-RPC 2.0)

```json
{
  "jsonrpc": "2.0",
  "id": "rube_1707500000_abc123",
  "method": "tools/call",
  "params": {
    "name": "RUBE_MULTI_EXECUTE_TOOL",
    "arguments": {
      "tools": [{
        "tool_slug": "INSTAGRAM_CREATE_MEDIA_CONTAINER",
        "arguments": {
          "ig_user_id": "17841400000000",
          "image_url": "https://blob.vercel-storage.com/image.jpg",
          "caption": "Texto do post",
          "media_type": "STORIES"
        }
      }],
      "sync_response_to_workbench": false,
      "memory": {},
      "session_id": "zulu",
      "thought": "Publishing story"
    }
  }
}
```

### Formato da Resposta (SSE)

```
data: {
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"data\":{\"data\":{\"results\":[{\"response\":{\"data\":{\"id\":\"17900000000\"}}}]}}}"
    }]
  }
}
```

A resposta e deeply nested: `result.data.data.results[0].response.data`

---

## Fluxos de Publicacao

### 1. Publicacao Imediata (QuickPost)

**Componente**: `QuickPostModal.tsx`
**Servico**: `rubeService.ts → publishToInstagram()`

```
Usuario clica "Publicar"
    │
    ▼
[5%]  checkPublishingQuota()
    │   → INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT
    │   → Verifica se restam posts (25/dia)
    │
    ▼
[15%] uploadImageForInstagram()
    │   → Se data URL: upload para Vercel Blob
    │   → Se HTTP URL: usa direto
    │
    ▼
[30%] createMediaContainer()
    │   → INSTAGRAM_CREATE_MEDIA_CONTAINER
    │   → Retorna container_id
    │
    ▼
[45-70%] getContainerStatus() [polling 1s, max 60s]
    │   → INSTAGRAM_GET_POST_STATUS
    │   → Aguarda status = 'FINISHED'
    │
    ▼
[80%] publishContainer() ou publishCarousel()
    │   → INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH
    │   → Retorna media_id
    │
    ▼
[100%] Sucesso! markGalleryImagePublished()
```

**Tipos de conteudo suportados:**
- **Feed (photo)**: Imagem 1:1 com legenda e hashtags
- **Stories**: Imagem 9:16 sem legenda
- **Reels**: Video com legenda
- **Carousel**: 2+ imagens/videos com legenda

### 2. Publicacao Agendada

**Componente**: `SchedulePostModal.tsx`
**Backend**: `server/helpers/scheduled-publisher.mjs`

```
Usuario agenda post (data + hora)
    │
    ▼
Salva em scheduled_posts (status: 'scheduled')
    │
    ▼
BullMQ job roda a cada minuto
    │
    ▼
checkAndPublishScheduledPosts()
    │   → Busca posts com scheduled_timestamp <= agora
    │   → Limite: 5 posts por execucao
    │   → Horario: 7:00 - 23:59 (America/Sao_Paulo)
    │
    ▼
Para cada post:
    │
    ├── getInstagramCredentials(instagram_account_id)
    │   → Busca rube_token e instagram_user_id do banco
    │
    ├── ensureHttpUrl(image_url)
    │   → Converte data URL para HTTP se necessario
    │
    ├── createMediaContainer() / createCarouselContainer()
    │
    ├── getContainerStatus() [polling]
    │
    ├── publishContainer() / publishCarousel()
    │
    └── Atualiza scheduled_posts:
        → Sucesso: status='published', instagram_media_id=...
        → Falha: publish_attempts++, retry ate 3x
        → Falha final: status='failed'
```

### 3. Conexao de Conta

**Componente**: `ConnectInstagramModal.tsx`

```
1. Usuario abre modal de configuracoes
2. Clica "Conectar Instagram"
3. Modal abre link para https://rube.app/settings/api-keys
4. Usuario gera token no Rube
5. Cola token no campo do modal
6. Frontend envia POST /api/db/instagram-accounts
7. Backend:
   a. Valida token chamando INSTAGRAM_GET_USER_INFO via Rube
   b. Extrai instagram_user_id e username
   c. Salva na tabela instagram_accounts
8. Modal mostra sucesso com @username
```

---

## Multi-Tenant

### InstagramContext

Todas as operacoes de publicacao exigem um contexto multi-tenant:

```typescript
interface InstagramContext {
  instagramAccountId: string;  // UUID da tabela instagram_accounts
  userId: string;              // Clerk user ID (user_xxx)
  organizationId?: string;     // Clerk org ID (opcional)
}
```

### Resolucao de Token no Proxy

O endpoint `POST /api/rube` resolve o token em 5 etapas:

1. **Extrai contexto** do body: `instagram_account_id`, `user_id`, `organization_id`
2. **Resolve Clerk ID** para UUID do banco (`users.auth_provider_id`)
3. **Busca conta** na tabela `instagram_accounts`:
   - Pessoal: `WHERE id = ? AND user_id = ? AND is_active = TRUE`
   - Organizacional: `WHERE id = ? AND (organization_id = ? OR user_id = ?) AND is_active = TRUE`
4. **Injeta `ig_user_id`** nos argumentos de cada ferramenta
5. **Forward** para `https://rube.app/mcp` com `Authorization: Bearer {rube_token}`

O token **nunca** chega ao frontend - ele e resolvido pelo proxy e enviado diretamente ao Rube.

---

## Seguranca

### Protecao de Token
- Tokens armazenados no PostgreSQL (tabela `instagram_accounts`)
- Nunca expostos em logs (valores redacted)
- Frontend so envia `instagram_account_id` (UUID), nunca o token
- Proxy resolve token no servidor e faz forward

### Middleware Chain
```
POST /api/rube
  → clerkMiddleware()           // Valida sessao Clerk (JWT)
  → requireAuthenticatedRequest // Exige userId valido
  → enforceAuthenticatedIdentity // Verifica user_id no body = userId do JWT
  → csrfProtection              // Valida X-CSRF-Token header
  → handler                     // Busca token e faz proxy
```

### CSRF
- `rubeService.ts` inclui `X-CSRF-Token` no header (via `apiClient.getCsrfToken()`)
- Backend valida via Double Submit Cookie pattern
- Token expira em 24 horas

### Rate Limiting
- Instagram: 25 publicacoes por 24 horas (enforced pelo Rube/Instagram API)
- Scheduled publisher: max 5 posts por execucao com delay de 2s entre posts
- HTTP 429 retornado quando quota excedida

### Timeout
- **Cliente**: 15 segundos (AbortController no `callRubeMCP`)
- **Servidor**: 15 segundos (`AbortSignal.timeout` no fetch para `rube.app`)
- Evita que a UI trave quando o Rube esta fora do ar

---

## Tratamento de Erros

### Erros do Frontend (rubeService.ts)

| HTTP | Mensagem | Causa |
|------|----------|-------|
| 400 | "Conecte sua conta Instagram em Configuracoes" | Conta nao encontrada |
| 401 | "Token expirado. Reconecte sua conta" | Token Rube invalido |
| 403 | "Conta nao encontrada ou sem permissao" | Acesso negado / CSRF invalido |
| 429 | "Limite de publicacoes atingido (25/dia)" | Quota Instagram excedida |
| 504 | "Servico Rube nao respondeu (timeout)" | Rube MCP fora do ar |

### Erros do Backend (server/index.mjs)

| Codigo | Resposta | Causa |
|--------|----------|-------|
| 400 | `User not found` | Clerk ID nao encontrado no banco |
| 403 | `Instagram account not found or inactive` | Conta desativada ou de outro usuario |
| 500 | `RUBE_TOKEN not configured` | Token global ausente (dev mode) |
| 504 | `Rube MCP timeout` | Servico nao respondeu em 15s |

### Retry (Agendados)
- Maximo 3 tentativas
- `publish_attempts` incrementado a cada falha
- `last_publish_attempt` atualizado
- Apos 3 falhas: `status = 'failed'`

---

## Tipos TypeScript

```typescript
// Tipos de conteudo do Instagram
type InstagramContentType = 'photo' | 'video' | 'reel' | 'story' | 'carousel';

// Estados do fluxo de publicacao
type InstagramPublishStep =
  | 'idle'
  | 'uploading_image'
  | 'creating_container'
  | 'checking_status'
  | 'publishing'
  | 'completed'
  | 'failed';

// Estado de progresso (usado na UI)
interface InstagramPublishState {
  step: InstagramPublishStep;
  message: string;
  progress: number;  // 0-100
  postId?: string;
}

// Resultado da publicacao
interface InstagramPublishResult {
  success: boolean;
  mediaId?: string;
  errorMessage?: string;
}

// Quota de publicacao
interface PublishingQuota {
  used: number;
  limit: number;      // Padrao: 25
  remaining: number;
}

// Conta Instagram conectada
interface InstagramAccount {
  id: string;
  user_id: string;
  organization_id: string | null;
  instagram_user_id: string;
  instagram_username: string;
  is_active: boolean;
  connected_at: string;
  last_used_at: string | null;
}
```

---

## Arquivos Relevantes

### Frontend
| Arquivo | Descricao |
|---------|-----------|
| `src/services/rubeService.ts` | Servico principal - todas as chamadas ao Rube |
| `src/components/common/QuickPostModal.tsx` | Modal de publicacao imediata |
| `src/components/calendar/SchedulePostModal.tsx` | Modal de agendamento |
| `src/components/settings/ConnectInstagramModal.tsx` | Modal de conexao de conta |
| `src/services/blobService.ts` | Upload de imagens para Vercel Blob |
| `src/types.ts` | Tipos TypeScript (InstagramAccount, etc.) |

### Backend
| Arquivo | Descricao |
|---------|-----------|
| `server/index.mjs` (linhas 7346-7769) | Endpoints Instagram + proxy Rube |
| `server/helpers/scheduled-publisher.mjs` | Publicador de posts agendados |
| `db/schema.sql` | Schema da tabela instagram_accounts |
| `db/migrations/004_instagram_accounts.sql` | Migracao inicial |
| `db/migrations/009_instagram_org_sharing.sql` | Compartilhamento por organizacao |

---

## Troubleshooting

### Publicacao trava (progresso parado)
- **Causa provavel**: Rube MCP fora do ar ou com limite
- **Fix**: Timeout de 15s implementado - agora mostra erro em vez de travar
- **Verificar**: Abrir `https://rube.app` para confirmar status do servico

### Erro 403 ao publicar
- **Causa 1**: CSRF token ausente ou expirado
- **Causa 2**: Conta Instagram desativada ou de outro usuario
- **Fix**: Verificar se `X-CSRF-Token` esta no header; reconectar conta

### Imagens 404 no Vercel Blob
- **Causa**: Imagens deletadas/expiradas no Vercel Blob
- **Impacto**: Instagram rejeita URLs 404 ao criar container
- **Fix**: Regenerar imagens antes de publicar

### Quota excedida (429)
- **Limite**: 25 publicacoes por periodo de 24 horas (Instagram)
- **Verificar**: `checkPublishingQuota()` retorna uso atual
- **Solucao**: Aguardar reset da janela de 24h
