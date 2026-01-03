# Guia de Desenvolvimento Local

Este documento explica como configurar e rodar o DirectorAi localmente.

## Pre-requisitos

- Node.js 20+ (ou Bun)
- Docker (opcional, para Redis local)
- Conta no Neon (PostgreSQL)
- Conta no Vercel (Blob Storage)
- Conta no Clerk (Autenticacao)
- Chave da API do Google Gemini
- Acesso ao Railway (para Redis em desenvolvimento)

## Modos de Desenvolvimento

O DirectorAi tem **dois modos de desenvolvimento**:

### 1. Modo Padrao - Railway Redis (`npm run dev`)

```bash
npm run dev
```

**Caracteristicas:**
- Roda `dev-api.mjs` (porta 3002) + Vite (porta 5173)
- Usa Redis do **Railway** (mesmo da producao)
- Jobs em background funcionam normalmente
- Recomendado para desenvolvimento padrao

**Requerimentos:**
- `REDIS_URL` ou `REDIS_PRIVATE_URL` configurado no `.env` (URL do Redis Railway)

### 2. Modo Local - Docker Redis (`npm run dev:local`)

```bash
npm run dev:local
```

**Caracteristicas:**
- Roda Docker Redis local (porta 6380) + `dev-api.mjs` + Vite
- Nao depende de servicos externos para Redis
- Bom para desenvolvimento offline
- Inicia Redis automaticamente via Docker Compose

**Requerimentos:**
- Docker instalado e rodando

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

### 3. Configurar Redis

O modo padrao (`npm run dev`) usa Redis do Railway. Para isso, adicione no `.env`:

```bash
REDIS_URL="redis://default:xxx@xxx.railway.internal:6379"
# ou use REDIS_PRIVATE_URL se disponivel
```

Para usar Redis local (`npm run dev:local`), nao e necessario configurar - o Docker Compose cuida disso.

**Opcao: Redis instalado localmente**
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
# Modo padrao (Railway Redis)
npm run dev

# Modo local (Docker Redis)
npm run dev:local
```

## Diferenca Entre Modos

| Funcionalidade | `npm run dev` | `npm run dev:local` |
|---------------|---------------|---------------------|
| API de banco de dados | OK | OK |
| Geracao de campanhas | OK | OK |
| Geracao de imagens (sync) | OK | OK |
| Geracao de imagens (fila) | OK | OK |
| Jobs em background | OK | OK |
| Redis | Railway (remoto) | Docker (local) |
| Requer Docker | Nao | Sim |
| Funciona offline | Nao | Sim |

## Portas Utilizadas

| Servico | Porta | Modo |
|---------|-------|------|
| Vite (frontend) | 5173 | Ambos |
| Dev API | 3002 | Ambos |
| Redis (local) | 6380 | `npm run dev:local` |

## Estrutura de Servidores

### dev-api.mjs (Desenvolvimento)

- Servidor de desenvolvimento com todas as APIs
- Conecta ao Redis (Railway ou local via Docker)
- Processa jobs em background via BullMQ
- Hot reload para desenvolvimento rapido

### index.mjs (Producao)

- Servidor completo para deploy
- Serve frontend buildado + APIs
- Identico comportamento de jobs
- Usado no Railway

## Comandos Uteis

```bash
# Desenvolvimento padrao (Railway Redis)
npm run dev

# Desenvolvimento local (Docker Redis)
npm run dev:local

# Iniciar apenas o Redis local
npm run dev:redis

# Parar containers Docker
npm run dev:stop

# Ver logs do Redis local
docker compose logs redis

# Limpar dados do Redis local
docker compose down -v
```

## Troubleshooting

### "Connection refused" no Redis (modo local)

```bash
# Verificar se Redis esta rodando
docker ps | grep redis

# Se nao estiver, iniciar
npm run dev:redis
```

### Jobs nao processam

1. Verifique se `REDIS_URL` ou `REDIS_PRIVATE_URL` esta configurado no `.env`
2. No modo local, verifique se Docker esta rodando
3. Verifique logs do servidor para erros de conexao

### Erro "GEMINI_API_KEY not set"

Verifique se o arquivo `.env` existe e tem a chave correta.

### Erro de conexao com banco

1. Verifique `DATABASE_URL` no `.env`
2. Confirme SSL: `?sslmode=require` no final

## PWA (Progressive Web App)

A aplicacao suporta instalacao como PWA:

- **Desktop:** Clique no icone de instalacao na barra de endereco
- **Mobile:** Use "Adicionar a tela inicial" no navegador

Recursos PWA:
- Funciona offline (cache de assets)
- Icone na area de trabalho/home screen
- Experiencia fullscreen

---

*DirectorAi - Aura Engine v3.0*
