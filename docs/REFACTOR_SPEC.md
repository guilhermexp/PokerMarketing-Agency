# Especificação de Refatoração - DirectorAi

## 🎯 Objetivo

Quebrar componentes monolíticos (250K+ linhas) em módulos menores, testáveis e maintíveis, seguindo uma estratégia de migração gradual com rollback seguro.

## 📊 Escopo Total

| Arquivo | Linhas | Prioridade |
|---------|--------|------------|
| ClipsTab.tsx | 249,930 | 🔴 Crítica |
| FlyerGenerator.tsx | 139,319 | 🔴 Crítica |
| CarrosselTab.tsx | 66,608 | 🟡 Alta |
| ImagePreviewModal.tsx | 58,305 | 🟡 Alta |
| services/api (+ apiClient compat) | — | 🔴 Crítica |
| ffmpegService.ts | 32,608 | 🟡 Alta |
| **Total** | **584,869** | - |

---

## 🔴 Componentes Críticos para Refatoração

### 1. ClipsTab.tsx (249,930 linhas)

**Problema:** Monólito que gerencia toda funcionalidade de clipes
**Meta:** Dividir em 10-12 componentes especializados

#### Estrutura Proposta:
```
components/clips/
├── ClipsTab.tsx              # Container principal (< 300 linhas)
├── ClipsList.tsx             # Lista de clipes com virtualização
├── ClipsListItem.tsx         # Item individual da lista
├── ClipsEditor.tsx           # Editor de clipes
├── ClipsEditorToolbar.tsx    # Toolbar do editor
├── ClipsPreview.tsx          # Preview e player
├── ClipsUpload.tsx           # Upload e processamento
├── ClipsFilters.tsx          # Filtros e busca
├── ClipsGenerationModal.tsx  # Modal de geração com IA
├── hooks/
│   ├── useClipsState.ts      # Estado global dos clipes
│   ├── useClipsUpload.ts     # Lógica de upload
│   ├── useClipsEditor.ts     # Lógica de edição
│   ├── useClipsGeneration.ts # Lógica de geração IA
│   └── useClipsFilters.ts    # Lógica de filtros
├── services/
│   ├── clipsApi.ts           # API calls específicas
│   └── clipsProcessor.ts     # Processamento de vídeo
└── types/
    └── clips.types.ts        # Tipos específicos de clips
```

---

### 2. FlyerGenerator.tsx (139,319 linhas)

**Problema:** Gerador de flyers com lógica complexa de templates e Excel
**Meta:** Separar UI, lógica e processamento

#### Estrutura Proposta:
```
components/flyer/
├── FlyerGenerator.tsx        # Container (< 250 linhas)
├── FlyerForm.tsx             # Formulário de configuração
├── FlyerFormFields.tsx       # Campos do formulário
├── FlyerPreview.tsx          # Preview do flyer
├── FlyerPreviewCanvas.tsx    # Canvas de renderização
├── FlyerTemplates.tsx        # Seleção de templates
├── FlyerTemplateCard.tsx     # Card de template individual
├── TournamentImport.tsx      # Import de planilhas
├── TournamentTable.tsx       # Tabela de torneios
├── hooks/
│   ├── useFlyerGeneration.ts # Lógica de geração
│   ├── useFlyerTemplates.ts  # Gerenciamento de templates
│   ├── useTournamentData.ts  # Dados de torneios
│   └── useFlyerExport.ts     # Exportação de flyers
├── services/
│   ├── flyerApi.ts           # API calls
│   ├── excelProcessor.ts     # Processamento de Excel
│   └── flyerRenderer.ts      # Renderização de flyers
└── types/
    └── flyer.types.ts
```

---

### 3. CarrosselTab.tsx (66,608 linhas)

**Problema:** Gerenciamento complexo de carrosséis Instagram
**Meta:** Componentizar por funcionalidade

#### Estrutura Proposta:
```
components/carousel/
├── CarouselTab.tsx           # Container (< 200 linhas)
├── CarouselBuilder.tsx       # Construtor de carrossel
├── CarouselSlide.tsx         # Slide individual
├── CarouselSlideEditor.tsx   # Editor de slide
├── CarouselPreview.tsx       # Preview completo
├── CarouselImageManager.tsx  # Gerenciamento de imagens
├── CarouselReorder.tsx       # Reordenação de slides
├── hooks/
│   ├── useCarouselState.ts   # Estado do carrossel
│   ├── useCarouselSlides.ts  # Gerenciamento de slides
│   └── useCarouselExport.ts  # Exportação
├── services/
│   └── carouselApi.ts
└── types/
    └── carousel.types.ts
```

---

### 4. ImagePreviewModal.tsx (58,305 linhas)

**Problema:** Modal com múltiplas funcionalidades de edição de imagem
**Meta:** Separar visualização, edição e exportação

#### Estrutura Proposta:
```
components/image-preview/
├── ImagePreviewModal.tsx     # Container modal (< 200 linhas)
├── ImageViewer.tsx           # Visualização básica com zoom/pan
├── ImageEditor.tsx           # Container de edição
├── ImageEditorToolbar.tsx    # Toolbar de ferramentas
├── ImageCropper.tsx          # Recorte e resize
├── ImageFilters.tsx          # Filtros e ajustes
├── ImageAiEnhance.tsx        # Enhancement com IA
├── ImageExport.tsx           # Opções de export
├── ImageCompare.tsx          # Comparação antes/depois
├── hooks/
│   ├── useImageEditor.ts     # Estado de edição
│   ├── useImageCrop.ts       # Lógica de crop
│   ├── useImageFilters.ts    # Aplicação de filtros
│   ├── useImageAi.ts         # Integração com IA
│   └── useImageExport.ts     # Lógica de exportação
├── services/
│   ├── imageEditApi.ts       # API calls de edição
│   └── imageProcessor.ts     # Processamento local
└── types/
    └── imageEditor.types.ts
```

---

### 5. services/api (modular) + services/apiClient.ts (compat)

**Problema:** Cliente API monolítico com todas as chamadas
**Meta:** Separar por domínio mantendo interface compatível

#### Estrutura Proposta:
```
services/api/
├── index.ts                  # Re-exports para compatibilidade (< 100 linhas)
├── client.ts                 # Configuração base do fetch
├── aiApi.ts                  # Chamadas para IA (generate, edit, etc)
├── dbApi.ts                  # Operações de banco (CRUD)
├── uploadApi.ts              # Upload de arquivos
├── adminApi.ts               # Funcionalidades admin
├── rubeApi.ts                # Instagram/Rube publishing
├── schedulerApi.ts           # Agendamentos
├── galleryApi.ts             # Galeria de imagens
└── types/
    ├── index.ts              # Re-exports de tipos
    ├── aiTypes.ts            # Tipos de IA
    ├── dbTypes.ts            # Tipos de banco
    ├── uploadTypes.ts        # Tipos de upload
    └── commonTypes.ts        # Tipos compartilhados
```

---

### 6. ffmpegService.ts (32,608 linhas)

**Problema:** Serviço monolítico de processamento de vídeo
**Meta:** Separar por funcionalidade de processamento

#### Estrutura Proposta:
```
services/ffmpeg/
├── index.ts                  # Re-exports e inicialização
├── ffmpegCore.ts             # Core: load, init, cleanup
├── videoEncoder.ts           # Encoding de vídeo
├── videoTranscoder.ts        # Transcoding entre formatos
├── videoTrimmer.ts           # Corte e trim de vídeos
├── audioExtractor.ts         # Extração e processamento de áudio
├── thumbnailGenerator.ts     # Geração de thumbnails
├── subtitleBurner.ts         # Queima de legendas
├── watermarkApplier.ts       # Aplicação de marca d'água
├── hooks/
│   └── useFFmpeg.ts          # Hook para uso nos componentes
└── types/
    └── ffmpeg.types.ts
```

---

## 🗃️ Estratégia de Estado

### Biblioteca Recomendada: Zustand

**Motivo:** Menor boilerplate que Redux, melhor performance que Context API para estado frequentemente atualizado.

#### Instalação:
```bash
npm install zustand
```

#### Exemplo de Store (Clips):
```typescript
// stores/clipsStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Clip, ClipFilter } from '@/types';

interface ClipsState {
  // Estado
  clips: Clip[];
  selectedClip: Clip | null;
  filters: ClipFilter;
  isLoading: boolean;
  error: string | null;

  // Ações
  setClips: (clips: Clip[]) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  deleteClip: (id: string) => void;
  selectClip: (id: string | null) => void;
  setFilters: (filters: Partial<ClipFilter>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useClipsStore = create<ClipsState>()(
  devtools(
    persist(
      (set, get) => ({
        // Estado inicial
        clips: [],
        selectedClip: null,
        filters: { search: '', status: 'all' },
        isLoading: false,
        error: null,

        // Ações
        setClips: (clips) => set({ clips }),

        addClip: (clip) => set((state) => ({
          clips: [...state.clips, clip]
        })),

        updateClip: (id, updates) => set((state) => ({
          clips: state.clips.map(c =>
            c.id === id ? { ...c, ...updates } : c
          ),
          selectedClip: state.selectedClip?.id === id
            ? { ...state.selectedClip, ...updates }
            : state.selectedClip
        })),

        deleteClip: (id) => set((state) => ({
          clips: state.clips.filter(c => c.id !== id),
          selectedClip: state.selectedClip?.id === id
            ? null
            : state.selectedClip
        })),

        selectClip: (id) => set((state) => ({
          selectedClip: id
            ? state.clips.find(c => c.id === id) || null
            : null
        })),

        setFilters: (filters) => set((state) => ({
          filters: { ...state.filters, ...filters }
        })),

        setLoading: (isLoading) => set({ isLoading }),
        setError: (error) => set({ error }),
      }),
      { name: 'clips-store' }
    ),
    { name: 'ClipsStore' }
  )
);
```

#### Stores a Criar:
```
stores/
├── clipsStore.ts         # Estado de clips
├── flyerStore.ts         # Estado de flyers
├── carouselStore.ts      # Estado de carrosséis
├── galleryStore.ts       # Estado da galeria
├── editorStore.ts        # Estado do editor de imagem
├── uiStore.ts            # Estado de UI (modals, sidebars)
└── index.ts              # Re-exports
```

---

## 🔄 Estratégia de Migração

### Migração Paralela (concluída)

1. **Manter código antigo intacto** (renomear para `*Legacy`)
2. **Criar nova implementação** na estrutura proposta
3. **Validar com testes e build**
4. **Remover código legacy** após validação

Obs: as feature flags foram removidas após o rollout completo.

---

## 📋 Plano de Execução

### Fase 1: Preparação (1 semana)
1. **Configurar infraestrutura de testes**
   - Instalar Vitest + React Testing Library
   - Configurar coverage reports
   - Setup CI/CD para testes

2. **Criar estrutura base**
   - Pastas conforme especificação
  - Feature flags (removidas após rollout)
   - Stores Zustand básicas

3. **Extrair tipos compartilhados**
   - Mover tipos de `types.ts` para módulos específicos
   - Criar barrel exports

### Fase 2: services/api (1 semana)
1. **Dividir por domínio** (ai, db, upload, admin, rube, scheduler, gallery)
2. **Criar client.ts** com configuração base
3. **Manter `index.ts`** com re-exports para compatibilidade
4. **Testar todas as rotas** antes de remover código antigo

### Fase 3: ffmpegService.ts (0.5 semana)
1. **Separar por funcionalidade**
2. **Criar hook `useFFmpeg`** para componentes
3. **Manter singleton** do ffmpeg core

### Fase 4: ImagePreviewModal.tsx (1 semana)
1. **Extrair ImageViewer** (zoom, pan, navegação)
2. **Extrair ImageEditor** (crop, filters, AI)
3. **Extrair ImageExport** (download, formatos)
4. **Criar stores** para estado de edição

> ⚠️ **Importante:** Este componente é usado por ClipsTab, FlyerGenerator e CarouselTab. Refatorar ANTES dos demais.

### Fase 5: ClipsTab.tsx (2 semanas)
1. **Semana 1:**
   - Extrair hooks de estado (`useClipsState`, `useClipsUpload`)
   - Extrair `ClipsList` e `ClipsListItem`
   - Extrair `ClipsFilters`

2. **Semana 2:**
   - Extrair `ClipsEditor` e toolbar
   - Extrair `ClipsPreview`
   - Extrair `ClipsGenerationModal`
   - Integrar com stores Zustand

### Fase 6: FlyerGenerator.tsx (1.5 semanas)
1. **Separar FlyerForm** e campos
2. **Extrair TournamentImport** e processamento Excel
3. **Separar FlyerPreview** e canvas
4. **Extrair FlyerTemplates**

### Fase 7: CarrosselTab.tsx (1 semana)
1. **Separar CarouselBuilder** e slides
2. **Extrair CarouselPreview**
3. **Extrair CarouselImageManager**
4. **Extrair CarouselReorder** (drag and drop)

### Fase 8: Cleanup e Documentação (0.5 semana)
1. **Remover código legacy** (após validação em produção)
2. **Atualizar documentação**
3. **Atualizar README com nova estrutura**

---

## 🛠️ Padrões de Refatoração

### 1. Extração de Hooks

```typescript
// ❌ Antes: Lógica misturada no componente
const ClipsTab = () => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);

  const fetchClips = async () => {
    setLoading(true);
    try {
      const data = await api.getClips();
      setClips(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ... mais 1000 linhas de lógica
};

// ✅ Depois: Hook especializado
// hooks/useClipsData.ts
export const useClipsData = () => {
  const { clips, setClips, setLoading, setError } = useClipsStore();

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const data = await clipsApi.getAll();
      setClips(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [setClips, setLoading, setError]);

  const createClip = useCallback(async (input: CreateClipInput) => {
    // lógica isolada
  }, []);

  return { clips, fetchClips, createClip };
};

// Componente limpo
const ClipsTab = () => {
  const { clips, fetchClips } = useClipsData();

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  return <ClipsList clips={clips} />;
};
```

### 2. Separação de Serviços

```typescript
// ❌ Antes: API calls espalhadas
const uploadClip = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });
  // ... mais 50 linhas
};

// ✅ Depois: Serviço dedicado
// services/api/clipsApi.ts
import { client } from './client';
import type { Clip, CreateClipInput, UpdateClipInput } from './types';

export const clipsApi = {
  getAll: async (): Promise<Clip[]> => {
    return client.get('/api/db/clips');
  },

  getById: async (id: string): Promise<Clip> => {
    return client.get(`/api/db/clips/${id}`);
  },

  create: async (input: CreateClipInput): Promise<Clip> => {
    return client.post('/api/db/clips', input);
  },

  update: async (id: string, input: UpdateClipInput): Promise<Clip> => {
    return client.put(`/api/db/clips/${id}`, input);
  },

  delete: async (id: string): Promise<void> => {
    return client.delete(`/api/db/clips/${id}`);
  },

  upload: async (file: File, onProgress?: (p: number) => void): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    return client.upload('/api/upload', formData, { onProgress });
  },

  generateWithAi: async (input: GenerateClipInput): Promise<Clip> => {
    return client.post('/api/ai/generate-clip', input);
  },
};
```

### 3. Componentização por Responsabilidade

```typescript
// ❌ Antes: Componente monolítico
const ClipsTab = () => (
  <div className="clips-tab">
    {/* Filters - 200 linhas */}
    <div className="filters">
      <input type="text" />
      <select>...</select>
      {/* ... */}
    </div>

    {/* Lista - 500 linhas */}
    <div className="list">
      {clips.map(clip => (
        <div key={clip.id}>
          {/* ... muito JSX */}
        </div>
      ))}
    </div>

    {/* Editor - 800 linhas */}
    <div className="editor">
      {/* ... muito JSX */}
    </div>

    {/* Preview - 400 linhas */}
    <div className="preview">
      {/* ... muito JSX */}
    </div>
  </div>
);

// ✅ Depois: Componentes especializados
const ClipsTab = () => {
  const { selectedClip } = useClipsStore();

  return (
    <div className="clips-tab">
      <ClipsFilters />

      <div className="clips-content">
        <ClipsList />

        {selectedClip && (
          <>
            <ClipsEditor clip={selectedClip} />
            <ClipsPreview clip={selectedClip} />
          </>
        )}
      </div>
    </div>
  );
};
```

### 4. Container/Presentation Pattern

```typescript
// Container: Lógica e estado
// components/clips/ClipsListContainer.tsx
export const ClipsListContainer = () => {
  const { clips, isLoading } = useClipsStore();
  const { fetchClips } = useClipsData();
  const { selectClip } = useClipsActions();

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  if (isLoading) return <ClipsListSkeleton />;

  return <ClipsList clips={clips} onSelect={selectClip} />;
};

// Presentation: Apenas renderização
// components/clips/ClipsList.tsx
interface ClipsListProps {
  clips: Clip[];
  onSelect: (id: string) => void;
}

export const ClipsList = ({ clips, onSelect }: ClipsListProps) => (
  <ul className="clips-list">
    {clips.map(clip => (
      <ClipsListItem
        key={clip.id}
        clip={clip}
        onClick={() => onSelect(clip.id)}
      />
    ))}
  </ul>
);
```

---

## 🧪 Estratégia de Testes

### Setup (Vitest + React Testing Library)

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
```

### 1. Testes de Hooks

```typescript
// hooks/__tests__/useClipsData.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useClipsData } from '../useClipsData';
import { clipsApi } from '@/services/api/clipsApi';

vi.mock('@/services/api/clipsApi');

describe('useClipsData', () => {
  it('should fetch clips on mount', async () => {
    const mockClips = [{ id: '1', title: 'Test Clip' }];
    vi.mocked(clipsApi.getAll).mockResolvedValue(mockClips);

    const { result } = renderHook(() => useClipsData());

    await waitFor(() => {
      expect(result.current.clips).toEqual(mockClips);
    });
  });

  it('should handle fetch error', async () => {
    vi.mocked(clipsApi.getAll).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useClipsData());

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });
  });
});
```

### 2. Testes de Serviços

```typescript
// services/api/__tests__/clipsApi.test.ts
import { clipsApi } from '../clipsApi';

describe('clipsApi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('should fetch all clips', async () => {
    const mockClips = [{ id: '1', title: 'Test' }];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockClips),
    } as Response);

    const result = await clipsApi.getAll();

    expect(result).toEqual(mockClips);
    expect(fetch).toHaveBeenCalledWith('/api/db/clips', expect.any(Object));
  });

  it('should upload file with progress', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: 'https://blob.vercel.com/file.mp4' }),
    } as Response);

    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
    const onProgress = vi.fn();

    const result = await clipsApi.upload(file, onProgress);

    expect(result).toBe('https://blob.vercel.com/file.mp4');
  });
});
```

### 3. Testes de Componentes

```typescript
// components/clips/__tests__/ClipsList.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClipsList } from '../ClipsList';

describe('ClipsList', () => {
  const mockClips = [
    { id: '1', title: 'Clip 1', thumbnail: '/thumb1.jpg' },
    { id: '2', title: 'Clip 2', thumbnail: '/thumb2.jpg' },
  ];

  it('should render all clips', () => {
    render(<ClipsList clips={mockClips} onSelect={vi.fn()} />);

    expect(screen.getByText('Clip 1')).toBeInTheDocument();
    expect(screen.getByText('Clip 2')).toBeInTheDocument();
  });

  it('should call onSelect when clip is clicked', async () => {
    const onSelect = vi.fn();
    render(<ClipsList clips={mockClips} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('Clip 1'));

    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('should show empty state when no clips', () => {
    render(<ClipsList clips={[]} onSelect={vi.fn()} />);

    expect(screen.getByText(/nenhum clip/i)).toBeInTheDocument();
  });
});
```

### 4. Testes de Store (Zustand)

```typescript
// stores/__tests__/clipsStore.test.ts
import { useClipsStore } from '../clipsStore';

describe('clipsStore', () => {
  beforeEach(() => {
    useClipsStore.setState({
      clips: [],
      selectedClip: null,
      isLoading: false,
      error: null,
    });
  });

  it('should add clip', () => {
    const clip = { id: '1', title: 'Test' };

    useClipsStore.getState().addClip(clip);

    expect(useClipsStore.getState().clips).toContainEqual(clip);
  });

  it('should select clip', () => {
    const clip = { id: '1', title: 'Test' };
    useClipsStore.setState({ clips: [clip] });

    useClipsStore.getState().selectClip('1');

    expect(useClipsStore.getState().selectedClip).toEqual(clip);
  });

  it('should update clip', () => {
    const clip = { id: '1', title: 'Original' };
    useClipsStore.setState({ clips: [clip] });

    useClipsStore.getState().updateClip('1', { title: 'Updated' });

    expect(useClipsStore.getState().clips[0].title).toBe('Updated');
  });
});
```

---

## 🔙 Critérios de Rollback

### Quando Reverter Imediatamente:

| Critério | Threshold | Ação |
|----------|-----------|------|
| Taxa de erro JS | > 1% | Desabilitar flag |
| Performance (LCP) | > 4s (era 2.5s) | Desabilitar flag |
| Crash rate | > 0.5% | Rollback completo |
| Bugs críticos | Qualquer | Desabilitar flag |

### Como Reverter:

```bash
# 1. Rollback via deploy (imediato)
# .env.production
legacy removido; rollback via deploy/revert

# 2. Deploy com flag desabilitada
npm run build && npm run deploy

# 3. Se necessário, rollback de código
git revert <commit-hash>
git push origin main
```

### Monitoramento Pós-Deploy:

```typescript
// utils/monitoring.ts
export const trackFeatureMetrics = (feature: string) => {
  // Track performance
  const lcp = performance.getEntriesByType('largest-contentful-paint')[0];

  // Track errors
  window.onerror = (msg, url, line) => {
    console.error(`[${feature}] Error:`, { msg, url, line });
    // Send to analytics
  };

  // Track usage
  console.log(`[${feature}] Loaded at`, new Date().toISOString());
};
```

---

## ✅ Checklist de Refatoração (por componente)

### Pre-Refatoração:
- [ ] Mapear todas as dependências (imports/exports)
- [ ] Identificar estado compartilhado entre componentes
- [ ] Listar todos os side effects (useEffect, subscriptions)
- [ ] Documentar props e interfaces atuais
- [ ] Identificar chamadas de API
- [ ] Mapear eventos e callbacks
- [ ] Screenshot/gravação do comportamento atual

### Durante Refatoração:
- [ ] Criar estrutura de pastas
- [ ] Extrair tipos primeiro (types.ts)
- [ ] Criar store Zustand se necessário
- [ ] Extrair hooks de estado
- [ ] Extrair serviços/API calls
- [ ] Dividir UI em componentes menores
- [ ] Escrever testes para cada módulo novo
- [ ] Legacy removido apos validacao

### Testes:
- [ ] Testes unitários dos hooks (> 80% coverage)
- [ ] Testes unitários dos serviços (> 80% coverage)
- [ ] Testes de componentes (> 70% coverage)
- [ ] Testes de integração dos fluxos principais
- [ ] Teste manual em staging

### Pós-Refatoração:
- [ ] Todos os testes passando
- [ ] Lint sem erros
- [ ] TypeScript sem erros
- [ ] Performance igual ou melhor (medir LCP, FID)
- [ ] Code review aprovado
- [ ] Feature flag habilitada em staging
- [ ] Teste manual em staging aprovado
- [ ] Feature flag habilitada em produção (10% → 50% → 100%)
- [ ] Monitorar erros por 1 semana
- [ ] Código legacy removido
- [ ] Documentação atualizada

---

## 📊 Status da Refatoração (Atualizado: 2026-01-13)

### Progresso por Área:

| Área | Progresso | Observações |
|------|-----------|-------------|
| services/api | **95%** | Estrutura completa |
| services/ffmpeg | **85%** | Estrutura completa |
| stores | **80%** | Todos stores existem |
| components/clips | **85%** | ClipCard simplificado (286 linhas) |
| components/flyer | **85%** | Hooks e componentes extraídos |
| components/carousel | **85%** | Hooks melhorados |
| components/image-preview | **95%** | Serviços e tipos adicionados |
| hooks | **85%** | Hooks especializados criados |
| Testes | **30%** | 47 testes, mais necessários |

**STATUS GERAL: ~85% COMPLETO** 🎉

---

## 📊 Métricas de Sucesso

### Antes da Refatoração (valores originais reportados):

| Arquivo | Linhas |
|---------|--------|
| ClipsTab.tsx | 249,930 |
| FlyerGenerator.tsx | 139,319 |
| CarrosselTab.tsx | 66,608 |
| ImagePreviewModal.tsx | 58,305 |
| services/api (+ apiClient compat) | — |
| ffmpegService.ts | 32,608 |
| **Total** | **584,869** |

### Após Refatoração (valores reais):

| Arquivo | Linhas Reais | Status |
|---------|--------------|--------|
| ClipsTab.tsx | 4,053 | Em refatoração |
| FlyerGenerator.tsx | 1,731 | Em refatoração |
| CarrosselTab.tsx | 487 | ✅ Dentro do limite |
| CarouselPreview.tsx | 406 | ✅ Dentro do limite |
| ImagePreviewModal.tsx | 289 | ✅ Dentro do limite |
| ClipsGenerationModal.tsx | 185 | ✅ Dentro do limite |
| ClipCard.tsx | 286 | ✅ Simplificado (-94%) |
| ClipSettingsModal.tsx | 169 | ✅ Dentro do limite |
| ffmpegService.ts | 5 (re-export) | ✅ Completo |

### Metas Alcançadas:

| Métrica | Meta | Status |
|---------|------|--------|
| Maior arquivo | < 500 linhas | Parcial |
| Componentes principais | < 300 linhas | Parcial |
| Hooks | < 200 linhas cada | ✅ Alcançado |
| Serviços | < 400 linhas cada | ✅ Alcançado |
| Cobertura de testes | > 80% | 25% (em progresso) |
| Arquivos por feature | 8-15 arquivos | ✅ Alcançado |

### Build e Testes:

| KPI | Valor Atual |
|-----|-------------|
| Build time | ~4-5s |
| Testes passando | 47/47 |
| Arquivos modificados | ~25 |
| Arquivos criados | ~30 |

### KPIs de Qualidade:

| KPI | Antes | Meta |
|-----|-------|------|
| Build time | ~45s | < 30s |
| Hot reload | ~3s | < 1s |
| IDE responsiveness | Lento | Normal |
| Time to fix bug | ~2h | < 30min |
| Onboarding time | ~2 semanas | < 1 semana |

---

## 🚀 Benefícios Esperados

### Performance
- **Build time:** -30% (menos código para processar)
- **Hot reload:** -70% (arquivos menores)
- **IDE:** Responsivo (não trava mais)

### Manutenibilidade
- **Localização de bugs:** Mais fácil com componentes isolados
- **Testes:** Possível testar unidades pequenas
- **Code review:** PRs menores e focados

### Colaboração
- **Merge conflicts:** -80% (arquivos menores, separados)
- **Trabalho paralelo:** Múltiplos devs em features diferentes
- **Onboarding:** Curva de aprendizado menor

### Qualidade
- **Cobertura de testes:** De 0% para 80%+
- **Type safety:** Tipos mais específicos por domínio
- **Reutilização:** Componentes e hooks compartilháveis

---

## ⚠️ Riscos e Mitigações

### Risco 1: Quebrar funcionalidades existentes
**Probabilidade:** Alta
**Impacto:** Alto
**Mitigação:**
- Rollback rapido via deploy/revert
- Testes extensivos antes de merge
- Deploy gradual (10% → 50% → 100%)
- Monitoramento de erros em tempo real

### Risco 2: Overhead de coordenação entre componentes
**Probabilidade:** Média
**Impacto:** Médio
**Mitigação:**
- Zustand para estado compartilhado
- Props drilling apenas para 2-3 níveis
- Context API para configurações globais

### Risco 3: Tempo de desenvolvimento exceder estimativa
**Probabilidade:** Alta
**Impacto:** Médio
**Mitigação:**
- Buffer de 20% em cada fase
- Priorizar componentes mais críticos
- Aceitar "good enough" vs perfeição

### Risco 4: Regressões de performance
**Probabilidade:** Baixa
**Impacto:** Alto
**Mitigação:**
- Benchmark antes/depois de cada fase
- Lazy loading de componentes pesados
- Memoização onde necessário

---

## 📅 Timeline Total: 8 semanas

| Semana | Fase | Entregável |
|--------|------|------------|
| 1 | Preparação | Infraestrutura, tipos, stores base |
| 2 | services/api | API client modularizado |
| 2.5 | ffmpegService.ts | Serviço FFmpeg modularizado |
| 3 | ImagePreviewModal | Modal de imagem refatorado |
| 4-5 | ClipsTab | Tab de clips refatorada |
| 6-7 | FlyerGenerator | Gerador de flyers refatorado |
| 7.5-8 | CarrosselTab | Tab de carrossel refatorada |
| 8 | Cleanup | Remoção de código legacy, docs |

---

## ✅ Critérios de Aceitação Final

- [ ] Todos os testes passando (> 80% coverage)
- [ ] Zero erros de TypeScript
- [ ] Zero warnings de lint
- [ ] Todas as funcionalidades mantidas (smoke test)
- [ ] Performance igual ou melhor (LCP < 2.5s)
- [ ] Nenhum arquivo > 500 linhas
- [ ] Legacy removido (código legado deletado)
- [ ] Documentação atualizada
- [ ] Code review aprovado por 2+ desenvolvedores
- [ ] 1 semana em produção sem incidentes

---

## 📚 Referências

- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest](https://vitest.dev/)
- [Feature Flags Best Practices](https://martinfowler.com/articles/feature-toggles.html)
