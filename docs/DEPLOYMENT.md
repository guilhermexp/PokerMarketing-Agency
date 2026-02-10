# Guia de Deploy no Railway

Este documento detalha o processo completo para fazer deploy do DirectorAi no Railway.

## Pre-requisitos

1. Conta no [Railway](https://railway.app)
2. Conta no [Neon](https://neon.tech) para PostgreSQL
3. Conta no [Vercel](https://vercel.com) para Blob Storage
4. Conta no [Clerk](https://clerk.com) para autenticacao
5. Chave da API do [Google AI Studio](https://aistudio.google.com) para Gemini

## 1. Configuracao do Projeto

### 1.1 Criar Projeto no Railway

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Criar novo projeto
railway init
```

### 1.2 Adicionar Servico Redis

No dashboard do Railway:
1. Clique em "New Service"
2. Selecione "Database" > "Redis"
3. Aguarde provisionamento

O Redis sera usado para a fila de jobs (BullMQ).

## 2. Variaveis de Ambiente

### 2.1 Variaveis Obrigatorias

Configure no Railway Dashboard ou via CLI:

```bash
# Banco de dados (Neon)
railway variables set DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Google Gemini
railway variables set GEMINI_API_KEY="sua-chave-gemini"

# Vercel Blob Storage
railway variables set BLOB_READ_WRITE_TOKEN="vercel_blob_xxxxx"

# Clerk Authentication
# IMPORTANTE: Use chaves de teste (pk_test_/sk_test_) em desenvolvimento.
# Configure chaves live (pk_live_/sk_live_) apenas no Railway Dashboard, nunca no codigo.
railway variables set VITE_CLERK_PUBLISHABLE_KEY="pk_test_xxxxx"
railway variables set CLERK_SECRET_KEY="sk_test_xxxxx"
```

### 2.2 Variaveis Opcionais

```bash
# Admin panel access (comma-separated emails)
# Se nao configurado, nenhum usuario tera acesso ao painel admin.
railway variables set SUPER_ADMIN_EMAILS="admin@yourdomain.com,admin2@yourdomain.com"

# Fal.ai para Sora 2 (video fallback)
railway variables set FAL_KEY="sua-chave-fal"

# OpenRouter para modelos alternativos
railway variables set OPENROUTER_API_KEY="sua-chave-openrouter"

# API Rube para video
railway variables set RUBE_TOKEN="seu-token-rube"
```

### 2.3 Variaveis Automaticas

O Railway configura automaticamente:
- `REDIS_URL` ou `REDIS_PRIVATE_URL` - URL do Redis interno
- `PORT` - Porta do servico (usamos 8080)

## 3. Arquivos de Configuracao

### 3.1 railway.toml

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

### 3.2 Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar codigo fonte
COPY . .

# Build do frontend (Vite)
RUN npm run build

# Expor porta
EXPOSE 8080

# Iniciar server
CMD ["node", "server/index.mjs"]
```

## 4. Deploy

### 4.1 Via CLI

```bash
# Vincular ao projeto
railway link

# Fazer deploy
railway up

# Ver logs
railway logs -f
```

### 4.2 Via GitHub (Recomendado)

1. Conecte seu repositorio no Railway Dashboard
2. Configure o branch para deploy automatico (ex: `main`)
3. Cada push dispara um novo deploy

## 5. Verificacao

### 5.1 Health Check

```bash
curl https://seu-app.up.railway.app/api/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "redis": "connected",
  "database": "connected"
}
```

### 5.2 Logs

```bash
# Ver logs em tempo real
railway logs -f

# Ver ultimos 100 logs
railway logs --tail 100
```

### 5.3 Checklist de Verificacao

- [ ] App carrega na URL do Railway
- [ ] Login com Clerk funciona
- [ ] Geracao de campanha retorna dados
- [ ] Geracao de imagem funciona
- [ ] Jobs aparecem no indicador
- [ ] Imagens sao salvas na galeria

## 6. Troubleshooting

### Erro: "An API Key must be set"

O frontend nao esta recebendo a API key:
1. Verifique `GEMINI_API_KEY` no Railway
2. Confirme que `vite.config.ts` define `VITE_API_KEY`
3. Faca redeploy para rebuild

### Erro: "Redis connection refused"

1. Verifique se o servico Redis esta rodando
2. Confirme que `REDIS_URL` ou `REDIS_PRIVATE_URL` existe
3. Use a URL interna do Railway (nao a publica)

### Erro: "Database connection failed"

1. Verifique `DATABASE_URL` no Railway
2. Confirme SSL: `?sslmode=require` no final da URL
3. Verifique IP allowlist no Neon (permitir 0.0.0.0/0 para Railway)

### Jobs Travados

1. Verifique logs: `railway logs --tail 50`
2. Verifique Redis: jobs podem estar presos na fila
3. Use o botao "Cancelar Todos" no frontend

### Build Falhou

1. Verifique logs do build no Railway Dashboard
2. Erros comuns:
   - Dependencias faltando no package.json
   - Erro de TypeScript no build
   - Variavel de ambiente faltando no build

## 7. Escalabilidade

### Workers

Por padrao, o worker processa 2 jobs simultaneamente:

```javascript
// server/helpers/job-queue.mjs
const worker = new Worker('generation', processor, {
  concurrency: 2,  // ajustar conforme necessidade
  connection: redis
});
```

### Recursos

No Railway, ajuste os recursos conforme demanda:
- **Memory**: 512MB minimo recomendado
- **CPU**: 0.5 vCPU para uso moderado
- **Redis**: Plan Free para desenvolvimento

## 8. Monitoramento

### Metricas do Railway

- CPU/Memory usage
- Request count
- Error rate

### Logs Estruturados

O server loga eventos importantes:
```
[INFO] Server started on port 8080
[INFO] Redis connected
[INFO] Processing job: flyer-123
[ERROR] Job failed: clip-456 - API rate limit
```

### Alertas

Configure alertas no Railway para:
- Deploy falhou
- Container reiniciou
- Memoria alta

## 9. Backup

### Banco de Dados

O Neon faz backup automatico. Para backup manual:
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Imagens

Imagens estao no Vercel Blob Storage com replicacao automatica.

---

*DirectorAi - Aura Engine v3.0*
