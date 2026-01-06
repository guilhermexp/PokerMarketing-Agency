/**
 * Production Server for Railway
 * Serves both the static frontend and API routes
 */

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { config } from "dotenv";
import { fal } from "@fal-ai/client";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { GoogleGenAI } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
  createOrgContext,
} from "./helpers/organization-context.mjs";
import {
  getImageQueue,
  addJob,
  initializeWorker,
  initializeScheduledPostsChecker,
  schedulePostForPublishing,
  cancelScheduledPost,
  closeQueue,
} from "./helpers/job-queue.mjs";
import { checkAndPublishScheduledPosts, publishScheduledPostById } from "./helpers/scheduled-publisher.mjs";

config();

/**
 * Helper: Convert URL or data URL to base64 string
 * - If already base64 or data URL, extracts the base64 part
 * - If HTTP URL, fetches the image and converts to base64
 */
async function urlToBase64(input) {
  if (!input) return null;

  // Already base64 (no prefix)
  if (!input.startsWith('data:') && !input.startsWith('http')) {
    return input;
  }

  // Data URL - extract base64 part
  if (input.startsWith('data:')) {
    return input.split(',')[1];
  }

  // HTTP URL - fetch and convert
  if (input.startsWith('http')) {
    try {
      const response = await fetch(input);
      if (!response.ok) {
        console.error(`[urlToBase64] Failed to fetch ${input}: ${response.status}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return base64;
    } catch (error) {
      console.error(`[urlToBase64] Error fetching ${input}:`, error.message);
      return null;
    }
  }

  return input;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Railway provides PORT environment variable
const PORT = process.env.PORT || 8080;

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: "50mb" }));

// Clerk authentication middleware
app.use(
  clerkMiddleware({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }),
);

// Helper to get Clerk org context from request
function getClerkOrgContext(req) {
  const auth = getAuth(req);
  return createOrgContext(auth);
}

// Legacy helper for organization context resolution
async function resolveOrganizationContext(sql, userId, organizationId) {
  if (!organizationId) {
    return {
      organizationId: null,
      isPersonal: true,
      orgRole: null,
      hasPermission: () => true,
    };
  }

  return {
    organizationId,
    isPersonal: false,
    orgRole: "org:member",
    hasPermission: (permission) => true,
  };
}

const DATABASE_URL = process.env.DATABASE_URL;

// Cache for resolved user IDs (5 minute TTL)
const userIdCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000;

function getCachedUserId(clerkId) {
  const cached = userIdCache.get(clerkId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    return cached.userId;
  }
  return null;
}

function setCachedUserId(clerkId, userId) {
  userIdCache.set(clerkId, { userId, timestamp: Date.now() });
}

function getSql() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not configured");
  }
  return neon(DATABASE_URL);
}

// ============================================================================
// AI HELPERS (Gemini + OpenRouter)
// ============================================================================

// Gemini client
const getGeminiAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
};

// OpenRouter client
const getOpenRouter = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  return new OpenRouter({ apiKey });
};

// Retry helper for 503 errors
const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error?.message?.includes("503") ||
        error?.message?.includes("overloaded") ||
        error?.message?.includes("UNAVAILABLE") ||
        error?.status === 503;

      if (isRetryable && attempt < maxRetries) {
        console.log(`[Gemini] Retry ${attempt}/${maxRetries} after ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// Map aspect ratios
const mapAspectRatio = (ratio) => {
  const map = {
    "1:1": "1:1",
    "9:16": "9:16",
    "16:9": "16:9",
    "1.91:1": "16:9",
    "4:5": "4:5",
    "3:4": "3:4",
    "4:3": "4:3",
    "2:3": "2:3",
    "3:2": "3:2",
  };
  return map[ratio] || "1:1";
};

// Generate image with Gemini
const generateGeminiImage = async (prompt, aspectRatio, model = "gemini-3-pro-image-preview", imageSize = "1K", productImages, styleReferenceImage) => {
  const ai = getGeminiAi();
  const parts = [{ text: prompt }];

  if (styleReferenceImage) {
    parts.push({
      inlineData: {
        data: styleReferenceImage.base64,
        mimeType: styleReferenceImage.mimeType,
      },
    });
  }

  if (productImages) {
    productImages.forEach((img) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio),
          imageSize,
        },
      },
    })
  );

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate image");
};

// Generate image with Imagen 4
const generateImagenImage = async (prompt, aspectRatio) => {
  const ai = getGeminiAi();

  const response = await withRetry(() =>
    ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
        aspectRatio,
      },
    })
  );

  return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
};

// Generate structured content with Gemini
const generateStructuredContent = async (model, parts, responseSchema, temperature = 0.7) => {
  const ai = getGeminiAi();

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema,
      temperature,
    },
  });

  return response.text.trim();
};

// Generate text with OpenRouter
const generateTextWithOpenRouter = async (model, systemPrompt, userPrompt, temperature = 0.7) => {
  const openrouter = getOpenRouter();

  const response = await openrouter.chat.send({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    responseFormat: { type: "json_object" },
    temperature,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter (${model}) no content returned`);
  }

  return content;
};

// Generate text with OpenRouter + Vision
const generateTextWithOpenRouterVision = async (model, textParts, imageParts, temperature = 0.7) => {
  const openrouter = getOpenRouter();

  const content = textParts.map((text) => ({ type: "text", text }));

  for (const img of imageParts) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    });
  }

  const response = await openrouter.chat.send({
    model,
    messages: [{ role: "user", content }],
    responseFormat: { type: "json_object" },
    temperature,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error(`OpenRouter (${model}) no content returned`);
  }

  return result;
};

// Schema Type constants
const Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  NUMBER: "NUMBER",
};

// Prompt builders
const shouldUseTone = (brandProfile, target) => {
  const targets = brandProfile.toneTargets || ["campaigns", "posts", "images", "flyers"];
  return targets.includes(target);
};

const getToneText = (brandProfile, target) => {
  return shouldUseTone(brandProfile, target) ? brandProfile.toneOfVoice : "";
};

const buildImagePrompt = (prompt, brandProfile, hasStyleReference = false) => {
  const toneText = getToneText(brandProfile, "images");
  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText ? `${toneText}, ` : ""}Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;

  if (hasStyleReference) {
    fullPrompt += `

**TIPOGRAFIA OBRIGATÓRIA PARA CENAS (REGRA INVIOLÁVEL):**
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact, ou similar)
- TODOS os textos devem usar a MESMA família tipográfica - PROIBIDO misturar estilos
- Títulos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas clássicas, handwriting, ou fontes finas/light`;
  }

  return fullPrompt;
};

const buildFlyerPrompt = (brandProfile) => {
  const toneText = getToneText(brandProfile, "flyers");

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**REGRAS DE CONTEÚDO:**
1. Destaque informações importantes (valores, datas, horários) de forma clara e legível.
2. Use a marca ${brandProfile.name}.
3. Siga a identidade visual da marca em todos os elementos.

**IDENTIDADE DA MARCA - ${brandProfile.name}:**
${brandProfile.description ? `- Descrição: ${brandProfile.description}` : ""}
${toneText ? `- Tom de Comunicação: ${toneText}` : ""}
- Cor Primária (dominante): ${brandProfile.primaryColor}
- Cor de Acento (destaques, CTAs): ${brandProfile.secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (acento)
   - Crie variações tonais dessas cores para profundidade
   - Evite introduzir cores aleatórias

2. RESPIRAÇÃO VISUAL (Anti-Poluição):
   - Menos é mais: priorize espaços negativos estratégicos
   - Não sobrecarregue com elementos decorativos desnecessários
   - Hierarquia visual clara

3. TIPOGRAFIA CINEMATOGRÁFICA:
   - Máximo 2-3 famílias tipográficas diferentes
   - Contraste forte entre títulos (bold/black) e corpo (regular/medium)

4. ESTÉTICA PREMIUM SEM CLICHÊS:
   - Evite excesso de efeitos (brilhos, sombras, neons chamativos)
   - Prefira elegância sutil a ostentação visual

**ATMOSFERA FINAL:**
- Alta classe, luxo e sofisticação
- Cinematográfico mas não exagerado
- Profissional mas criativo
- Impactante mas elegante`;
};

const buildQuickPostPrompt = (brandProfile, context) => {
  const toneText = getToneText(brandProfile, "posts");

  return `
Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandProfile.name}${brandProfile.description ? ` - ${brandProfile.description}` : ""}${toneText ? ` | **TOM:** ${toneText}` : ""}

**REGRAS DE OURO:**
1. GANCHO EXPLOSIVO com emojis relevantes ao tema.
2. DESTAQUE informações importantes (valores, datas, ofertas).
3. CTA FORTE (ex: Link na Bio, Saiba Mais).
4. 5-8 Hashtags estratégicas relevantes à marca e ao conteúdo.

Responda apenas JSON:
{ "platform": "Instagram", "content": "Texto Legenda", "hashtags": ["tag1", "tag2"], "image_prompt": "descrição visual" }`;
};

/**
 * Video prompt JSON conversion system prompt
 */
const getVideoPromptSystemPrompt = (duration, aspectRatio) => {
  return `Você é um especialista em prompt engineering para vídeo de IA.
Converta o prompt genérico fornecido em um JSON estruturado e aninhado otimizado para modelos de geração de vídeo (Veo 3, Sora 2).

O JSON deve incluir detalhes ricos sobre:
- visual_style: estética, paleta de cores, iluminação
- camera: movimentos de câmera cinematográficos, posições inicial e final
- subject: personagem/objeto principal, ação, expressão/estado
- environment: cenário, props relevantes, atmosfera
- scene_sequence: 2-3 beats de ação para criar dinamismo
- technical: duração (${duration} seconds), aspect ratio (${aspectRatio}), tokens de qualidade

**TIPOGRAFIA OBRIGATÓRIA (REGRA CRÍTICA PARA CONSISTÊNCIA VISUAL):**
Se o vídeo contiver QUALQUER texto na tela (títulos, legendas, overlays, valores, CTAs):
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact)
- TODOS os textos devem usar a MESMA família tipográfica
- Textos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas, handwriting, ou fontes finas/light

Mantenha a essência do prompt original mas expanda com detalhes visuais cinematográficos.`;
};

const buildCampaignPrompt = (brandProfile, transcript, quantityInstructions) => {
  const toneText = getToneText(brandProfile, "campaigns");

  return `
**PERFIL DA MARCA:**
- Nome: ${brandProfile.name}
- Descrição: ${brandProfile.description}
${toneText ? `- Tom de Voz: ${toneText}` : ""}
- Cores Oficiais: Primária ${brandProfile.primaryColor}, Secundária ${brandProfile.secondaryColor}

**CONTEÚDO PARA ESTRUTURAR:**
${transcript}

**QUANTIDADES EXATAS A GERAR (OBRIGATÓRIO SEGUIR):**
${quantityInstructions}

**REGRAS CRÍTICAS PARA IMAGE_PROMPT (OBRIGATÓRIO):**

1. **IDIOMA (REGRA INVIOLÁVEL):**
   - TODOS os image_prompts DEVEM ser escritos em PORTUGUÊS
   - QUALQUER texto que apareça na imagem (títulos, CTAs, valores) DEVE estar em PORTUGUÊS
   - PROIBIDO usar inglês nos textos da imagem

2. **ALINHAMENTO CONTEÚDO-IMAGEM:**
   - O image_prompt DEVE refletir o tema da legenda (content)
   - NUNCA gere prompts genéricos desconectados do conteúdo

3. **ELEMENTOS OBRIGATÓRIOS:**
   - Cores da marca (${brandProfile.primaryColor}, ${brandProfile.secondaryColor})
   - Estilo cinematográfico, luxuoso e premium
   - Textos em fonte bold condensed sans-serif

**MISSÃO:** Gere uma campanha completa em JSON com as QUANTIDADES EXATAS especificadas. Cada image_prompt DEVE ser em PORTUGUÊS e alinhado com seu content.`;
};

// Build quantity instructions for campaign
const buildQuantityInstructions = (options) => {
  const quantities = [];

  if (options.videoClipScripts.generate && options.videoClipScripts.count > 0) {
    quantities.push(`- Roteiros de vídeo (videoClipScripts): EXATAMENTE ${options.videoClipScripts.count} roteiro(s)`);
  } else {
    quantities.push(`- Roteiros de vídeo (videoClipScripts): 0 (array vazio)`);
  }

  const postPlatforms = [];
  if (options.posts.instagram?.generate && options.posts.instagram.count > 0) {
    postPlatforms.push(`${options.posts.instagram.count}x Instagram`);
  }
  if (options.posts.facebook?.generate && options.posts.facebook.count > 0) {
    postPlatforms.push(`${options.posts.facebook.count}x Facebook`);
  }
  if (options.posts.twitter?.generate && options.posts.twitter.count > 0) {
    postPlatforms.push(`${options.posts.twitter.count}x Twitter`);
  }
  if (options.posts.linkedin?.generate && options.posts.linkedin.count > 0) {
    postPlatforms.push(`${options.posts.linkedin.count}x LinkedIn`);
  }
  if (postPlatforms.length > 0) {
    quantities.push(`- Posts (posts): ${postPlatforms.join(", ")}`);
  } else {
    quantities.push(`- Posts (posts): 0 (array vazio)`);
  }

  const adPlatforms = [];
  if (options.adCreatives.facebook?.generate && options.adCreatives.facebook.count > 0) {
    adPlatforms.push(`${options.adCreatives.facebook.count}x Facebook`);
  }
  if (options.adCreatives.google?.generate && options.adCreatives.google.count > 0) {
    adPlatforms.push(`${options.adCreatives.google.count}x Google`);
  }
  if (adPlatforms.length > 0) {
    quantities.push(`- Anúncios (adCreatives): ${adPlatforms.join(", ")}`);
  } else {
    quantities.push(`- Anúncios (adCreatives): 0 (array vazio)`);
  }

  return quantities.join("\n    ");
};

// Campaign schema for structured generation
const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
      description: "Roteiros para vídeos curtos (Reels/Shorts/TikTok).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                narration: { type: Type.STRING },
                duration_seconds: { type: Type.INTEGER },
              },
              required: ["scene", "visual", "narration", "duration_seconds"],
            },
          },
          image_prompt: { type: Type.STRING },
          audio_script: { type: Type.STRING },
        },
        required: ["title", "hook", "scenes", "image_prompt", "audio_script"],
      },
    },
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          content: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_prompt: { type: Type.STRING },
        },
        required: ["platform", "content", "hashtags", "image_prompt"],
      },
    },
    adCreatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
        },
        required: ["platform", "headline", "body", "cta", "image_prompt"],
      },
    },
  },
  required: ["videoClipScripts", "posts", "adCreatives"],
};

// Quick post schema
const quickPostSchema = {
  type: Type.OBJECT,
  properties: {
    platform: { type: Type.STRING },
    content: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    image_prompt: { type: Type.STRING },
  },
  required: ["platform", "content", "hashtags", "image_prompt"],
};

// Helper to resolve user ID (handles both Clerk IDs and UUIDs)
async function resolveUserId(sql, userId) {
  if (!userId) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(userId)) {
    return userId;
  }

  const cachedId = getCachedUserId(userId);
  if (cachedId) {
    return cachedId;
  }

  const result = await sql`
    SELECT id FROM users
    WHERE auth_provider_id = ${userId}
    AND deleted_at IS NULL
    LIMIT 1
  `;

  if (result.length > 0) {
    const resolvedId = result[0].id;
    setCachedUserId(userId, resolvedId);
    return resolvedId;
  }

  console.log("[User Lookup] No user found for auth_provider_id:", userId);
  return null;
}

// ============================================================================
// BULLMQ JOB PROCESSOR
// ============================================================================

/**
 * Process image generation jobs from BullMQ queue
 */
const processGenerationJob = async (job) => {
  const { jobId, prompt, config } = job.data;
  const sql = getSql();

  console.log(`[JobProcessor] Processing job ${jobId}`);

  try {
    // Mark as processing
    await sql`
      UPDATE generation_jobs
      SET status = 'processing',
          started_at = NOW(),
          attempts = COALESCE(attempts, 0) + 1
      WHERE id = ${jobId}
    `;

    job.updateProgress(10);

    // Build brand profile object for helpers
    const brandProfile = {
      name: config.brandName,
      description: config.brandDescription,
      toneOfVoice: config.brandToneOfVoice,
      primaryColor: config.brandPrimaryColor,
      secondaryColor: config.brandSecondaryColor,
    };

    // Generate the image using existing helper
    const ai = getGeminiAi();
    const brandingInstruction = buildFlyerPrompt(brandProfile);

    const parts = [
      { text: brandingInstruction },
      { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
    ];

    // Add logo if provided (handles data URLs, HTTP URLs, and raw base64)
    if (config.logo) {
      const logoData = await urlToBase64(config.logo);
      if (logoData) {
        parts.push({ inlineData: { data: logoData, mimeType: "image/png" } });
      }
    }

    // Add collab logo if provided
    if (config.collabLogo) {
      const collabData = await urlToBase64(config.collabLogo);
      if (collabData) {
        parts.push({ inlineData: { data: collabData, mimeType: "image/png" } });
      }
    }

    // Add style reference if provided
    if (config.styleReference) {
      const refData = await urlToBase64(config.styleReference);
      if (refData) {
        parts.push({ text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:" });
        parts.push({ inlineData: { data: refData, mimeType: "image/png" } });
      }
    }

    // Add composition assets
    if (config.compositionAssets && config.compositionAssets.length > 0) {
      for (let i = 0; i < config.compositionAssets.length; i++) {
        const assetData = await urlToBase64(config.compositionAssets[i]);
        if (assetData) {
          parts.push({ text: `Ativo de composição ${i + 1}:` });
          parts.push({ inlineData: { data: assetData, mimeType: "image/png" } });
        }
      }
    }

    job.updateProgress(30);

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: config.model || "gemini-3-pro-image-preview",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: mapAspectRatio(config.aspectRatio),
            imageSize: config.imageSize || "1K",
          },
        },
      })
    );

    job.updateProgress(70);

    // Extract image from response
    let imageDataUrl = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageDataUrl) {
      throw new Error("AI failed to generate image");
    }

    // Upload to Vercel Blob
    const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid image data");

    const [, mimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, "base64");
    const extension = mimeType.split("/")[1] || "png";

    const blob = await put(`generated/${jobId}.${extension}`, buffer, {
      access: "public",
      contentType: mimeType,
    });

    job.updateProgress(90);

    // Get user_id from job record
    const jobRecord = await sql`
      SELECT user_id, organization_id FROM generation_jobs WHERE id = ${jobId}
    `;

    if (jobRecord.length === 0) {
      throw new Error("Job record not found");
    }

    // Save to gallery
    const galleryResult = await sql`
      INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size)
      VALUES (
        ${jobRecord[0].user_id},
        ${jobRecord[0].organization_id},
        ${blob.url},
        ${prompt},
        ${config.source || "Flyer"},
        ${config.model || "gemini-3-pro-image-preview"},
        ${config.aspectRatio},
        ${config.imageSize || "1K"}
      )
      RETURNING id
    `;

    const galleryId = galleryResult[0]?.id;

    // Mark as completed
    await sql`
      UPDATE generation_jobs
      SET status = 'completed',
          result_url = ${blob.url},
          result_gallery_id = ${galleryId},
          completed_at = NOW(),
          progress = 100
      WHERE id = ${jobId}
    `;

    console.log(`[JobProcessor] Completed job ${jobId}, gallery ID: ${galleryId}`);

    return { success: true, resultUrl: blob.url, galleryId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[JobProcessor] Error for job ${jobId}:`, errorMessage);

    // Update job as failed
    await sql`
      UPDATE generation_jobs
      SET status = 'failed',
          error_message = ${errorMessage}
      WHERE id = ${jobId}
    `;

    throw error;
  }
};

// Initialize the BullMQ worker if Redis is configured
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
if (REDIS_URL) {
  console.log("[Server] Redis configured, initializing BullMQ worker...");
  initializeWorker(processGenerationJob);

  // Initialize scheduled posts publisher (exact time + 5min fallback)
  initializeScheduledPostsChecker(checkAndPublishScheduledPosts, publishScheduledPostById)
    .then(() => console.log("[Server] Scheduled posts publisher initialized"))
    .catch((err) => console.error("[Server] Failed to initialize scheduled posts publisher:", err.message));
} else {
  console.log("[Server] No Redis URL configured, background jobs will use polling fallback");
}

// ============================================================================
// API ROUTES
// ============================================================================

// Health check
app.get("/api/db/health", async (req, res) => {
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

// Unified initial data endpoint
app.get("/api/db/init", async (req, res) => {
  const start = Date.now();

  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({
        brandProfile: null,
        gallery: [],
        scheduledPosts: [],
        campaigns: [],
        tournamentSchedule: null,
        tournamentEvents: [],
        schedulesList: [],
      });
    }

    const isOrgContext = !!organization_id;

    const [
      brandProfileResult,
      galleryResult,
      scheduledPostsResult,
      campaignsResult,
      tournamentResult,
      schedulesListResult,
    ] = await Promise.all([
      isOrgContext
        ? sql`SELECT * FROM brand_profiles WHERE organization_id = ${organization_id} AND deleted_at IS NULL LIMIT 1`
        : sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`,

      isOrgContext
        ? sql`SELECT * FROM gallery_images WHERE organization_id = ${organization_id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`
        : sql`SELECT * FROM gallery_images WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,

      isOrgContext
        ? sql`SELECT * FROM scheduled_posts WHERE organization_id = ${organization_id} ORDER BY scheduled_timestamp ASC LIMIT 100`
        : sql`SELECT * FROM scheduled_posts WHERE user_id = ${resolvedUserId} AND organization_id IS NULL ORDER BY scheduled_timestamp ASC LIMIT 100`,

      isOrgContext
        ? sql`
          SELECT
            c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
            COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
            COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
            COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
            (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
            (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
            (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
          FROM campaigns c
          WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 20
        `
        : sql`
          SELECT
            c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
            COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
            COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
            COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
            (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
            (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
            (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
          FROM campaigns c
          WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 20
        `,

      isOrgContext
        ? sql`
          SELECT
            ws.*,
            COALESCE(
              (SELECT json_agg(te ORDER BY te.day_of_week, te.name)
               FROM tournament_events te
               WHERE te.week_schedule_id = ws.id),
              '[]'::json
            ) as events
          FROM week_schedules ws
          WHERE ws.organization_id = ${organization_id}
          ORDER BY ws.created_at DESC
          LIMIT 1
        `
        : sql`
          SELECT
            ws.*,
            COALESCE(
              (SELECT json_agg(te ORDER BY te.day_of_week, te.name)
               FROM tournament_events te
               WHERE te.week_schedule_id = ws.id),
              '[]'::json
            ) as events
          FROM week_schedules ws
          WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
          ORDER BY ws.created_at DESC
          LIMIT 1
        `,

      isOrgContext
        ? sql`
          SELECT ws.*, COUNT(te.id)::int as event_count
          FROM week_schedules ws
          LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
          WHERE ws.organization_id = ${organization_id}
          GROUP BY ws.id
          ORDER BY ws.start_date DESC
          LIMIT 10
        `
        : sql`
          SELECT ws.*, COUNT(te.id)::int as event_count
          FROM week_schedules ws
          LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
          WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
          GROUP BY ws.id
          ORDER BY ws.start_date DESC
          LIMIT 10
        `,
    ]);

    const duration = Date.now() - start;
    const tournamentData = tournamentResult[0] || null;

    res.json({
      brandProfile: brandProfileResult[0] || null,
      gallery: galleryResult,
      scheduledPosts: scheduledPostsResult,
      campaigns: campaignsResult,
      tournamentSchedule: tournamentData
        ? {
            id: tournamentData.id,
            user_id: tournamentData.user_id,
            organization_id: tournamentData.organization_id,
            start_date: tournamentData.start_date,
            end_date: tournamentData.end_date,
            filename: tournamentData.filename,
            daily_flyer_urls: tournamentData.daily_flyer_urls || {},
            created_at: tournamentData.created_at,
            updated_at: tournamentData.updated_at,
          }
        : null,
      tournamentEvents: tournamentData?.events || [],
      schedulesList: schedulesListResult,
      _meta: {
        loadTime: duration,
        queriesExecuted: 6,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Init API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Users API
app.get("/api/db/users", async (req, res) => {
  try {
    const sql = getSql();
    const { email, id } = req.query;

    if (id) {
      const result =
        await sql`SELECT * FROM users WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (email) {
      const result =
        await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    return res.status(400).json({ error: "email or id is required" });
  } catch (error) {
    console.error("[Users API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/users", async (req, res) => {
  try {
    const sql = getSql();
    const { email, name, avatar_url, auth_provider, auth_provider_id } =
      req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "email and name are required" });
    }

    const existing =
      await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;

    if (existing.length > 0) {
      // Update auth_provider info and last_login
      const updated = await sql`
        UPDATE users
        SET last_login_at = NOW(),
            auth_provider = COALESCE(${auth_provider}, auth_provider),
            auth_provider_id = COALESCE(${auth_provider_id}, auth_provider_id)
        WHERE id = ${existing[0].id}
        RETURNING *
      `;
      return res.json(updated[0]);
    }

    const result = await sql`
      INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
      VALUES (${email}, ${name}, ${avatar_url || null}, ${auth_provider || "email"}, ${auth_provider_id || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    console.error("[Users API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Brand Profiles API
app.get("/api/db/brand-profiles", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, id, organization_id } = req.query;

    if (id) {
      const result =
        await sql`SELECT * FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.json(null);
      }

      let result;
      if (organization_id) {
        await resolveOrganizationContext(sql, resolvedUserId, organization_id);
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          LIMIT 1
        `;
      } else {
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          LIMIT 1
        `;
      }
      return res.json(result[0] || null);
    }

    return res.status(400).json({ error: "user_id or id is required" });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Brand Profiles API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/brand-profiles", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      name,
      description,
      logo_url,
      primary_color,
      secondary_color,
      tone_of_voice,
    } = req.body;

    if (!user_id || !name) {
      return res.status(400).json({ error: "user_id and name are required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
        return res
          .status(403)
          .json({ error: "Permission denied: manage_brand required" });
      }
    }

    const result = await sql`
      INSERT INTO brand_profiles (user_id, organization_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name}, ${description || null}, ${logo_url || null},
              ${primary_color || "#FFFFFF"}, ${secondary_color || "#000000"}, ${tone_of_voice || "Profissional"})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Brand Profiles API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/db/brand-profiles", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const {
      user_id,
      name,
      description,
      logo_url,
      primary_color,
      secondary_color,
      tone_of_voice,
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const existing =
      await sql`SELECT organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL`;
    if (existing.length === 0) {
      return res.status(404).json({ error: "Brand profile not found" });
    }

    if (existing[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          existing[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
          return res
            .status(403)
            .json({ error: "Permission denied: manage_brand required" });
        }
      }
    }

    const result = await sql`
      UPDATE brand_profiles
      SET name = COALESCE(${name || null}, name),
          description = COALESCE(${description || null}, description),
          logo_url = COALESCE(${logo_url || null}, logo_url),
          primary_color = COALESCE(${primary_color || null}, primary_color),
          secondary_color = COALESCE(${secondary_color || null}, secondary_color),
          tone_of_voice = COALESCE(${tone_of_voice || null}, tone_of_voice)
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Brand Profiles API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Gallery Images API
app.get("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, source, limit } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]);
    }

    let query;
    const limitNum = parseInt(limit) || 50;

    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (source) {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE organization_id = ${organization_id} AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    } else {
      if (source) {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Gallery API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      src_url,
      prompt,
      source,
      model,
      aspect_ratio,
      image_size,
      post_id,
      ad_creative_id,
      video_script_id,
      is_style_reference,
      style_reference_name,
      media_type,
      duration,
    } = req.body;

    if (!user_id || !src_url || !source || !model) {
      return res
        .status(400)
        .json({ error: "user_id, src_url, source, and model are required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.CREATE_FLYER)) {
        return res
          .status(403)
          .json({ error: "Permission denied: create_flyer required" });
      }
    }

    const result = await sql`
      INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size,
                                  post_id, ad_creative_id, video_script_id, is_style_reference, style_reference_name,
                                  media_type, duration)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${src_url}, ${prompt || null}, ${source}, ${model},
              ${aspect_ratio || null}, ${image_size || null},
              ${post_id || null}, ${ad_creative_id || null}, ${video_script_id || null},
              ${is_style_reference || false}, ${style_reference_name || null},
              ${media_type || 'image'}, ${duration || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Gallery API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { published_at } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE gallery_images
      SET published_at = ${published_at || null},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Gallery image not found" });
    }

    return res.status(200).json(result[0]);
  } catch (error) {
    console.error("[Gallery API] PATCH Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const image =
      await sql`SELECT organization_id FROM gallery_images WHERE id = ${id} AND deleted_at IS NULL`;
    if (image.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    if (image[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          image[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_GALLERY)) {
          return res
            .status(403)
            .json({ error: "Permission denied: delete_gallery required" });
        }
      }
    }

    await sql`UPDATE gallery_images SET deleted_at = NOW() WHERE id = ${id}`;
    res.status(204).end();
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Gallery API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Posts API
app.patch("/api/db/posts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { image_url } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE posts SET image_url = ${image_url}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json(result[0]);
  } catch (error) {
    console.error("[Posts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Ad Creatives API
app.patch("/api/db/ad-creatives", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { image_url } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE ad_creatives SET image_url = ${image_url}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Ad creative not found" });
    }

    res.json(result[0]);
  } catch (error) {
    console.error("[Ad Creatives API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Scheduled Posts API
app.get("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, status } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]);
    }

    let query;
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id} AND status = ${status}
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id}
          ORDER BY scheduled_timestamp ASC
        `;
      }
    } else {
      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND status = ${status}
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
          ORDER BY scheduled_timestamp ASC
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Scheduled Posts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      content_type,
      content_id,
      image_url,
      caption,
      hashtags,
      scheduled_date,
      scheduled_time,
      scheduled_timestamp,
      timezone,
      platforms,
      instagram_content_type,
      instagram_account_id,
      created_from,
    } = req.body;

    if (
      !user_id ||
      !image_url ||
      !scheduled_timestamp ||
      !scheduled_date ||
      !scheduled_time ||
      !platforms
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
        return res
          .status(403)
          .json({ error: "Permission denied: schedule_post required" });
      }
    }

    const timestampMs =
      typeof scheduled_timestamp === "string"
        ? new Date(scheduled_timestamp).getTime()
        : scheduled_timestamp;

    const result = await sql`
      INSERT INTO scheduled_posts (
        user_id, organization_id, content_type, content_id, image_url, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, instagram_account_id, created_from
      ) VALUES (
        ${resolvedUserId}, ${organization_id || null}, ${content_type || "flyer"}, ${content_id || null}, ${image_url}, ${caption || ""},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${timestampMs},
        ${timezone || "America/Sao_Paulo"}, ${platforms || "instagram"},
        ${instagram_content_type || "photo"}, ${instagram_account_id || null}, ${created_from || null}
      )
      RETURNING *
    `;

    const newPost = result[0];

    // Schedule the job for exact-time publishing (if Redis is available)
    const REDIS_AVAILABLE = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (REDIS_AVAILABLE && newPost.status === 'scheduled') {
      try {
        const jobResult = await schedulePostForPublishing(
          newPost.id,
          resolvedUserId,
          timestampMs
        );
        console.log(`[Scheduled Posts API] Job scheduled for post ${newPost.id}: ${jobResult.scheduledFor}`);
      } catch (jobError) {
        // Don't fail the request, fallback checker will handle it
        console.warn(`[Scheduled Posts API] Failed to schedule job, will use fallback:`, jobError.message);
      }
    }

    res.status(201).json(newPost);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Scheduled Posts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const post =
      await sql`SELECT organization_id FROM scheduled_posts WHERE id = ${id}`;
    if (post.length === 0) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (post[0].organization_id && updates.user_id) {
      const resolvedUserId = await resolveUserId(sql, updates.user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          post[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
          return res
            .status(403)
            .json({ error: "Permission denied: schedule_post required" });
        }
      }
    }

    const result = await sql`
      UPDATE scheduled_posts
      SET status = COALESCE(${updates.status || null}, status),
          published_at = COALESCE(${updates.published_at || null}, published_at),
          error_message = COALESCE(${updates.error_message || null}, error_message),
          instagram_media_id = COALESCE(${updates.instagram_media_id || null}, instagram_media_id),
          publish_attempts = COALESCE(${updates.publish_attempts || null}, publish_attempts),
          last_publish_attempt = COALESCE(${updates.last_publish_attempt || null}, last_publish_attempt)
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Scheduled Posts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const post =
      await sql`SELECT organization_id FROM scheduled_posts WHERE id = ${id}`;
    if (post.length === 0) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (post[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          post[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
          return res
            .status(403)
            .json({ error: "Permission denied: schedule_post required" });
        }
      }
    }

    // Cancel the scheduled job if Redis is available
    const REDIS_AVAILABLE = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (REDIS_AVAILABLE) {
      try {
        await cancelScheduledPost(id);
      } catch (e) {
        // Ignore - job may not exist
      }
    }

    await sql`DELETE FROM scheduled_posts WHERE id = ${id}`;
    res.status(204).end();
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Scheduled Posts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// INSTAGRAM ACCOUNTS API (Multi-tenant Rube MCP)
// ============================================================================

const RUBE_MCP_URL = 'https://rube.app/mcp';

// Validate Rube token by calling Instagram API
async function validateRubeToken(rubeToken) {
  try {
    const request = {
      jsonrpc: '2.0',
      id: `validate_${Date.now()}`,
      method: 'tools/call',
      params: {
        name: 'RUBE_MULTI_EXECUTE_TOOL',
        arguments: {
          tools: [{
            tool_slug: 'INSTAGRAM_GET_USER_INFO',
            arguments: { fields: 'id,username' }
          }],
          sync_response_to_workbench: false,
          memory: {},
          session_id: 'validate',
          thought: 'Validating Instagram connection'
        }
      }
    };

    const response = await fetch(RUBE_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${rubeToken}`
      },
      body: JSON.stringify(request)
    });

    const text = await response.text();

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return { success: false, error: 'Token inválido ou expirado. Gere um novo token no Rube.' };
    }

    if (!response.ok) {
      return { success: false, error: `Erro ao validar token (${response.status})` };
    }

    // Parse SSE response
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.substring(6));
          if (json?.error) {
            return { success: false, error: 'Instagram não conectado no Rube.' };
          }
          const nestedData = json?.result?.content?.[0]?.text;
          if (nestedData) {
            const parsed = JSON.parse(nestedData);
            if (parsed?.error || parsed?.data?.error) {
              return { success: false, error: 'Instagram não conectado no Rube.' };
            }
            const results = parsed?.data?.data?.results || parsed?.data?.results;
            if (results && results.length > 0) {
              const userData = results[0]?.response?.data;
              if (userData?.id) {
                return {
                  success: true,
                  instagramUserId: String(userData.id),
                  instagramUsername: userData.username || 'unknown'
                };
              }
            }
          }
        } catch (e) {
          console.error('[Instagram Accounts] Parse error:', e);
        }
      }
    }
    return { success: false, error: 'Instagram não conectado no Rube.' };
  } catch (error) {
    return { success: false, error: error.message || 'Erro ao validar token' };
  }
}

// GET - List Instagram accounts
app.get("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, id } = req.query;

    if (id) {
      const result = await sql`
        SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
               is_active, connected_at, last_used_at, created_at, updated_at
        FROM instagram_accounts WHERE id = ${id}
      `;
      return res.json(result[0] || null);
    }

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve Clerk ID to DB UUID
    const userResult = await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
    const resolvedUserId = userResult[0]?.id;
    if (!resolvedUserId) {
      return res.json([]);
    }

    const result = organization_id
      ? await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at
          FROM instagram_accounts
          WHERE organization_id = ${organization_id} AND is_active = TRUE
          ORDER BY connected_at DESC
        `
      : await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at
          FROM instagram_accounts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND is_active = TRUE
          ORDER BY connected_at DESC
        `;

    res.json(result);
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Connect new Instagram account
app.post("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, rube_token } = req.body;

    if (!user_id || !rube_token) {
      return res.status(400).json({ error: 'user_id and rube_token are required' });
    }

    // Resolve Clerk ID to DB UUID
    const userResult = await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
    const resolvedUserId = userResult[0]?.id;
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Validate the Rube token
    const validation = await validateRubeToken(rube_token);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error || 'Token inválido' });
    }

    const { instagramUserId, instagramUsername } = validation;

    // Check if already connected
    const existing = await sql`
      SELECT id FROM instagram_accounts
      WHERE user_id = ${resolvedUserId} AND instagram_user_id = ${instagramUserId}
    `;

    if (existing.length > 0) {
      // Update existing
      const result = await sql`
        UPDATE instagram_accounts
        SET rube_token = ${rube_token}, instagram_username = ${instagramUsername},
            is_active = TRUE, connected_at = NOW(), updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                  is_active, connected_at, last_used_at, created_at, updated_at
      `;
      return res.json({ success: true, account: result[0], message: 'Conta reconectada!' });
    }

    // Create new
    const result = await sql`
      INSERT INTO instagram_accounts (user_id, organization_id, instagram_user_id, instagram_username, rube_token)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${instagramUserId}, ${instagramUsername}, ${rube_token})
      RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                is_active, connected_at, last_used_at, created_at, updated_at
    `;

    res.status(201).json({ success: true, account: result[0], message: `Conta @${instagramUsername} conectada!` });
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update Instagram account token
app.put("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { rube_token } = req.body;

    if (!id || !rube_token) {
      return res.status(400).json({ error: 'id and rube_token are required' });
    }

    const validation = await validateRubeToken(rube_token);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await sql`
      UPDATE instagram_accounts
      SET rube_token = ${rube_token}, instagram_username = ${validation.instagramUsername},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                is_active, connected_at, last_used_at, created_at, updated_at
    `;

    res.json({ success: true, account: result[0], message: 'Token atualizado!' });
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Disconnect Instagram account (soft delete)
app.delete("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    await sql`UPDATE instagram_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}`;
    res.json({ success: true, message: 'Conta desconectada.' });
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API
app.get("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, id, include_content } = req.query;

    if (id) {
      const result = await sql`
        SELECT * FROM campaigns
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;

      if (!result[0]) {
        return res.status(200).json(null);
      }

      if (include_content === "true") {
        const campaign = result[0];

        const [videoScripts, posts, adCreatives] = await Promise.all([
          sql`
            SELECT * FROM video_clip_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          sql`
            SELECT * FROM posts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          sql`
            SELECT * FROM ad_creatives
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
        ]);

        return res.status(200).json({
          ...campaign,
          video_clip_scripts: videoScripts,
          posts: posts,
          ad_creatives: adCreatives,
        });
      }

      return res.status(200).json(result[0]);
    }

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(200).json([]);
    }

    let result;
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      result = await sql`
        SELECT
          c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
        FROM campaigns c
        WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    } else {
      result = await sql`
        SELECT
          c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
        FROM campaigns c
        WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Campaigns API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      name,
      brand_profile_id,
      input_transcript,
      generation_options,
      status,
      video_clip_scripts,
      posts,
      ad_creatives,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({
        error:
          "User not found. Please ensure user exists before creating campaigns.",
      });
    }

    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.CREATE_CAMPAIGN)) {
        return res
          .status(403)
          .json({ error: "Permission denied: create_campaign required" });
      }
    }

    const result = await sql`
      INSERT INTO campaigns (user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null}, ${status || "draft"})
      RETURNING *
    `;

    const campaign = result[0];

    if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
      for (let i = 0; i < video_clip_scripts.length; i++) {
        const script = video_clip_scripts[i];
        await sql`
          INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${i})
        `;
      }
    }

    if (posts && Array.isArray(posts)) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await sql`
          INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
        `;
      }
    }

    if (ad_creatives && Array.isArray(ad_creatives)) {
      for (let i = 0; i < ad_creatives.length; i++) {
        const ad = ad_creatives[i];
        await sql`
          INSERT INTO ad_creatives (campaign_id, user_id, organization_id, platform, headline, body, cta, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${ad.platform}, ${ad.headline}, ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${i})
        `;
      }
    }

    res.status(201).json(campaign);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Campaigns API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const campaign =
      await sql`SELECT organization_id FROM campaigns WHERE id = ${id} AND deleted_at IS NULL`;
    if (campaign.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          campaign[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_CAMPAIGN)) {
          return res
            .status(403)
            .json({ error: "Permission denied: delete_campaign required" });
        }
      }
    }

    await sql`
      UPDATE campaigns
      SET deleted_at = NOW()
      WHERE id = ${id}
    `;

    res.status(200).json({ success: true });
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Campaigns API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update clip thumbnail
app.patch("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const { clip_id } = req.query;
    const { thumbnail_url } = req.body;

    if (!clip_id) {
      return res.status(400).json({ error: "clip_id is required" });
    }

    if (!thumbnail_url) {
      return res.status(400).json({ error: "thumbnail_url is required" });
    }

    const result = await sql`
      UPDATE video_clip_scripts
      SET thumbnail_url = ${thumbnail_url}, updated_at = NOW()
      WHERE id = ${clip_id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Clip not found" });
    }

    console.log(`[Campaigns API] Updated clip ${clip_id} thumbnail`);
    res.status(200).json(result[0]);
  } catch (error) {
    console.error("[Campaigns API] Error updating clip thumbnail:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update scene image_url in scenes JSONB
app.patch("/api/db/campaigns/scene", async (req, res) => {
  try {
    const sql = getSql();
    const { clip_id, scene_number } = req.query;
    const { image_url } = req.body;

    if (!clip_id || scene_number === undefined) {
      return res
        .status(400)
        .json({ error: "clip_id and scene_number are required" });
    }

    const sceneNum = parseInt(scene_number, 10);

    // Get current scenes
    const [clip] = await sql`
      SELECT scenes FROM video_clip_scripts WHERE id = ${clip_id}
    `;

    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    // Update the specific scene with image_url
    const scenes = clip.scenes || [];
    const updatedScenes = scenes.map((scene) => {
      if (scene.sceneNumber === sceneNum) {
        return { ...scene, image_url: image_url || null };
      }
      return scene;
    });

    // Save updated scenes back to database
    const result = await sql`
      UPDATE video_clip_scripts
      SET scenes = ${JSON.stringify(updatedScenes)}::jsonb,
          updated_at = NOW()
      WHERE id = ${clip_id}
      RETURNING *
    `;

    console.log(`[Campaigns API] Updated scene ${sceneNum} image for clip ${clip_id}`);
    res.json(result[0]);
  } catch (error) {
    console.error("[Campaigns API] Error updating scene image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API
app.get("/api/db/tournaments/list", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedules: [] });
    }

    let schedules;
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.organization_id = ${organization_id}
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    } else {
      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    }

    res.json({ schedules });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Tournaments API] List Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedule: null, events: [] });
    }

    if (week_schedule_id) {
      const events = await sql`
        SELECT * FROM tournament_events
        WHERE week_schedule_id = ${week_schedule_id}
        ORDER BY day_of_week, name
      `;
      return res.json({ events });
    }

    let schedules;
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE organization_id = ${organization_id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    if (schedules.length === 0) {
      return res.json({ schedule: null, events: [] });
    }

    const schedule = schedules[0];

    const events = await sql`
      SELECT * FROM tournament_events
      WHERE week_schedule_id = ${schedule.id}
      ORDER BY day_of_week, name
    `;

    res.json({ schedule, events });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Tournaments API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, start_date, end_date, filename, events } =
      req.body;

    if (!user_id || !start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "user_id, start_date, and end_date are required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    }

    const scheduleResult = await sql`
      INSERT INTO week_schedules (user_id, organization_id, start_date, end_date, filename, original_filename)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${start_date}, ${end_date}, ${filename || null}, ${filename || null})
      RETURNING *
    `;

    const schedule = scheduleResult[0];

    if (events && Array.isArray(events) && events.length > 0) {
      const batchSize = 50;

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);

        await Promise.all(
          batch.map(
            (event) =>
              sql`
              INSERT INTO tournament_events (
                user_id, organization_id, week_schedule_id, day_of_week, name, game, gtd, buy_in,
                rebuy, add_on, stack, players, late_reg, minutes, structure, times, event_date
              )
              VALUES (
                ${resolvedUserId}, ${organization_id || null}, ${schedule.id}, ${event.day}, ${event.name}, ${event.game || null},
                ${event.gtd || null}, ${event.buyIn || null}, ${event.rebuy || null},
                ${event.addOn || null}, ${event.stack || null}, ${event.players || null},
                ${event.lateReg || null}, ${event.minutes || null}, ${event.structure || null},
                ${JSON.stringify(event.times || {})}, ${event.eventDate || null}
              )
            `,
          ),
        );
      }
    }

    res.status(201).json({
      schedule,
      eventsCount: events?.length || 0,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Tournaments API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id || !user_id) {
      return res.status(400).json({ error: "id and user_id are required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    const schedule =
      await sql`SELECT organization_id FROM week_schedules WHERE id = ${id}`;
    if (schedule.length > 0 && schedule[0].organization_id) {
      await resolveOrganizationContext(
        sql,
        resolvedUserId,
        schedule[0].organization_id,
      );
    }

    await sql`
      DELETE FROM tournament_events
      WHERE week_schedule_id = ${id}
    `;

    await sql`
      DELETE FROM week_schedules
      WHERE id = ${id}
    `;

    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Tournaments API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generation Jobs API
app.post("/api/generate/queue", async (req, res) => {
  try {
    const sql = getSql();
    const { userId, organizationId, jobType, prompt, config, context } = req.body;

    if (!userId || !jobType || !prompt || !config) {
      return res.status(400).json({
        error: "Missing required fields: userId, jobType, prompt, config",
      });
    }

    if (organizationId) {
      const resolvedUserId = await resolveUserId(sql, userId);
      if (resolvedUserId) {
        await resolveOrganizationContext(sql, resolvedUserId, organizationId);
      }
    }

    // Insert job into database (context is used to match job with UI component)
    const result = await sql`
      INSERT INTO generation_jobs (user_id, organization_id, job_type, prompt, config, status, context)
      VALUES (${userId}, ${organizationId || null}, ${jobType}, ${prompt}, ${JSON.stringify(config)}, 'queued', ${context || null})
      RETURNING id, created_at
    `;

    const dbJob = result[0];

    // Add to BullMQ queue if Redis is configured
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (redisUrl) {
      try {
        await addJob(dbJob.id, { prompt, config });
        console.log(`[Generate Queue] Job ${dbJob.id} added to BullMQ queue`);
      } catch (queueError) {
        console.error(`[Generate Queue] Failed to add to BullMQ, job will be processed by fallback:`, queueError.message);
      }
    } else {
      console.log(`[Generate Queue] No Redis configured, job ${dbJob.id} saved to DB only`);
    }

    res.json({
      success: true,
      jobId: dbJob.id,
      status: "queued",
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Generate Queue] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/generate/status", async (req, res) => {
  try {
    const sql = getSql();
    const { jobId, userId, status: filterStatus, limit } = req.query;

    if (jobId) {
      const jobs = await sql`
        SELECT
          id, user_id, job_type, status, progress,
          result_url, result_gallery_id, error_message,
          created_at, started_at, completed_at, attempts, context
        FROM generation_jobs
        WHERE id = ${jobId}
        LIMIT 1
      `;

      if (jobs.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }

      return res.json(jobs[0]);
    }

    if (userId) {
      let jobs;
      const limitNum = parseInt(limit) || 50;

      if (filterStatus) {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at, context
          FROM generation_jobs
          WHERE user_id = ${userId} AND status = ${filterStatus}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at, context
          FROM generation_jobs
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }

      return res.json({ jobs, total: jobs.length });
    }

    return res.status(400).json({ error: "jobId or userId is required" });
  } catch (error) {
    console.error("[Generate Status] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel/Delete a job
app.delete("/api/generate/job/:jobId", async (req, res) => {
  try {
    const sql = getSql();
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: "jobId is required" });
    }

    // Cancel the job (mark as failed)
    const result = await sql`
      UPDATE generation_jobs
      SET status = 'failed',
          error_message = 'Cancelled by user'
      WHERE id = ${jobId}
      AND status IN ('queued', 'processing')
      RETURNING id
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Job not found or already completed" });
    }

    console.log(`[Generate] Job ${jobId} cancelled by user`);
    res.json({ success: true, jobId });
  } catch (error) {
    console.error("[Generate Cancel] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel all pending jobs for a user
app.post("/api/generate/cancel-all", async (req, res) => {
  try {
    const sql = getSql();
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const result = await sql`
      UPDATE generation_jobs
      SET status = 'failed',
          error_message = 'Cancelled by user (bulk)'
      WHERE user_id = ${userId}
      AND status IN ('queued', 'processing')
      RETURNING id
    `;

    console.log(`[Generate] Cancelled ${result.length} jobs for user ${userId}`);
    res.json({ success: true, cancelledCount: result.length });
  } catch (error) {
    console.error("[Generate Cancel All] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Video Proxy API
app.get("/api/proxy-video", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    if (
      !url.includes(".public.blob.vercel-storage.com/") &&
      !url.includes(".blob.vercel-storage.com/")
    ) {
      return res
        .status(403)
        .json({ error: "Only Vercel Blob URLs are allowed" });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch video: ${response.statusText}` });
    }

    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "video/mp4",
    );
    res.setHeader(
      "Content-Length",
      response.headers.get("content-length") || "",
    );
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;
    if (range) {
      const contentLength = parseInt(
        response.headers.get("content-length") || "0",
      );
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
      res.setHeader("Content-Length", end - start + 1);
    }

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("[Video Proxy] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// File Upload API
const MAX_FILE_SIZE = 100 * 1024 * 1024;

app.post("/api/upload", async (req, res) => {
  try {
    const { filename, contentType, data } = req.body;

    if (!filename || !contentType || !data) {
      return res.status(400).json({
        error: "Missing required fields: filename, contentType, data",
      });
    }

    const buffer = Buffer.from(data, "base64");

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;

    const blob = await put(uniqueFilename, buffer, {
      access: "public",
      contentType,
    });

    return res.status(200).json({
      success: true,
      url: blob.url,
      filename: uniqueFilename,
      size: buffer.length,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================================================
// AI GENERATION ENDPOINTS
// ============================================================================

// AI Campaign Generation
app.post("/api/ai/campaign", async (req, res) => {
  try {
    const { brandProfile, transcript, options, productImages } = req.body;

    if (!brandProfile || !transcript || !options) {
      return res.status(400).json({
        error: "brandProfile, transcript, and options are required",
      });
    }

    console.log("[Campaign API] Generating campaign...");
    console.log("[Campaign API] Options received:", JSON.stringify(options, null, 2));

    // Model selection - config in config/ai-models.ts
    // OpenRouter models have "/" in their ID (e.g., "openai/gpt-5.2")
    const model = brandProfile.creativeModel || "gemini-3-pro-preview";
    const isOpenRouter = model.includes("/");

    const quantityInstructions = buildQuantityInstructions(options);
    console.log("[Campaign API] Quantity instructions:", quantityInstructions);
    const prompt = buildCampaignPrompt(brandProfile, transcript, quantityInstructions);

    let result;

    if (isOpenRouter) {
      const textParts = [prompt];
      const imageParts = productImages || [];

      if (imageParts.length > 0) {
        result = await generateTextWithOpenRouterVision(model, textParts, imageParts, 0.7);
      } else {
        result = await generateTextWithOpenRouter(model, "", prompt, 0.7);
      }
    } else {
      const parts = [{ text: prompt }];

      if (productImages) {
        productImages.forEach((img) => {
          parts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64 },
          });
        });
      }

      result = await generateStructuredContent(model, parts, campaignSchema, 0.7);
    }

    const campaign = JSON.parse(result);

    console.log("[Campaign API] Campaign generated successfully");

    res.json({
      success: true,
      campaign,
      model,
    });
  } catch (error) {
    console.error("[Campaign API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate campaign" });
  }
});

// AI Flyer Generation
app.post("/api/ai/flyer", async (req, res) => {
  try {
    const {
      prompt,
      brandProfile,
      logo,
      referenceImage,
      aspectRatio = "9:16",
      collabLogo,
      imageSize = "1K",
      compositionAssets,
    } = req.body;

    if (!prompt || !brandProfile) {
      return res.status(400).json({ error: "prompt and brandProfile are required" });
    }

    console.log(`[Flyer API] Generating flyer, aspect ratio: ${aspectRatio}`);

    const ai = getGeminiAi();
    const brandingInstruction = buildFlyerPrompt(brandProfile);

    const parts = [
      { text: brandingInstruction },
      { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
    ];

    if (logo) {
      parts.push({ inlineData: { data: logo.base64, mimeType: logo.mimeType } });
    }

    if (collabLogo) {
      parts.push({
        inlineData: { data: collabLogo.base64, mimeType: collabLogo.mimeType },
      });
    }

    if (referenceImage) {
      parts.push({ text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:" });
      parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    if (compositionAssets) {
      compositionAssets.forEach((asset, i) => {
        parts.push({ text: `Ativo de composição ${i + 1}:` });
        parts.push({
          inlineData: { data: asset.base64, mimeType: asset.mimeType },
        });
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio),
          imageSize,
        },
      },
    });

    let imageDataUrl = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageDataUrl) {
      throw new Error("A IA falhou em produzir o Flyer.");
    }

    console.log("[Flyer API] Flyer generated successfully");

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    console.error("[Flyer API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate flyer" });
  }
});

// AI Image Generation
app.post("/api/ai/image", async (req, res) => {
  try {
    const {
      prompt,
      brandProfile,
      aspectRatio = "1:1",
      model = "gemini-3-pro-image-preview",
      imageSize = "1K",
      productImages,
      styleReferenceImage,
    } = req.body;

    if (!prompt || !brandProfile) {
      return res.status(400).json({ error: "prompt and brandProfile are required" });
    }

    console.log(`[Image API] Generating image with ${model}, aspect ratio: ${aspectRatio}`);

    let imageDataUrl;

    if (model === "imagen-4.0-generate-001") {
      const fullPrompt = buildImagePrompt(prompt, brandProfile, !!styleReferenceImage);
      imageDataUrl = await generateImagenImage(fullPrompt, aspectRatio);
    } else {
      const fullPrompt = buildImagePrompt(prompt, brandProfile, !!styleReferenceImage);
      imageDataUrl = await generateGeminiImage(
        fullPrompt,
        aspectRatio,
        model,
        imageSize,
        productImages,
        styleReferenceImage
      );
    }

    console.log("[Image API] Image generated successfully");

    res.json({
      success: true,
      imageUrl: imageDataUrl,
      model,
    });
  } catch (error) {
    console.error("[Image API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate image" });
  }
});

// Convert generic prompt to structured JSON for video generation
app.post("/api/ai/convert-prompt", async (req, res) => {
  try {
    const { prompt, duration = 5, aspectRatio = "16:9" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    console.log(`[Convert Prompt API] Converting prompt to JSON, duration: ${duration}s`);

    const ai = getGeminiAi();
    const systemPrompt = getVideoPromptSystemPrompt(duration, aspectRatio);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\nPrompt: " + prompt }] }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    const text = response.text?.trim() || "";

    // Try to parse as JSON
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // If not valid JSON, return as-is
      result = text;
    }

    console.log("[Convert Prompt API] Conversion successful");

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[Convert Prompt API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to convert prompt" });
  }
});

// AI Text Generation
app.post("/api/ai/text", async (req, res) => {
  try {
    const {
      type,
      brandProfile,
      context,
      systemPrompt,
      userPrompt,
      image,
      temperature = 0.7,
      responseSchema,
    } = req.body;

    if (!brandProfile) {
      return res.status(400).json({ error: "brandProfile is required" });
    }

    console.log(`[Text API] Generating ${type} text...`);

    const model = brandProfile.creativeModel || "gemini-3-pro-preview";
    const isOpenRouter = model.includes("/");

    let result;

    if (type === "quickPost") {
      if (!context) {
        return res.status(400).json({ error: "context is required for quickPost" });
      }

      const prompt = buildQuickPostPrompt(brandProfile, context);

      if (isOpenRouter) {
        const parts = [prompt];
        if (image) {
          result = await generateTextWithOpenRouterVision(model, parts, [image], temperature);
        } else {
          result = await generateTextWithOpenRouter(model, "", prompt, temperature);
        }
      } else {
        const parts = [{ text: prompt }];
        if (image) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            },
          });
        }
        result = await generateStructuredContent(model, parts, quickPostSchema, temperature);
      }
    } else {
      if (!systemPrompt && !userPrompt) {
        return res.status(400).json({ error: "systemPrompt or userPrompt is required for custom text" });
      }

      if (isOpenRouter) {
        if (image) {
          const parts = userPrompt ? [userPrompt] : [];
          result = await generateTextWithOpenRouterVision(model, parts, [image], temperature);
        } else {
          result = await generateTextWithOpenRouter(model, systemPrompt || "", userPrompt || "", temperature);
        }
      } else {
        const parts = [];
        if (userPrompt) {
          parts.push({ text: userPrompt });
        }
        if (image) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            },
          });
        }

        result = await generateStructuredContent(
          model,
          parts,
          responseSchema || quickPostSchema,
          temperature
        );
      }
    }

    console.log("[Text API] Text generated successfully");

    res.json({
      success: true,
      result: JSON.parse(result),
      model,
    });
  } catch (error) {
    console.error("[Text API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate text" });
  }
});

// AI Edit Image
app.post("/api/ai/edit-image", async (req, res) => {
  try {
    const { image, prompt, mask, referenceImage } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: "image and prompt are required" });
    }

    console.log("[Edit Image API] Editing image...");

    const ai = getGeminiAi();
    const instructionPrompt = `DESIGNER SÊNIOR: Execute alteração profissional: ${prompt}. Texto original e logos são SAGRADOS, preserve informações importantes visíveis.`;

    const parts = [
      { text: instructionPrompt },
      { inlineData: { data: image.base64, mimeType: image.mimeType } },
    ];

    if (mask) {
      parts.push({ inlineData: { data: mask.base64, mimeType: mask.mimeType } });
    }
    if (referenceImage) {
      parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: { parts },
      config: { imageConfig: { imageSize: "1K" } },
    });

    let imageDataUrl = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageDataUrl) {
      throw new Error("Failed to edit image");
    }

    console.log("[Edit Image API] Image edited successfully");

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    console.error("[Edit Image API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to edit image" });
  }
});

// AI Extract Colors from Logo
app.post("/api/ai/extract-colors", async (req, res) => {
  try {
    const { logo } = req.body;

    if (!logo) {
      return res.status(400).json({ error: "logo is required" });
    }

    console.log("[Extract Colors API] Analyzing logo...");

    const ai = getGeminiAi();

    const colorSchema = {
      type: Type.OBJECT,
      properties: {
        primaryColor: { type: Type.STRING },
        secondaryColor: { type: Type.STRING, nullable: true },
        tertiaryColor: { type: Type.STRING, nullable: true },
      },
      required: ["primaryColor"],
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            text: `Analise este logo e extraia APENAS as cores que REALMENTE existem na imagem visível.

REGRAS IMPORTANTES:
- Extraia somente cores que você pode ver nos pixels da imagem
- NÃO invente cores que não existem
- Ignore áreas transparentes (não conte transparência como cor)
- Se o logo tiver apenas 1 cor visível, retorne null para secondaryColor e tertiaryColor
- Se o logo tiver apenas 2 cores visíveis, retorne null para tertiaryColor

PRIORIDADE DAS CORES:
- primaryColor: A cor mais dominante/presente no logo (maior área)
- secondaryColor: A segunda cor mais presente (se existir), ou null
- tertiaryColor: Uma terceira cor de destaque/acento (se existir), ou null

Retorne as cores em formato hexadecimal (#RRGGBB).`,
          },
          { inlineData: { mimeType: logo.mimeType, data: logo.base64 } },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: colorSchema,
      },
    });

    const colors = JSON.parse(response.text.trim());

    console.log("[Extract Colors API] Colors extracted:", colors);

    res.json(colors);
  } catch (error) {
    console.error("[Extract Colors API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to extract colors" });
  }
});

// AI Speech Generation (TTS)
app.post("/api/ai/speech", async (req, res) => {
  try {
    const { script, voiceName = "Orus" } = req.body;

    if (!script) {
      return res.status(400).json({ error: "script is required" });
    }

    console.log("[Speech API] Generating speech...");

    const ai = getGeminiAi();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: script }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });

    const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";

    if (!audioBase64) {
      throw new Error("Failed to generate speech");
    }

    console.log("[Speech API] Speech generated successfully");

    res.json({
      success: true,
      audioBase64,
    });
  } catch (error) {
    console.error("[Speech API] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate speech" });
  }
});

// AI Assistant Streaming Endpoint
app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { history, brandProfile } = req.body;

    if (!history) {
      return res.status(400).json({ error: "history is required" });
    }

    console.log("[Assistant API] Starting streaming conversation...");

    const ai = getGeminiAi();

    const assistantTools = {
      functionDeclarations: [
        {
          name: "create_image",
          description: "Gera uma nova imagem de marketing do zero.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: "Descrição técnica detalhada para a IA de imagem.",
              },
              aspect_ratio: {
                type: Type.STRING,
                enum: ["1:1", "9:16", "16:9"],
                description: "Proporção da imagem.",
              }
            },
            required: ["description"],
          },
        },
        {
          name: "edit_referenced_image",
          description: "Edita a imagem atualmente em foco.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              prompt: {
                type: Type.STRING,
                description: "Descrição exata da alteração desejada.",
              },
            },
            required: ["prompt"],
          },
        },
        {
          name: "create_brand_logo",
          description: "Cria um novo logo para a marca.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING, description: "Descrição do logo." },
            },
            required: ["prompt"],
          },
        }
      ],
    };

    const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design de alta performance.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: history,
      config: {
        systemInstruction,
        tools: [assistantTools],
        temperature: 0.5,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text || '';
      const functionCall = chunk.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;

      const data = { text };
      if (functionCall) {
        data.functionCall = functionCall;
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

    console.log("[Assistant API] Streaming completed");
  } catch (error) {
    console.error("[Assistant API] Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Failed to run assistant" });
    }
    res.end();
  }
});

// AI Video Generation API
const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is not configured');
  }
  fal.config({ credentials: apiKey });
};

app.post("/api/ai/video", async (req, res) => {
  try {
    configureFal();

    const { prompt, aspectRatio, model, imageUrl, sceneDuration } = req.body;

    if (!prompt || !aspectRatio || !model) {
      return res.status(400).json({
        error: 'Missing required fields: prompt, aspectRatio, model',
      });
    }

    console.log(`[Video API] Generating video with ${model}...`);

    let videoUrl;
    const isHttpUrl = imageUrl && imageUrl.startsWith('http');

    if (model === 'sora-2') {
      const duration = 12;

      let result;

      if (isHttpUrl) {
        result = await fal.subscribe('fal-ai/sora-2/image-to-video', {
          input: {
            prompt,
            image_url: imageUrl,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            duration,
            delete_video: false,
          },
          logs: true,
        });
      } else {
        result = await fal.subscribe('fal-ai/sora-2/text-to-video', {
          input: {
            prompt,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            duration,
            delete_video: false,
          },
          logs: true,
        });
      }

      videoUrl = result?.data?.video?.url || result?.video?.url || '';
    } else {
      const duration = sceneDuration && sceneDuration <= 4 ? '4s' : sceneDuration && sceneDuration <= 6 ? '6s' : '8s';

      let result;

      if (isHttpUrl) {
        result = await fal.subscribe('fal-ai/veo3.1/fast/image-to-video', {
          input: {
            prompt,
            image_url: imageUrl,
            aspect_ratio: aspectRatio,
            duration,
            resolution: '720p',
            generate_audio: true,
          },
          logs: true,
        });
      } else {
        result = await fal.subscribe('fal-ai/veo3.1/fast', {
          input: {
            prompt,
            aspect_ratio: aspectRatio,
            duration,
            resolution: '720p',
            generate_audio: true,
            auto_fix: true,
          },
          logs: true,
        });
      }

      videoUrl = result?.data?.video?.url || result?.video?.url || '';
    }

    if (!videoUrl) {
      throw new Error('Failed to generate video - invalid response');
    }

    console.log(`[Video API] Video generated: ${videoUrl}`);

    console.log('[Video API] Uploading to Vercel Blob...');
    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();

    const filename = `${model}-video-${Date.now()}.mp4`;
    const blob = await put(filename, videoBlob, {
      access: 'public',
      contentType: 'video/mp4',
    });

    console.log(`[Video API] Video stored: ${blob.url}`);

    return res.status(200).json({
      success: true,
      url: blob.url,
      model,
    });
  } catch (error) {
    console.error('[Video API] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate video',
    });
  }
});

// ============================================================================
// RUBE MCP PROXY - For Instagram Publishing
// ============================================================================

// RUBE_MCP_URL already defined above at line 1752

app.post("/api/rube", async (req, res) => {
  try {
    const sql = getSql();
    const { instagram_account_id, user_id, ...mcpRequest } = req.body;

    let token;
    let instagramUserId;

    // Multi-tenant mode: use user's token from database
    if (instagram_account_id && user_id) {
      console.log('[Rube Proxy] Multi-tenant mode - fetching token for account:', instagram_account_id);

      // Resolve user_id: can be DB UUID or Clerk ID
      let resolvedUserId = user_id;
      if (user_id.startsWith('user_')) {
        const userResult = await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
        resolvedUserId = userResult[0]?.id;
        if (!resolvedUserId) {
          console.log('[Rube Proxy] User not found for Clerk ID:', user_id);
          return res.status(400).json({ error: 'User not found' });
        }
      }

      // Fetch account token and instagram_user_id
      const accountResult = await sql`
        SELECT rube_token, instagram_user_id FROM instagram_accounts
        WHERE id = ${instagram_account_id} AND user_id = ${resolvedUserId} AND is_active = TRUE
        LIMIT 1
      `;

      if (accountResult.length === 0) {
        console.log('[Rube Proxy] Instagram account not found or not active');
        return res.status(403).json({ error: 'Instagram account not found or inactive' });
      }

      token = accountResult[0].rube_token;
      instagramUserId = accountResult[0].instagram_user_id;
      console.log('[Rube Proxy] Using token for Instagram user:', instagramUserId);

      // Update last_used_at
      await sql`UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = ${instagram_account_id}`;
    } else {
      // Fallback to global token (dev mode)
      token = process.env.RUBE_TOKEN;
      if (!token) {
        return res.status(500).json({ error: 'RUBE_TOKEN not configured' });
      }
      console.log('[Rube Proxy] Using global RUBE_TOKEN (dev mode)');
    }

    // Inject ig_user_id into tool arguments if we have it
    if (instagramUserId && mcpRequest.params?.arguments) {
      // For RUBE_MULTI_EXECUTE_TOOL, inject into each tool's arguments
      if (mcpRequest.params.arguments.tools && Array.isArray(mcpRequest.params.arguments.tools)) {
        mcpRequest.params.arguments.tools.forEach(tool => {
          if (tool.arguments) {
            tool.arguments.ig_user_id = instagramUserId;
          }
        });
        console.log('[Rube Proxy] Injected ig_user_id into', mcpRequest.params.arguments.tools.length, 'tools');
      } else {
        // For direct tool calls
        mcpRequest.params.arguments.ig_user_id = instagramUserId;
        console.log('[Rube Proxy] Injected ig_user_id directly');
      }
    }

    const response = await fetch(RUBE_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(mcpRequest),
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    console.error('[Rube Proxy] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// STATIC FILES - Serve frontend in production
// ============================================================================

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, "../dist"), {
  setHeaders: (res, filePath) => {
    // Set COEP headers for WASM support
    if (filePath.endsWith('.html')) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
  }
}));

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }

  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

// ============================================================================
// AUTO-MIGRATION & START SERVER
// ============================================================================

async function runAutoMigrations() {
  if (!DATABASE_URL) {
    console.log("[Migration] Skipping - no DATABASE_URL configured");
    return;
  }

  try {
    const sql = getSql();

    // Ensure context column exists (for job-to-UI matching)
    await sql`
      ALTER TABLE generation_jobs
      ADD COLUMN IF NOT EXISTS context VARCHAR(255)
    `;
    console.log("[Migration] ✓ Ensured context column exists");

    // Add 'clip' to generation_job_type enum if not exists
    try {
      await sql`ALTER TYPE generation_job_type ADD VALUE IF NOT EXISTS 'clip'`;
      console.log("[Migration] ✓ Ensured 'clip' job type exists");
    } catch (enumError) {
      // Might already exist or different PG version
      console.log("[Migration] Note: clip enum might already exist");
    }

    // Create instagram_accounts table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS instagram_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id VARCHAR(50),
        instagram_user_id VARCHAR(255) NOT NULL,
        instagram_username VARCHAR(255),
        rube_token TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, instagram_user_id)
      )
    `;
    console.log("[Migration] ✓ Ensured instagram_accounts table exists");

    // Add instagram_account_id column to scheduled_posts if not exists
    await sql`
      ALTER TABLE scheduled_posts
      ADD COLUMN IF NOT EXISTS instagram_account_id UUID REFERENCES instagram_accounts(id) ON DELETE SET NULL
    `;
    console.log("[Migration] ✓ Ensured instagram_account_id column in scheduled_posts");

  } catch (error) {
    console.error("[Migration] Error:", error.message);
    // Don't fail startup - column might already exist with different syntax
  }
}

async function startServer() {
  // Run migrations first
  await runAutoMigrations();

  app.listen(PORT, () => {
    console.log(`[Production Server] Running on port ${PORT}`);
    console.log(`[Production Server] Database: ${DATABASE_URL ? "Connected" : "NOT CONFIGURED"}`);
    console.log(`[Production Server] Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();
