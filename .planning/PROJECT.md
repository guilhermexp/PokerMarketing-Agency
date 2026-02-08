# Image Generation Playground

## Vision

Create a dedicated Image Generation Playground page with a 3-panel layout (Config + Workspace + Topics sidebar) inspired by LobeChat's image generation system. This provides a focused, professional environment for AI image generation with organized topics/projects, batch generation support, and a streamlined workflow.

## Key Features

1. **3-Panel Layout**
   - Left: Config Panel (model selection, dimensions, parameters)
   - Center: Workspace (prompt input + generation feed)
   - Right: Topics Sidebar (organized projects/sessions)

2. **Topic Organization**
   - Create topics to organize generation sessions
   - Auto-generate topic titles using AI
   - Topic cover images from first generation
   - Switch between topics seamlessly

3. **Batch Generation**
   - Generate 1-4 images per request
   - Async task processing with polling
   - Real-time status updates (pending/processing/success/error)
   - Exponential backoff polling strategy

4. **Dynamic Config Panel**
   - Model selection (Gemini, OpenRouter, etc.)
   - Dimension controls with aspect ratio lock
   - Provider-specific parameters
   - Reference image upload support

5. **Generation Feed**
   - Batches grouped with generations
   - Individual image actions (download, reuse seed, delete)
   - Batch actions (download all as ZIP, reuse settings)
   - Loading/error states with retry

## Technical Decisions

- **Route**: `/image-playground` (separate from existing `/playground`)
- **Store**: New Zustand store `imagePlaygroundStore.ts` with 4 slices
- **Database**: 4 new tables (topics, batches, generations, async_tasks)
- **API**: Express endpoints under `/api/image-playground/*`
- **Styling**: Match existing dark theme with glassmorphism

## Success Criteria

- [ ] New page accessible via sidebar navigation
- [ ] 3-panel responsive layout renders correctly
- [ ] Users can create/switch topics
- [ ] Config panel shows model-specific parameters
- [ ] Generate 1-4 images with prompt
- [ ] Polling shows real-time generation status
- [ ] Download individual images or batch ZIP
- [ ] Reuse seed/settings from previous generations
- [ ] Delete topics/batches/generations with cascade
- [ ] Persisted config (model, parameters) across sessions

---

## Roadmap

### Milestone 1: Image Generation Playground MVP

#### Phase 1: Database Schema & API Foundation
- Create database migration for 4 tables
- Implement Express API endpoints for topics CRUD
- Implement Express API endpoints for batches/generations
- Add async task status endpoint for polling

#### Phase 2: Zustand Store & State Management
- Create imagePlaygroundStore with 4 slices
- Implement generationConfig slice (model, params, dimensions)
- Implement generationTopic slice (topics CRUD, active topic)
- Implement generationBatch slice (batches map, polling)
- Implement createImage slice (generation action)
- Add selectors for computed values
- Setup localStorage persistence for config

#### Phase 3: UI Components - Layout & Navigation
- Create ImagePlaygroundPage layout component
- Create ConfigPanel sidebar component
- Create Workspace center panel
- Create TopicsSidebar right panel
- Add route and sidebar navigation link

#### Phase 4: UI Components - Config Panel
- ModelSelect dropdown with providers
- DimensionControlGroup (width/height/aspect lock)
- ImageNumSlider (1-4 images)
- SeedNumberInput (optional seed)
- Reference image upload (ImageUrlUpload)

#### Phase 5: UI Components - Workspace
- PromptInput with generate button
- GenerationFeed scrollable list
- BatchItem component with batch actions
- GenerationItem with loading/success/error states
- ActionButtons (download, seed, settings, delete)

#### Phase 6: UI Components - Topics Sidebar
- TopicsList with scroll
- TopicItem (title, cover, active state)
- NewTopicButton
- Topic context menu (rename, delete)

#### Phase 7: Integration & Polling
- Wire up createImage to API
- Implement polling with exponential backoff
- Handle generation completion (update UI)
- Handle errors with retry option
- Auto-update topic cover on first success

#### Phase 8: Polish & Testing
- Download image functionality
- Download batch as ZIP
- Reuse seed action
- Reuse settings action
- Delete generation/batch/topic
- Responsive design adjustments
- Error boundary and loading states

---

## Technical Architecture

### Database Schema

```sql
-- Topics: Container for generation sessions
CREATE TABLE image_generation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  cover_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batches: Group of generations from single request
CREATE TABLE image_generation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES image_generation_topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generations: Individual images in a batch
CREATE TABLE image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES image_generation_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  async_task_id UUID,
  seed INTEGER,
  asset JSONB, -- {url, thumbnailUrl, width, height}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Async Tasks: Track background processing
CREATE TABLE image_async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'image_generation',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, success, error
  metadata JSONB NOT NULL DEFAULT '{}',
  error JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_topics_user ON image_generation_topics(user_id, organization_id);
CREATE INDEX idx_batches_topic ON image_generation_batches(topic_id);
CREATE INDEX idx_generations_batch ON image_generations(batch_id);
CREATE INDEX idx_tasks_status ON image_async_tasks(user_id, status);
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/image-playground/topics` | List user's topics |
| POST | `/api/image-playground/topics` | Create new topic |
| PATCH | `/api/image-playground/topics/:id` | Update topic |
| DELETE | `/api/image-playground/topics/:id` | Delete topic (cascade) |
| GET | `/api/image-playground/batches?topicId=x` | List batches for topic |
| DELETE | `/api/image-playground/batches/:id` | Delete batch (cascade) |
| POST | `/api/image-playground/generate` | Create image batch |
| GET | `/api/image-playground/status/:generationId` | Poll generation status |
| DELETE | `/api/image-playground/generations/:id` | Delete single generation |

### Zustand Store Structure

```typescript
interface ImagePlaygroundStore {
  // Config Slice
  model: string;
  provider: string;
  parameters: RuntimeImageGenParams;
  imageNum: number;
  isAspectRatioLocked: boolean;
  setModel: (model: string, provider: string) => void;
  setParam: (name: string, value: any) => void;
  setImageNum: (num: number) => void;

  // Topic Slice
  topics: ImageGenerationTopic[];
  activeTopicId: string | null;
  createTopic: () => Promise<string>;
  switchTopic: (topicId: string) => void;
  deleteTopic: (topicId: string) => Promise<void>;

  // Batch Slice
  batchesMap: Record<string, GenerationBatch[]>;
  fetchBatches: (topicId: string) => Promise<void>;
  deleteBatch: (batchId: string) => Promise<void>;
  deleteGeneration: (generationId: string) => Promise<void>;

  // Create Image Slice
  isCreating: boolean;
  createImage: () => Promise<void>;
}
```

### Component Tree

```
ImagePlaygroundPage
├── ConfigPanel
│   ├── ModelSelect
│   ├── DimensionControlGroup
│   │   ├── WidthInput
│   │   ├── HeightInput
│   │   └── AspectRatioLock
│   ├── ImageNumSlider
│   ├── SeedNumberInput
│   └── ImageUrlUpload
├── Workspace
│   ├── PromptInput
│   │   ├── TextArea
│   │   └── GenerateButton
│   └── GenerationFeed
│       └── BatchItem (repeated)
│           ├── BatchHeader
│           │   └── BatchActions
│           └── GenerationItem (repeated)
│               ├── LoadingState / SuccessState / ErrorState
│               └── ActionButtons
└── TopicsSidebar
    ├── NewTopicButton
    └── TopicsList
        └── TopicItem (repeated)
```

---

*Project created: 2026-01-26*
