# 07. Guia de Clonagem do Backend

> **Implementação completa do backend**

---

## Estrutura de APIs

```
api/
├── db/
│   ├── campaigns/
│   │   └── route.ts
│   ├── posts/
│   │   └── route.ts
│   ├── ad-creatives/
│   │   └── route.ts
│   ├── carousels/
│   │   └── route.ts
│   ├── gallery/
│   │   └── route.ts
│   ├── scheduled-posts/
│   │   └── route.ts
│   └── init/
│       └── route.ts
├── ai/
│   └── campaign/
│       └── route.ts
└── generate/
    ├── queue/
    │   └── route.ts
    └── status/
        └── route.ts
```

---

## Endpoint 1: POST /api/db/campaigns (Criar Campanha)

```typescript
import { neon } from '@neondatabase/serverless';

export async function POST(req: Request) {
  const sql = neon(process.env.DATABASE_URL);
  const body = await req.json();
  const { user_id, name, video_clip_scripts, posts, ad_creatives, carousel_scripts } = body;

  // 1. Criar campanha
  const [campaign] = await sql`
    INSERT INTO campaigns (user_id, name, input_transcript, generation_options)
    VALUES (${user_id}, ${name}, ${body.input_transcript}, ${body.generation_options})
    RETURNING *
  `;

  // 2. Criar video clips
  if (video_clip_scripts?.length > 0) {
    await sql`
      INSERT INTO video_clip_scripts (campaign_id, title, hook, scenes, image_prompt, audio_script, sort_order)
      SELECT ${campaign.id}, * FROM ${sql(video_clip_scripts.map((clip, i) => ({
        title: clip.title,
        hook: clip.hook,
        scenes: JSON.stringify(clip.scenes),
        image_prompt: clip.image_prompt,
        audio_script: clip.audio_script,
        sort_order: i
      })))}
    `;
  }

  // 3. Criar posts (similar)
  // 4. Criar ads (similar)
  // 5. Criar carousels (similar)

  // 6. Retornar campanha completa
  return Response.json(campaign);
}
```

---

## Endpoint 2: GET /api/db/campaigns (Listar Campanhas)

```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id');
  const id = searchParams.get('id');
  const includeContent = searchParams.get('include_content') === 'true';

  const sql = neon(process.env.DATABASE_URL);

  if (id && includeContent) {
    // Buscar campanha completa
    const [campaign] = await sql`SELECT * FROM campaigns WHERE id = ${id} AND user_id = ${userId}`;
    const clips = await sql`SELECT * FROM video_clip_scripts WHERE campaign_id = ${id} ORDER BY sort_order`;
    const posts = await sql`SELECT * FROM posts WHERE campaign_id = ${id} ORDER BY sort_order`;
    const ads = await sql`SELECT * FROM ad_creatives WHERE campaign_id = ${id} ORDER BY sort_order`;
    const carousels = await sql`SELECT * FROM carousel_scripts WHERE campaign_id = ${id} ORDER BY sort_order`;

    return Response.json({
      ...campaign,
      video_clip_scripts: clips,
      posts,
      ad_creatives: ads,
      carousel_scripts: carousels
    });
  }

  // Listar campanhas
  const campaigns = await sql`
    SELECT c.*,
      COUNT(DISTINCT vcs.id) as clips_count,
      COUNT(DISTINCT p.id) as posts_count,
      COUNT(DISTINCT ac.id) as ads_count
    FROM campaigns c
    LEFT JOIN video_clip_scripts vcs ON vcs.campaign_id = c.id
    LEFT JOIN posts p ON p.campaign_id = c.id
    LEFT JOIN ad_creatives ac ON ac.campaign_id = c.id
    WHERE c.user_id = ${userId}
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 10
  `;

  return Response.json(campaigns);
}
```

---

## Endpoint 3: POST /api/ai/campaign (Gerar com IA)

```typescript
import { GoogleGenerativeAI } from '@google/genai';

export async function POST(req: Request) {
  const { brandProfile, transcript, options, productImages } = await req.json();

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `Você é um especialista em marketing...
BRAND: ${JSON.stringify(brandProfile)}
TRANSCRIPT: ${transcript}
GENERATE: ${JSON.stringify(options)}
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: marketingCampaignSchema
    }
  });

  const campaign = JSON.parse(result.response.text());
  return Response.json(campaign);
}
```

---

## Workers: Background Jobs

```typescript
// server/workers/generationWorker.mjs
import { Worker } from 'bullmq';
import { GoogleGenerativeAI } from '@google/genai';
import { put } from '@vercel/blob';

const worker = new Worker('generation-queue', async (job) => {
  const { type, prompt, targetId, userId } = job.data;

  // 1. Gerar imagem com Gemini
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const result = await model.generateContent(prompt);
  const imageBase64 = result.response.imageData;

  // 2. Upload para Vercel Blob
  const blob = await fetch(`data:image/png;base64,${imageBase64}`).then(r => r.blob());
  const { url } = await put(`${userId}/${targetId}.png`, blob, { access: 'public' });

  // 3. Atualizar banco de dados
  const sql = neon(process.env.DATABASE_URL);

  if (type === 'post') {
    await sql`UPDATE posts SET image_url = ${url} WHERE id = ${targetId}`;
  } else if (type === 'ad') {
    await sql`UPDATE ad_creatives SET image_url = ${url} WHERE id = ${targetId}`;
  }
  // ... outros tipos

  return { imageUrl: url };
}, {
  connection: new IORedis(process.env.REDIS_URL)
});

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});
```

---

## Checklist de Implementação

### ✅ Configuração
- [ ] DATABASE_URL configurada
- [ ] GOOGLE_GENERATIVE_AI_API_KEY configurada
- [ ] BLOB_READ_WRITE_TOKEN configurada
- [ ] REDIS_URL configurada

### ✅ Endpoints
- [ ] POST /api/db/campaigns (criar)
- [ ] GET /api/db/campaigns (listar/obter)
- [ ] PUT /api/db/campaigns (atualizar)
- [ ] DELETE /api/db/campaigns (deletar)
- [ ] POST /api/ai/campaign (gerar com IA)
- [ ] POST /api/generate/queue (adicionar job)
- [ ] GET /api/generate/status (status de job)

### ✅ Workers
- [ ] Generation worker rodando
- [ ] Redis conectado
- [ ] BullMQ configurado

### ✅ Testes
- [ ] Criar campanha funciona
- [ ] Listar campanhas funciona
- [ ] Gerar com IA funciona
- [ ] Background jobs processam
- [ ] Upload de imagens funciona

---

**Última atualização**: 2026-01-18
