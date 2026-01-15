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
import {
  checkAndPublishScheduledPosts,
  publishScheduledPostById,
} from "./helpers/scheduled-publisher.mjs";
import {
  buildCampaignPrompt,
  buildQuantityInstructions,
} from "./helpers/campaign-prompts.mjs";
import { urlToBase64 } from "./helpers/image-helpers.mjs";
import {
  logAiUsage,
  extractGeminiTokens,
  extractOpenRouterTokens,
  createTimer,
} from "./helpers/usage-tracking.mjs";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Railway provides PORT environment variable
const PORT = process.env.PORT || 8080;

// CORS configuration - Allow same-origin and configured origins
const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Default allowed domains (Railway, Vercel, localhost)
const defaultAllowedPatterns = [
  ".up.railway.app",
  ".vercel.app",
  "localhost",
  "127.0.0.1",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Check configured origins first
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check against default allowed patterns (Railway, Vercel, localhost)
      if (defaultAllowedPatterns.some((pattern) => origin.includes(pattern))) {
        return callback(null, true);
      }

      console.warn("[CORS] Blocked request from unauthorized origin:", origin);
      return callback(new Error("CORS not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

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

// Model defaults
const DEFAULT_TEXT_MODEL = "gemini-3-flash-preview";
const DEFAULT_FAST_TEXT_MODEL = "gemini-3-flash-preview";
const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_ASSISTANT_MODEL = "gemini-3-flash-preview";

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
        console.log(
          `[Gemini] Retry ${attempt}/${maxRetries} after ${delayMs}ms...`,
        );
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
const generateGeminiImage = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
) => {
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
    }),
  );

  const responseParts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(responseParts)) {
    console.error("[Image API] Unexpected response:", JSON.stringify(response, null, 2));
    throw new Error("Failed to generate image - invalid response structure");
  }

  for (const part of responseParts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate image");
};

// Generate structured content with Gemini
const generateStructuredContent = async (
  model,
  parts,
  responseSchema,
  temperature = 0.7,
) => {
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
const generateTextWithOpenRouter = async (
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
) => {
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
const generateTextWithOpenRouterVision = async (
  model,
  textParts,
  imageParts,
  temperature = 0.7,
) => {
  const openrouter = getOpenRouter();

  const content = textParts.map((text) => ({ type: "text", text }));

  for (const img of imageParts) {
    content.push({
      type: "image_url",
      imageUrl: {
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
  const targets = brandProfile.toneTargets || [
    "campaigns",
    "posts",
    "images",
    "flyers",
  ];
  return targets.includes(target);
};

const getToneText = (brandProfile, target) => {
  return shouldUseTone(brandProfile, target) ? brandProfile.toneOfVoice : "";
};

const buildImagePrompt = (
  prompt,
  brandProfile,
  hasStyleReference = false,
  hasLogo = false,
  hasProductImages = false,
) => {
  const toneText = getToneText(brandProfile, "images");
  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText ? `${toneText}, ` : ""}Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;

  if (hasLogo) {
    fullPrompt += `

**LOGO DA MARCA (OBRIGATÓRIO):**
- Use o LOGO EXATO fornecido na imagem de referência anexada - NÃO CRIE UM LOGO DIFERENTE
- O logo deve aparecer de forma clara e legível na composição
- Mantenha as proporções e cores originais do logo`;
  }

  if (hasProductImages) {
    fullPrompt += `

**IMAGENS DE PRODUTO (OBRIGATÓRIO):**
- As imagens anexadas são referências de produto
- Preserve fielmente o produto (forma, cores e detalhes principais)
- O produto deve aparecer com destaque na composição`;
  }

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
    carousels: {
      type: Type.ARRAY,
      description: "Carrosséis para Instagram (4-6 slides cada).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          cover_prompt: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                slide: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ["slide", "visual", "text"],
            },
          },
        },
        required: ["title", "hook", "cover_prompt", "slides"],
      },
    },
  },
  required: ["videoClipScripts", "posts", "adCreatives", "carousels"],
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
// SECURITY: Authentication & Authorization Middleware
// ============================================================================

// Rate limiting storage (in-memory, use Redis in production for distributed)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // max requests per window

function checkRateLimit(identifier) {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(identifier, { windowStart: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Middleware: Require authentication
function requireAuth(req, res, next) {
  const auth = getAuth(req);

  if (!auth?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  // Apply rate limiting per user
  const rateLimit = checkRateLimit(auth.userId);
  res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    });
  }

  req.authUserId = auth.userId;
  req.authOrgId = auth.orgId || null;
  next();
}

// Middleware: Verify user owns the requested resource
async function requireResourceAccess(req, res, next) {
  const auth = getAuth(req);

  if (!auth?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  // Get user_id from query or body
  const requestedUserId =
    req.query.user_id || req.body?.user_id || req.params?.user_id;
  const requestedOrgId =
    req.query.organization_id ||
    req.body?.organization_id ||
    req.params?.organization_id;

  // If no user_id provided, attach auth user
  if (!requestedUserId && !requestedOrgId) {
    req.authUserId = auth.userId;
    req.authOrgId = auth.orgId || null;
    return next();
  }

  try {
    const sql = getSql();

    // Resolve the authenticated user's database ID
    const authDbUser = await sql`
      SELECT id FROM users
      WHERE auth_provider_id = ${auth.userId}
      AND deleted_at IS NULL
      LIMIT 1
    `;

    if (authDbUser.length === 0) {
      return res.status(403).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    const authDbUserId = authDbUser[0].id;

    // If requesting by organization_id, verify org membership via Clerk
    if (requestedOrgId) {
      // Clerk provides orgId in the auth object if user is in that org
      if (auth.orgId === requestedOrgId) {
        req.authUserId = auth.userId;
        req.authDbUserId = authDbUserId;
        req.authOrgId = requestedOrgId;
        return next();
      }

      // Check if user has access to this org
      return res.status(403).json({
        error: "Access denied to this organization",
        code: "ORG_ACCESS_DENIED",
      });
    }

    // If requesting by user_id, verify it matches the authenticated user
    if (requestedUserId) {
      const resolvedRequestedId = await resolveUserId(sql, requestedUserId);

      // Allow if the requested user_id matches the authenticated user
      if (
        resolvedRequestedId === authDbUserId ||
        requestedUserId === auth.userId
      ) {
        req.authUserId = auth.userId;
        req.authDbUserId = authDbUserId;
        req.authOrgId = auth.orgId || null;
        return next();
      }

      console.warn(
        `[Security] User ${auth.userId} attempted to access resources for user ${requestedUserId}`,
      );
      return res.status(403).json({
        error: "Access denied to this resource",
        code: "RESOURCE_ACCESS_DENIED",
      });
    }

    next();
  } catch (error) {
    console.error("[Auth Middleware] Error:", error);
    return res.status(500).json({ error: "Authentication error" });
  }
}

// ============================================================================
// SECURITY: Input Validation & Sanitization
// ============================================================================

// Sanitize string input to prevent XSS and injection attacks
function sanitizeString(input, maxLength = 10000) {
  if (typeof input !== "string") return "";

  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim();
}

// Validate and sanitize AI prompt input
function validatePrompt(prompt, fieldName = "prompt") {
  if (!prompt || typeof prompt !== "string") {
    return { valid: false, error: `${fieldName} is required and must be a string` };
  }

  const sanitized = sanitizeString(prompt, 50000);

  if (sanitized.length < 1) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  return { valid: true, value: sanitized };
}

// Validate user_id format
function validateUserId(userId) {
  if (!userId) return { valid: false, error: "user_id is required" };

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clerkPattern = /^user_[a-zA-Z0-9]+$/;

  if (uuidPattern.test(userId) || clerkPattern.test(userId)) {
    return { valid: true, value: userId };
  }

  return { valid: false, error: "Invalid user_id format" };
}

// Validate URL format
function validateUrl(url, allowedDomains = []) {
  if (!url) return { valid: true, value: null };

  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Invalid URL protocol" };
    }

    // If allowed domains specified, check against them
    if (allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some(
        (domain) =>
          parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
      );
      if (!isAllowed) {
        return { valid: false, error: "URL domain not allowed" };
      }
    }

    return { valid: true, value: url };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

// Rate limit for AI endpoints (stricter than general rate limit)
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const AI_RATE_LIMIT_MAX_REQUESTS = 30; // max AI requests per window

function checkAiRateLimit(identifier) {
  const key = `ai:${identifier}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now - record.windowStart > AI_RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: AI_RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= AI_RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: AI_RATE_LIMIT_MAX_REQUESTS - record.count };
}

// Middleware for AI endpoints with stricter rate limiting
function requireAuthWithAiRateLimit(req, res, next) {
  const auth = getAuth(req);

  if (!auth?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  // Apply stricter AI rate limiting
  const rateLimit = checkAiRateLimit(auth.userId);
  res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: "AI rate limit exceeded. Please try again later.",
      code: "AI_RATE_LIMIT_EXCEEDED",
    });
  }

  req.authUserId = auth.userId;
  req.authOrgId = auth.orgId || null;
  next();
}

// ============================================================================
// BULLMQ JOB PROCESSOR
// ============================================================================

/**
 * Process video generation jobs
 */
const processVideoGenerationJob = async (job, jobId, prompt, config, sql) => {
  console.log(`[JobProcessor] Processing VIDEO job ${jobId}`);

  const {
    model,
    aspectRatio,
    imageUrl,
    lastFrameUrl,
    sceneDuration,
    useInterpolation,
  } = config;
  const isInterpolationMode = useInterpolation && lastFrameUrl;

  job.updateProgress(20);

  let videoUrl;
  let result;

  // Use fal.ai for video generation (or Google API for interpolation)
  if (model === "sora-2") {
    // Sora model
    if (imageUrl) {
      result = await fal.subscribe("fal-ai/sora-2/image-to-video", {
        input: {
          prompt,
          image_url: imageUrl,
          duration: sceneDuration || 5,
          aspect_ratio: aspectRatio || "9:16",
          delete_video: false,
        },
      });
    } else {
      result = await fal.subscribe("fal-ai/sora-2/text-to-video", {
        input: {
          prompt,
          duration: sceneDuration || 5,
          aspect_ratio: aspectRatio || "9:16",
          delete_video: false,
        },
      });
    }
    videoUrl = result?.data?.video?.url || result?.video?.url || "";
  } else {
    // Veo 3.1 model - try Google API first, fallback to FAL.ai
    try {
      videoUrl = await generateVideoWithGoogleVeo(
        prompt,
        aspectRatio || "9:16",
        imageUrl,
        isInterpolationMode ? lastFrameUrl : null,
      );
    } catch (googleError) {
      console.log(
        `[JobProcessor] Google Veo failed: ${googleError.message}`,
      );
      console.log("[JobProcessor] Falling back to FAL.ai...");
      const duration = isInterpolationMode
        ? "8s"
        : sceneDuration
          ? String(sceneDuration)
          : "5";
      if (imageUrl) {
        result = await fal.subscribe("fal-ai/veo3.1/fast/image-to-video", {
          input: {
            prompt,
            image_url: imageUrl,
            duration,
            aspect_ratio: aspectRatio || "9:16",
          },
        });
      } else {
        result = await fal.subscribe("fal-ai/veo3.1/fast", {
          input: {
            prompt,
            duration,
            aspect_ratio: aspectRatio || "9:16",
          },
        });
      }
      videoUrl = result?.data?.video?.url || result?.video?.url || "";
    }
  }

  job.updateProgress(70);

  if (!videoUrl) {
    throw new Error("Failed to generate video - invalid response");
  }

  console.log(`[JobProcessor] Video generated: ${videoUrl}`);

  // Download video and upload to Vercel Blob for persistence
  const videoResponse = await fetch(videoUrl);
  const videoBlob = await videoResponse.blob();

  const filename = `${model || "veo"}-video-${jobId}.mp4`;
  const blob = await put(filename, videoBlob, {
    access: "public",
    contentType: "video/mp4",
  });

  job.updateProgress(90);

  return { resultUrl: blob.url };
};

const resolveJobImage = async (image) => {
  if (!image) return null;

  if (typeof image === "string") {
    if (image.startsWith("data:")) {
      const [header, data] = image.split(",");
      const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
      return { base64: data, mimeType };
    }

    const base64 = await urlToBase64(image);
    if (!base64) return null;
    return { base64, mimeType: "image/png" };
  }

  if (image.base64) {
    return {
      base64: image.base64,
      mimeType: image.mimeType || "image/png",
    };
  }

  return null;
};

/**
 * Process generic image generation jobs (simple prompt-based)
 */
const processImageGenerationJob = async (job, jobId, prompt, config, sql) => {
  console.log(`[JobProcessor] Processing IMAGE job ${jobId}`);

  const ai = getGeminiAi();
  const model = config.model || DEFAULT_IMAGE_MODEL;

  // Build parts array
  const parts = [];

  // Add system instruction for image generation
  const systemPrompt = config.systemPrompt || `You are an expert image generator. Create a high-quality image based on the user's description.
Style: ${config.style || "photorealistic"}
Mood: ${config.mood || "professional"}`;

  parts.push({ text: systemPrompt });
  parts.push({ text: `Generate an image: ${prompt}` });

  // Add reference image if provided
  if (config.referenceImage) {
    const refData = await urlToBase64(config.referenceImage);
    if (refData) {
      parts.push({ text: "Use this as style reference:" });
      parts.push({ inlineData: { data: refData, mimeType: "image/png" } });
    }
  }

  // Add edit source image if provided (for image editing)
  if (config.sourceImage) {
    const srcData = await urlToBase64(config.sourceImage);
    if (srcData) {
      parts.push({ text: "Edit this image according to the instructions:" });
      parts.push({ inlineData: { data: srcData, mimeType: "image/png" } });
    }
  }

  if (config.productImages && config.productImages.length > 0) {
    for (const image of config.productImages) {
      const resolved = await resolveJobImage(image);
      if (resolved) {
        parts.push({ text: "Use this product image as reference:" });
        parts.push({
          inlineData: { data: resolved.base64, mimeType: resolved.mimeType },
        });
      }
    }
  }

  job.updateProgress(30);

  // Generate image
  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mapAspectRatio(config.aspectRatio || "1:1"),
          imageSize: config.imageSize || "1K",
        },
      },
    }),
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

  const blob = await put(`generated/image-${jobId}.${extension}`, buffer, {
    access: "public",
    contentType: mimeType,
  });

  job.updateProgress(90);

  // Get owner info
  const jobOwner = await sql`
    SELECT user_id, organization_id FROM generation_jobs WHERE id = ${jobId}
  `;

  if (jobOwner.length === 0) {
    throw new Error("Job record not found");
  }

  // Save to gallery
  const galleryResult = await sql`
    INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size)
    VALUES (
      ${jobOwner[0].user_id},
      ${jobOwner[0].organization_id},
      ${blob.url},
      ${prompt},
      ${config.source || "AI Generated"},
      ${model},
      ${config.aspectRatio || "1:1"},
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

  return { resultUrl: blob.url, galleryId };
};

/**
 * Process all generation jobs from BullMQ queue
 */
const processGenerationJob = async (job) => {
  const { jobId, prompt, config } = job.data;
  const sql = getSql();

  console.log(`[JobProcessor] Processing job ${jobId}`);

  try {
    // Get job type from database
    const jobRecord = await sql`
      SELECT job_type, user_id, organization_id FROM generation_jobs WHERE id = ${jobId}
    `;

    if (jobRecord.length === 0) {
      throw new Error("Job record not found");
    }

    const jobType = jobRecord[0].job_type;

    // Mark as processing
    await sql`
      UPDATE generation_jobs
      SET status = 'processing',
          started_at = NOW(),
          attempts = COALESCE(attempts, 0) + 1
      WHERE id = ${jobId}
    `;

    job.updateProgress(10);

    // Handle video jobs
    if (jobType === "video") {
      const { resultUrl } = await processVideoGenerationJob(
        job,
        jobId,
        prompt,
        config,
        sql,
      );

      // Mark as completed
      await sql`
        UPDATE generation_jobs
        SET status = 'completed',
            result_url = ${resultUrl},
            completed_at = NOW(),
            progress = 100
        WHERE id = ${jobId}
      `;

      console.log(`[JobProcessor] Completed VIDEO job ${jobId}`);
      return { success: true, resultUrl };
    }

    // Handle generic image jobs (simple prompt-based generation)
    if (jobType === "image") {
      const { resultUrl, galleryId } = await processImageGenerationJob(
        job,
        jobId,
        prompt,
        config,
        sql,
      );

      console.log(`[JobProcessor] Completed IMAGE job ${jobId}`);
      return { success: true, resultUrl, galleryId };
    }

    // Continue with flyer/branded image generation for other job types...

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
        parts.push({
          text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:",
        });
        parts.push({ inlineData: { data: refData, mimeType: "image/png" } });
      }
    }

    if (config.productImages && config.productImages.length > 0) {
      for (const image of config.productImages) {
        const resolved = await resolveJobImage(image);
        if (resolved) {
          parts.push({ text: "Imagem de produto para referência:" });
          parts.push({
            inlineData: { data: resolved.base64, mimeType: resolved.mimeType },
          });
        }
      }
    }

    // Add composition assets
    if (config.compositionAssets && config.compositionAssets.length > 0) {
      for (let i = 0; i < config.compositionAssets.length; i++) {
        const assetData = await urlToBase64(config.compositionAssets[i]);
        if (assetData) {
          parts.push({ text: `Ativo de composição ${i + 1}:` });
          parts.push({
            inlineData: { data: assetData, mimeType: "image/png" },
          });
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
      }),
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
    const jobOwner = await sql`
      SELECT user_id, organization_id FROM generation_jobs WHERE id = ${jobId}
    `;

    if (jobOwner.length === 0) {
      throw new Error("Job record not found");
    }

    // Save to gallery
    const galleryResult = await sql`
      INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size)
      VALUES (
        ${jobOwner[0].user_id},
        ${jobOwner[0].organization_id},
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

    console.log(
      `[JobProcessor] Completed job ${jobId}, gallery ID: ${galleryId}`,
    );

    return { success: true, resultUrl: blob.url, galleryId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
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

// Redis URL for BullMQ (initialized after server starts)
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;

// ============================================================================
// API ROUTES
// ============================================================================

// Simple health check (no DB dependency - for Railway healthcheck)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// DB Health check
app.get("/api/db/health", async (req, res) => {
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// Super admin emails from environment
const SUPER_ADMIN_EMAILS = (process.env.VITE_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

// Middleware to verify super admin access
async function requireSuperAdmin(req, res, next) {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user email from Clerk
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    const userResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
      headers: { Authorization: `Bearer ${clerkSecretKey}` }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Failed to verify user' });
    }

    const userData = await userResponse.json();
    const userEmail = userData.email_addresses?.[0]?.email_address?.toLowerCase();

    if (!userEmail || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
      return res.status(403).json({ error: 'Access denied. Super admin only.' });
    }

    req.adminEmail = userEmail;
    next();
  } catch (error) {
    console.error('[Admin] Auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

// Admin: Verify if current user is admin (for frontend to check admin status securely)
app.get("/api/admin/verify-admin", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.json({ isAdmin: false });
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    const userResponse = await fetch(
      `https://api.clerk.com/v1/users/${auth.userId}`,
      {
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      },
    );

    if (!userResponse.ok) {
      return res.json({ isAdmin: false });
    }

    const userData = await userResponse.json();
    const userEmail =
      userData.email_addresses?.[0]?.email_address?.toLowerCase();

    const isAdmin = userEmail && SUPER_ADMIN_EMAILS.includes(userEmail);
    res.json({ isAdmin });
  } catch (error) {
    console.error("[Admin] Verify admin error:", error);
    res.json({ isAdmin: false });
  }
});

// Admin: Get overview stats
app.get("/api/admin/stats", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();

    // Note: organizations are managed by Clerk, not in our DB
    const [
      usersResult,
      campaignsResult,
      postsResult,
      galleryResult,
      aiUsageResult,
      errorsResult,
      orgCountResult
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM users`,
      sql`SELECT COUNT(*) as count FROM campaigns`,
      sql`SELECT COUNT(*) as count,
          COUNT(*) FILTER (WHERE status = 'scheduled') as pending
          FROM scheduled_posts`,
      sql`SELECT COUNT(*) as count FROM gallery_images`,
      sql`SELECT
          COALESCE(SUM(estimated_cost_cents), 0) as total_cost,
          COUNT(*) as total_requests
          FROM api_usage_logs
          WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      sql`SELECT COUNT(*) as count FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          AND status = 'failed'`,
      sql`SELECT COUNT(DISTINCT organization_id) as count FROM api_usage_logs WHERE organization_id IS NOT NULL`
    ]);

    res.json({
      totalUsers: parseInt(usersResult[0]?.count || 0),
      activeUsersToday: 0,
      totalOrganizations: parseInt(orgCountResult[0]?.count || 0),
      totalCampaigns: parseInt(campaignsResult[0]?.count || 0),
      totalScheduledPosts: parseInt(postsResult[0]?.count || 0),
      pendingPosts: parseInt(postsResult[0]?.pending || 0),
      totalGalleryImages: parseInt(galleryResult[0]?.count || 0),
      aiCostThisMonth: parseInt(aiUsageResult[0]?.total_cost || 0),
      aiRequestsThisMonth: parseInt(aiUsageResult[0]?.total_requests || 0),
      recentErrors: parseInt(errorsResult[0]?.count || 0)
    });
  } catch (error) {
    console.error('[Admin] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Admin: Get AI usage analytics
app.get("/api/admin/usage", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { days = 30 } = req.query;

    const timeline = await sql`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
        operation
      FROM api_usage_logs
      WHERE created_at >= NOW() - INTERVAL '1 day' * ${parseInt(days)}
      GROUP BY DATE(created_at), operation
      ORDER BY date DESC
    `;

    const aggregated = {};
    for (const row of timeline) {
      const dateKey = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : String(row.date);
      if (!aggregated[dateKey]) {
        aggregated[dateKey] = { date: dateKey, total_requests: 0, total_cost_cents: 0 };
      }
      aggregated[dateKey].total_requests += parseInt(row.total_requests);
      aggregated[dateKey].total_cost_cents += parseInt(row.total_cost_cents);
    }

    res.json({
      timeline: Object.values(aggregated).sort((a, b) => a.date.localeCompare(b.date))
    });
  } catch (error) {
    console.error('[Admin] Usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// Admin: Get users list
app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { limit = 20, page = 1, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const searchFilter = search ? `%${search}%` : null;

    const users = await sql`
      SELECT
        u.id,
        u.auth_provider_id as clerk_user_id,
        u.email,
        u.name,
        u.avatar_url,
        u.last_login_at,
        u.created_at,
        COUNT(DISTINCT c.id) as campaign_count,
        COUNT(DISTINCT bp.id) as brand_count,
        COUNT(DISTINCT sp.id) as scheduled_post_count
      FROM users u
      LEFT JOIN campaigns c ON c.user_id = u.id AND c.deleted_at IS NULL
      LEFT JOIN brand_profiles bp ON bp.user_id = u.id AND bp.deleted_at IS NULL
      LEFT JOIN scheduled_posts sp ON sp.user_id = u.id
      WHERE (${searchFilter}::text IS NULL OR u.email ILIKE ${searchFilter} OR u.name ILIKE ${searchFilter})
      GROUP BY u.id, u.auth_provider_id, u.email, u.name, u.avatar_url, u.last_login_at, u.created_at
      ORDER BY u.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as total FROM users
      WHERE (${searchFilter}::text IS NULL OR email ILIKE ${searchFilter} OR name ILIKE ${searchFilter})
    `;
    const total = parseInt(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('[Admin] Users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin: Get organizations list (from Clerk org IDs in brand_profiles/campaigns/usage tables)
app.get("/api/admin/organizations", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get organization base data with counts from various tables
    const orgs = await sql`
      WITH org_base AS (
        SELECT DISTINCT organization_id
        FROM brand_profiles
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        UNION
        SELECT DISTINCT organization_id
        FROM campaigns
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
      ),
      brand_data AS (
        SELECT
          organization_id,
          COUNT(*) as brand_count,
          MIN(name) as primary_brand_name,
          MIN(created_at) as first_brand_created
        FROM brand_profiles
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id
      ),
      campaign_data AS (
        SELECT
          organization_id,
          COUNT(*) as campaign_count
        FROM campaigns
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id
      ),
      gallery_data AS (
        SELECT
          organization_id,
          COUNT(*) as gallery_image_count
        FROM gallery_images
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id
      ),
      post_data AS (
        SELECT
          organization_id,
          COUNT(*) as scheduled_post_count
        FROM scheduled_posts
        WHERE organization_id IS NOT NULL
        GROUP BY organization_id
      ),
      activity_data AS (
        SELECT
          organization_id,
          MAX(created_at) as last_activity
        FROM (
          SELECT organization_id, created_at FROM brand_profiles WHERE organization_id IS NOT NULL
          UNION ALL
          SELECT organization_id, created_at FROM campaigns WHERE organization_id IS NOT NULL
          UNION ALL
          SELECT organization_id, created_at FROM gallery_images WHERE organization_id IS NOT NULL
          UNION ALL
          SELECT organization_id, created_at FROM scheduled_posts WHERE organization_id IS NOT NULL
        ) all_activity
        GROUP BY organization_id
      ),
      usage_this_month AS (
        SELECT
          organization_id,
          COUNT(*) as request_count,
          COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
        FROM api_usage_logs
        WHERE organization_id IS NOT NULL
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY organization_id
      )
      SELECT
        o.organization_id,
        COALESCE(b.primary_brand_name, 'Unnamed') as primary_brand_name,
        COALESCE(b.brand_count, 0) as brand_count,
        COALESCE(c.campaign_count, 0) as campaign_count,
        COALESCE(g.gallery_image_count, 0) as gallery_image_count,
        COALESCE(p.scheduled_post_count, 0) as scheduled_post_count,
        b.first_brand_created,
        a.last_activity,
        COALESCE(u.request_count, 0) as ai_requests,
        COALESCE(u.cost_cents, 0) as ai_cost_cents
      FROM org_base o
      LEFT JOIN brand_data b ON b.organization_id = o.organization_id
      LEFT JOIN campaign_data c ON c.organization_id = o.organization_id
      LEFT JOIN gallery_data g ON g.organization_id = o.organization_id
      LEFT JOIN post_data p ON p.organization_id = o.organization_id
      LEFT JOIN activity_data a ON a.organization_id = o.organization_id
      LEFT JOIN usage_this_month u ON u.organization_id = o.organization_id
      ORDER BY a.last_activity DESC NULLS LAST
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    // Transform data to match frontend interface
    const organizations = orgs.map(org => ({
      organization_id: org.organization_id,
      primary_brand_name: org.primary_brand_name,
      brand_count: String(org.brand_count),
      campaign_count: String(org.campaign_count),
      gallery_image_count: String(org.gallery_image_count),
      scheduled_post_count: String(org.scheduled_post_count),
      first_brand_created: org.first_brand_created,
      last_activity: org.last_activity,
      aiUsageThisMonth: {
        requests: parseInt(org.ai_requests) || 0,
        costCents: parseInt(org.ai_cost_cents) || 0,
        costUsd: (parseInt(org.ai_cost_cents) || 0) / 100
      }
    }));

    // Count total organizations
    const countResult = await sql`
      SELECT COUNT(DISTINCT organization_id) as total FROM (
        SELECT organization_id FROM brand_profiles WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        UNION
        SELECT organization_id FROM campaigns WHERE organization_id IS NOT NULL AND deleted_at IS NULL
      ) orgs
    `;
    const total = parseInt(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      organizations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('[Admin] Organizations error:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// Admin: Get activity logs
app.get("/api/admin/logs", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { limit = 100, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Simple query without dynamic filters for now
    const logs = await sql`
      SELECT id, user_id, organization_id, endpoint, operation as category, model_id as model,
             estimated_cost_cents as cost_cents, error_message as error,
             CASE WHEN status = 'failed' THEN 'error' ELSE 'info' END as severity,
             status, latency_ms as duration_ms, created_at as timestamp
      FROM api_usage_logs
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const totalResult = await sql`SELECT COUNT(*) as count FROM api_usage_logs`;

    // Get unique categories
    const categoriesResult = await sql`SELECT DISTINCT operation as category FROM api_usage_logs WHERE operation IS NOT NULL`;

    // Get recent error count
    const errorCountResult = await sql`SELECT COUNT(*) as count FROM api_usage_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'`;

    const total = parseInt(totalResult[0]?.count || 0);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      },
      filters: {
        categories: categoriesResult.map(r => r.category),
        recentErrorCount: parseInt(errorCountResult[0]?.count || 0)
      }
    });
  } catch (error) {
    console.error('[Admin] Logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Unified initial data endpoint - Protected
app.get("/api/db/init", requireResourceAccess, async (req, res) => {
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
            COALESCE(
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1),
              (SELECT src_url FROM gallery_images
               WHERE video_script_id IN (SELECT id FROM video_clip_scripts WHERE campaign_id = c.id)
                 AND src_url IS NOT NULL AND src_url NOT LIKE 'data:%'
               ORDER BY created_at DESC
               LIMIT 1)
            ) as clip_preview_url,
            COALESCE(
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT src_url FROM gallery_images
               WHERE post_id IN (SELECT id FROM posts WHERE campaign_id = c.id)
                 AND src_url IS NOT NULL AND src_url NOT LIKE 'data:%'
               ORDER BY created_at DESC
               LIMIT 1)
            ) as post_preview_url,
            COALESCE(
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT src_url FROM gallery_images
               WHERE ad_creative_id IN (SELECT id FROM ad_creatives WHERE campaign_id = c.id)
                 AND src_url IS NOT NULL AND src_url NOT LIKE 'data:%'
               ORDER BY created_at DESC
               LIMIT 1)
            ) as ad_preview_url
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
            COALESCE(
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1),
              (SELECT src_url FROM gallery_images
               WHERE video_script_id IN (SELECT id FROM video_clip_scripts WHERE campaign_id = c.id)
                 AND src_url IS NOT NULL AND src_url NOT LIKE 'data:%'
               ORDER BY created_at DESC
               LIMIT 1)
            ) as clip_preview_url,
            COALESCE(
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT src_url FROM gallery_images
               WHERE post_id IN (SELECT id FROM posts WHERE campaign_id = c.id)
                 AND src_url IS NOT NULL AND src_url NOT LIKE 'data:%'
               ORDER BY created_at DESC
               LIMIT 1)
            ) as post_preview_url,
            COALESCE(
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT src_url FROM gallery_images
               WHERE ad_creative_id IN (SELECT id FROM ad_creatives WHERE campaign_id = c.id)
                 AND src_url IS NOT NULL AND src_url NOT LIKE 'data:%'
               ORDER BY created_at DESC
               LIMIT 1)
            ) as ad_preview_url
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

// Users API - Protected: requires authentication
app.get("/api/db/users", requireAuth, async (req, res) => {
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

app.post("/api/db/users", requireAuth, async (req, res) => {
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

// Brand Profiles API - Protected: requires resource access verification
app.get("/api/db/brand-profiles", requireResourceAccess, async (req, res) => {
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

app.post("/api/db/brand-profiles", requireResourceAccess, async (req, res) => {
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

app.put("/api/db/brand-profiles", requireResourceAccess, async (req, res) => {
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

// Gallery Images API - Protected: requires resource access verification
app.get("/api/db/gallery", requireResourceAccess, async (req, res) => {
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

app.post("/api/db/gallery", requireResourceAccess, async (req, res) => {
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
              ${media_type || "image"}, ${duration || null})
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

app.delete("/api/db/gallery", requireResourceAccess, async (req, res) => {
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
app.get("/api/db/scheduled-posts", requireResourceAccess, async (req, res) => {
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

app.post("/api/db/scheduled-posts", requireResourceAccess, async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      content_type,
      content_id,
      image_url,
      carousel_image_urls,
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
        user_id, organization_id, content_type, content_id, image_url, carousel_image_urls, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, instagram_account_id, created_from
      ) VALUES (
        ${resolvedUserId}, ${organization_id || null}, ${content_type || "flyer"}, ${content_id || null}, ${image_url}, ${carousel_image_urls || null}, ${caption || ""},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${timestampMs},
        ${timezone || "America/Sao_Paulo"}, ${platforms || "instagram"},
        ${instagram_content_type || "photo"}, ${instagram_account_id || null}, ${created_from || null}
      )
      RETURNING *
    `;

    const newPost = result[0];

    // Schedule the job for exact-time publishing (if Redis is available)
    const REDIS_AVAILABLE =
      process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
    if (REDIS_AVAILABLE && newPost.status === "scheduled") {
      try {
        const jobResult = await schedulePostForPublishing(
          newPost.id,
          resolvedUserId,
          timestampMs,
        );
        console.log(
          `[Scheduled Posts API] Job scheduled for post ${newPost.id}: ${jobResult.scheduledFor}`,
        );
      } catch (jobError) {
        // Don't fail the request, fallback checker will handle it
        console.warn(
          `[Scheduled Posts API] Failed to schedule job, will use fallback:`,
          jobError.message,
        );
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

app.put("/api/db/scheduled-posts", requireResourceAccess, async (req, res) => {
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

app.delete("/api/db/scheduled-posts", requireResourceAccess, async (req, res) => {
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
    const REDIS_AVAILABLE =
      process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
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

const RUBE_MCP_URL = "https://rube.app/mcp";

// Validate Rube token by calling Instagram API
async function validateRubeToken(rubeToken) {
  try {
    const request = {
      jsonrpc: "2.0",
      id: `validate_${Date.now()}`,
      method: "tools/call",
      params: {
        name: "RUBE_MULTI_EXECUTE_TOOL",
        arguments: {
          tools: [
            {
              tool_slug: "INSTAGRAM_GET_USER_INFO",
              arguments: { fields: "id,username" },
            },
          ],
          sync_response_to_workbench: false,
          memory: {},
          session_id: "validate",
          thought: "Validating Instagram connection",
        },
      },
    };

    const response = await fetch(RUBE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${rubeToken}`,
      },
      body: JSON.stringify(request),
    });

    const text = await response.text();

    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      return {
        success: false,
        error: "Token inválido ou expirado. Gere um novo token no Rube.",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Erro ao validar token (${response.status})`,
      };
    }

    // Parse SSE response
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const json = JSON.parse(line.substring(6));
          if (json?.error) {
            return {
              success: false,
              error: "Instagram não conectado no Rube.",
            };
          }
          const nestedData = json?.result?.content?.[0]?.text;
          if (nestedData) {
            const parsed = JSON.parse(nestedData);
            if (parsed?.error || parsed?.data?.error) {
              return {
                success: false,
                error: "Instagram não conectado no Rube.",
              };
            }
            const results =
              parsed?.data?.data?.results || parsed?.data?.results;
            if (results && results.length > 0) {
              const userData = results[0]?.response?.data;
              if (userData?.id) {
                return {
                  success: true,
                  instagramUserId: String(userData.id),
                  instagramUsername: userData.username || "unknown",
                };
              }
            }
          }
        } catch (e) {
          console.error("[Instagram Accounts] Parse error:", e);
        }
      }
    }
    return { success: false, error: "Instagram não conectado no Rube." };
  } catch (error) {
    return { success: false, error: error.message || "Erro ao validar token" };
  }
}

// GET - List Instagram accounts
// For organizations: returns all accounts connected to the org (shared by all members)
// For personal: returns accounts owned by the user
app.get("/api/db/instagram-accounts", requireResourceAccess, async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, id } = req.query;

    if (id) {
      const result = await sql`
        SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
               is_active, connected_at, last_used_at, created_at, updated_at, connected_by_user_id
        FROM instagram_accounts WHERE id = ${id}
      `;
      return res.json(result[0] || null);
    }

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // user_id can be either DB UUID or Clerk ID - try both
    let resolvedUserId = user_id;

    // Check if it's a Clerk ID (starts with 'user_')
    if (user_id.startsWith("user_")) {
      const userResult =
        await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
      resolvedUserId = userResult[0]?.id;
      if (!resolvedUserId) {
        console.log("[Instagram] User not found for Clerk ID:", user_id);
        return res.json([]);
      }
    } else {
      // Assume it's a DB UUID - verify it exists
      const userResult =
        await sql`SELECT id FROM users WHERE id = ${user_id} LIMIT 1`;
      if (userResult.length === 0) {
        console.log("[Instagram] User not found for DB UUID:", user_id);
        return res.json([]);
      }
    }
    console.log("[Instagram] Resolved user ID:", resolvedUserId);

    // For organizations: get accounts connected to the org (any member can use)
    // For personal: get accounts owned by the user
    const result = organization_id
      ? await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at, connected_by_user_id
          FROM instagram_accounts
          WHERE organization_id = ${organization_id} AND is_active = TRUE
          ORDER BY connected_at DESC
        `
      : await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at, connected_by_user_id
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
// For organizations: account is shared by all org members
// For personal: account is owned by the user
app.post("/api/db/instagram-accounts", requireResourceAccess, async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, rube_token } = req.body;

    if (!user_id || !rube_token) {
      return res
        .status(400)
        .json({ error: "user_id and rube_token are required" });
    }

    // Resolve Clerk ID to DB UUID (for tracking who connected)
    const userResult =
      await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
    const resolvedUserId = userResult[0]?.id;
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Validate the Rube token
    const validation = await validateRubeToken(rube_token);
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: validation.error || "Token inválido" });
    }

    const { instagramUserId, instagramUsername } = validation;

    // Check if already connected based on context (org or personal)
    let existing;
    if (organization_id) {
      // For organizations: check if this Instagram is already connected to the ORG
      existing = await sql`
        SELECT id FROM instagram_accounts
        WHERE organization_id = ${organization_id} AND instagram_user_id = ${instagramUserId}
      `;
    } else {
      // For personal: check if this Instagram is already connected to the USER
      existing = await sql`
        SELECT id FROM instagram_accounts
        WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND instagram_user_id = ${instagramUserId}
      `;
    }

    if (existing.length > 0) {
      // Update existing - reconnect with new token
      const result = await sql`
        UPDATE instagram_accounts
        SET rube_token = ${rube_token}, instagram_username = ${instagramUsername},
            is_active = TRUE, connected_at = NOW(), updated_at = NOW(),
            connected_by_user_id = ${resolvedUserId}
        WHERE id = ${existing[0].id}
        RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                  is_active, connected_at, last_used_at, created_at, updated_at, connected_by_user_id
      `;
      return res.json({
        success: true,
        account: result[0],
        message: "Conta reconectada!",
      });
    }

    // Create new account
    // For org accounts: user_id is null, organization_id is the owner
    // For personal accounts: user_id is the owner, organization_id is null
    const ownerUserId = organization_id ? null : resolvedUserId;

    const result = await sql`
      INSERT INTO instagram_accounts (user_id, organization_id, instagram_user_id, instagram_username, rube_token, connected_by_user_id)
      VALUES (${ownerUserId}, ${organization_id || null}, ${instagramUserId}, ${instagramUsername}, ${rube_token}, ${resolvedUserId})
      RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                is_active, connected_at, last_used_at, created_at, updated_at, connected_by_user_id
    `;

    res.status(201).json({
      success: true,
      account: result[0],
      message: `Conta @${instagramUsername} conectada!`,
    });
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update Instagram account token
app.put("/api/db/instagram-accounts", requireResourceAccess, async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { rube_token } = req.body;

    if (!id || !rube_token) {
      return res.status(400).json({ error: "id and rube_token are required" });
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

    res.json({
      success: true,
      account: result[0],
      message: "Token atualizado!",
    });
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Disconnect Instagram account (soft delete)
app.delete("/api/db/instagram-accounts", requireResourceAccess, async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    await sql`UPDATE instagram_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}`;
    res.json({ success: true, message: "Conta desconectada." });
  } catch (error) {
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API
app.get("/api/db/campaigns", requireResourceAccess, async (req, res) => {
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

        const [videoScripts, posts, adCreatives, carouselScripts] = await Promise.all([
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
          sql`
            SELECT * FROM carousel_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
        ]);

        return res.status(200).json({
          ...campaign,
          video_clip_scripts: videoScripts,
          posts: posts,
          ad_creatives: adCreatives,
          carousel_scripts: carouselScripts,
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
          c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at,
          u.name as creator_name,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
        FROM campaigns c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    } else {
      result = await sql`
        SELECT
          c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at,
          u.name as creator_name,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
        FROM campaigns c
        LEFT JOIN users u ON u.id = c.user_id
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

app.post("/api/db/campaigns", requireResourceAccess, async (req, res) => {
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
      carousel_scripts,
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

    // Insert and collect video clip scripts with their IDs
    const createdVideoClipScripts = [];
    if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
      for (let i = 0; i < video_clip_scripts.length; i++) {
        const script = video_clip_scripts[i];
        const result = await sql`
          INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${i})
          RETURNING *
        `;
        createdVideoClipScripts.push(result[0]);
      }
    }

    // Insert and collect posts with their IDs
    const createdPosts = [];
    if (posts && Array.isArray(posts)) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const result = await sql`
          INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
          RETURNING *
        `;
        createdPosts.push(result[0]);
      }
    }

    // Insert and collect ad creatives with their IDs
    const createdAdCreatives = [];
    if (ad_creatives && Array.isArray(ad_creatives)) {
      for (let i = 0; i < ad_creatives.length; i++) {
        const ad = ad_creatives[i];
        const result = await sql`
          INSERT INTO ad_creatives (campaign_id, user_id, organization_id, platform, headline, body, cta, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${ad.platform}, ${ad.headline}, ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${i})
          RETURNING *
        `;
        createdAdCreatives.push(result[0]);
      }
    }

    // Insert and collect carousel scripts with their IDs
    const createdCarouselScripts = [];
    if (carousel_scripts && Array.isArray(carousel_scripts)) {
      for (let i = 0; i < carousel_scripts.length; i++) {
        const carousel = carousel_scripts[i];
        const result = await sql`
          INSERT INTO carousel_scripts (campaign_id, user_id, organization_id, title, hook, cover_prompt, caption, slides, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${carousel.title}, ${carousel.hook}, ${carousel.cover_prompt || null}, ${carousel.caption || null}, ${JSON.stringify(carousel.slides || [])}, ${i})
          RETURNING *
        `;
        createdCarouselScripts.push(result[0]);
      }
    }

    // Return campaign with all created items including their IDs
    res.status(201).json({
      ...campaign,
      video_clip_scripts: createdVideoClipScripts,
      posts: createdPosts,
      ad_creatives: createdAdCreatives,
      carousel_scripts: createdCarouselScripts,
    });
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

app.delete("/api/db/campaigns", requireResourceAccess, async (req, res) => {
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
    // Note: In DB, the field is "scene" not "sceneNumber"
    const scenes = clip.scenes || [];
    const updatedScenes = scenes.map((scene) => {
      if (scene.scene === sceneNum) {
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

    console.log(
      `[Campaigns API] Updated scene ${sceneNum} image for clip ${clip_id}`,
    );
    res.json(result[0]);
  } catch (error) {
    console.error("[Campaigns API] Error updating scene image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Carousels API - Update carousel (cover_url, caption)
app.patch("/api/db/carousels", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { cover_url, caption } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE carousel_scripts
      SET cover_url = COALESCE(${cover_url}, cover_url),
          caption = COALESCE(${caption}, caption),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    console.log(`[Carousels API] Updated carousel ${id}`);
    res.json(result[0]);
  } catch (error) {
    console.error("[Carousels API] Error updating carousel:", error);
    res.status(500).json({ error: error.message });
  }
});

// Carousels API - Update slide image_url in slides JSONB
app.patch("/api/db/carousels/slide", async (req, res) => {
  try {
    const sql = getSql();
    const { carousel_id, slide_number } = req.query;
    const { image_url } = req.body;

    if (!carousel_id || slide_number === undefined) {
      return res
        .status(400)
        .json({ error: "carousel_id and slide_number are required" });
    }

    const slideNum = parseInt(slide_number, 10);

    // Get current slides
    const [carousel] = await sql`
      SELECT slides FROM carousel_scripts WHERE id = ${carousel_id}
    `;

    if (!carousel) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    // Update the specific slide with image_url
    const slides = carousel.slides || [];
    const updatedSlides = slides.map((slide) => {
      if (slide.slide === slideNum) {
        return { ...slide, image_url: image_url || null };
      }
      return slide;
    });

    // Save updated slides back to database
    const result = await sql`
      UPDATE carousel_scripts
      SET slides = ${JSON.stringify(updatedSlides)}::jsonb,
          updated_at = NOW()
      WHERE id = ${carousel_id}
      RETURNING *
    `;

    console.log(
      `[Carousels API] Updated slide ${slideNum} image for carousel ${carousel_id}`,
    );
    res.json(result[0]);
  } catch (error) {
    console.error("[Carousels API] Error updating slide image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API
app.get("/api/db/tournaments/list", requireResourceAccess, async (req, res) => {
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

app.get("/api/db/tournaments", requireResourceAccess, async (req, res) => {
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

app.post("/api/db/tournaments", requireResourceAccess, async (req, res) => {
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

app.delete("/api/db/tournaments", requireResourceAccess, async (req, res) => {
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
    const { userId, organizationId, jobType, prompt, config, context } =
      req.body;

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
        console.error(
          `[Generate Queue] Failed to add to BullMQ, job will be processed by fallback:`,
          queueError.message,
        );
      }
    } else {
      console.log(
        `[Generate Queue] No Redis configured, job ${dbJob.id} saved to DB only`,
      );
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
      // Resolve Clerk ID to database UUID if needed
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        return res.json({ jobs: [], total: 0 });
      }

      let jobs;
      const limitNum = parseInt(limit) || 50;

      if (filterStatus) {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at, context
          FROM generation_jobs
          WHERE user_id = ${resolvedUserId} AND status = ${filterStatus}
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
          WHERE user_id = ${resolvedUserId}
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
      return res
        .status(404)
        .json({ error: "Job not found or already completed" });
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

    console.log(
      `[Generate] Cancelled ${result.length} jobs for user ${userId}`,
    );
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
app.post("/api/ai/campaign", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      brandProfile,
      transcript,
      options,
      productImages,
      inspirationImages,
      collabLogo,
      compositionAssets,
      toneOfVoiceOverride,
    } = req.body;

    if (!brandProfile || !transcript || !options) {
      return res.status(400).json({
        error: "brandProfile, transcript, and options are required",
      });
    }

    console.log("[Campaign API] Generating campaign...");
    console.log(
      "[Campaign API] Options received:",
      JSON.stringify(options, null, 2),
    );
    console.log("[Campaign API] Images:", {
      productImages: productImages?.length || 0,
      inspirationImages: inspirationImages?.length || 0,
      collabLogo: !!collabLogo,
      compositionAssets: compositionAssets?.length || 0,
    });

    // Model selection - config in config/ai-models.ts
    // OpenRouter models have "/" in their ID (e.g., "openai/gpt-5.2")
    const model = brandProfile.creativeModel || DEFAULT_TEXT_MODEL;
    const isOpenRouter = model.includes("/");

    const quantityInstructions = buildQuantityInstructions(options, "prod");
    const effectiveBrandProfile = toneOfVoiceOverride
      ? { ...brandProfile, toneOfVoice: toneOfVoiceOverride }
      : brandProfile;
    const prompt = buildCampaignPrompt(
      effectiveBrandProfile,
      transcript,
      quantityInstructions,
      getToneText(effectiveBrandProfile, "campaigns"),
    );

    // Collect all images for vision models
    const allImages = [];
    if (productImages) allImages.push(...productImages);
    if (inspirationImages) allImages.push(...inspirationImages);
    if (collabLogo) allImages.push(collabLogo);
    if (compositionAssets) allImages.push(...compositionAssets);

    let result;

    if (isOpenRouter) {
      // Add explicit JSON schema for OpenRouter models
      const jsonSchemaPrompt = `${prompt}

**FORMATO JSON OBRIGATÓRIO - TODOS OS CAMPOS SÃO OBRIGATÓRIOS:**

ATENÇÃO: Você DEVE gerar TODOS os 4 arrays: videoClipScripts, posts, adCreatives E carousels.
O campo "carousels" é OBRIGATÓRIO e NÃO pode ser omitido.

\`\`\`json
{
  "videoClipScripts": [
    {
      "title": "Título do vídeo",
      "hook": "Gancho inicial do vídeo",
      "scenes": [
        {"scene": 1, "visual": "descrição visual", "narration": "narração", "duration_seconds": 5}
      ],
      "image_prompt": "prompt para thumbnail com cores da marca, estilo cinematográfico",
      "audio_script": "script de áudio completo"
    }
  ],
  "posts": [
    {
      "platform": "Instagram|Facebook|Twitter|LinkedIn",
      "content": "texto do post",
      "hashtags": ["tag1", "tag2"],
      "image_prompt": "descrição da imagem com cores da marca, estilo cinematográfico"
    }
  ],
  "adCreatives": [
    {
      "platform": "Facebook|Google",
      "headline": "título do anúncio",
      "body": "corpo do anúncio",
      "cta": "call to action",
      "image_prompt": "descrição da imagem com cores da marca, estilo cinematográfico"
    }
  ],
  "carousels": [
    {
      "title": "Título do carrossel Instagram",
      "hook": "Gancho/abertura impactante do carrossel",
      "cover_prompt": "Imagem de capa cinematográfica com cores da marca, título em fonte bold condensed sans-serif, estilo luxuoso e premium, composição visual impactante",
      "slides": [
        {"slide": 1, "visual": "descrição visual detalhada do slide 1 - capa/título", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 2, "visual": "descrição visual detalhada do slide 2 - conteúdo", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 3, "visual": "descrição visual detalhada do slide 3 - conteúdo", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 4, "visual": "descrição visual detalhada do slide 4 - conteúdo", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 5, "visual": "descrição visual detalhada do slide 5 - CTA", "text": "TEXTO CURTO EM MAIÚSCULAS"}
      ]
    }
  ]
}
\`\`\`

REGRAS CRÍTICAS:
1. O JSON DEVE conter EXATAMENTE os 4 arrays: videoClipScripts, posts, adCreatives, carousels
2. O array "carousels" NUNCA pode estar vazio - gere pelo menos 1 carrossel com 5 slides
3. Responda APENAS com o JSON válido, sem texto adicional.`;

      const textParts = [jsonSchemaPrompt];

      if (allImages.length > 0) {
        result = await generateTextWithOpenRouterVision(
          model,
          textParts,
          allImages,
          0.7,
        );
      } else {
        result = await generateTextWithOpenRouter(model, "", jsonSchemaPrompt, 0.7);
      }
    } else {
      const parts = [{ text: prompt }];

      if (allImages.length > 0) {
        allImages.forEach((img) => {
          parts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64 },
          });
        });
      }

      result = await generateStructuredContent(
        model,
        parts,
        campaignSchema,
        0.7,
      );
    }

    const campaign = JSON.parse(result);

    console.log("[Campaign API] Campaign structure:", {
      hasPosts: !!campaign.posts,
      postsCount: campaign.posts?.length,
      hasAdCreatives: !!campaign.adCreatives,
      adCreativesCount: campaign.adCreatives?.length,
      hasVideoScripts: !!campaign.videoClipScripts,
      videoScriptsCount: campaign.videoClipScripts?.length,
      hasCarousels: !!campaign.carousels,
      carouselsCount: campaign.carousels?.length,
      hasProductImages: !!productImages?.length,
      productImagesCount: productImages?.length || 0,
      hasInspirationImages: !!inspirationImages?.length,
      inspirationImagesCount: inspirationImages?.length || 0,
      hasCollabLogo: !!collabLogo,
      compositionAssetsCount: compositionAssets?.length || 0,
      toneOverride: toneOfVoiceOverride || null,
    });

    console.log("[Campaign API] Campaign generated successfully");

    // Log AI usage
    const inputTokens = prompt.length / 4;
    const outputTokens = result.length / 4;
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/campaign',
      operation: 'campaign',
      model,
      inputTokens: Math.round(inputTokens),
      outputTokens: Math.round(outputTokens),
      latencyMs: timer(),
      status: 'success',
      metadata: {
        productImagesCount: productImages?.length || 0,
        inspirationImagesCount: inspirationImages?.length || 0,
        hasCollabLogo: !!collabLogo,
      }
    });

    res.json({
      success: true,
      campaign,
      model,
    });
  } catch (error) {
    console.error("[Campaign API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/campaign',
      operation: 'campaign',
      model: req.body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate campaign" });
  }
});

// AI Flyer Generation
app.post("/api/ai/flyer", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

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
      return res
        .status(400)
        .json({ error: "prompt and brandProfile are required" });
    }

    console.log(`[Flyer API] Generating flyer, aspect ratio: ${aspectRatio}`);

    const ai = getGeminiAi();
    const brandingInstruction = buildFlyerPrompt(brandProfile);

    const parts = [
      { text: brandingInstruction },
      { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
    ];

    if (logo) {
      parts.push({
        inlineData: { data: logo.base64, mimeType: logo.mimeType },
      });
    }

    if (collabLogo) {
      parts.push({
        inlineData: { data: collabLogo.base64, mimeType: collabLogo.mimeType },
      });
    }

    if (referenceImage) {
      parts.push({
        text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:",
      });
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
      model: DEFAULT_IMAGE_MODEL,
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

    // Log AI usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/flyer',
      operation: 'flyer',
      model: DEFAULT_IMAGE_MODEL,
      imageCount: 1,
      imageSize: imageSize || '1K',
      latencyMs: timer(),
      status: 'success',
      metadata: { aspectRatio, hasLogo: !!logo, hasReference: !!referenceImage }
    });

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    console.error("[Flyer API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/flyer',
      operation: 'flyer',
      model: DEFAULT_IMAGE_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate flyer" });
  }
});

// AI Image Generation
app.post("/api/ai/image", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      prompt,
      brandProfile,
      aspectRatio = "1:1",
      imageSize = "1K",
      productImages,
      styleReferenceImage,
    } = req.body;
    const model = DEFAULT_IMAGE_MODEL;

    if (!prompt || !brandProfile) {
      return res
        .status(400)
        .json({ error: "prompt and brandProfile are required" });
    }

    console.log(
      `[Image API] Generating image with ${model}, aspect ratio: ${aspectRatio} | productImages: ${productImages?.length || 0}`,
    );

    // Prepare product images array, including brand logo if available
    let allProductImages = productImages ? [...productImages] : [];

    // Auto-include brand logo as reference if it's an HTTP URL and not already passed by frontend
    // (Frontend handles data URLs, server handles HTTP URLs)
    if (brandProfile.logo && brandProfile.logo.startsWith('http') && allProductImages.length === 0) {
      try {
        const logoBase64 = await urlToBase64(brandProfile.logo);
        if (logoBase64) {
          console.log("[Image API] Including brand logo from HTTP URL");
          // Detect mime type from URL or default to png
          const mimeType = brandProfile.logo.includes('.svg') ? 'image/svg+xml'
            : brandProfile.logo.includes('.jpg') || brandProfile.logo.includes('.jpeg') ? 'image/jpeg'
            : 'image/png';
          allProductImages.unshift({ base64: logoBase64, mimeType });
        }
      } catch (err) {
        console.warn("[Image API] Failed to include brand logo:", err.message);
      }
    }

    const hasLogo = !!brandProfile.logo && allProductImages.length > 0;
    const fullPrompt = buildImagePrompt(
      prompt,
      brandProfile,
      !!styleReferenceImage,
      hasLogo,
      !!productImages?.length,
    );

    console.log("[Image API] Prompt:");
    console.log(fullPrompt);

    const imageDataUrl = await generateGeminiImage(
      fullPrompt,
      aspectRatio,
      DEFAULT_IMAGE_MODEL,
      imageSize,
      allProductImages.length > 0 ? allProductImages : undefined,
      styleReferenceImage,
    );

    console.log("[Image API] Image generated successfully");

    // Log AI usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/image',
      operation: 'image',
      model,
      imageCount: 1,
      imageSize: imageSize || '1K',
      latencyMs: timer(),
      status: 'success',
      metadata: { aspectRatio, hasProductImages: !!productImages?.length, hasStyleRef: !!styleReferenceImage }
    });

    res.json({
      success: true,
      imageUrl: imageDataUrl,
      model,
    });
  } catch (error) {
    console.error("[Image API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/image',
      operation: 'image',
      model: DEFAULT_IMAGE_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate image" });
  }
});

// Convert generic prompt to structured JSON for video generation
app.post("/api/ai/convert-prompt", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { prompt, duration = 5, aspectRatio = "16:9" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    console.log(
      `[Convert Prompt API] Converting prompt to JSON, duration: ${duration}s`,
    );

    const ai = getGeminiAi();
    const systemPrompt = getVideoPromptSystemPrompt(duration, aspectRatio);

    const response = await ai.models.generateContent({
      model: DEFAULT_FAST_TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\nPrompt: " + prompt }],
        },
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

    // Log AI usage
    const tokens = extractGeminiTokens(response);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/convert-prompt',
      operation: 'text',
      model: DEFAULT_FAST_TEXT_MODEL,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: 'success',
    });

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[Convert Prompt API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/convert-prompt',
      operation: 'text',
      model: DEFAULT_FAST_TEXT_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to convert prompt" });
  }
});

// AI Text Generation
app.post("/api/ai/text", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

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

    const model = brandProfile.creativeModel || DEFAULT_TEXT_MODEL;
    const isOpenRouter = model.includes("/");

    let result;

    if (type === "quickPost") {
      if (!context) {
        return res
          .status(400)
          .json({ error: "context is required for quickPost" });
      }

      const prompt = buildQuickPostPrompt(brandProfile, context);

      if (isOpenRouter) {
        const parts = [prompt];
        if (image) {
          result = await generateTextWithOpenRouterVision(
            model,
            parts,
            [image],
            temperature,
          );
        } else {
          result = await generateTextWithOpenRouter(
            model,
            "",
            prompt,
            temperature,
          );
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
        result = await generateStructuredContent(
          model,
          parts,
          quickPostSchema,
          temperature,
        );
      }
    } else {
      if (!systemPrompt && !userPrompt) {
        return res.status(400).json({
          error: "systemPrompt or userPrompt is required for custom text",
        });
      }

      if (isOpenRouter) {
        if (image) {
          const parts = userPrompt ? [userPrompt] : [];
          result = await generateTextWithOpenRouterVision(
            model,
            parts,
            [image],
            temperature,
          );
        } else {
          result = await generateTextWithOpenRouter(
            model,
            systemPrompt || "",
            userPrompt || "",
            temperature,
          );
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
          temperature,
        );
      }
    }

    console.log("[Text API] Text generated successfully");

    // Log AI usage
    const inputTokens = (userPrompt?.length || 0) / 4;
    const outputTokens = result.length / 4;
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/text',
      operation: 'text',
      model,
      inputTokens: Math.round(inputTokens),
      outputTokens: Math.round(outputTokens),
      latencyMs: timer(),
      status: 'success',
      metadata: { type, hasImage: !!image }
    });

    res.json({
      success: true,
      result: JSON.parse(result),
      model,
    });
  } catch (error) {
    console.error("[Text API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/text',
      operation: 'text',
      model: req.body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate text" });
  }
});

// AI Enhance Prompt - Improves user input for better campaign results
app.post("/api/ai/enhance-prompt", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { prompt, brandProfile } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }

    console.log("[Enhance Prompt API] Enhancing prompt...");

    const ai = getGeminiAi();

    const systemPrompt = `Você é um especialista em marketing digital e criação de conteúdo multiplataforma. Sua função é aprimorar briefings de campanhas para gerar máximo engajamento em TODOS os formatos de conteúdo.

TIPOS DE CONTEÚDO QUE A CAMPANHA PODE GERAR:
1. **Vídeos/Reels**: Conteúdo em vídeo curto para Instagram/TikTok
2. **Posts de Feed**: Imagens estáticas ou carrosséis para Instagram/Facebook
3. **Stories**: Conteúdo efêmero vertical
4. **Anúncios**: Criativos para campanhas pagas

DIRETRIZES DE ENGAJAMENTO (aplicáveis a TODOS os formatos):

**ATENÇÃO IMEDIATA:**
- Para vídeos: Hook visual/auditivo nos primeiros 2 segundos
- Para posts: Headline impactante ou visual que pare o scroll
- Para stories: Elemento interativo ou surpresa inicial

**CURIOSIDADE:**
- Perguntas abertas que o público precisa responder
- Contraste (conhecido vs. desconhecido)
- Premissas intrigantes ou contra-intuitivas

**VALOR PRÁTICO:**
- Dicas concretas que resolvam problemas reais
- Informação útil e acionável
- Transformação clara (antes → depois)

**CONEXÃO EMOCIONAL:**
- Tom autêntico e humanizado
- Storytelling quando apropriado
- Identificação com dores/desejos do público

**CHAMADA PARA AÇÃO:**
- CTA claro e específico
- Senso de urgência quando apropriado
- Próximo passo óbvio

${
  brandProfile
    ? `
CONTEXTO DA MARCA:
- Nome: ${brandProfile.name || "Não especificado"}
- Descrição: ${brandProfile.description || "Não especificado"}
- Tom de Voz: ${brandProfile.toneOfVoice || "Não especificado"}
`
    : ""
}

TAREFA:
Receba o briefing do usuário e transforme-o em um briefing aprimorado que maximize o potencial de engajamento para TODOS os tipos de conteúdo que serão gerados (vídeos, posts e anúncios).

REGRAS:
1. Mantenha a essência e objetivo original do briefing
2. Seja abrangente - o briefing será usado para gerar vídeos E posts estáticos
3. Adicione sugestões de hooks, headlines, e elementos visuais
4. Inclua ideias de CTAs e hashtags relevantes
5. Seja específico e acionável
6. Responda APENAS com o briefing aprimorado, sem explicações
7. Use português brasileiro
8. Mantenha tamanho similar ou ligeiramente maior que o original
9. Use formatação markdown para estruturar (negrito, listas, etc)`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\nBRIEFING ORIGINAL:\n" + prompt }],
        },
      ],
      config: {
        temperature: 0.5,
        maxOutputTokens: 2048,
      },
    });

    const enhancedPrompt = result.text?.trim() || "";

    console.log("[Enhance Prompt API] Successfully enhanced prompt");

    // Log AI usage
    const tokens = extractGeminiTokens(result);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/enhance-prompt',
      operation: 'text',
      model: 'gemini-3-flash-preview',
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: 'success',
    });

    res.json({ enhancedPrompt });
  } catch (error) {
    console.error("[Enhance Prompt API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/enhance-prompt',
      operation: 'text',
      model: 'gemini-3-flash-preview',
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to enhance prompt" });
  }
});

app.post("/api/ai/edit-image", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { image, prompt, mask, maskRegion, referenceImage } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: "image and prompt are required" });
    }

    console.log("[Edit Image API] Editing image...", { hasMask: !!mask, hasMaskRegion: !!maskRegion });

    const ai = getGeminiAi();

    // Build location-aware prompt if mask region is provided
    let locationHint = "";
    if (maskRegion) {
      const { x, y, width, height, imageWidth, imageHeight } = maskRegion;
      // Calculate position as percentage and quadrant
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const percX = Math.round((centerX / imageWidth) * 100);
      const percY = Math.round((centerY / imageHeight) * 100);

      // Determine quadrant/position description
      let positionDesc = "";
      if (percY < 33) {
        positionDesc = percX < 33 ? "canto superior esquerdo" : percX > 66 ? "canto superior direito" : "parte superior central";
      } else if (percY > 66) {
        positionDesc = percX < 33 ? "canto inferior esquerdo" : percX > 66 ? "canto inferior direito" : "parte inferior central";
      } else {
        positionDesc = percX < 33 ? "lado esquerdo" : percX > 66 ? "lado direito" : "centro";
      }

      locationHint = ` ATENÇÃO: Edite SOMENTE a área marcada no ${positionDesc} da imagem (aproximadamente ${Math.round(width/imageWidth*100)}% de largura x ${Math.round(height/imageHeight*100)}% de altura). NÃO modifique outras partes da imagem.`;
      console.log("[Edit Image API] Location hint:", locationHint);
    }

    const instructionPrompt = `DESIGNER SÊNIOR: Execute alteração profissional: ${prompt}.${locationHint} Texto original e logos são SAGRADOS, preserve informações importantes visíveis.`;

    const parts = [
      { text: instructionPrompt },
      { inlineData: { data: image.base64, mimeType: image.mimeType } },
    ];

    // Configurar máscara para inpainting (edição de área específica)
    let imageConfig = { imageSize: "1K" };

    if (mask) {
      // Gemini suporta máscara binária (preto=editar, branco=preservar)
      // A máscara deve ser uma imagem PNG com transparência ou escala de cinza
      imageConfig.mask = {
        image: {
          inlineData: {
            data: mask.base64,
            mimeType: mask.mimeType || "image/png"
          }
        }
      };
      console.log("[Edit Image API] Mask applied");
    }

    if (referenceImage) {
      parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: DEFAULT_IMAGE_MODEL,
        contents: { parts },
        config: { imageConfig },
      })
    );

    // Check for blocked content
    if (response.candidates?.[0]?.finishReason === "SAFETY") {
      const safetyRatings = response.candidates?.[0]?.safetyRatings || [];
      console.log("[Edit Image API] Blocked by safety filters:", safetyRatings);
      throw new Error("A edição foi bloqueada pelos filtros de segurança. Tente reformular o pedido.");
    }

    let imageDataUrl = null;
    const parts_response = response.candidates?.[0]?.content?.parts;
    // Check if parts_response is an array (not empty object or undefined)
    if (Array.isArray(parts_response)) {
      for (const part of parts_response) {
        if (part.inlineData) {
          imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageDataUrl) {
      console.log("[Edit Image API] No image in response:", JSON.stringify(response, null, 2).substring(0, 1000));
      throw new Error("O modelo não retornou uma imagem. Tente novamente com uma instrução diferente.");
    }

    console.log("[Edit Image API] Image edited successfully");

    // Log AI usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/edit-image',
      operation: 'edit_image',
      model: 'gemini-3-pro-image-preview',
      imageCount: 1,
      imageSize: '1K',
      latencyMs: timer(),
      status: 'success',
      metadata: { hasMask: !!mask, hasReference: !!referenceImage }
    });

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    console.error("[Edit Image API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/edit-image',
      operation: 'edit_image',
      model: 'gemini-3-pro-image-preview',
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to edit image" });
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
      model: DEFAULT_IMAGE_MODEL,
      contents: {
        parts: [
          {
            text: `Analise este logo e extraia as cores presentes na imagem.

REGRAS ESTRITAS:
- Examine CADA pixel da imagem
- primaryColor: cor que aparece em MAIOR área (OBRIGATÓRIO)
- secondaryColor: segunda cor mais frequente (retorne null se não existir)
- tertiaryColor: terceira cor de destaque (retorne null se não existir)
- NÃO invente cores que não estão no logo
- NÃO retorne preto (#000000) ou branco (#FFFFFF) a menos que estejam claramente visíveis

RESPONDA:
- Se só houver 1 cor: {"primaryColor": "#COR", "secondaryColor": null, "tertiaryColor": null}
- Se houver 2 cores: {"primaryColor": "#COR1", "secondaryColor": "#COR2", "tertiaryColor": null}
- Se houver 3 cores: {"primaryColor": "#COR1", "secondaryColor": "#COR2", "tertiaryColor": "#COR3"}

Retorne APENAS o JSON, sem texto adicional.`,
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

    // Log AI usage
    const tokens = extractGeminiTokens(response);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/extract-colors',
      operation: 'image',
      model: DEFAULT_IMAGE_MODEL,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: 'success',
    });

    res.json(colors);
  } catch (error) {
    console.error("[Extract Colors API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/extract-colors',
      operation: 'image',
      model: DEFAULT_IMAGE_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to extract colors" });
  }
});

// AI Speech Generation (TTS)
app.post("/api/ai/speech", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

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

    const audioBase64 =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";

    if (!audioBase64) {
      throw new Error("Failed to generate speech");
    }

    console.log("[Speech API] Speech generated successfully");

    // Log AI usage - TTS is priced per character
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/speech',
      operation: 'speech',
      model: 'gemini-2.5-flash-preview-tts',
      characterCount: script.length,
      latencyMs: timer(),
      status: 'success',
      metadata: { voiceName }
    });

    res.json({
      success: true,
      audioBase64,
    });
  } catch (error) {
    console.error("[Speech API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/speech',
      operation: 'speech',
      model: 'gemini-2.5-flash-preview-tts',
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate speech" });
  }
});

// AI Assistant Streaming Endpoint
app.post("/api/ai/assistant", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { history, brandProfile } = req.body;

    if (!history) {
      return res.status(400).json({ error: "history is required" });
    }

    console.log("[Assistant API] Starting streaming conversation...");

    const ai = getGeminiAi();
    const sanitizedHistory = history
      .map((message) => {
        const parts = (message.parts || []).filter(
          (part) => part.text || part.inlineData,
        );
        if (!parts.length) return null;
        return { ...message, parts };
      })
      .filter(Boolean);

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
              },
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
        },
      ],
    };

    const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design de alta performance.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await ai.models.generateContentStream({
      model: DEFAULT_ASSISTANT_MODEL,
      contents: sanitizedHistory,
      config: {
        systemInstruction,
        tools: [assistantTools],
        temperature: 0.5,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text || "";
      const functionCall = chunk.candidates?.[0]?.content?.parts?.find(
        (p) => p.functionCall,
      )?.functionCall;

      const data = { text };
      if (functionCall) {
        data.functionCall = functionCall;
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();

    console.log("[Assistant API] Streaming completed");

    // Log AI usage - estimate tokens based on history length
    const inputTokens = JSON.stringify(sanitizedHistory).length / 4;
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/assistant',
      operation: 'text',
      model: DEFAULT_ASSISTANT_MODEL,
      inputTokens: Math.round(inputTokens),
      latencyMs: timer(),
      status: 'success',
      metadata: { historyLength: sanitizedHistory.length }
    }).catch(() => {});
  } catch (error) {
    console.error("[Assistant API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/assistant',
      operation: 'text',
      model: DEFAULT_ASSISTANT_MODEL,
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ error: error.message || "Failed to run assistant" });
    }
    res.end();
  }
});

// AI Video Generation API
const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY environment variable is not configured");
  }
  fal.config({ credentials: apiKey });
};

// Generate video using Google Veo API directly (supports first/last frame interpolation)
async function generateVideoWithGoogleVeo(
  prompt,
  aspectRatio,
  imageUrl,
  lastFrameUrl = null,
) {
  const ai = getGeminiAi();
  const isHttpUrl = imageUrl && imageUrl.startsWith("http");
  const hasLastFrame = lastFrameUrl && lastFrameUrl.startsWith("http");
  const mode = hasLastFrame
    ? "first-last-frame"
    : isHttpUrl
      ? "image-to-video"
      : "text-to-video";

  console.log(`[Google Veo] Generating video: ${mode}, ${aspectRatio}`);
  const startTime = Date.now();

  const generateParams = {
    model: "veo-3.1-fast-generate-preview",
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio,
      ...(hasLastFrame && { durationSeconds: 8 }),
      ...(hasLastFrame && { personGeneration: "allow_adult" }),
    },
  };

  if (isHttpUrl) {
    const imageResponse = await fetch(imageUrl);
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";
    generateParams.image = { imageBytes: imageBase64, mimeType: contentType };
  }

  if (hasLastFrame) {
    const lastFrameResponse = await fetch(lastFrameUrl);
    const lastFrameArrayBuffer = await lastFrameResponse.arrayBuffer();
    const lastFrameBase64 =
      Buffer.from(lastFrameArrayBuffer).toString("base64");
    const lastFrameContentType =
      lastFrameResponse.headers.get("content-type") || "image/jpeg";
    generateParams.lastFrame = {
      imageBytes: lastFrameBase64,
      mimeType: lastFrameContentType,
    };
  }

  let operation = await ai.models.generateVideos(generateParams);

  const maxWaitTime = 5 * 60 * 1000;
  const pollInterval = 10000;
  const startPoll = Date.now();

  while (!operation.done) {
    if (Date.now() - startPoll > maxWaitTime) {
      throw new Error("Video generation timed out after 5 minutes");
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  console.log(`[Google Veo] Video generated in ${Date.now() - startTime}ms`);

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("No videos generated by Google Veo");
  }

  const videoUri = generatedVideos[0].video?.uri;
  if (!videoUri) {
    throw new Error("Invalid video response from Google Veo");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  return `${videoUri}&key=${apiKey}`;
}

app.post("/api/ai/video", requireAuthWithAiRateLimit, async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    configureFal();

    const {
      prompt,
      aspectRatio,
      model,
      imageUrl,
      lastFrameUrl,
      sceneDuration,
      useInterpolation = false,
    } = req.body;

    if (!prompt || !aspectRatio || !model) {
      return res.status(400).json({
        error: "Missing required fields: prompt, aspectRatio, model",
      });
    }

    const isInterpolationMode = useInterpolation && lastFrameUrl;
    console.log(
      `[Video API] Generating video with ${model}, interpolation: ${isInterpolationMode}`,
    );

    let videoUrl;
    const isHttpUrl = imageUrl && imageUrl.startsWith("http");

    if (model === "sora-2") {
      // Sora 2 via FAL.ai (doesn't support first/last frame)
      const duration = 12;
      let result;

      if (isHttpUrl) {
        result = await fal.subscribe("fal-ai/sora-2/image-to-video", {
          input: {
            prompt,
            image_url: imageUrl,
            resolution: "720p",
            aspect_ratio: aspectRatio,
            duration,
            delete_video: false,
          },
          logs: true,
        });
      } else {
        result = await fal.subscribe("fal-ai/sora-2/text-to-video", {
          input: {
            prompt,
            resolution: "720p",
            aspect_ratio: aspectRatio,
            duration,
            delete_video: false,
          },
          logs: true,
        });
      }

      videoUrl = result?.data?.video?.url || result?.video?.url || "";
    } else {
      // Veo 3.1 - try Google API first, fallback to FAL.ai
      try {
        videoUrl = await generateVideoWithGoogleVeo(
          prompt,
          aspectRatio,
          imageUrl,
          isInterpolationMode ? lastFrameUrl : null,
        );
      } catch (googleError) {
        console.log(
          `[Video API] Google Veo failed: ${googleError.message}`,
        );
        console.log("[Video API] Falling back to FAL.ai...");
        const duration = isInterpolationMode
          ? "8s"
          : sceneDuration && sceneDuration <= 4
            ? "4s"
            : sceneDuration && sceneDuration <= 6
              ? "6s"
              : "8s";

        let result;

        if (isHttpUrl) {
          result = await fal.subscribe("fal-ai/veo3.1/fast/image-to-video", {
            input: {
              prompt,
              image_url: imageUrl,
              aspect_ratio: aspectRatio,
              duration,
              resolution: "720p",
              generate_audio: true,
            },
            logs: true,
          });
        } else {
          result = await fal.subscribe("fal-ai/veo3.1/fast", {
            input: {
              prompt,
              aspect_ratio: aspectRatio,
              duration,
              resolution: "720p",
              generate_audio: true,
              auto_fix: true,
            },
            logs: true,
          });
        }

        videoUrl = result?.data?.video?.url || result?.video?.url || "";
      }
    }

    if (!videoUrl) {
      throw new Error("Failed to generate video - invalid response");
    }

    console.log(`[Video API] Video generated: ${videoUrl}`);

    console.log("[Video API] Uploading to Vercel Blob...");
    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();

    const filename = `${model}-video-${Date.now()}.mp4`;
    const blob = await put(filename, videoBlob, {
      access: "public",
      contentType: "video/mp4",
    });

    console.log(`[Video API] Video stored: ${blob.url}`);

    // Log AI usage - video is priced per second
    const durationSeconds = sceneDuration || 5; // Default 5 seconds
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/video',
      operation: 'video',
      model: model.includes('veo') ? 'veo-3.1-fast' : model,
      videoDurationSeconds: durationSeconds,
      latencyMs: timer(),
      status: 'success',
      metadata: { aspectRatio, hasImageUrl: !!imageUrl, isInterpolation: isInterpolationMode }
    });

    return res.status(200).json({
      success: true,
      url: blob.url,
      model,
    });
  } catch (error) {
    console.error("[Video API] Error:", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/video',
      operation: 'video',
      model: req.body?.model || 'veo-3.1-fast',
      latencyMs: timer(),
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {});
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to generate video",
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
    const { instagram_account_id, user_id, organization_id, ...mcpRequest } = req.body;

    let token;
    let instagramUserId;

    // Multi-tenant mode: use token from database
    // Supports both personal accounts (user_id) and organization accounts (organization_id)
    if (instagram_account_id && (user_id || organization_id)) {
      console.log(
        "[Rube Proxy] Multi-tenant mode - fetching token for account:",
        instagram_account_id,
        organization_id ? `(org: ${organization_id})` : "(personal)",
      );

      // Resolve user_id if provided (for personal accounts or audit)
      let resolvedUserId = null;
      if (user_id) {
        if (user_id.startsWith("user_")) {
          const userResult =
            await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
          resolvedUserId = userResult[0]?.id;
          if (!resolvedUserId) {
            console.log("[Rube Proxy] User not found for Clerk ID:", user_id);
            return res.status(400).json({ error: "User not found" });
          }
        } else {
          resolvedUserId = user_id;
        }
      }

      // Fetch account token based on context
      // For organizations: any member can use org accounts
      // For personal: only the owner can use the account
      let accountResult;
      if (organization_id) {
        // Organization context: verify account belongs to the org
        accountResult = await sql`
          SELECT rube_token, instagram_user_id FROM instagram_accounts
          WHERE id = ${instagram_account_id} AND organization_id = ${organization_id} AND is_active = TRUE
          LIMIT 1
        `;
      } else if (resolvedUserId) {
        // Personal context: verify account belongs to the user
        accountResult = await sql`
          SELECT rube_token, instagram_user_id FROM instagram_accounts
          WHERE id = ${instagram_account_id} AND user_id = ${resolvedUserId} AND organization_id IS NULL AND is_active = TRUE
          LIMIT 1
        `;
      } else {
        return res.status(400).json({ error: "user_id or organization_id required" });
      }

      if (accountResult.length === 0) {
        console.log("[Rube Proxy] Instagram account not found or access denied");
        return res
          .status(403)
          .json({ error: "Instagram account not found or access denied" });
      }

      token = accountResult[0].rube_token;
      instagramUserId = accountResult[0].instagram_user_id;
      console.log(
        "[Rube Proxy] Using token for Instagram user:",
        instagramUserId,
      );

      // Update last_used_at
      await sql`UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = ${instagram_account_id}`;
    } else {
      // Fallback to global token (dev mode)
      token = process.env.RUBE_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "RUBE_TOKEN not configured" });
      }
      console.log("[Rube Proxy] Using global RUBE_TOKEN (dev mode)");
    }

    // Inject ig_user_id into tool arguments if we have it
    if (instagramUserId && mcpRequest.params?.arguments) {
      // For RUBE_MULTI_EXECUTE_TOOL, inject into each tool's arguments
      if (
        mcpRequest.params.arguments.tools &&
        Array.isArray(mcpRequest.params.arguments.tools)
      ) {
        mcpRequest.params.arguments.tools.forEach((tool) => {
          if (tool.arguments) {
            tool.arguments.ig_user_id = instagramUserId;
          }
        });
        console.log(
          "[Rube Proxy] Injected ig_user_id into",
          mcpRequest.params.arguments.tools.length,
          "tools",
        );
      } else {
        // For direct tool calls
        mcpRequest.params.arguments.ig_user_id = instagramUserId;
        console.log("[Rube Proxy] Injected ig_user_id directly");
      }
    }

    const response = await fetch(RUBE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(mcpRequest),
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    console.error("[Rube Proxy] Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================================================
// STATIC FILES - Serve frontend in production
// ============================================================================

// Serve static files from the dist directory
app.use(
  express.static(path.join(__dirname, "../dist"), {
    setHeaders: (res, filePath) => {
      // Set COEP headers for WASM support
      if (filePath.endsWith(".html")) {
        res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      }
    },
  }),
);

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }

  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
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

    // Add 'video' to generation_job_type enum if not exists
    try {
      await sql`ALTER TYPE generation_job_type ADD VALUE IF NOT EXISTS 'video'`;
      console.log("[Migration] ✓ Ensured 'video' job type exists");
    } catch (enumError) {
      // Might already exist or different PG version
      console.log("[Migration] Note: video enum might already exist");
    }

    // Add 'image' to generation_job_type enum if not exists
    try {
      await sql`ALTER TYPE generation_job_type ADD VALUE IF NOT EXISTS 'image'`;
      console.log("[Migration] ✓ Ensured 'image' job type exists");
    } catch (enumError) {
      // Might already exist or different PG version
      console.log("[Migration] Note: image enum might already exist");
    }

    // Create instagram_accounts table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS instagram_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        organization_id VARCHAR(50),
        instagram_user_id VARCHAR(255) NOT NULL,
        instagram_username VARCHAR(255),
        rube_token TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[Migration] ✓ Ensured instagram_accounts table exists");

    // Migration 009: Add connected_by_user_id for org sharing (tracks who connected)
    try {
      await sql`
        ALTER TABLE instagram_accounts
        ADD COLUMN IF NOT EXISTS connected_by_user_id UUID REFERENCES users(id)
      `;
      console.log("[Migration] ✓ Added connected_by_user_id column");

      // Copy existing user_id to connected_by_user_id for existing records
      await sql`
        UPDATE instagram_accounts
        SET connected_by_user_id = user_id
        WHERE connected_by_user_id IS NULL AND user_id IS NOT NULL
      `;
      console.log("[Migration] ✓ Copied user_id to connected_by_user_id");

      // Make user_id nullable (for org accounts)
      await sql`
        ALTER TABLE instagram_accounts
        ALTER COLUMN user_id DROP NOT NULL
      `;
      console.log("[Migration] ✓ Made user_id nullable for org accounts");
    } catch (migError) {
      console.log("[Migration] Note: instagram_accounts org sharing migration:", migError.message);
    }

    // Add instagram_account_id column to scheduled_posts if not exists
    await sql`
      ALTER TABLE scheduled_posts
      ADD COLUMN IF NOT EXISTS instagram_account_id UUID REFERENCES instagram_accounts(id) ON DELETE SET NULL
    `;
    console.log(
      "[Migration] ✓ Ensured instagram_account_id column in scheduled_posts",
    );

    // Migration 005: Create AI usage tracking enums and table
    try {
      // Create ai_provider enum
      await sql`
        DO $$ BEGIN
          CREATE TYPE ai_provider AS ENUM ('google', 'openrouter', 'fal');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `;

      // Create ai_operation enum
      await sql`
        DO $$ BEGIN
          CREATE TYPE ai_operation AS ENUM ('text', 'image', 'video', 'speech', 'flyer', 'edit_image', 'campaign');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `;

      // Create usage_status enum
      await sql`
        DO $$ BEGIN
          CREATE TYPE usage_status AS ENUM ('success', 'failed', 'timeout', 'rate_limited');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `;

      // Create api_usage_logs table
      await sql`
        CREATE TABLE IF NOT EXISTS api_usage_logs (
          id SERIAL PRIMARY KEY,
          request_id UUID NOT NULL UNIQUE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          organization_id VARCHAR(50),
          endpoint VARCHAR(255) NOT NULL,
          operation ai_operation NOT NULL,
          provider ai_provider NOT NULL,
          model_id VARCHAR(100),
          input_tokens INTEGER,
          output_tokens INTEGER,
          total_tokens INTEGER,
          image_count INTEGER,
          image_size VARCHAR(10),
          video_duration_seconds INTEGER,
          audio_duration_seconds INTEGER,
          character_count INTEGER,
          estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
          latency_ms INTEGER,
          status usage_status NOT NULL DEFAULT 'success',
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      // Create indexes
      await sql`CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON api_usage_logs(user_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_usage_logs_org ON api_usage_logs(organization_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON api_usage_logs((created_at::DATE))`;

      console.log("[Migration] ✓ Ensured api_usage_logs table and enums exist");
    } catch (usageError) {
      console.log("[Migration] Note: api_usage_logs migration:", usageError.message);
    }
  } catch (error) {
    console.error("[Migration] Error:", error.message);
    // Don't fail startup - column might already exist with different syntax
  }
}

async function startServer() {
  // Start server first (so healthcheck passes)
  app.listen(PORT, () => {
    console.log(`[Production Server] Running on port ${PORT}`);
    console.log(
      `[Production Server] Database: ${DATABASE_URL ? "Connected" : "NOT CONFIGURED"}`,
    );
    console.log(
      `[Production Server] Environment: ${process.env.NODE_ENV || "development"}`,
    );
  });

  // Initialize BullMQ workers after server starts (non-blocking)
  if (REDIS_URL) {
    console.log("[Server] Redis configured, initializing BullMQ worker...");
    try {
      initializeWorker(processGenerationJob);
      await initializeScheduledPostsChecker(
        checkAndPublishScheduledPosts,
        publishScheduledPostById,
      );
      console.log("[Server] Scheduled posts publisher initialized");
    } catch (err) {
      console.error("[Server] Failed to initialize BullMQ:", err.message);
    }
  } else {
    console.log(
      "[Server] No Redis URL configured, background jobs will use polling fallback",
    );
  }

  // Run migrations in background (non-blocking)
  try {
    await runAutoMigrations();
  } catch (migrationError) {
    console.error(
      "[Migration] Failed but server is running:",
      migrationError.message,
    );
  }
}

startServer();
