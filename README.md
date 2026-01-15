# DirectorAi: Poker Marketing Agency

DirectorAi é um kit de crescimento com IA projetado para criadores, com foco em agências de marketing de poker. A aplicação ajuda a reaproveitar conteúdo, como transcrições de vídeos ou posts, transformando-o automaticamente em campanhas de marketing completas, incluindo clipes de vídeo, posts para redes sociais e criativos de anúncio.

## ✨ Funcionalidades Principais

- **Gerador de Campanhas:** Transforma uma simples transcrição de texto e uma imagem de referência opcional em uma campanha de marketing multiplataforma.
- **Gerador de Flyers de Torneios:** Importa planilhas de torneios de poker (.xlsx) e gera flyers promocionais individuais ou resumos diários, com alta customização.
- **Perfil de Marca Dinâmico:** Configura a identidade visual da sua marca (logo, cores, tom de voz) para que toda a geração de conteúdo da IA seja consistente.
- **Suporte a Múltiplos Modelos de IA:** Permite escolher entre diferentes modelos de IA para geração de imagem (Google Gemini e Bytedance Seedream) para obter estilos visuais variados.
- **Edição de Imagem Avançada:** Oferece uma interface para editar imagens geradas usando prompts de texto, máscaras de edição e imagens de referência.
- **Galeria de Mídia:** Armazena todas as imagens geradas, permitindo fácil acesso, reutilização e edição.
- **Assistente de IA:** Um chatbot integrado que entende o contexto da aplicação, permitindo executar ações como criar logos, editar imagens da galeria e consultar informações de torneios.

Para mais detalhes técnicos e guias de uso, consulte o diretório [docs/](./docs/), incluindo:
- [Documentação Técnica Principal](docs/DOCUMENTATION.md)
- [Documentação dos Modelos de IA](docs/MODEL_DOCUMENTATION.md)
- [Especificação de Refatoração](docs/REFACTOR_SPEC.md)

## 🚀 Arquitetura e Tecnologias

A aplicação é um Single Page Application (SPA) construído com as seguintes tecnologias:

- **Frontend:**
  - **React:** Biblioteca principal para a construção da interface de usuário.
  - **TypeScript:** Para tipagem estática e um desenvolvimento mais robusto.
  - **Tailwind CSS:** Para estilização rápida e consistente.

- **Serviços de IA e Backend:**
  - **Google Gemini API (`@google/genai`):**
    - `gemini-2.5-flash`: Utilizado para tarefas de texto, como a geração de campanhas e a lógica do assistente.
    - `imagen-4.0-generate-001`: Modelo principal para geração de imagens (text-to-image).
    - `gemini-2.5-flash-image-preview`: Modelo multimodal para edição avançada de imagens, variações de marca e geração de flyers com inputs visuais.
    - `veo-2.0-generate-001`: Utilizado para a geração de vídeos a partir de roteiros.
  - **Fal.ai API:**
    - `bytedance/seedream/v4`: Utilizado como um modelo alternativo para geração de imagens (text-to-image), oferecendo um estilo visual diferente.

## 📁 Estrutura de Arquivos

```
/
├── docs/                 # Documentação do projeto
│   ├── DOCUMENTATION.md    # Documentação técnica detalhada
│   ├── MODEL_DOCUMENTATION.md # Docs dos modelos de IA
│   └── ...
├── src/                  # Código fonte da aplicação
│   ├── components/       # Componentes React
│   │   ├── dashboard/    # Componentes da dashboard
│   │   ├── flyer/        # Gerador de flyers
│   │   └── ...
│   ├── services/         # Serviços (API clients, lógica de IA)
│   ├── types.ts          # Definições de tipos
│   ├── App.tsx           # Componente raiz
│   └── ...
├── server/               # Backend API
├── db/                   # Migrações de banco de dados
├── public/               # Ativos estáticos
├── index.html            # Ponto de entrada HTML
└── vite.config.ts        # Configuração do Vite
```

## 🏁 Como Começar

Para rodar esta aplicação, o ambiente de execução precisa ter a seguinte variável de ambiente configurada:

- `API_KEY`: Sua chave de API do Google AI Studio para acessar os modelos Gemini.

A chave da API da Fal.ai para o modelo Bytedance está atualmente hardcoded em `src/services/geminiService.ts`, mas idealmente também seria gerenciada via variáveis de ambiente.

A aplicação utiliza um `importmap` em `index.html` para carregar as dependências (React, @google/genai, etc.) diretamente de um CDN, simplificando o processo de build.

### Dev com Bun

```sh
bun install
bun run dev
```

### Migrar imagens base64 da galeria

Se o banco estiver com imagens base64 (data URLs) em `gallery_images.src_url`,
isso gera transferencia enorme. Use o script abaixo para mover para Vercel Blob:

```sh
DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... node db/migrate-gallery-base64-to-blob.mjs
```
