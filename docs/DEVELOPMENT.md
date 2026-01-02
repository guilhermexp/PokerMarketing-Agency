# Guia de Desenvolvimento Local

Este documento explica como configurar e rodar o DirectorAi localmente.

## Pre-requisitos

- Node.js 20+
- Docker (para Redis) ou Redis instalado localmente
- Conta no Neon (PostgreSQL)
- Conta no Vercel (Blob Storage)
- Conta no Clerk (Autenticacao)
- Chave da API do Google Gemini

## Modos de Desenvolvimento

O DirectorAi tem **dois modos de desenvolvimento**:

### 1. Modo Simples (`npm run dev`)

```bash
npm run dev
```

**Caracteristicas:**
- Roda `dev-api.mjs` (porta 3002) + Vite (porta 5173)
- **NÃO processa jobs em background** - jobs ficam em "queued" para sempre
- Bom para desenvolver UI/UX sem precisar de Redis
- Todas as APIs de banco funcionam normalmente

**Limitações:**
- Geracao de imagens via fila nao funciona
- Jobs aparecem como "queued" mas nunca completam

### 2. Modo Completo (`npm run dev:full`)

```bash
# Primeiro, inicie o Redis
npm run dev:redis

# Depois, rode o app completo
npm run dev:full
```

**Caracteristicas:**
- Roda `server/index.mjs` (porta 8080) + Vite (porta 5173)
- **Processa jobs em background** via BullMQ + Redis
- Comportamento identico a producao
- Requer Docker ou Redis local

**Requerimentos:**
- Docker instalado (para `npm run dev:redis`)
- OU Redis rodando em `localhost:6379`

## Configuracao

### 1. Variaveis de Ambiente

Crie um arquivo `.env` na raiz:

```bash
# Banco de dados (Neon)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Google Gemini
GEMINI_API_KEY="sua-chave-gemini"

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN="vercel_blob_xxxxx"

# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY="pk_test_xxxxx"
CLERK_SECRET_KEY="sk_test_xxxxx"

# Opcional: Fal.ai para video
FAL_KEY="sua-chave-fal"
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Rodar Redis (para modo completo)

**Opcao A: Docker Compose (recomendado)**
```bash
npm run dev:redis
```

**Opcao B: Docker manual**
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**Opcao C: Redis instalado localmente**
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis
```

### 4. Iniciar Aplicacao

```bash
# Modo simples (sem Redis)
npm run dev

# Modo completo (com Redis)
npm run dev:full
```

## Diferenca Entre Modos

| Funcionalidade | `npm run dev` | `npm run dev:full` |
|---------------|---------------|-------------------|
| API de banco de dados | OK | OK |
| Geracao de campanhas | OK | OK |
| Geracao de imagens (sync) | OK | OK |
| Geracao de imagens (fila) | Nao | OK |
| Jobs em background | Nao | OK |
| Indicador de jobs | Jobs ficam "queued" | OK |
| Requer Redis | Nao | Sim |

## Portas Utilizadas

| Servico | Porta | Modo |
|---------|-------|------|
| Vite (frontend) | 5173 | Ambos |
| Dev API | 3002 | `npm run dev` |
| Full Server | 8080 | `npm run dev:full` |
| Redis | 6379 | `npm run dev:full` |

## Estrutura de Servidores

### dev-api.mjs (Modo Simples)

- Servidor leve apenas para APIs de banco
- Nao tem BullMQ/Redis
- Jobs criados ficam em "queued" para sempre
- Util para desenvolver UI sem infraestrutura completa

### index.mjs (Modo Completo / Producao)

- Servidor completo com todas as funcionalidades
- Inclui BullMQ worker para processar jobs
- Processa jobs em background com concurrency 2
- Identico ao que roda em producao

## Comandos Uteis

```bash
# Iniciar Redis
npm run dev:redis

# Parar Redis
npm run dev:redis:stop

# Ver logs do Redis
docker compose logs redis

# Limpar dados do Redis
docker compose down -v
```

## Troubleshooting

### "Connection refused" no Redis

```bash
# Verificar se Redis esta rodando
docker ps | grep redis

# Se nao estiver, iniciar
npm run dev:redis
```

### Jobs nao processam em `npm run dev`

Isso e esperado! Use `npm run dev:full` para processar jobs.

### Erro "GEMINI_API_KEY not set"

Verifique se o arquivo `.env` existe e tem a chave correta.

### Erro de conexao com banco

1. Verifique `DATABASE_URL` no `.env`
2. Confirme SSL: `?sslmode=require` no final

---

*DirectorAi - Aura Engine v3.0*
