# 09. Referência Rápida

> **Cheat sheet e guias visuais**

---

## Fluxogramas

### Criar Campanha
```
User → UploadForm → Gemini API → createCampaign() → Database
                                       ↓
                                  Queue Jobs → Workers → Generate Images → Update DB
```

### Gerar Imagem
```
User Click → Queue Job → BullMQ → Worker → Gemini → Upload Blob → Update DB → Notify UI
```

### Publicar Carrossel
```
User → Carousel Preview → Order Images → Upload to Instagram → Create Container → Publish
```

---

## Comandos Úteis

### Desenvolvimento
```bash
# Iniciar dev server
npm run dev

# Build para produção
npm run build

# Typecheck
npm run typecheck

# Lint
npm run lint
```

### Database
```bash
# Conectar ao banco
psql $DATABASE_URL

# Criar tabelas
psql $DATABASE_URL < create_all_tables.sql

# Reset database
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql $DATABASE_URL < create_all_tables.sql
```

### Redis
```bash
# Iniciar Redis (Docker)
docker run -d -p 6379:6379 redis:7-alpine

# Ver jobs na fila
redis-cli
> KEYS bull:generation-queue:*
```

---

## Endpoints Principais

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/db/campaigns` | Listar campanhas |
| POST | `/db/campaigns` | Criar campanha |
| GET | `/db/campaigns?id=...&include_content=true` | Obter campanha completa |
| DELETE | `/db/campaigns?id=...` | Deletar campanha |
| POST | `/ai/campaign` | Gerar campanha com IA |
| POST | `/generate/queue` | Adicionar job à fila |
| GET | `/generate/status?jobId=...` | Status de job |

---

## Tipos Principais

```typescript
// Campanha
interface MarketingCampaign {
  id?: string;
  name?: string;
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
  carousels: CarouselScript[];
}

// Post
interface Post {
  id?: string;
  platform: "Instagram" | "LinkedIn" | "Twitter" | "Facebook";
  content: string;
  hashtags: string[];
  image_prompt: string;
  image_url?: string | null;
}

// Galeria
interface GalleryImage {
  id: string;
  src: string;
  prompt?: string;
  source: string;
  post_id?: string;
  campaign_id?: string;
}
```

---

## Hooks SWR

```typescript
// Dados iniciais
const data = useInitialData(userId, organizationId);

// Campanhas
const { campaigns, isLoading, addCampaign } = useCampaigns(userId);

// Galeria
const { images, loadMore } = useGalleryImages(userId);
```

---

## Stores Zustand

```typescript
// Jobs
const { jobs, addJob, pollGenerationJob } = useJobsStore();

// UI
const { showToast, openModal } = useUiStore();
```

---

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Erro de TypeScript | `npm run typecheck` |
| Database não conecta | Verificar `DATABASE_URL` |
| Redis erro | `docker ps` (verificar se está rodando) |
| Imagens não gerando | Verificar `GOOGLE_GENERATIVE_AI_API_KEY` |
| SWR não atualiza | `mutate()` para forçar refetch |
| Build falha | `rm -rf node_modules && npm install` |

---

## Variáveis de Ambiente

```env
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=vercel_blob_...
REDIS_URL=redis://...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

---

## Estrutura de Arquivos (38 críticos)

```
src/
├── types.ts
├── hooks/
│   └── useAppData.tsx
├── stores/
│   ├── jobsStore.ts
│   ├── clipsStore.ts
│   ├── carouselStore.ts
│   └── galleryStore.ts
├── services/
│   └── api/
│       ├── client.ts
│       ├── campaignsApi.ts
│       ├── aiApi.ts
│       ├── galleryApi.ts
│       └── jobsApi.ts
└── components/
    ├── campaigns/
    │   ├── CampaignsList.tsx
    │   ├── UploadForm.tsx
    │   └── GenerationOptionsModal.tsx
    ├── tabs/
    │   ├── ClipsTab.tsx
    │   ├── PostsTab.tsx
    │   ├── AdCreativesTab.tsx
    │   └── clips/
    │       └── ClipCard.tsx
    ├── carousel/
    │   ├── CarouselTab.tsx
    │   ├── CampaignCarouselCard.tsx
    │   ├── ClipCarouselCard.tsx
    │   ├── CarouselPreview.tsx
    │   └── services/
    │       ├── campaignCarouselGeneration.ts
    │       └── carouselClipGeneration.ts
    ├── common/
    │   ├── InstagramPostPreview.tsx
    │   ├── FacebookPostPreview.tsx
    │   ├── TwitterPostPreview.tsx
    │   ├── LinkedInPostPreview.tsx
    │   ├── FacebookAdPreview.tsx
    │   └── GoogleAdPreview.tsx
    ├── gallery/
    │   └── GalleryView.tsx
    ├── image-preview/
    │   └── ImagePreviewModal.tsx
    └── dashboard/
        └── Dashboard.tsx
```

---

## Links Úteis

- [01_ARCHITECTURE.md](./01_ARCHITECTURE.md) - Arquitetura completa
- [02_DATA_MODELS.md](./02_DATA_MODELS.md) - Schemas e tipos
- [03_API_REFERENCE.md](./03_API_REFERENCE.md) - Referência de APIs
- [06_FRONTEND_CLONE.md](./06_FRONTEND_CLONE.md) - Clonagem frontend
- [07_BACKEND_CLONE.md](./07_BACKEND_CLONE.md) - Clonagem backend
- [08_INTEGRATION_GUIDE.md](./08_INTEGRATION_GUIDE.md) - Guia de integração

---

**Última atualização**: 2026-01-18
