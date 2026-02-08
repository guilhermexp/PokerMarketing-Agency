# 📸 DOCUMENTAÇÃO COMPLETA - Sistema de Geração de Imagens

## Visão Geral

Esta documentação completa descreve **TODO O SISTEMA** de geração de imagens do LobeChat, incluindo:
- Arquitetura e estrutura de pastas
- Componentes frontend
- APIs e endpoints
- State management (Zustand)
- Fluxo de dados completo
- Exemplos de código para replicação

## 🎯 O que é o Sistema de Geração de Imagens?

Uma página completa para **text-to-image generation** com:
- ✅ Interface de 3 painéis (config + canvas + galeria)
- ✅ Suporte a múltiplos providers (Google, OpenAI, AWS, etc.)
- ✅ Configuração dinâmica baseada no modelo
- ✅ Histórico organizado em Topics
- ✅ Preview, download, reuso de seeds
- ✅ Upload de imagens de referência
- ✅ Geração em batch com polling de status

## 📚 Índice de Documentação

| Arquivo | Conteúdo |
|---------|----------|
| **[01-ARQUITETURA.md](./01-ARQUITETURA.md)** | Estrutura de pastas, rotas, organização geral |
| **[02-COMPONENTES.md](./02-COMPONENTES.md)** | Todos os componentes React, props, responsabilidades |
| **[03-APIS-ENDPOINTS.md](./03-APIS-ENDPOINTS.md)** | tRPC routers, endpoints, request/response |
| **[04-STATE-MANAGEMENT.md](./04-STATE-MANAGEMENT.md)** | Zustand stores, slices, selectors, actions |
| **[05-FLUXO-DADOS.md](./05-FLUXO-DADOS.md)** | Fluxo completo: prompt → geração → display |
| **[06-CODIGOS-EXEMPLO.md](./06-CODIGOS-EXEMPLO.md)** | Snippets de código para replicar features |

## 🚀 Como Usar Esta Documentação

### Para Replicar o Sistema Inteiro:
1. Leia **01-ARQUITETURA** para entender a estrutura
2. Leia **02-COMPONENTES** para ver todos os componentes
3. Leia **03-APIS-ENDPOINTS** para criar seu backend
4. Leia **04-STATE-MANAGEMENT** para gerenciar estado
5. Leia **05-FLUXO-DADOS** para conectar tudo
6. Use **06-CODIGOS-EXEMPLO** para copiar código

### Para Implementar Features Específicas:
- **Preview de imagens**: Veja seção em 02-COMPONENTES + 06-CODIGOS-EXEMPLO
- **Upload de referências**: Veja ConfigPanel em 02-COMPONENTES
- **Polling de status**: Veja 05-FLUXO-DADOS seção 6.1
- **Download de imagens**: Veja 05-FLUXO-DADOS seção 6.2

## 🏗️ Stack Tecnológica

```json
{
  "frontend": {
    "framework": "React 19 + Next.js 16",
    "routing": "React Router v7 (SPA)",
    "state": "Zustand 5.0",
    "ui": "@lobehub/ui + Ant Design 6",
    "styling": "antd-style + Emotion",
    "data-fetching": "tRPC + SWR"
  },
  "backend": {
    "api": "tRPC 11.8",
    "database": "PostgreSQL (Drizzle ORM)",
    "storage": "S3 (AWS/Cloudflare R2)",
    "queue": "asyncTasks table + polling"
  }
}
```

## 📐 Arquitetura de 3 Painéis

```
┌─────────────────────────────────────────────────────────────┐
│                          Header                              │
├──────────────┬──────────────────────────┬───────────────────┤
│              │                          │                   │
│   Config     │      ImageWorkspace      │   TopicSidebar   │
│   Panel      │                          │                   │
│              │   ┌──────────────────┐   │   ┌───────────┐  │
│  ┌────────┐  │   │  PromptInput     │   │   │ Topic 1   │  │
│  │Model   │  │   │  [Text input]    │   │   ├───────────┤  │
│  │Select  │  │   │  [Generate btn]  │   │   │ Topic 2   │  │
│  ├────────┤  │   └──────────────────┘   │   ├───────────┤  │
│  │Width   │  │                          │   │ Topic 3   │  │
│  │Height  │  │   ┌──────────────────┐   │   └───────────┘  │
│  ├────────┤  │   │ GenerationFeed   │   │                   │
│  │Steps   │  │   │                  │   │   [+ New Topic]   │
│  │Seed    │  │   │  Batch 1:        │   │                   │
│  │...     │  │   │  [img] [img]     │   │                   │
│  └────────┘  │   │                  │   │                   │
│              │   │  Batch 2:        │   │                   │
│              │   │  [loading...]    │   │                   │
│              │   └──────────────────┘   │                   │
└──────────────┴──────────────────────────┴───────────────────┘
```

## 🔑 Conceitos-Chave

### Topics
- **O que são**: Collections/projetos de geração (ex: "Anime Characters", "Logo Designs")
- **Hierarquia**: Topic → Batches → Generations (imagens)
- **UI**: Right sidebar lista todos os topics

### Batches
- **O que são**: Grupos de imagens geradas com o mesmo prompt/config
- **Exemplo**: Gerar 4 imagens de "cute cat" = 1 batch com 4 generations
- **UI**: Card no feed com prompt + múltiplas imagens

### Generations
- **O que são**: Imagens individuais dentro de um batch
- **Dados**: URL, seed, dimensions, status, asyncTask
- **UI**: ImageItem com preview, download, seed copy

### AsyncTasks
- **O que são**: Background jobs para processar geração
- **Status**: Pending → Processing → Success/Error
- **Polling**: Frontend verifica status periodicamente

## ⚡ Features Principais

| Feature | Descrição | Arquivo Relacionado |
|---------|-----------|---------------------|
| **Text-to-Image** | Prompt → Imagem | 05-FLUXO-DADOS.md §6.1 |
| **Multi-Provider** | Google, OpenAI, AWS, etc. | 02-COMPONENTES.md ModelSelect |
| **Dynamic Config** | Params baseados no modelo | 02-COMPONENTES.md ConfigPanel |
| **Image References** | Upload imagem de referência | 02-COMPONENTES.md ImageUrl |
| **Batch Generation** | Múltiplas imagens por vez | 03-APIS-ENDPOINTS.md createImage |
| **Status Polling** | Tracking de geração assíncrona | 04-STATE-MANAGEMENT.md §3.3 |
| **Download** | Baixar imagens geradas | 05-FLUXO-DADOS.md §6.2 |
| **Seed Reuse** | Reproduzir gerações | 05-FLUXO-DADOS.md §6.3 |
| **Topic Management** | Organizar em projetos | 05-FLUXO-DADOS.md §6.5 |
| **Preview Gallery** | Lightbox com zoom | 02-COMPONENTES.md ImageItem |

## 🎓 Conceitos Avançados

### Dynamic Schema
Cada modelo tem um `parametersSchema` que define quais parâmetros suporta:
```typescript
{
  supportedParams: ['prompt', 'width', 'height', 'seed', 'steps'],
  constraints: { width: { min: 64, max: 2048 } }
}
```
A UI renderiza apenas os controles suportados.

### Aspect Ratio Lock
- Lock ativo: width/height mantém proporção
- Unlock: ajuste independente
- Constraints do modelo são respeitados

### Optimistic Updates
- Delete generation: UI atualiza imediatamente
- Backend processa depois
- Refresh para garantir consistência

### URL Sync
- Query params: `?topic=xxx&prompt=yyy`
- Auto-fill prompt ao carregar página
- Navegação entre topics atualiza URL

## 📊 Métricas

- **Componentes**: ~50 componentes React
- **Endpoints tRPC**: 15+ routers
- **Store Slices**: 4 slices principais
- **Arquivos**: ~100 arquivos TypeScript
- **LOC**: ~8,000+ linhas de código

## 🔗 Links Externos

- [Ant Design Image](https://ant.design/components/image)
- [tRPC Documentation](https://trpc.io)
- [Zustand](https://github.com/pmndrs/zustand)
- [SWR](https://swr.vercel.app)

## 📝 Notas de Implementação

### Segurança
- URLs de imagem: S3 keys em DB (não URLs completas)
- Presigned URLs geradas on-demand
- Validação de file types/sizes no upload

### Performance
- SWR cache para topics/batches
- Polling com exponential backoff (1s → 30s)
- Lazy loading de imagens
- Optimistic UI updates

### Responsividade
- Mobile: Painéis colapsam
- Desktop: 3 painéis lado a lado
- Grid layout responsivo

---

**Criado em**: 2026-01-16
**Versão do LobeChat**: 2.0.0-next.295
**Autor**: Análise automatizada do codebase

---

🚀 **Pronto para começar!** Navegue pelos arquivos de documentação para entender cada parte do sistema.
