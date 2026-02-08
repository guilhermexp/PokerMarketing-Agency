# 06. Guia de Clonagem do Frontend

> **Passo a passo completo para clonar todos os componentes frontend**

---

## Estrutura de Pastas

Crie a seguinte estrutura no seu projeto:

```
src/
├── components/
│   ├── campaigns/
│   ├── tabs/
│   ├── carousel/
│   ├── common/
│   ├── gallery/
│   ├── image-preview/
│   └── dashboard/
├── hooks/
├── stores/
├── services/
│   └── api/
├── contexts/
└── types.ts
```

---

## Arquivos a Copiar (38 críticos)

### Grupo 1: Tipos e Configuração (3 arquivos)

```
src/types.ts                                    # Tipos principais
src/config/ai-models.ts                         # Modelos de IA (se existir)
```

### Grupo 2: APIs e Serviços (7 arquivos)

```
src/services/api/client.ts                      # HTTP client base
src/services/api/campaignsApi.ts                # CRUD de campanhas
src/services/api/aiApi.ts                       # Integração com IA
src/services/api/galleryApi.ts                  # API de galeria
src/services/api/jobsApi.ts                     # Background jobs
src/services/api/index.ts                       # Exports
src/services/geminiService.ts                   # Serviço Gemini
```

### Grupo 3: State Management (5 arquivos)

```
src/hooks/useAppData.tsx                        # Hooks SWR principais
src/stores/jobsStore.ts                         # Jobs (Zustand)
src/stores/clipsStore.ts                        # Clips (opcional)
src/stores/carouselStore.ts                     # Carousels (opcional)
src/stores/galleryStore.ts                      # Gallery (opcional)
```

### Grupo 4: Componentes de Campanha (4 arquivos)

```
src/components/campaigns/CampaignsList.tsx      # Listagem
src/components/campaigns/UploadForm.tsx         # Criação
src/components/campaigns/GenerationOptionsModal.tsx # Config
src/components/dashboard/Dashboard.tsx          # Container principal
```

### Grupo 5: Sistema de Abas (4 arquivos)

```
src/components/tabs/ClipsTab.tsx                # Aba de clips
src/components/tabs/PostsTab.tsx                # Aba de posts
src/components/tabs/AdCreativesTab.tsx          # Aba de ads
src/components/carousel/CarouselTab.tsx         # Aba de carrosséis
```

### Grupo 6: Componentes de Carrossel (8 arquivos)

```
src/components/carousel/CampaignCarouselCard.tsx    # Card de campanha
src/components/carousel/ClipCarouselCard.tsx        # Card de clip
src/components/carousel/CarouselPreview.tsx         # Preview interativo
src/components/carousel/services/campaignCarouselGeneration.ts
src/components/carousel/services/carouselClipGeneration.ts
src/components/carousel/services/carouselApi.ts
src/components/carousel/services/carouselCaption.ts
src/components/carousel/utils.ts
```

### Grupo 7: Componentes de Clips (3 arquivos)

```
src/components/tabs/clips/ClipCard.tsx          # Card individual
src/components/tabs/clips/useClipsTab.ts        # Hook
src/components/tabs/clips/utils.ts              # Utilitários
```

### Grupo 8: Preview de Plataformas (6 arquivos)

```
src/components/common/InstagramPostPreview.tsx
src/components/common/FacebookPostPreview.tsx
src/components/common/TwitterPostPreview.tsx
src/components/common/LinkedInPostPreview.tsx
src/components/common/FacebookAdPreview.tsx
src/components/common/GoogleAdPreview.tsx
```

### Grupo 9: Galeria e Editor (2 arquivos)

```
src/components/gallery/GalleryView.tsx          # Galeria
src/components/image-preview/ImagePreviewModal.tsx # Editor
```

---

## Ordem de Implementação

### Fase 1: Base (Dia 1)
1. Copiar `src/types.ts`
2. Copiar APIs (`src/services/api/*`)
3. Copiar hooks (`src/hooks/useAppData.tsx`)
4. Copiar stores (`src/stores/*`)

### Fase 2: Componentes Core (Dia 2)
5. Copiar `Dashboard.tsx`
6. Copiar `CampaignsList.tsx`
7. Copiar `UploadForm.tsx`
8. Copiar `GenerationOptionsModal.tsx`

### Fase 3: Abas (Dia 2-3)
9. Copiar `ClipsTab.tsx` + `ClipCard.tsx`
10. Copiar `PostsTab.tsx` + previews de plataforma
11. Copiar `AdCreativesTab.tsx`
12. Copiar `CarouselTab.tsx` + componentes relacionados

### Fase 4: Finalização (Dia 3)
13. Copiar `GalleryView.tsx`
14. Copiar `ImagePreviewModal.tsx`
15. Testar integração completa

---

## Adaptações Necessárias

### 1. BrandProfile

Se o novo projeto não tem BrandProfile:

```typescript
// Criar contexto simples
const defaultBrandProfile: BrandProfile = {
  name: "My Brand",
  toneOfVoice: "Profissional",
  // ...
};
```

### 2. Auth Context

Adaptar para seu sistema de autenticação:

```typescript
// Se usar Clerk
const { userId } = useAuth();

// Se usar outro
const { user } = useYourAuth();
const userId = user?.id;
```

### 3. Rotas

Adaptar navegação para seu sistema de routing:

```typescript
// Se usar React Router
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();
navigate('/campaigns');

// Se usar Next.js
import { useRouter } from 'next/router';
const router = useRouter();
router.push('/campaigns');
```

---

## Checklist de Validação

### ✅ Base
- [ ] Tipos TypeScript sem erros
- [ ] APIs conectando com backend
- [ ] SWR hooks funcionando
- [ ] Zustand stores funcionando

### ✅ Componentes
- [ ] Dashboard renderiza
- [ ] CampaignsList mostra campanhas
- [ ] UploadForm cria campanhas
- [ ] Tabs renderizam corretamente

### ✅ Funcionalidades
- [ ] Criação de campanha funciona
- [ ] Listagem de campanhas funciona
- [ ] Geração de imagens funciona
- [ ] Carousels funcionam
- [ ] Galeria funciona

---

**Última atualização**: 2026-01-18
