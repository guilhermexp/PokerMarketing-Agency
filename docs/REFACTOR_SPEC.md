# Especificação de Refatoração - DirectorAi (Atualizada)

## 🎯 Objetivo

Quebrar componentes monolíticos em módulos menores, testáveis e maintíveis. Esta versão reflete a **estrutura real** do repositório.

## 📊 Escopo Atual (por diretório)

| Área | Diretório atual | Observações |
|------|------------------|-------------|
| Clips | `src/components/tabs` + `src/components/tabs/clips` | Refatoração concentrada em subpasta `tabs/clips` |
| Flyer | `src/components/flyer` + `src/hooks/flyer` + `src/services/flyer` | Hooks e serviços fora de `components` |
| Carousel | `src/components/carousel` | Estrutura bem modularizada |
| Image Preview | `src/components/image-preview` | Subcomponentes, hooks, services e types |
| API | `src/services/api` + `src/services/apiClient.ts` | Modular com compat layer |
| FFmpeg | `src/services/ffmpeg` + `src/services/ffmpegService.ts` | Módulos separados + re-export |
| Stores | `src/stores` | Zustand stores por domínio |

---

## 🔴 Componentes Críticos (Estrutura Atual)

### 1. Clips (tabs/clips)

**Objetivo atual:** Modularização por subpasta com lógica centralizada em `ClipCard` e `useClipsTab`.

#### Estrutura Atual:
```
src/components/tabs/
├── ClipsTab.tsx
└── clips/
    ├── ClipCard.tsx
    ├── ClipSettingsModal.tsx
    ├── useClipsTab.ts
    ├── utils.ts
    └── types.ts
```

#### Stores e Tipos:
```
src/stores/clipsStore.ts
```

---

### 2. Flyer

**Objetivo atual:** Separar UI, hooks e processamento (hooks e services fora de components).

#### Estrutura Atual:
```
src/components/flyer/
├── FlyerGenerator.tsx
├── FlyerThumbStrip.tsx
├── ManualEventModal.tsx
├── PeriodCard.tsx
├── PeriodCardRow.tsx
├── TournamentEventCard.tsx
├── useFlyerGenerator.ts
├── utils.ts
└── index.ts

src/hooks/flyer/
├── useFlyerGeneration.ts
└── useTournamentData.ts

src/services/flyer/
└── excelProcessor.ts

src/stores/flyerStore.ts
src/types/flyer.types.ts
```

---

### 3. Carousel

**Objetivo atual:** Componentizar por responsabilidade com hooks, services e tipos.

#### Estrutura Atual:
```
src/components/carousel/
├── CarouselTab.tsx
├── CarouselBuilder.tsx
├── CarouselSlide.tsx
├── CarouselSlideEditor.tsx
├── CarouselPreview.tsx
├── CarouselImageManager.tsx
├── CarouselReorder.tsx
├── CampaignCarouselCard.tsx
├── ClipCarouselCard.tsx
├── components/
│   └── CarouselToast.tsx
├── hooks/
│   ├── useCarouselState.ts
│   ├── useCarouselSlides.ts
│   ├── useCarouselExport.ts
│   └── index.ts
├── services/
│   ├── carouselApi.ts
│   ├── carouselCaption.ts
│   ├── carouselClipGeneration.ts
│   ├── carouselImageUpdate.ts
│   └── carouselPublish.ts
├── types/
│   └── carousel.types.ts
└── utils.ts

src/stores/carouselStore.ts
```

---

### 4. Image Preview

**Objetivo atual:** Separar visualização, edição, export e lógica em hooks/services.

#### Estrutura Atual:
```
src/components/image-preview/
├── ImagePreviewModal.tsx
├── ImageViewer.tsx
├── ImageEditor.tsx
├── ImageExport.tsx
├── ImagePreviewCanvas.tsx
├── ImagePreviewSidebar.tsx
├── ImagePreviewHeader.tsx
├── ImagePreviewFooter.tsx
├── ImagePreviewCompare.tsx
├── ImagePreviewVideoPlayer.tsx
├── ImagePreviewMaskCanvas.tsx
├── ImagePreviewMobileActions.tsx
├── ImagePreviewLoadingOverlay.tsx
├── ErrorBanner.tsx
├── AiEditSection.tsx
├── CropAndFilterSection.tsx
├── ResizeWithProtectionSection.tsx
├── MinimalImageUploader.tsx
├── PreviewReadyNote.tsx
├── VideoMetaSection.tsx
├── hooks/
│   ├── useAiEdit.ts
│   ├── useImageCanvas.ts
│   ├── useImageCrop.ts
│   ├── useImageFilters.ts
│   ├── useImageResize.ts
│   ├── useProtectionCanvas.ts
│   ├── useTextDetection.ts
│   └── useVideoPlayer.ts
├── services/
│   ├── imageEditApi.ts
│   ├── imageProcessor.ts
│   └── index.ts
├── types/
│   └── index.ts
├── types.ts
└── uiTypes.ts

src/stores/imagePreviewStore.ts
```

Compat:
```
src/components/common/ImagePreviewModal.tsx
```

---

### 5. services/api + apiClient compat

**Objetivo atual:** API modular por domínio com compat layer.

#### Estrutura Atual:
```
src/services/api/
├── index.ts
├── client.ts
├── aiApi.ts
├── dbApi.ts
├── uploadApi.ts
├── adminApi.ts
├── rubeApi.ts
├── schedulerApi.ts
├── galleryApi.ts
├── flyerApi.ts
├── campaignsApi.ts
├── jobsApi.ts
├── tournamentApi.ts
└── types/
    ├── index.ts
    ├── aiTypes.ts
    ├── dbTypes.ts
    ├── uploadTypes.ts
    └── commonTypes.ts

src/services/apiClient.ts
```

---

### 6. ffmpegService.ts

**Objetivo atual:** Serviços separados + re-export no entrypoint.

#### Estrutura Atual:
```
src/services/ffmpeg/
├── index.ts
├── ffmpegCore.ts
├── videoEncoder.ts
├── videoTranscoder.ts
├── videoTrimmer.ts
├── audioExtractor.ts
├── thumbnailGenerator.ts
├── subtitleBurner.ts
├── watermarkApplier.ts
├── utils.ts
├── hooks/
│   └── useFFmpeg.ts
└── types/
    └── ffmpeg.types.ts

src/services/ffmpegService.ts
```

---

## 🗃️ Estratégia de Estado

**Padrão atual:** Zustand com stores por domínio em `src/stores`.

```
src/stores/
├── clipsStore.ts
├── flyerStore.ts
├── carouselStore.ts
├── galleryStore.ts
├── editorStore.ts
├── imagePreviewStore.ts
├── jobsStore.ts
├── uiStore.ts
└── index.ts
```

---

## 🔄 Estratégia de Migração (Atualizada)

1. **Compat entries preservadas**:
   - `src/components/tabs/CarrosselTab.tsx` (re-export)
   - `src/components/common/ImagePreviewModal.tsx` (re-export)
2. **Estrutura feature-based em `src/components/*`**.
3. **Hooks e serviços desmembrados fora dos componentes** onde necessário (ex: `src/hooks/flyer`).

---

## ✅ Status Atual (referência do repo)

| Área | Status | Observações |
|------|--------|-------------|
| clips | Parcial | `ClipCard` ainda concentra muita lógica |
| flyer | Parcial | `FlyerGenerator` ainda grande |
| carousel | Quase completo | Modularizado, mas `CarouselTab` ainda grande |
| image-preview | Quase completo | `ImagePreviewModal` ainda moderado |
| api | Completo | Modular + compat layer |
| ffmpeg | Completo | Modular + re-export |
| stores | Completo | Stores presentes |

---

## 📊 Métricas de Sucesso (Atualizadas)

| Arquivo | Linhas reais | Status |
|---------|--------------|--------|
| `src/components/tabs/ClipsTab.tsx` | 142 | ✅ Dentro do limite |
| `src/components/tabs/clips/ClipCard.tsx` | 5545 | ⚠️ Alto |
| `src/components/flyer/FlyerGenerator.tsx` | 1394 | ⚠️ Alto |
| `src/components/carousel/CarouselTab.tsx` | 590 | ⚠️ Alto |
| `src/components/image-preview/ImagePreviewModal.tsx` | 306 | ⚠️ Moderado |
| `src/services/ffmpegService.ts` | 5 | ✅ Re-export |
| `src/services/apiClient.ts` | 1487 | ⚠️ Compat grande |

---

## ✅ Critérios de Aceitação Final (mantidos)

- [ ] Testes passando
- [ ] TypeScript sem erros
- [ ] Lint sem warnings
- [ ] Funcionalidades mantidas
- [ ] Performance igual ou melhor
- [ ] Nenhum arquivo > 500 linhas
- [ ] Compat removido quando seguro
- [ ] Documentação atualizada

---

## 📌 Próximos Passos Sugeridos

1. **Quebrar `ClipCard.tsx` em subcomponentes** (UI + editor + preview + actions).
2. **Separar `FlyerGenerator.tsx`** em formulário/preview/import.
3. **Reduzir `CarouselTab.tsx`** movendo seções para subcomponentes.
4. **Refinar compat layers** (`apiClient.ts`, `ImagePreviewModal` compat) quando seguro.
