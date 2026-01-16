# Índice de Documentação
## PokerMarketing Agency - Sistema de Geração de Imagens

**Versão:** 1.0
**Data:** 2026-01-15
**Autor:** Claude Code (Senior Architect)

---

## 📚 Documentação Completa

Este índice organiza toda a documentação do sistema de geração de imagens da PokerMarketing Agency.

---

## 🎯 Documentos Principais

### 1. [ARCHITECTURE-IMAGE-GENERATION.md](./ARCHITECTURE-IMAGE-GENERATION.md)
**Documentação Arquitetural Completa**

Análise técnica profunda de toda a arquitetura do sistema de geração de imagens.

**Conteúdo:**
- ✅ Visão geral da arquitetura
- ✅ Fluxo de dados detalhado
- ✅ Parâmetros de geração (BrandProfile, ImageParams, etc.)
- ✅ Estrutura de prompts (Campanha, Imagem, Flyer, Vídeo)
- ✅ Modelos de IA (Gemini, GPT, Grok, Fal.ai)
- ✅ Casos de uso práticos
- ✅ Esquemas de dados (Campaign, Image, Video)
- ✅ Boas práticas e padrões

**Para quem:**
- Desenvolvedores que precisam entender a arquitetura completa
- Arquitetos de software planejando modificações
- Tech leads revisando o sistema

**Leitura estimada:** 30-45 minutos

---

### 2. [IMAGE-GENERATION-SUMMARY.md](./IMAGE-GENERATION-SUMMARY.md)
**Resumo Executivo**

Versão condensada e prática focada em uso rápido do sistema.

**Conteúdo:**
- ✅ Visão geral rápida (componentes, fluxos)
- ✅ Parâmetros-chave explicados
- ✅ Fluxo de geração típico
- ✅ Modelos disponíveis (tabelas comparativas)
- ✅ Anatomia de um prompt eficaz
- ✅ Regras de estilo aplicadas
- ✅ Prompts especializados
- ✅ Exemplos práticos
- ✅ Métricas de performance e custos
- ✅ Problemas comuns e soluções
- ✅ Checklist de qualidade

**Para quem:**
- Desenvolvedores novos no projeto
- Product managers precisando de overview
- QA testando funcionalidades

**Leitura estimada:** 10-15 minutos

---

### 3. [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md)
**Diagramas Visuais**

Representações visuais da arquitetura, fluxos e estruturas de dados.

**Conteúdo:**
- ✅ Diagrama da arquitetura geral do sistema
- ✅ Fluxo de geração de campanha completa
- ✅ Fluxo de prompt engineering (enrichment layers)
- ✅ Fluxo de decisão de modelo
- ✅ Database schema (relacionamentos)
- ✅ Job queue architecture
- ✅ Modelo de dados: BrandProfile

**Para quem:**
- Pessoas que preferem aprender visualmente
- Apresentações para stakeholders
- Onboarding de novos membros

**Leitura estimada:** 15-20 minutos

---

### 4. [PROMPT-EXAMPLES.md](./PROMPT-EXAMPLES.md)
**Exemplos Práticos de Prompts**

Biblioteca completa de exemplos reais de prompts e suas saídas.

**Conteúdo:**
- ✅ Prompts de campanha (input → output completo)
- ✅ Prompts de posts (Instagram, Facebook)
- ✅ Prompts de flyers (com logo, sem logo)
- ✅ Prompts de vídeo (scenes, thumbnails)
- ✅ Prompts de carrosséis (5 slides)
- ✅ Prompts com referências visuais (produto + logo)
- ✅ Exemplos de edição de imagem (com máscara)
- ✅ Exemplos de saídas da IA (JSON completos)
- ✅ Dicas práticas (DO/DON'T)

**Para quem:**
- Desenvolvedores implementando novos prompts
- Designers entendendo o processo criativo
- Product managers validando qualidade de saída

**Leitura estimada:** 20-30 minutos

---

## 🗂️ Outros Documentos Relevantes

### [MODEL_DOCUMENTATION.md](./MODEL_DOCUMENTATION.md)
**Documentação de Modelos de IA**

Documentação original sobre os modelos de imagem (legada, mas ainda relevante).

**Conteúdo:**
- Modelos Text-to-Image (Gemini, Bytedance)
- Modelos Image-to-Image (edição, variação)
- Funções do geminiService.ts
- Quando usar cada modelo

---

### [VIDEO-GENERATION.md](./VIDEO-GENERATION.md) & [VEO-3.1-VIDEO-GENERATION.md](./VEO-3.1-VIDEO-GENERATION.md)
**Geração de Vídeo**

Documentação específica sobre geração de vídeos.

**Conteúdo:**
- Modelos Sora 2 e Veo 3.1
- Parâmetros de vídeo
- Fluxos de geração
- Limitações e boas práticas

---

## 📖 Guia de Leitura Recomendado

### Para Novos Desenvolvedores

1. **Comece aqui:** [IMAGE-GENERATION-SUMMARY.md](./IMAGE-GENERATION-SUMMARY.md)
   - Obtenha uma visão geral rápida do sistema

2. **Visualize:** [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md)
   - Entenda os fluxos visualmente

3. **Pratique:** [PROMPT-EXAMPLES.md](./PROMPT-EXAMPLES.md)
   - Veja exemplos reais de uso

4. **Aprofunde:** [ARCHITECTURE-IMAGE-GENERATION.md](./ARCHITECTURE-IMAGE-GENERATION.md)
   - Mergulhe nos detalhes técnicos

### Para Arquitetos/Tech Leads

1. **Arquitetura completa:** [ARCHITECTURE-IMAGE-GENERATION.md](./ARCHITECTURE-IMAGE-GENERATION.md)
2. **Diagramas:** [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md)
3. **Resumo executivo:** [IMAGE-GENERATION-SUMMARY.md](./IMAGE-GENERATION-SUMMARY.md)

### Para Product Managers/Designers

1. **Resumo:** [IMAGE-GENERATION-SUMMARY.md](./IMAGE-GENERATION-SUMMARY.md)
2. **Exemplos:** [PROMPT-EXAMPLES.md](./PROMPT-EXAMPLES.md)
3. **Diagramas:** [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md)

---

## 🔍 Busca Rápida por Tópico

### Parâmetros
- **BrandProfile:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#1-brandprofile-perfil-da-marca) | [Diagrama](./ARCHITECTURE-DIAGRAM.md#7-modelo-de-dados-brandprofile)
- **AspectRatio:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#2-parâmetros-de-imagem)
- **ImageSize:** [SUMMARY](./IMAGE-GENERATION-SUMMARY.md#4-imagesize-opcional)

### Prompts
- **Campanha:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#1-prompt-de-campanha-buildcampaignprompt) | [Exemplos](./PROMPT-EXAMPLES.md#1-prompts-de-campanha)
- **Imagem:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#2-prompt-de-imagem-buildimageprompt) | [Exemplos](./PROMPT-EXAMPLES.md#2-prompts-de-posts)
- **Flyer:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#3-prompt-de-flyer-buildflyerprompt) | [Exemplos](./PROMPT-EXAMPLES.md#3-prompts-de-flyers)
- **Vídeo:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#4-prompts-de-vídeo-clipsscenes) | [Exemplos](./PROMPT-EXAMPLES.md#4-prompts-de-vídeo-clips)
- **Carrossel:** [Exemplos](./PROMPT-EXAMPLES.md#5-prompts-de-carrosséis)

### Modelos
- **Gemini:** [SUMMARY](./IMAGE-GENERATION-SUMMARY.md#textocampanha) | [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#1-modelos-criativos-texto)
- **GPT-5.2:** [SUMMARY](./IMAGE-GENERATION-SUMMARY.md#textocampanha)
- **Sora/Veo:** [VIDEO-GENERATION](./VIDEO-GENERATION.md) | [VEO-3.1](./VEO-3.1-VIDEO-GENERATION.md)

### Fluxos
- **Geração de Campanha:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#1-geração-de-campanha-completa) | [Diagrama](./ARCHITECTURE-DIAGRAM.md#2-fluxo-de-geração-de-campanha-completa)
- **Geração de Imagem:** [ARCHITECTURE](./ARCHITECTURE-IMAGE-GENERATION.md#2-geração-de-imagem-individual) | [Diagrama](./ARCHITECTURE-DIAGRAM.md#3-fluxo-de-prompt-engineering)
- **Job Queue:** [Diagrama](./ARCHITECTURE-DIAGRAM.md#6-job-queue-architecture)

### Código
- **Frontend:** `src/components/` (CampaignsList, ClipsTab, PostsTab, etc.)
- **Services:** `src/services/geminiService.ts`, `src/services/api/aiApi.ts`
- **Backend:** `server/index.mjs`, `server/helpers/campaign-prompts.mjs`
- **Config:** `src/config/ai-models.ts`
- **Types:** `src/types.ts`

---

## 🔧 Arquivos de Código Principais

### Frontend (React/TypeScript)

```
src/
├── components/
│   ├── campaigns/CampaignsList.tsx       # Geração de campanhas
│   ├── tabs/ClipsTab.tsx                 # Geração de clips
│   ├── tabs/PostsTab.tsx                 # Geração de posts
│   ├── tabs/AdCreativesTab.tsx           # Geração de anúncios
│   ├── playground/PlaygroundView.tsx     # Playground de geração
│   └── flyer/FlyerGenerator.tsx          # Geração de flyers
├── services/
│   ├── geminiService.ts                  # Client-side AI service
│   ├── apiClient.ts                      # HTTP client
│   └── api/
│       ├── aiApi.ts                      # AI API endpoints
│       └── campaignsApi.ts               # Campaign API endpoints
├── ai-prompts/
│   ├── clipsPrompts.ts                   # Prompts de vídeo
│   └── logoPrompts.ts                    # Prompts de logo
├── config/
│   └── ai-models.ts                      # Configuração de modelos
└── types.ts                              # TypeScript types
```

### Backend (Node.js/Express)

```
server/
├── index.mjs                             # Main server file
├── helpers/
│   ├── campaign-prompts.mjs              # Prompt builders
│   ├── image-helpers.mjs                 # Image utilities
│   ├── job-queue.mjs                     # BullMQ queue
│   ├── scheduled-publisher.mjs           # Instagram publisher
│   ├── usage-tracking.mjs                # AI usage logging
│   └── organization-context.mjs          # Auth/permissions
└── dev-api.mjs                           # Development API
```

---

## 📊 Estatísticas da Documentação

- **Total de Documentos:** 4 principais + 3 complementares
- **Total de Páginas (estimado):** ~120 páginas
- **Total de Exemplos de Código:** 50+
- **Total de Diagramas:** 7
- **Tempo de Leitura Total:** ~2 horas (leitura completa)
- **Tempo de Leitura Mínimo:** ~30 minutos (resumo + exemplos)

---

## 🎓 Glossário Rápido

| Termo | Definição |
|-------|-----------|
| **BrandProfile** | Perfil da marca com cores, tom de voz, logo |
| **AspectRatio** | Proporção da imagem (1:1, 9:16, 16:9, etc.) |
| **ImageSize** | Resolução (1K, 2K, 4K) |
| **image_prompt** | Prompt específico para gerar uma imagem |
| **Gemini** | Modelo de IA do Google (texto e imagem) |
| **Fal.ai** | Plataforma para Sora 2 e Veo 3.1 (vídeo) |
| **Job Queue** | Fila de processamento assíncrono (BullMQ) |
| **Blob Storage** | Armazenamento de arquivos (Vercel Blob) |
| **Enrichment** | Processo de enriquecer prompts básicos |
| **Scene** | Cena individual de um vídeo clip |
| **Carousel** | Sequência de 5 slides para Instagram |

---

## 🔗 Links Externos Úteis

### SDKs e APIs
- [Google GenAI SDK](https://ai.google.dev/)
- [OpenRouter API](https://openrouter.ai/docs)
- [Fal.ai Documentation](https://fal.ai/models)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)

### Frameworks e Ferramentas
- [BullMQ (Job Queue)](https://docs.bullmq.io/)
- [Clerk (Auth)](https://clerk.com/docs)
- [NeonDB (PostgreSQL)](https://neon.tech/docs)

---

## 📝 Notas de Versão

### v1.0 (2026-01-15)
- Documentação inicial completa
- 4 documentos principais criados
- 7 diagramas visuais
- 50+ exemplos de código
- Cobertura completa de todos os fluxos

---

## 🤝 Como Contribuir

Para manter esta documentação atualizada:

1. **Ao adicionar novo modelo de IA:**
   - Atualizar `src/config/ai-models.ts`
   - Documentar em [ARCHITECTURE-IMAGE-GENERATION.md](./ARCHITECTURE-IMAGE-GENERATION.md)
   - Adicionar exemplo em [PROMPT-EXAMPLES.md](./PROMPT-EXAMPLES.md)

2. **Ao modificar prompts:**
   - Atualizar builders em `server/helpers/campaign-prompts.mjs`
   - Documentar mudanças em [ARCHITECTURE-IMAGE-GENERATION.md](./ARCHITECTURE-IMAGE-GENERATION.md)
   - Adicionar exemplos antes/depois em [PROMPT-EXAMPLES.md](./PROMPT-EXAMPLES.md)

3. **Ao adicionar novo fluxo:**
   - Implementar código
   - Adicionar diagrama em [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md)
   - Documentar caso de uso em [ARCHITECTURE-IMAGE-GENERATION.md](./ARCHITECTURE-IMAGE-GENERATION.md)

---

## 📧 Contato

Para dúvidas ou sugestões sobre esta documentação:
- **Autor:** Claude Code (Senior Architect)
- **Data de Criação:** 2026-01-15
- **Última Atualização:** 2026-01-15

---

**Status:** ✅ Documentação de Produção
