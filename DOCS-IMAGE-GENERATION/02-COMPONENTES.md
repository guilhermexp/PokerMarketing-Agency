# 02 - COMPONENTES

## 📦 Visão Geral dos Componentes

Total: **~50 componentes React** organizados em 3 categorias principais:
- **Layout**: Estrutura da página (header, sidebars, workspace)
- **Config**: Controles de configuração (esquerda)
- **Feed**: Galeria e exibição de imagens (centro + direita)

---

## 🎯 COMPONENTES DE LAYOUT

### 1. **Layout** (Main Container)

**Arquivo**: `_layout/index.tsx`

**Responsabilidade**: Container principal com 3 painéis

```tsx
interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.container}>
      <Header />
      <div className={styles.main}>
        <Sidebar />           {/* Left: Config */}
        <div className={styles.content}>
          {children}          {/* Center: Workspace */}
        </div>
        <TopicSidebar />      {/* Right: Topics */}
      </div>
    </div>
  );
}
```

**Estilos**:
- Desktop: 3 colunas (250px + flex-1 + 280px)
- Mobile: Stack vertical com drawers

---

### 2. **Header**

**Arquivo**: `_layout/Header.tsx`

**Responsabilidade**: Top navigation bar

```tsx
export default function Header() {
  return (
    <header className={styles.header}>
      <Logo />
      <Nav />
      <UserMenu />
    </header>
  );
}
```

**Features**:
- Logo clicável (volta para home)
- Navegação breadcrumb
- User avatar + dropdown

---

### 3. **Sidebar** (Config Panel Container)

**Arquivo**: `_layout/Sidebar.tsx`

**Responsabilidade**: Left sidebar com ConfigPanel em portal

```tsx
export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <Portal target="#config-panel-portal">
        <ConfigPanel />
      </Portal>
    </aside>
  );
}
```

**Comportamento**:
- Desktop: Sempre visível
- Mobile: Drawer

---

### 4. **TopicSidebar**

**Arquivo**: `_layout/TopicSidebar.tsx`

**Responsabilidade**: Right sidebar com lista de topics

```tsx
export default function TopicSidebar() {
  return (
    <aside className={styles.topicSidebar}>
      <Topics />
    </aside>
  );
}
```

---

## ⚙️ COMPONENTES DE CONFIGURAÇÃO (ConfigPanel)

### 5. **ConfigPanel** (Main Config Container)

**Arquivo**: `_layout/ConfigPanel/index.tsx`

**Responsabilidade**: Renderiza controles dinamicamente baseado no modelo

```tsx
export default function ConfigPanel() {
  const { parametersSchema, model, provider } = useImageStore();

  return (
    <div className={styles.configPanel}>
      <ModelSelect />

      {/* Sempre visível */}
      <DimensionControlGroup />
      <ImageNum />

      {/* Condicionais baseados em schema */}
      {parametersSchema.supportedParams.includes('size') && <SizeSelect />}
      {parametersSchema.supportedParams.includes('seed') && <SeedNumberInput />}
      {parametersSchema.supportedParams.includes('steps') && <StepsSliderInput />}
      {parametersSchema.supportedParams.includes('cfg') && <CfgSliderInput />}
      {parametersSchema.supportedParams.includes('imageUrl') && <ImageUrl />}

      {/* ... outros controles */}
    </div>
  );
}
```

**Lógica**: Cada modelo tem um `parametersSchema` que define quais parâmetros suporta.

---

### 6. **ModelSelect**

**Arquivo**: `_layout/ConfigPanel/components/ModelSelect/index.tsx`

**Props**:
```typescript
interface ModelSelectProps {
  value: { provider: string; model: string };
  onChange: (provider: string, model: string) => void;
}
```

**Features**:
- Dropdown de 2 níveis (provider → model)
- Pesquisa por nome
- Ícones de provider
- Link para settings do provider

**Uso**:
```tsx
<ModelSelect
  value={{ provider: 'google', model: 'gemini-3-pro' }}
  onChange={(p, m) => setModelAndProviderOnSelect(p, m)}
/>
```

---

### 7. **DimensionControlGroup**

**Arquivo**: `_layout/ConfigPanel/components/DimensionControlGroup.tsx`

**Responsabilidade**: Width + Height com aspect ratio lock

```tsx
interface DimensionControlGroupProps {
  width: number;
  height: number;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  constraints: { min: number; max: number };
}
```

**Features**:
- 🔒 Lock button (mantém proporção)
- Input numérico com validação
- Constraints do modelo (ex: min 64, max 2048)

**Lógica de Lock**:
```tsx
function handleWidthChange(newWidth: number) {
  onWidthChange(newWidth);

  if (isLocked) {
    const ratio = width / height;
    const newHeight = Math.round(newWidth / ratio);
    onHeightChange(newHeight);
  }
}
```

---

### 8. **AspectRatioSelect**

**Arquivo**: `_layout/ConfigPanel/components/AspectRatioSelect/index.tsx`

**Responsabilidade**: Presets de aspect ratio

```tsx
interface AspectRatioSelectProps {
  value: string | null;          // ex: "1:1", "16:9"
  onChange: (ratio: string) => void;
  isLocked: boolean;
}
```

**Presets**:
- 1:1 (Square)
- 16:9 (Landscape)
- 9:16 (Portrait)
- 4:3, 3:2, 21:9, etc.

**Uso**:
```tsx
<AspectRatioSelect
  value={activeAspectRatio}
  onChange={setAspectRatio}
  isLocked={isAspectRatioLocked}
/>
```

---

### 9. **ImageNum**

**Arquivo**: `_layout/ConfigPanel/components/ImageNum.tsx`

**Responsabilidade**: Número de imagens a gerar

```tsx
interface ImageNumProps {
  value: number;                 // 1-4
  onChange: (num: number) => void;
}
```

**UI**: Botões de rádio (1, 2, 3, 4)

---

### 10. **SeedNumberInput**

**Arquivo**: `_layout/ConfigPanel/components/SeedNumberInput.tsx`

**Responsabilidade**: Input de seed para reprodução

```tsx
interface SeedNumberInputProps {
  value: number | null;
  onChange: (seed: number | null) => void;
}
```

**Features**:
- Input numérico
- Botão "Random" (gera seed aleatório)
- Botão "Clear" (null)

---

### 11. **ImageUrl** (Single Reference)

**Arquivo**: `_layout/ConfigPanel/components/ImageUrl.tsx`

**Responsabilidade**: Upload de imagem de referência única

```tsx
interface ImageUrlProps {
  value: string | null;
  onChange: (url: string | null) => void;
}
```

**Features**:
- Drag & drop
- File picker
- Preview da imagem
- Botão "Remove"

**Fluxo**:
```
1. User arrasta imagem
2. Upload para S3 (via fileService)
3. Retorna S3 key
4. onChange(s3Key)
```

---

### 12. **ImageUrlsUpload** (Multiple References)

**Arquivo**: `_layout/ConfigPanel/components/ImageUrlsUpload.tsx`

**Responsabilidade**: Upload de múltiplas imagens de referência

```tsx
interface ImageUrlsUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;                   // Max images (default: 4)
}
```

**Features**:
- Upload múltiplo
- Modal para gerenciar
- Reordenar imagens (drag)
- Remove individual

---

### 13. **MultiImagesUpload** (Manager)

**Arquivo**: `_layout/ConfigPanel/components/MultiImagesUpload/index.tsx`

**Responsabilidade**: Modal para gerenciar múltiplas imagens

```tsx
interface MultiImagesUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  visible: boolean;
  onClose: () => void;
}
```

**Features**:
- Grid de thumbnails
- Drag to reorder
- Click para remover
- Upload adicional

---

### 14. **StepsSliderInput**

**Arquivo**: `_layout/ConfigPanel/components/StepsSliderInput.tsx`

**Responsabilidade**: Steps de diffusion

```tsx
interface StepsSliderInputProps {
  value: number;
  onChange: (steps: number) => void;
  min?: number;                   // Default: 1
  max?: number;                   // Default: 50
}
```

**UI**: Slider + número

---

### 15. **CfgSliderInput**

**Arquivo**: `_layout/ConfigPanel/components/CfgSliderInput.tsx`

**Responsabilidade**: Classifier-free guidance scale

```tsx
interface CfgSliderInputProps {
  value: number;
  onChange: (cfg: number) => void;
  min?: number;                   // Default: 1
  max?: number;                   // Default: 20
  step?: number;                  // Default: 0.5
}
```

---

### 16. **QualitySelect**

**Arquivo**: `_layout/ConfigPanel/components/QualitySelect.tsx`

**Responsabilidade**: Seletor de qualidade

```tsx
interface QualitySelectProps {
  value: string;                  // "low", "medium", "high"
  onChange: (quality: string) => void;
  options: QualityOption[];
}
```

**Options**:
- Low: Rápido, menor qualidade
- Medium: Balanceado
- High: Lento, maior qualidade

---

### 17. **SizeSelect**

**Arquivo**: `_layout/ConfigPanel/components/SizeSelect.tsx`

**Responsabilidade**: Tamanhos predefinidos

```tsx
interface SizeSelectProps {
  value: string;                  // ex: "1024x1024"
  onChange: (size: string) => void;
  options: SizeOption[];
}
```

**Presets Comuns**:
- 512x512 (small)
- 1024x1024 (medium)
- 2048x2048 (large)
- 1024x1792 (portrait)
- 1792x1024 (landscape)

---

## 🎨 COMPONENTES DE CONTEÚDO (Workspace)

### 18. **ImageWorkspace**

**Arquivo**: `features/ImageWorkspace/index.tsx`

**Responsabilidade**: Container principal do centro

```tsx
export default function ImageWorkspace() {
  const { currentBatches, isLoading } = useImageStore();

  if (isLoading) return <SkeletonList />;
  if (!currentBatches?.length) return <EmptyState />;

  return (
    <Content>
      <PromptInput />
      <GenerationFeed batches={currentBatches} />
    </Content>
  );
}
```

---

### 19. **PromptInput**

**Arquivo**: `features/PromptInput/index.tsx`

**Responsabilidade**: Input de texto para prompt

```tsx
interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export default function PromptInput({
  value,
  onChange,
  onGenerate,
  isGenerating
}: PromptInputProps) {
  return (
    <div className={styles.promptInput}>
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onGenerate();
          }
        }}
        placeholder="Describe the image you want to generate..."
        autoSize={{ minRows: 2, maxRows: 6 }}
      />

      <Button
        type="primary"
        icon={<Sparkles />}
        onClick={onGenerate}
        loading={isGenerating}
      >
        Generate
      </Button>
    </div>
  );
}
```

**Features**:
- Textarea com auto-resize
- Enter para gerar, Shift+Enter para nova linha
- Botão "Generate" com loading state
- Ícone de sparkles (✨)

---

### 20. **GenerationFeed**

**Arquivo**: `features/GenerationFeed/index.tsx`

**Responsabilidade**: Lista de batches

```tsx
interface GenerationFeedProps {
  batches: GenerationBatch[];
}

export default function GenerationFeed({ batches }: GenerationFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para novo batch
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [batches.length]);

  return (
    <div ref={feedRef} className={styles.feed}>
      {batches.map((batch, index) => (
        <Fragment key={batch.id}>
          <BatchItem batch={batch} />
          {index < batches.length - 1 && <Divider />}
        </Fragment>
      ))}
    </div>
  );
}
```

**Features**:
- Auto-scroll para último batch
- Animação com @formkit/auto-animate
- Dividers entre batches

---

### 21. **BatchItem**

**Arquivo**: `features/GenerationFeed/BatchItem.tsx`

**Responsabilidade**: Container de um batch (prompt + imagens)

```tsx
interface BatchItemProps {
  batch: GenerationBatch;
}

export default function BatchItem({ batch }: BatchItemProps) {
  return (
    <div className={styles.batchItem}>
      {/* Header */}
      <div className={styles.header}>
        <Text className={styles.prompt}>{batch.prompt}</Text>
        <Tag>{batch.model}</Tag>
      </div>

      {/* Reference Images (se houver) */}
      {batch.config.imageUrls && (
        <ReferenceImages urls={batch.config.imageUrls} />
      )}

      {/* Generated Images Grid */}
      <div className={styles.generationsGrid}>
        {batch.generations.map((gen) => (
          <GenerationItem key={gen.id} generation={gen} batch={batch} />
        ))}
      </div>
    </div>
  );
}
```

**Layout**:
```
┌─────────────────────────────────────────┐
│ "Cute cat with blue eyes"     [Model]  │
├─────────────────────────────────────────┤
│ Reference: [img] [img]                  │
├─────────────────────────────────────────┤
│ [Generated 1] [Generated 2]             │
│ [Generated 3] [Generated 4]             │
└─────────────────────────────────────────┘
```

---

### 22. **GenerationItem** (Main Controller)

**Arquivo**: `features/GenerationFeed/GenerationItem/index.tsx`

**Responsabilidade**: Renderiza imagem individual baseado em status

```tsx
interface GenerationItemProps {
  generation: Generation;
  batch: GenerationBatch;
}

export default function GenerationItem({ generation, batch }: GenerationItemProps) {
  const { asset, task } = generation;

  // Estados
  if (task.status === 'Success' && asset) {
    return <SuccessState generation={generation} batch={batch} />;
  }

  if (task.status === 'Error') {
    return <ErrorState generation={generation} error={task.error} />;
  }

  // Pending ou Processing
  return <LoadingState generation={generation} />;
}
```

**Renderização condicional**:
- ✅ Success → SuccessState (imagem + ações)
- ⏳ Pending/Processing → LoadingState (skeleton)
- ❌ Error → ErrorState (mensagem de erro)

---

### 23. **SuccessState** (Generated Image)

**Arquivo**: `features/GenerationFeed/GenerationItem/SuccessState.tsx`

**Responsabilidade**: Exibe imagem gerada com sucesso

```tsx
interface SuccessStateProps {
  generation: Generation;
  batch: GenerationBatch;
}

export default function SuccessState({ generation, batch }: SuccessStateProps) {
  const { asset, seed } = generation;

  return (
    <div className={styles.successState}>
      {/* Image Preview */}
      <ImageItem
        url={asset.url}
        alt={batch.prompt}
        preview={true}
        style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
      />

      {/* Action Buttons */}
      <ActionButtons
        generation={generation}
        batch={batch}
      />

      {/* Seed Display */}
      {seed && (
        <div className={styles.seedBadge}>
          <Tag>Seed: {seed}</Tag>
        </div>
      )}
    </div>
  );
}
```

**Layout**:
```
┌─────────────────────────┐
│                         │
│   [Generated Image]     │
│                         │
├─────────────────────────┤
│ [Download] [Seed] [Del] │
├─────────────────────────┤
│ Seed: 123456789         │
└─────────────────────────┘
```

---

### 24. **LoadingState** (Generating)

**Arquivo**: `features/GenerationFeed/GenerationItem/LoadingState.tsx`

**Responsabilidade**: Placeholder durante geração

```tsx
interface LoadingStateProps {
  generation: Generation;
}

export default function LoadingState({ generation }: LoadingStateProps) {
  return (
    <div className={styles.loadingState}>
      {/* Skeleton */}
      <Skeleton.Image active />

      {/* Elapsed Time */}
      <ElapsedTime startTime={generation.createdAt} />

      {/* Delete Button (cancel) */}
      <ActionIcon
        icon={Trash}
        onClick={() => handleDelete(generation.id)}
      />
    </div>
  );
}
```

**Features**:
- Skeleton animado
- Contador de tempo decorrido
- Botão de cancelar/deletar

---

### 25. **ErrorState** (Failed Generation)

**Arquivo**: `features/GenerationFeed/GenerationItem/ErrorState.tsx`

**Responsabilidade**: Exibe erro na geração

```tsx
interface ErrorStateProps {
  generation: Generation;
  error: AsyncTaskError;
}

export default function ErrorState({ generation, error }: ErrorStateProps) {
  return (
    <div className={styles.errorState}>
      <Result
        status="error"
        title="Generation Failed"
        subTitle={error.message}
      />

      {/* Actions */}
      <Space>
        <Button onClick={() => handleRetry(generation)}>
          Retry
        </Button>
        <Button onClick={() => handleDelete(generation.id)}>
          Delete
        </Button>
        <Button onClick={() => copyToClipboard(error.details)}>
          Copy Error
        </Button>
      </Space>
    </div>
  );
}
```

---

### 26. **ActionButtons**

**Arquivo**: `features/GenerationFeed/GenerationItem/ActionButtons.tsx`

**Responsabilidade**: Ações para imagem gerada

```tsx
interface ActionButtonsProps {
  generation: Generation;
  batch: GenerationBatch;
}

export default function ActionButtons({ generation, batch }: ActionButtonsProps) {
  return (
    <Space className={styles.actions}>
      {/* Download */}
      <ActionIcon
        icon={Download}
        title="Download"
        onClick={() => handleDownload(generation)}
      />

      {/* Copy/Apply Seed */}
      <ActionIcon
        icon={Dices}
        title="Use Seed"
        onClick={() => handleCopySeed(generation.seed, batch.model)}
      />

      {/* Delete */}
      <Popconfirm
        title="Delete this generation?"
        onConfirm={() => handleDelete(generation.id)}
      >
        <ActionIcon
          icon={Trash}
          title="Delete"
        />
      </Popconfirm>
    </Space>
  );
}
```

**Ações**:
1. **Download**: Baixa imagem com nome formatado
2. **Seed**: Copia seed ou aplica à config (se modelo suporta)
3. **Delete**: Remove geração (com confirmação)

---

### 27. **ElapsedTime**

**Arquivo**: `features/GenerationFeed/GenerationItem/ElapsedTime.tsx`

**Responsabilidade**: Contador de tempo de geração

```tsx
interface ElapsedTimeProps {
  startTime: Date;
}

export default function ElapsedTime({ startTime }: ElapsedTimeProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const start = new Date(startTime).getTime();
      setElapsed(Math.floor((now - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return <Tag>{elapsed}s</Tag>;
}
```

---

## 🗂️ COMPONENTES DE TOPICS (Right Sidebar)

### 28. **Topics**

**Arquivo**: `_layout/Topics/index.tsx`

**Responsabilidade**: Lista de todos os topics

```tsx
export default function Topics() {
  const { generationTopics, activeTopicId } = useImageStore();

  return (
    <div className={styles.topics}>
      <div className={styles.header}>
        <Title level={4}>Projects</Title>
        <NewTopicButton />
      </div>

      <div className={styles.list}>
        {generationTopics.map((topic) => (
          <TopicItem
            key={topic.id}
            topic={topic}
            active={topic.id === activeTopicId}
          />
        ))}
      </div>
    </div>
  );
}
```

---

### 29. **TopicItem**

**Arquivo**: `_layout/Topics/TopicItem.tsx`

**Responsabilidade**: Card de topic individual

```tsx
interface TopicItemProps {
  topic: ImageGenerationTopic;
  active: boolean;
}

export default function TopicItem({ topic, active }: TopicItemProps) {
  return (
    <div
      className={cx(styles.topicItem, active && styles.active)}
      onClick={() => handleSwitch(topic.id)}
    >
      {/* Cover Image */}
      <div className={styles.cover}>
        {topic.coverUrl ? (
          <img src={topic.coverUrl} alt="" />
        ) : (
          <ImagePlaceholder />
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        <Text className={styles.title}>
          {topic.title || 'Untitled'}
        </Text>
        <Text className={styles.date}>
          {formatDate(topic.createdAt)}
        </Text>
      </div>

      {/* Actions */}
      <Dropdown menu={{ items: menuItems }}>
        <ActionIcon icon={MoreVertical} />
      </Dropdown>
    </div>
  );
}
```

**Layout**:
```
┌───────────────────────────┐
│ ┌──────┐                  │
│ │Cover │  Title           │
│ │Image │  Jan 16, 2026    │
│ └──────┘             [···]│
└───────────────────────────┘
```

---

### 30. **NewTopicButton**

**Arquivo**: `_layout/Topics/NewTopicButton.tsx`

**Responsabilidade**: Botão para criar novo topic

```tsx
export default function NewTopicButton() {
  const { openNewGenerationTopic } = useImageStore();

  return (
    <Button
      type="dashed"
      icon={<Plus />}
      onClick={openNewGenerationTopic}
      block
    >
      New Project
    </Button>
  );
}
```

---

## 🔧 COMPONENTES UTILITÁRIOS

### 31. **ImageItem** (Reusável)

**Arquivo**: `src/components/ImageItem/index.tsx`

**Responsabilidade**: Componente de imagem com preview

```tsx
interface ImageItemProps {
  url: string;
  alt?: string;
  preview?: boolean;
  loading?: boolean;
  editable?: boolean;
  onRemove?: () => void;
  style?: CSSProperties;
}

export default function ImageItem({
  url,
  alt,
  preview = true,
  loading,
  editable,
  onRemove,
  style
}: ImageItemProps) {
  return (
    <Image
      src={url}
      alt={alt || ''}
      preview={preview}
      isLoading={loading}
      actions={editable && (
        <ActionIcon icon={Trash} onClick={onRemove} />
      )}
      style={style}
    />
  );
}
```

**Features** (via @lobehub/ui):
- Preview modal ao clicar
- Zoom, rotação, download
- Loading skeleton
- Delete button (modo editable)

---

### 32. **EmptyState**

**Arquivo**: `features/ImageWorkspace/EmptyState.tsx`

**Responsabilidade**: Estado vazio (sem gerações)

```tsx
export default function EmptyState() {
  return (
    <Result
      icon={<ImagePlus />}
      title="No generations yet"
      subTitle="Start by entering a prompt and clicking Generate"
    />
  );
}
```

---

### 33. **SkeletonList**

**Arquivo**: `features/ImageWorkspace/SkeletonList.tsx`

**Responsabilidade**: Loading skeleton

```tsx
export default function SkeletonList() {
  return (
    <div className={styles.skeletonList}>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} active paragraph={{ rows: 4 }} />
      ))}
    </div>
  );
}
```

---

## 📊 Resumo de Componentes

| Categoria | Quantidade | Principais |
|-----------|------------|------------|
| **Layout** | 5 | Layout, Header, Sidebar, TopicSidebar |
| **Config** | 15 | ModelSelect, DimensionControl, ImageUrl, Seeds, Steps |
| **Content** | 10 | PromptInput, GenerationFeed, BatchItem, GenerationItem |
| **Topics** | 5 | Topics, TopicItem, NewTopicButton |
| **Utilitários** | 10+ | ImageItem, EmptyState, Skeleton, ActionButtons |

---

## 🔗 Próximos Passos

- **[03-APIS-ENDPOINTS.md](./03-APIS-ENDPOINTS.md)** - Documentação de APIs
- **[04-STATE-MANAGEMENT.md](./04-STATE-MANAGEMENT.md)** - State management
- **[05-FLUXO-DADOS.md](./05-FLUXO-DADOS.md)** - Fluxo de dados completo
