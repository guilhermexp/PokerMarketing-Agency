# 03. Referência de APIs

> **Documentação completa de todos os endpoints**
>
> Referência detalhada de todas as APIs REST do sistema de campanhas, incluindo payloads, responses e exemplos.

---

## Endpoint Base

```
Development: http://localhost:3000/api
Production: https://seu-dominio.com/api
```

**Autenticação**: Todos os endpoints requerem autenticação via Clerk.

**Headers padrão**:
```
Content-Type: application/json
Authorization: Bearer <clerk_session_token>
```

---

## Campanhas

### GET `/db/campaigns` - Listar Campanhas

**Query Parameters**:
- `user_id` (required): ID do usuário
- `organization_id` (optional): ID da organização

**Response**: `DbCampaign[]`

```json
[
  {
    "id": "uuid",
    "user_id": "user_123",
    "name": "Campaign Q1 2026",
    "status": "active",
    "created_at": "2026-01-15T10:00:00Z",
    "clips_count": 2,
    "posts_count": 5,
    "ads_count": 3,
    "clip_preview_url": "https://..."
  }
]
```

### GET `/db/campaigns?id=...&include_content=true` - Obter Campanha Completa

**Query Parameters**:
- `id` (required): ID da campanha
- `user_id` (required): ID do usuário
- `include_content` (required): `"true"`
- `organization_id` (optional): ID da organização

**Response**: `DbCampaignFull`

```json
{
  "id": "uuid",
  "name": "Campaign Q1 2026",
  "video_clip_scripts": [...],
  "posts": [...],
  "ad_creatives": [...],
  "carousel_scripts": [...]
}
```

### POST `/db/campaigns` - Criar Campanha

**Body**:
```json
{
  "user_id": "user_123",
  "name": "New Campaign",
  "input_transcript": "Create a campaign about...",
  "generation_options": { ... },
  "video_clip_scripts": [
    {
      "title": "Clip 1",
      "hook": "Opening hook",
      "scenes": [...]
    }
  ],
  "posts": [...],
  "ad_creatives": [...],
  "carousel_scripts": [...]
}
```

**Response**: `DbCampaignFull`

### PUT `/db/campaigns?id=...` - Atualizar Campanha

**Body**: `Partial<DbCampaign>`

```json
{
  "name": "Updated Name",
  "status": "archived"
}
```

### DELETE `/db/campaigns?id=...` - Deletar Campanha

**Response**: `204 No Content`

---

## Geração com IA

### POST `/ai/campaign` - Gerar Campanha com IA

**Body**:
```json
{
  "brandProfile": {
    "name": "My Brand",
    "toneOfVoice": "Profissional",
    ...
  },
  "transcript": "Create marketing content about...",
  "options": {
    "videoClipScripts": { "generate": true, "count": 2 },
    "posts": {
      "instagram": { "generate": true, "count": 3 }
    }
  },
  "productImages": [
    { "base64": "...", "mimeType": "image/png" }
  ]
}
```

**Response**: `MarketingCampaign`

---

## Background Jobs

### POST `/generate/queue` - Adicionar Job à Fila

**Body**:
```json
{
  "userId": "user_123",
  "type": "post",
  "prompt": "Generate image of...",
  "targetId": "post_uuid",
  "brandProfile": { ... }
}
```

**Response**:
```json
{
  "jobId": "job_123",
  "status": "queued"
}
```

### GET `/generate/status?jobId=...` - Status do Job

**Response**:
```json
{
  "jobId": "job_123",
  "status": "completed",
  "result": {
    "imageUrl": "https://..."
  }
}
```

---

## Atualização de Imagens

### PATCH `/db/posts?id=...` - Atualizar Imagem de Post

**Body**:
```json
{
  "image_url": "https://blob.vercel-storage.com/..."
}
```

### PATCH `/db/ad-creatives?id=...` - Atualizar Imagem de Anúncio

**Body**:
```json
{
  "image_url": "https://..."
}
```

### PATCH `/db/campaigns?clip_id=...` - Atualizar Thumbnail de Clip

**Body**:
```json
{
  "thumbnail_url": "https://..."
}
```

### PATCH `/db/campaigns/scene` - Atualizar Imagem de Cena

**Query**: `clip_id=...&scene_number=1`

**Body**:
```json
{
  "image_url": "https://..."
}
```

### PATCH `/db/carousels?id=...` - Atualizar Cover ou Caption

**Body**:
```json
{
  "cover_url": "https://...",
  "caption": "Updated caption"
}
```

### PATCH `/db/carousels/slide` - Atualizar Slide

**Query**: `carousel_id=...&slide_number=1`

**Body**:
```json
{
  "image_url": "https://..."
}
```

---

## Gallery

### GET `/db/gallery` - Listar Imagens

**Query**:
- `user_id`: ID do usuário
- `limit`: Número de imagens (default: 20)
- `offset`: Offset para paginação

**Response**: `GalleryImage[]`

### POST `/db/gallery` - Adicionar Imagem

**Body**: `Omit<GalleryImage, "id">`

### PATCH `/db/gallery?id=...` - Atualizar Imagem

**Body**:
```json
{
  "src": "https://new-url.com/image.png"
}
```

### DELETE `/db/gallery?id=...` - Deletar Imagem

---

## Agendamento

### GET `/db/scheduled-posts` - Listar Posts Agendados

**Query**: `user_id=...`

**Response**: `ScheduledPost[]`

### POST `/db/scheduled-posts` - Agendar Post

**Body**:
```json
{
  "user_id": "user_123",
  "type": "campaign_post",
  "contentId": "post_uuid",
  "imageUrl": "https://...",
  "caption": "Post caption",
  "hashtags": ["#tag1", "#tag2"],
  "scheduledDate": "2026-01-20",
  "scheduledTime": "14:00",
  "platforms": "instagram"
}
```

### DELETE `/db/scheduled-posts?id=...` - Cancelar Post

---

## Códigos de Status

| Código | Descrição |
|--------|-----------|
| 200 | OK - Sucesso |
| 201 | Created - Recurso criado |
| 204 | No Content - Deletado com sucesso |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Sem permissão |
| 404 | Not Found - Não encontrado |
| 500 | Internal Server Error - Erro no servidor |

---

## Exemplos cURL

### Criar Campanha
```bash
curl -X POST https://api.example.com/db/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "user_id": "user_123",
    "name": "New Campaign",
    "input_transcript": "Create content about..."
  }'
```

### Listar Campanhas
```bash
curl https://api.example.com/db/campaigns?user_id=user_123 \
  -H "Authorization: Bearer <token>"
```

---

**Última atualização**: 2026-01-18
