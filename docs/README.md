# DirectorAi: Aura Engine

DirectorAi é um kit de crescimento com IA projetado para criadores, com foco em agências de marketing. A aplicação ajuda a reaproveitar conteúdo, como transcrições de vídeos ou posts, transformando-o automaticamente em campanhas de marketing completas, incluindo clipes de vídeo, posts para redes sociais e criativos de anúncio.

## Funcionalidades Principais

- **Gerador de Campanhas:** Transforma transcrição de texto em campanhas de marketing multiplataforma completas
- **Gerador de Flyers de Torneios:** Importa planilhas (.xlsx) e gera flyers promocionais individuais ou resumos diários
- **Perfil de Marca Dinâmico:** Configura identidade visual (logo, cores, tom de voz) para consistência na geração de conteúdo
- **Geração de Imagens IA:** Utiliza Google Gemini para criar imagens de alta qualidade
- **Edição de Imagem Avançada:** Edita imagens usando prompts de texto e máscaras
- **Geração de Vídeo:** Cria vídeos a partir de imagens usando Veo 3.1 ou Sora 2
- **Text-to-Speech:** Narra scripts em português brasileiro com vozes naturais
- **Galeria de Mídia:** Armazena todas as imagens geradas com persistência em nuvem
- **Background Jobs:** Processamento assíncrono com feedback em tempo real

## Arquitetura

A aplicação é uma SPA React com backend Express, otimizada para deploy em Railway.

### Stack Tecnológico

| Camada | Tecnologia | Descrição |
|--------|------------|-----------|
| **Frontend** | React 19 + TypeScript + Tailwind CSS | SPA com componentes modulares |
| **Backend** | Express.js (ESM) | API REST servindo frontend e endpoints de IA |
| **Banco de Dados** | PostgreSQL (Neon Serverless) | Persistência de usuários, campanhas, galeria |
| **Armazenamento** | Vercel Blob Storage | Imagens, vídeos e áudios gerados |
| **Autenticação** | Clerk | Auth multi-tenant com organizações |
| **Fila de Jobs** | BullMQ + Redis | Processamento assíncrono de imagens |
| **IA - Imagem** | Google Gemini API | Geração e edição de imagens |
| **IA - Vídeo** | Veo 3.1 + Fal.ai (Sora 2) | Geração de vídeos |
| **IA - Áudio** | Gemini TTS (Zephyr) | Narração em português brasileiro |
| **Deploy** | Railway | Container Docker com Redis integrado |

### Diagrama de Fluxo

```
[Usuário] --> [Frontend React]
                   |
                   v
            [Express Server]
                   |
    +--------------+--------------+
    |              |              |
    v              v              v
[PostgreSQL]  [Vercel Blob]  [BullMQ/Redis]
                                  |
                                  v
                          [Job Processor]
                                  |
                   +--------------+--------------+
                   |              |              |
                   v              v              v
             [Gemini API]   [Veo API]    [Fal.ai API]
```

## Estrutura de Arquivos

```
/
├── server/
│   ├── index.mjs              # Express server principal
│   └── helpers/
│       └── job-queue.mjs      # BullMQ queue e worker
│
├── services/
│   ├── services/api (compat via services/apiClient.ts)           # Cliente HTTP para todas as APIs
│   ├── geminiService.ts       # Wrapper para /api/ai/* endpoints
│   ├── blobService.ts         # Upload para Vercel Blob
│   └── rubeService.ts         # Geração de vídeo (Veo/Fal.ai)
│
├── hooks/
│   ├── useBackgroundJobs.tsx  # Provider e hooks para jobs
│   ├── useInitialData.ts      # Carrega dados iniciais via SWR
│   ├── useGalleryImages.ts    # CRUD de galeria
│   └── useCampaigns.ts        # CRUD de campanhas
│
├── components/
│   ├── tabs/
│   │   ├── ClipsTab.tsx       # Edição de clips de vídeo
│   │   ├── PostsTab.tsx       # Posts para redes sociais
│   │   └── AdCreativesTab.tsx # Criativos de anúncio
│   ├── common/
│   │   └── BackgroundJobsIndicator.tsx  # UI de jobs em andamento
│   ├── Dashboard.tsx
│   ├── FlyerGenerator.tsx
│   └── BrandProfileSetup.tsx
│
├── db/
│   ├── schema.sql             # Schema completo do PostgreSQL
│   └── run-migration.mjs      # Script de migração
│
├── Dockerfile                 # Build para Railway
├── railway.toml               # Configuração Railway
└── vite.config.ts             # Build do frontend
```

## Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL do PostgreSQL (Neon) |
| `GEMINI_API_KEY` | Chave da API Google Gemini |
| `BLOB_READ_WRITE_TOKEN` | Token do Vercel Blob Storage |
| `VITE_CLERK_PUBLISHABLE_KEY` | Chave pública do Clerk |
| `CLERK_SECRET_KEY` | Chave secreta do Clerk |

### Opcionais

| Variável | Descrição |
|----------|-----------|
| `REDIS_URL` ou `REDIS_PRIVATE_URL` | URL do Redis (Railway) |
| `FAL_KEY` | Chave da API Fal.ai (Sora 2) |
| `OPENROUTER_API_KEY` | Chave OpenRouter (modelos alternativos) |
| `RUBE_TOKEN` | Token para API Rube (vídeo) |

## Modelos de IA Utilizados

| Funcionalidade | Modelo | Endpoint |
|----------------|--------|----------|
| Campanhas (JSON) | `gemini-2.5-flash-preview-05-20` | `/api/ai/generate-campaign` |
| Imagens Pro | `gemini-3-pro-image-preview` | `/api/ai/generate-image` |
| Edição Rápida | `gemini-2.5-flash-preview-image` | `/api/ai/edit-image` |
| TTS (Voz) | `gemini-2.5-flash-preview-tts` | `/api/ai/generate-tts` |
| Vídeo | `veo-3.1-fast-generate-preview` | `/api/ai/generate-video` |
| Vídeo (Fallback) | `fal-ai/sora-2/text-to-video` | Fal.ai API |

## Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas chaves (incluindo REDIS_URL do Railway)

# Modo padrao (Railway Redis)
npm run dev

# Modo local (Docker Redis, funciona offline)
npm run dev:local
```

Veja [DEVELOPMENT.md](./DEVELOPMENT.md) para detalhes sobre os modos de desenvolvimento.

## Deploy no Railway

1. Crie projeto no Railway
2. Adicione serviço Redis
3. Configure variáveis de ambiente
4. Conecte repositório GitHub ou use CLI:
   ```bash
   railway link
   railway up
   ```

Veja [DEPLOYMENT.md](./DEPLOYMENT.md) para instruções detalhadas.

## Documentação Adicional

- [DOCUMENTATION.md](../DOCUMENTATION.md) - Documentação técnica completa
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Guia de desenvolvimento local
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guia de deploy no Railway
- [DEBUGGING.md](./DEBUGGING.md) - Guia de depuração
- [MODEL_DOCUMENTATION.md](./MODEL_DOCUMENTATION.md) - Detalhes dos modelos de IA

---

*DirectorAi - Aura Engine v3.0*
