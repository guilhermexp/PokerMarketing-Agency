# 📘 Sistema de Campanhas - Documentação Completa

> **Guia Técnico Completo para Desenvolvedores**
>
> Documentação abrangente do sistema de campanhas de marketing com IA, incluindo arquitetura, APIs, schemas de dados e guia completo de clonagem para novos projetos.

---

## 📚 Índice de Documentação

Este é o documento master que organiza toda a documentação técnica do sistema de campanhas. Use os links abaixo para navegar entre os diferentes guias:

### 🏗️ Arquitetura e Design

#### [01. Arquitetura do Sistema](./01_ARCHITECTURE.md)
Visão completa da arquitetura, incluindo:
- Diagrama de arquitetura end-to-end
- Stack tecnológica utilizada
- Fluxo de dados completo (frontend → backend → IA → storage)
- Padrões de design implementados
- Gerenciamento de estado (SWR + Zustand)
- Sistema de componentes UI

**Quando usar**: Comece por aqui para entender como o sistema funciona como um todo.

---

#### [02. Modelos de Dados](./02_DATA_MODELS.md)
Schemas completos de banco de dados e tipos TypeScript:
- Schemas PostgreSQL (tabelas, indexes, foreign keys)
- Tipos TypeScript (interfaces e types)
- Relacionamentos entre entidades
- Exemplos de dados
- Validações e constraints

**Quando usar**: Consulte antes de modificar estruturas de dados ou adicionar novos campos.

---

#### [03. Referência de APIs](./03_API_REFERENCE.md)
Documentação completa de todos os endpoints:
- Endpoints REST (CRUD de campanhas)
- Payloads de request/response
- Códigos de status e erros
- Exemplos de chamadas (curl, fetch)
- Rate limiting e autenticação
- Endpoints de IA e background jobs

**Quando usar**: Referência essencial ao integrar APIs ou debugar problemas de backend.

---

### 🔧 Setup e Configuração

#### [04. Dependências e Infraestrutura](./04_DEPENDENCIES.md)
Lista completa de dependências e infraestrutura necessária:
- Pacotes NPM necessários
- Versões mínimas requeridas
- Infraestrutura backend (Neon, Redis, Vercel Blob)
- Variáveis de ambiente (`.env`)
- Chaves de API necessárias
- Configurações de build e deploy

**Quando usar**: Primeiro passo ao configurar um novo ambiente ou troubleshooting de dependências.

---

#### [05. Configuração do Banco de Dados](./05_DATABASE_SETUP.md)
Scripts SQL completos e configuração do PostgreSQL:
- Scripts de criação de tabelas
- Migrations completas
- Indexes e otimizações
- Row Level Security (RLS)
- Seeds de dados de exemplo
- Backup e restore

**Quando usar**: Ao configurar o banco de dados pela primeira vez ou fazer migrations.

---

### 📦 Guias de Clonagem

#### [06. Clonagem do Frontend](./06_FRONTEND_CLONE.md)
Guia passo a passo para clonar todos os componentes frontend:
- Lista completa dos 38+ arquivos críticos
- Estrutura de pastas detalhada
- Dependências entre componentes
- Adaptações necessárias
- Configuração de rotas
- Temas e estilos

**Quando usar**: Ao replicar o sistema de campanhas em um novo projeto React/Next.js.

---

#### [07. Clonagem do Backend](./07_BACKEND_CLONE.md)
Implementação completa do backend:
- Endpoints API (código completo)
- Integração com Google Generative AI
- Background jobs (BullMQ workers)
- Upload e storage de arquivos
- Validação e error handling
- Performance e caching

**Quando usar**: Ao implementar o backend em um novo projeto ou servidor.

---

### 🚀 Integração e Deploy

#### [08. Guia de Integração](./08_INTEGRATION_GUIDE.md)
Passo a passo completo de integração end-to-end:
- Ordem de implementação recomendada
- Checklist de validação
- Adaptações necessárias (Brand Profile, Auth)
- Casos de teste essenciais
- Troubleshooting comum
- Dicas de performance

**Quando usar**: Durante a fase de integração final de todos os componentes.

---

#### [09. Referência Rápida](./09_QUICK_REFERENCE.md)
Cheat sheet e guias visuais:
- Fluxogramas de processos principais
- Mapa de componentes UI
- Tabela de endpoints API
- Comandos úteis
- Troubleshooting rápido
- Glossário de termos

**Quando usar**: Consulta rápida durante desenvolvimento ou debug.

---

## 🎯 Casos de Uso Comuns

### Para Desenvolvedores Novos no Projeto
1. Leia [01_ARCHITECTURE.md](./01_ARCHITECTURE.md) para entender o sistema
2. Configure o ambiente com [04_DEPENDENCIES.md](./04_DEPENDENCIES.md)
3. Use [09_QUICK_REFERENCE.md](./09_QUICK_REFERENCE.md) como guia rápido

### Para Clonar o Sistema Completo
1. Comece com [04_DEPENDENCIES.md](./04_DEPENDENCIES.md) - setup inicial
2. Configure o banco com [05_DATABASE_SETUP.md](./05_DATABASE_SETUP.md)
3. Clone frontend seguindo [06_FRONTEND_CLONE.md](./06_FRONTEND_CLONE.md)
4. Implemente backend com [07_BACKEND_CLONE.md](./07_BACKEND_CLONE.md)
5. Integre tudo com [08_INTEGRATION_GUIDE.md](./08_INTEGRATION_GUIDE.md)

### Para Modificar Funcionalidades Existentes
1. Consulte [02_DATA_MODELS.md](./02_DATA_MODELS.md) para schemas
2. Veja [03_API_REFERENCE.md](./03_API_REFERENCE.md) para endpoints afetados
3. Use [01_ARCHITECTURE.md](./01_ARCHITECTURE.md) para entender impactos

### Para Debug e Troubleshooting
1. Comece com [09_QUICK_REFERENCE.md](./09_QUICK_REFERENCE.md) - troubleshooting rápido
2. Consulte [03_API_REFERENCE.md](./03_API_REFERENCE.md) para códigos de erro
3. Veja [08_INTEGRATION_GUIDE.md](./08_INTEGRATION_GUIDE.md) para problemas comuns

---

## 📊 Visão Geral do Sistema

### O Que o Sistema Faz

O Sistema de Campanhas é uma plataforma completa para geração automatizada de conteúdo de marketing usando IA. Principais funcionalidades:

- **Criação de Campanhas**: Upload de transcripts e geração automática com IA (Gemini)
- **Video Clips**: Scripts de vídeo com cenas, narração e imagens
- **Posts Sociais**: Conteúdo otimizado para Instagram, Facebook, Twitter, LinkedIn
- **Anúncios**: Criativos para Facebook Ads e Google Ads
- **Carrosséis Instagram**: Geração automática de carrosséis com múltiplos slides
- **Galeria**: Gerenciamento de todas as imagens geradas
- **Publicação**: Integração com redes sociais para publicação direta
- **Agendamento**: Sistema de calendário para agendar posts

### Stack Tecnológica Principal

**Frontend**:
- React 18+ com TypeScript
- Next.js 14+ (App Router)
- TailwindCSS + Radix UI
- SWR (data fetching & caching)
- Zustand (state management)

**Backend**:
- Next.js API Routes
- Neon PostgreSQL (database)
- Vercel Blob (file storage)
- BullMQ + Redis (background jobs)
- Google Generative AI (Gemini)

**DevOps**:
- Vercel (hosting)
- GitHub Actions (CI/CD - opcional)

---

## 🏆 Funcionalidades Principais

### 1. Criação de Campanhas com IA
- Upload de transcript (texto ou áudio)
- Seleção de tom de voz (formal, casual, técnico, etc.)
- Configuração de assets a gerar (clips, posts, ads, carrosséis)
- Geração automática com Gemini
- Preview em tempo real

### 2. Sistema de Abas Modular
- **Clips Tab**: Visualização e edição de video clips
- **Posts Tab**: Posts para múltiplas plataformas sociais
- **Ads Tab**: Criativos publicitários
- **Carousel Tab**: Carrosséis para Instagram

### 3. Geração de Imagens
- Background jobs para geração assíncrona
- Múltiplos modelos de IA (Gemini Imagen, etc.)
- Sistema de retry automático
- Notificações de progresso

### 4. Editor de Imagens Avançado
- Crop e resize
- Filtros e ajustes
- AI Edit (edição guiada por IA)
- Remoção de background
- Canvas de desenho para máscaras

### 5. Publicação e Agendamento
- Publicação direta no Instagram
- Agendamento via calendário
- Preview específico por plataforma
- Caption gerada com IA

---

## 📁 Estrutura de Arquivos do Projeto

```
projeto/
├── docs/                                    # 📘 Documentação (você está aqui)
│   ├── CAMPAIGN_SYSTEM.md                   # Este arquivo (índice)
│   ├── 01_ARCHITECTURE.md
│   ├── 02_DATA_MODELS.md
│   ├── 03_API_REFERENCE.md
│   ├── 04_DEPENDENCIES.md
│   ├── 05_DATABASE_SETUP.md
│   ├── 06_FRONTEND_CLONE.md
│   ├── 07_BACKEND_CLONE.md
│   ├── 08_INTEGRATION_GUIDE.md
│   └── 09_QUICK_REFERENCE.md
│
├── src/
│   ├── components/
│   │   ├── campaigns/                       # Componentes de campanha
│   │   ├── tabs/                            # Sistema de abas
│   │   ├── carousel/                        # Componentes de carrossel
│   │   ├── common/                          # Previews de plataformas
│   │   ├── gallery/                         # Galeria de imagens
│   │   └── image-preview/                   # Editor de imagens
│   │
│   ├── hooks/
│   │   └── useAppData.tsx                   # Hooks SWR principais
│   │
│   ├── stores/                              # Zustand stores
│   │   ├── jobsStore.ts
│   │   ├── clipsStore.ts
│   │   ├── carouselStore.ts
│   │   └── galleryStore.ts
│   │
│   ├── services/
│   │   └── api/                             # Cliente de APIs
│   │       ├── client.ts
│   │       ├── campaignsApi.ts
│   │       ├── aiApi.ts
│   │       ├── galleryApi.ts
│   │       └── jobsApi.ts
│   │
│   └── types.ts                             # Tipos TypeScript globais
│
├── server/
│   └── helpers/
│       └── campaign-prompts.mjs             # Prompts de IA
│
└── api/                                     # API Routes (Next.js)
    ├── db/
    │   ├── campaigns/
    │   └── init/
    ├── ai/
    │   └── campaign/
    └── generate/
        └── queue/
```

---

## ⚡ Quick Start

### Para Usar Esta Documentação

1. **Primeiro Acesso**: Leia [01_ARCHITECTURE.md](./01_ARCHITECTURE.md)
2. **Setup Novo Projeto**: Siga [04_DEPENDENCIES.md](./04_DEPENDENCIES.md) → [05_DATABASE_SETUP.md](./05_DATABASE_SETUP.md)
3. **Clonagem**: Use [06_FRONTEND_CLONE.md](./06_FRONTEND_CLONE.md) + [07_BACKEND_CLONE.md](./07_BACKEND_CLONE.md)
4. **Referência Rápida**: Marque [09_QUICK_REFERENCE.md](./09_QUICK_REFERENCE.md) nos favoritos

### Tempo Estimado para Clonagem Completa

| Fase | Tempo Estimado |
|------|----------------|
| Setup de infraestrutura (DB, Redis, etc.) | 1 dia |
| Clonagem de frontend (38+ arquivos) | 2-3 dias |
| Implementação de backend (APIs, jobs) | 2-3 dias |
| Integração com IA e testes | 1-2 dias |
| **Total** | **7-11 dias** |

*Estimativas para desenvolvedor experiente em React/Next.js/TypeScript*

---

## 🔒 Requisitos de Infraestrutura

### Obrigatório
- ✅ Node.js 18+
- ✅ PostgreSQL 14+ (Neon recomendado)
- ✅ Redis (para BullMQ)
- ✅ Vercel Blob ou S3 (storage)
- ✅ Google AI API key

### Opcional
- 📱 Instagram Graph API (para publicação)
- 📊 Analytics/Monitoring (Sentry, etc.)
- 🔐 Auth provider (Clerk, Auth0, etc.)

---

## 📞 Suporte e Contribuição

### Problemas Comuns
Consulte [08_INTEGRATION_GUIDE.md](./08_INTEGRATION_GUIDE.md) seção "Troubleshooting"

### Reportar Bugs
[Crie uma issue no GitHub do projeto]

### Contribuir
Contribuições são bem-vindas! Siga as guidelines em `CONTRIBUTING.md`

---

## 📝 Changelog e Versões

### Versão Atual: 1.0.0
- ✅ Documentação completa inicial
- ✅ Guias de clonagem
- ✅ Referências de API
- ✅ Scripts de banco de dados

### Próximas Versões
- 🔜 Diagramas visuais (Mermaid)
- 🔜 Vídeos tutoriais
- 🔜 Template de projeto starter
- 🔜 Docker Compose para dev local

---

## 📄 Licença

[Insira informações de licença do projeto]

---

## 🙏 Créditos

Desenvolvido por: [Seu Nome/Empresa]

Tecnologias utilizadas:
- Google Generative AI (Gemini)
- Vercel Platform
- Neon Serverless Postgres
- E mais de 30 bibliotecas open-source

---

**Última atualização**: 2026-01-18

**Versão da documentação**: 1.0.0

---

[⬆️ Voltar ao topo](#-sistema-de-campanhas---documentação-completa)
