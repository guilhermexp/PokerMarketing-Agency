# Guia de Depuracao do DirectorAi

Este documento fornece orientacoes para depurar a aplicacao DirectorAi, incluindo o backend Express, sistema de filas e integracao com IA.

## 1. Arquitetura de Depuracao

A aplicacao tem tres camadas principais para depuracao:

1. **Frontend (React)** - Componentes, estado, hooks
2. **Backend (Express)** - Endpoints API, middleware
3. **Jobs (BullMQ/Redis)** - Fila de processamento assincrono

## 2. Depurando o Frontend

### React DevTools

Use a extensao React DevTools para inspecionar:
- Arvore de componentes
- Props e state de cada componente
- Context providers (BackgroundJobsProvider, etc.)

### Estados Principais

Os dados agora sao gerenciados via hooks com persistencia em banco:

| Hook | Funcao | Origem dos Dados |
|------|--------|------------------|
| `useInitialData` | Carrega dados iniciais | PostgreSQL via `/api/db/init` |
| `useCampaigns` | CRUD de campanhas | PostgreSQL |
| `useGalleryImages` | CRUD de galeria | PostgreSQL + Vercel Blob |
| `useBackgroundJobs` | Status de jobs | PostgreSQL + polling |

### Console do Navegador

Verifique o console para erros de:
- Chamadas fetch() que falharam
- Erros de parsing JSON
- Erros de componentes React

```javascript
// Exemplo: debugar chamada de API
const response = await fetch('/api/ai/generate-image', {...});
console.log('Response status:', response.status);
const data = await response.json();
console.log('Response data:', data);
```

## 3. Depurando o Backend

### Logs do Railway

```bash
# Ver ultimos 50 logs
railway logs --tail 50

# Logs em tempo real
railway logs -f

# Logs de um servico especifico
railway logs --service redis
```

### Testando Endpoints Localmente

```bash
# Health check
curl http://localhost:8080/api/health

# Gerar imagem (POST)
curl -X POST http://localhost:8080/api/ai/generate-image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "teste", "userId": "user_123"}'

# Status de jobs
curl "http://localhost:8080/api/generate/status?userId=user_123"
```

### Adicionando Logs no Server

```javascript
// Em server/index.mjs
app.post('/api/ai/generate-image', async (req, res) => {
  console.log('=== Generate Image Request ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    const result = await generateImage(prompt, brandProfile);
    console.log('Result:', result.success ? 'OK' : result.error);
    res.json(result);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});
```

## 4. Depurando o Sistema de Filas

### Jobs Travados

1. Verifique o indicador "Jobs em Background" no frontend
2. Use o botao "Cancelar" ou "Cancelar Todos"
3. Verifique logs do Railway

### Verificando Jobs no Banco

```sql
-- Jobs pendentes
SELECT id, job_type, status, context, created_at
FROM generation_jobs
WHERE status IN ('queued', 'processing')
ORDER BY created_at DESC;

-- Jobs falhados
SELECT id, job_type, error_message, created_at
FROM generation_jobs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Testando Fila Manualmente

```bash
# Via curl
curl -X POST http://localhost:8080/api/generate/queue \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "jobType": "flyer",
    "prompt": "Teste de flyer",
    "config": {},
    "context": "test-context"
  }'
```

## 5. Problemas Comuns e Solucoes

### Imagens Nao Persistem

1. **Verifique se esta usando URL do Blob (nao data URL)**
   ```typescript
   // ERRADO
   onAddImageToGallery({ src: dataUrl }); // data:image/png;base64,...

   // CERTO
   const httpUrl = await uploadImageToBlob(base64Data, mimeType);
   onAddImageToGallery({ src: httpUrl }); // https://xxx.blob.vercel-storage.com/...
   ```

2. **Verifique se o video_script_id esta sendo salvo**
   ```typescript
   // Deve passar o ID do clip
   onAddImageToGallery({
     src: httpUrl,
     videoScriptId: clipId
   });
   ```

3. **Verifique a galeria carregando**
   ```javascript
   console.log('Gallery images:', galleryImages);
   ```

### Jobs Completam mas UI Nao Atualiza

1. **Verifique o campo `context` do job**
   - O context deve ser unico por item (ex: `clip-0`, `post-1`)
   - O frontend usa o context para saber qual componente atualizar

2. **Verifique o polling**
   ```javascript
   // Em useBackgroundJobs
   console.log('Polling jobs:', pendingJobs);
   ```

### Erros de API Key

1. **No frontend**: "An API Key must be set"
   - Verifique se `VITE_API_KEY` esta definido no vite.config.ts
   - Rebuild necessario apos mudanca

2. **No backend**: "Invalid API key"
   - Verifique `GEMINI_API_KEY` nas variaveis do Railway
   - Nao use prefixo VITE_ no server

### Erros de Banco de Dados

```bash
# Testar conexao
node -e "
  import('postgres').then(({default: postgres}) => {
    const sql = postgres(process.env.DATABASE_URL);
    sql\`SELECT 1\`.then(console.log).catch(console.error);
  });
"
```

### Jobs com Tipo 'clip' Nao Funcionam

O enum do banco pode nao incluir 'clip'. Execute:

```sql
ALTER TYPE generation_job_type ADD VALUE IF NOT EXISTS 'clip';
```

Ou deixe a auto-migracao do server rodar no startup.

## 6. Variaveis de Ambiente

### Verificando no Railway

```bash
railway variables list
```

### Variaveis Obrigatorias

| Variavel | Frontend | Backend |
|----------|----------|---------|
| `GEMINI_API_KEY` | - | X |
| `DATABASE_URL` | - | X |
| `BLOB_READ_WRITE_TOKEN` | - | X |
| `VITE_CLERK_PUBLISHABLE_KEY` | X | - |
| `CLERK_SECRET_KEY` | - | X |
| `REDIS_URL` ou `REDIS_PRIVATE_URL` | - | X |

## 7. Ferramentas Uteis

### Extensoes do Navegador

- **React DevTools** - Inspecionar componentes
- **Redux DevTools** - Se usar Redux/Zustand
- **Network Tab** - Requisicoes HTTP

### CLI

```bash
# Railway CLI
railway logs -f          # Logs em tempo real
railway shell            # Shell no container
railway variables list   # Listar variaveis

# PostgreSQL
psql $DATABASE_URL       # Conectar ao banco

# Redis
redis-cli -u $REDIS_URL  # Conectar ao Redis
```

## 8. Migracao de Banco

### Adicionar Coluna Manualmente

```bash
node db/run-context-migration.mjs
```

### Auto-Migracao

O server executa migracoes automaticas no startup:
- Adiciona coluna `context` se nao existir
- Adiciona valor `clip` ao enum se nao existir

Verifique os logs do startup para ver se as migracoes rodaram.

---

*DirectorAi - Aura Engine v3.0*
