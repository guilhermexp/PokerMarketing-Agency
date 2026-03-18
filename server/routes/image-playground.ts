import type { Express, Request, Response } from "express";
import type { Logger } from "pino";
import type { SqlClient } from "../lib/db.js";
import type { AuthContext } from "../lib/auth.js";
import type { BrandProfile } from "../lib/ai/prompt-builders.js";
import { urlToBase64 } from "../helpers/image-helpers.js";
import { getGeminiAi } from "../lib/ai/clients.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { expandAiInfluencerPrompt, expandProductHeroPrompt, expandExplodedProductPrompt, expandBrandIdentityPrompt } from "../lib/ai/prompt-builders.js";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getBatches,
  deleteBatch,
  deleteGeneration,
  retryGeneration,
  getGenerationStatus,
  createImageBatch,
  generateTopicTitle,
} from "../helpers/image-playground.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type ImagePlaygroundBatchesQuery,
  type ImagePlaygroundGenerateBody,
  type ImagePlaygroundStatusParams,
  type ImagePlaygroundStatusQuery,
  type PlaygroundGenerateTitleBody,
  type PlaygroundIdParams,
  type PlaygroundTopicBody,
  type PlaygroundTopicUpdateBody,
  imagePlaygroundBatchesQuerySchema,
  imagePlaygroundGenerateBodySchema,
  imagePlaygroundStatusParamsSchema,
  imagePlaygroundStatusQuerySchema,
  playgroundGenerateTitleBodySchema,
  playgroundIdParamsSchema,
  playgroundTopicBodySchema,
  playgroundTopicUpdateBodySchema,
} from "../schemas/playground-schemas.js";

// =============================================================================
// Types
// =============================================================================

interface ImagePlaygroundDependencies {
  getRequestAuthContext: (req: Request) => AuthContext | null;
  getSql: () => SqlClient;
  resolveUserId: (sql: SqlClient, userId: string | null | undefined) => Promise<string | null>;
  logger: Logger;
  buildImagePrompt: (options: BuildImagePromptOptions) => string;
}

interface BuildImagePromptOptions {
  prompt: string;
  brandProfile?: MappedBrandProfile | null;
  hasStyleReference?: boolean;
  hasLogo?: boolean;
  hasPersonReference?: boolean;
  hasProductImages?: boolean;
  fontStyle?: string | null;
}

interface MappedBrandProfile {
  name?: string;
  description?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  toneOfVoice?: string;
  toneTargets?: string[];
  [key: string]: unknown;
}

interface InlineImage {
  base64: string;
  mimeType: string;
}

interface ReferenceImage {
  id?: string;
  dataUrl: string;
  mimeType?: string;
}

interface GenerationParams {
  prompt: string;
  userPrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  imageSize?: string;
  seed?: number;
  useInstagramMode?: boolean;
  useAiInfluencerMode?: boolean;
  useProductHeroMode?: boolean;
  useExplodedProductMode?: boolean;
  useBrandIdentityMode?: boolean;
  useBrandProfile?: boolean;
  toneOfVoiceOverride?: string;
  fontStyleOverride?: string;
  referenceImages?: ReferenceImage[];
  productImages?: InlineImage[];
  personReferenceImage?: string;
  imageUrl?: string;
  brandProfile?: Record<string, unknown>;
  model?: string;
}

// Request body interfaces
interface CreateTopicBody {
  title?: string;
}

interface UpdateTopicBody {
  title?: string;
  coverUrl?: string;
}

interface GenerateBody {
  topicId: string;
  provider: string;
  model: string;
  imageNum?: number;
  params: GenerationParams;
}

interface GenerateTitleBody {
  prompts: string[];
}

// Database row interfaces
interface BrandProfileRow {
  name?: string;
  description?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  tone_of_voice?: string;
  settings?: {
    toneTargets?: string[];
  };
}

interface DatabaseError extends Error {
  code?: string;
}

interface ParsedDataUrl {
  mimeType: string;
  base64: string;
}

// =============================================================================
// Route Registration
// =============================================================================

export function registerImagePlaygroundRoutes(
  app: Express,
  {
    getRequestAuthContext,
    getSql,
    resolveUserId,
    logger,
    buildImagePrompt,
  }: ImagePlaygroundDependencies,
): void {
  const ALLOWED_TONES = new Set([
    "Profissional",
    "Espirituoso",
    "Casual",
    "Inspirador",
    "Técnico",
  ]);
  const ALLOWED_FONT_STYLES = new Set([
    "Bebas Neue",
    "Oswald",
    "Anton",
    "Impact",
    "Montserrat ExtraBold",
    "Gilroy",
  ]);

  const inferMimeTypeFromSource = (source: string | null | undefined): string => {
    if (!source || typeof source !== "string") return "image/png";
    const [pathWithoutQuery] = source.split("?");
    const cleanSource = (pathWithoutQuery ?? source).toLowerCase();
    if (cleanSource.endsWith(".svg")) return "image/svg+xml";
    if (cleanSource.endsWith(".jpg") || cleanSource.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (cleanSource.endsWith(".webp")) return "image/webp";
    return "image/png";
  };

  const parseDataUrl = (value: string | null | undefined): ParsedDataUrl | null => {
    if (!value || typeof value !== "string") return null;
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !match[1] || !match[2]) return null;
    return { mimeType: match[1], base64: match[2] };
  };

  const getLogoInlineImage = async (logoSource: string | null | undefined): Promise<InlineImage | null> => {
    if (!logoSource || typeof logoSource !== "string") return null;

    // data URL
    const parsedDataUrl = parseDataUrl(logoSource);
    if (parsedDataUrl) {
      return {
        base64: parsedDataUrl.base64,
        mimeType: parsedDataUrl.mimeType || "image/png",
      };
    }

    // http URL
    if (logoSource.startsWith("http")) {
      const logoBase64 = await urlToBase64(logoSource);
      if (!logoBase64) return null;
      return {
        base64: logoBase64,
        mimeType: inferMimeTypeFromSource(logoSource),
      };
    }

    // raw base64 fallback
    return { base64: logoSource, mimeType: "image/png" };
  };

  const buildAiInfluencerPrompt = (userPrompt: string): string => {
    return `CONTEXTO DE GERAÇÃO — AI INFLUENCER (FOTORREALISMO):
- A imagem deve parecer foto REAL tirada por um influenciador digital com smartphone
- Estilo: selfie candid ou foto lifestyle autêntica para redes sociais
- Câmera: perspectiva de smartphone (leve distorção de lente grande-angular, profundidade realista)
- Skin texture: alta fidelidade com poros visíveis, imperfeições naturais e brilho sutil
- Iluminação: natural e suave (luz de janela, golden hour, ou ambiente bem iluminado)
- Composição: enquadramento médio ou close-up, foco nítido no rosto, background com bokeh suave
- Roupa e acessórios: casual-chic, condizente com lifestyle de influenciador
- Expressão: natural, confiante, não posada — autêntica
- NÃO parecer render 3D, ilustração ou foto de estúdio profissional
- O resultado deve ser indistinguível de uma foto real de smartphone em rede social

PROMPT DO USUÁRIO:
${userPrompt}`;
  };

  const buildInstagramPostPrompt = (userPrompt: string): string => {
    return `CONTEXTO DE COMPOSIÇÃO — POST PARA INSTAGRAM (FEED):
- Formato: quadrado (1:1), otimizado para feed do Instagram
- A imagem deve funcionar como um POST PROFISSIONAL de Instagram para uma marca/agência
- Composição impactante mesmo em tamanho pequeno (visualização mobile)
- Hierarquia visual forte: um elemento principal que capture atenção imediatamente
- Se houver texto, deve ser grande, legível e em PORTUGUÊS
- Estilo: editorial/publicitário de alto nível, pronto para publicação
- Cores vibrantes e contraste alto para se destacar no feed
- Evite excesso de elementos — simplicidade premium
- O resultado deve parecer peça criada por agência de marketing digital profissional
- O branding da marca deve estar integrado de forma orgânica e envolvente na composição
- Evite aparência de "logo colado"; integre marca com harmonia de luz, cor, textura e layout

PROMPT DO USUÁRIO:
${userPrompt}`;
  };

  const buildProductHeroPrompt = (userPrompt: string): string => {
    return `CONTEXTO DE GERAÇÃO — PRODUCT HERO SHOT (FOTOGRAFIA PUBLICITÁRIA PREMIUM):
- A imagem deve parecer fotografia publicitária premium de produto, nível campanha internacional
- Hero shot: produto centralizado, composição simétrica, fundo limpo com bokeh suave
- Lente: 85mm f/1.8, forte separação de fundo, foco absoluto no produto
- Iluminação: estúdio de 3 pontos — key light, fill light, rim light dourado
- Textura: macro ultra-detalhado — condensação, reflexos, brilho, textura de material
- Composição: hierarquia visual clara, produto como protagonista absoluto
- Estilo: fotografia publicitária de alto nível, NÃO lifestyle, NÃO flat lay
- O resultado deve parecer campanha de produto de agência internacional

PROMPT DO USUÁRIO:
${userPrompt}`;
  };

  const buildExplodedProductPrompt = (userPrompt: string): string => {
    return `CONTEXTO DE GERAÇÃO — EXPLODED PRODUCT (INFOGRÁFICO DESCONSTRUÍDO):
- Layout vertical com cada componente/ingrediente flutuando independentemente
- Ordem de cima para baixo: decoração/pó → ingredientes principais → camadas líquidas → recipiente vazio no fundo
- Fundo: estúdio premium (escuro: gradiente grafite-carvão, ou claro: creme-bege)
- Cada ingrediente com textura ultra-realista em macro 8K
- Labels minimalistas com linhas indicadoras e nomes em inglês no lado direito
- Sombras suaves abaixo de cada componente flutuante
- Estilo: infográfico de produto premium / pôster visual de bebida
- NÃO é lifestyle, NÃO é flat lay, NÃO é ilustração

PROMPT DO USUÁRIO:
${userPrompt}`;
  };

  const buildBrandIdentityPrompt = (userPrompt: string, brandProfile: BrandProfile | null): string => {
    const name = brandProfile?.name || "a marca";
    const primary = brandProfile?.primaryColor || "#000000";
    const secondary = brandProfile?.secondaryColor || "#FFFFFF";
    const tone = brandProfile?.toneOfVoice || "Profissional";
    return `CONTEXTO DE GERAÇÃO — BRAND IDENTITY (ADERÊNCIA TOTAL A GUIDELINES):
- A imagem DEVE respeitar rigorosamente a identidade visual da marca ${name}
- Paleta de cores RESTRITA: primária ${primary}, acento ${secondary}. Nenhuma cor fora da paleta.
- Tom de voz visual: ${tone}
- Tipografia: bold condensed sans-serif (Monument Extended, Bebas Neue) para títulos
- Composição limpa, arquitetônica, respeitando a filosofia de design da marca
- SEM gradientes desnecessários, SEM cantos arredondados (a menos que seja parte da marca)
- SEM elementos decorativos que não façam parte da identidade
- O resultado deve parecer criado por alguém que conhece profundamente a identidade visual da marca

PROMPT DO USUÁRIO:
${userPrompt}`;
  };

  // Get all topics
  app.get("/api/image-playground/topics", async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const topics = await getTopics(sql, resolvedUserId, orgId);

      res.json({ topics });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Get topics error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Create topic
  app.post("/api/image-playground/topics", validateRequest({ body: playgroundTopicBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { title } = req.body as PlaygroundTopicBody;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const topic = await createTopic(sql, resolvedUserId, orgId, title);

      res.json({ success: true, topic });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Create topic error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Update topic
  app.patch("/api/image-playground/topics/:id", validateRequest({ params: playgroundIdParamsSchema, body: playgroundTopicUpdateBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params as PlaygroundIdParams;
      const { title, coverUrl } = req.body as PlaygroundTopicUpdateBody;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const topic = await updateTopic(
        sql,
        id,
        resolvedUserId,
        { title, coverUrl },
        orgId,
      );

      res.json({ success: true, topic });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Update topic error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Delete topic
  app.delete("/api/image-playground/topics/:id", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteTopic(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete topic error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Get batches for topic
  app.get("/api/image-playground/batches", validateRequest({ query: imagePlaygroundBatchesQuerySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { topicId, limit } = req.query as unknown as ImagePlaygroundBatchesQuery;

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const batches = await getBatches(
        sql,
        topicId,
        resolvedUserId,
        orgId,
        limit,
      );

      res.json({ batches });
    } catch (error) {
      const dbError = error as DatabaseError;
      if (
        typeof dbError?.message === "string" &&
        dbError.message.toLowerCase().includes("response is too large")
      ) {
        logger.warn(
          { err: error },
          "[ImagePlayground] Batches payload too large - returning empty list",
        );
        return res.json({ batches: [] });
      }
      if (dbError?.code === "42P01" || dbError?.code === "42703") {
        logger.warn(
          { err: error },
          "[ImagePlayground] Batches schema not ready - returning empty list",
        );
        return res.json({ batches: [] });
      }
      logger.error({ err: error }, "[ImagePlayground] Get batches error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Delete batch
  app.delete("/api/image-playground/batches/:id", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteBatch(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete batch error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Create image generation
  app.post("/api/image-playground/generate", validateRequest({ body: imagePlaygroundGenerateBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { topicId, provider, model, imageNum, params } = req.body as ImagePlaygroundGenerateBody;

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);

      // Enhanced params to pass to helper
      let enhancedParams: GenerationParams = { ...params };

      // Instagram Post Mode: apply composition context + force brand
      // Aspect ratio default (1:1) is set by the frontend toggle;
      // if the user changes it afterward, respect their choice.
      if (params.useInstagramMode) {
        enhancedParams.useBrandProfile = true;
        enhancedParams.prompt = buildInstagramPostPrompt(params.prompt);
        logger.info({}, "[ImagePlayground] Instagram Post mode enabled");
      }

      // AI Influencer Mode: expand prompt via Gemini Flash agent
      // Aspect ratio default (4:5) is set by the frontend toggle.
      if (params.useAiInfluencerMode) {
        const hasRefImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 0;

        logger.info(
          { hasRefImages, refCount: params.referenceImages?.length || 0 },
          "[ImagePlayground] AI Influencer: expanding prompt with Flash agent"
        );

        const expansion = await expandAiInfluencerPrompt(params.prompt, {
          hasReferenceImages: hasRefImages,
          referenceImageCount: params.referenceImages?.length || 0,
          aspectRatio: enhancedParams.aspectRatio,
          organizationId: orgId,
          sql,
        });

        if (expansion?.generationPrompt) {
          enhancedParams.prompt = expansion.generationPrompt;
          logger.info(
            { promptChars: expansion.generationPrompt.length },
            "[ImagePlayground] AI Influencer: prompt expanded successfully"
          );
        } else {
          enhancedParams.prompt = buildAiInfluencerPrompt(params.prompt);
          logger.warn({}, "[ImagePlayground] AI Influencer: expansion failed, using static fallback");
        }
      }

      // Product Hero Shot Mode: expand prompt via Flash agent
      // Aspect ratio default (1:1) is set by the frontend toggle.
      if (params.useProductHeroMode) {
        const hasRefImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 0;

        logger.info(
          { hasRefImages, refCount: params.referenceImages?.length || 0 },
          "[ImagePlayground] Product Hero: expanding prompt with Flash agent"
        );

        const expansion = await expandProductHeroPrompt(params.prompt, {
          hasReferenceImages: hasRefImages,
          referenceImageCount: params.referenceImages?.length || 0,
          aspectRatio: enhancedParams.aspectRatio,
          organizationId: orgId,
          sql,
        });

        if (expansion?.generationPrompt) {
          enhancedParams.prompt = expansion.generationPrompt;
          logger.info(
            { promptChars: expansion.generationPrompt.length },
            "[ImagePlayground] Product Hero: prompt expanded successfully"
          );
        } else {
          enhancedParams.prompt = buildProductHeroPrompt(params.prompt);
          logger.warn({}, "[ImagePlayground] Product Hero: expansion failed, using static fallback");
        }
      }

      // Exploded Product Mode: expand prompt via Flash agent
      // Aspect ratio default (9:16) is set by the frontend toggle.
      if (params.useExplodedProductMode) {
        const hasRefImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 0;

        logger.info(
          { hasRefImages, refCount: params.referenceImages?.length || 0 },
          "[ImagePlayground] Exploded Product: expanding prompt with Flash agent"
        );

        const expansion = await expandExplodedProductPrompt(params.prompt, {
          hasReferenceImages: hasRefImages,
          referenceImageCount: params.referenceImages?.length || 0,
          aspectRatio: enhancedParams.aspectRatio,
          organizationId: orgId,
          sql,
        });

        if (expansion?.generationPrompt) {
          enhancedParams.prompt = expansion.generationPrompt;
          logger.info(
            { promptChars: expansion.generationPrompt.length },
            "[ImagePlayground] Exploded Product: prompt expanded successfully"
          );
        } else {
          enhancedParams.prompt = buildExplodedProductPrompt(params.prompt);
          logger.warn({}, "[ImagePlayground] Exploded Product: expansion failed, using static fallback");
        }
      }

      // Brand Identity Mode: expand prompt via Flash agent + force brand
      // Aspect ratio default (4:5) is set by the frontend toggle.
      if (params.useBrandIdentityMode) {
        enhancedParams.useBrandProfile = true;
        const hasRefImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 0;

        // Fetch brand profile early so we can pass it to the expand function
        const isOrgContextBrand = !!orgId;
        const brandProfileResultBrand: BrandProfileRow[] = isOrgContextBrand
          ? await sql`SELECT * FROM brand_profiles WHERE organization_id = ${orgId} AND deleted_at IS NULL LIMIT 1`
          : await sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`;

        const brandProfileForExpand: BrandProfile | null = brandProfileResultBrand[0] ? {
          name: brandProfileResultBrand[0].name,
          description: brandProfileResultBrand[0].description,
          primaryColor: brandProfileResultBrand[0].primary_color,
          secondaryColor: brandProfileResultBrand[0].secondary_color,
          toneOfVoice: brandProfileResultBrand[0].tone_of_voice,
        } : null;

        logger.info(
          { hasRefImages, refCount: params.referenceImages?.length || 0, hasBrand: !!brandProfileForExpand },
          "[ImagePlayground] Brand Identity: expanding prompt with Flash agent"
        );

        const expansion = await expandBrandIdentityPrompt(params.prompt, {
          brandProfile: brandProfileForExpand,
          hasReferenceImages: hasRefImages,
          referenceImageCount: params.referenceImages?.length || 0,
          aspectRatio: enhancedParams.aspectRatio,
          organizationId: orgId,
          sql,
        });

        if (expansion?.generationPrompt) {
          enhancedParams.prompt = expansion.generationPrompt;
          logger.info(
            { promptChars: expansion.generationPrompt.length },
            "[ImagePlayground] Brand Identity: prompt expanded successfully"
          );
        } else {
          enhancedParams.prompt = buildBrandIdentityPrompt(params.prompt, brandProfileForExpand);
          logger.warn({}, "[ImagePlayground] Brand Identity: expansion failed, using static fallback");
        }
      }

      // If useBrandProfile is enabled, use SAME logic as /api/ai/image
      if (enhancedParams.useBrandProfile) {
        const isOrgContext = !!orgId;
        const brandProfileResult: BrandProfileRow[] = isOrgContext
          ? await sql`SELECT * FROM brand_profiles WHERE organization_id = ${orgId} AND deleted_at IS NULL LIMIT 1`
          : await sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`;

        const brandProfile = brandProfileResult[0];
        if (brandProfile) {
          // Map DB columns to expected format (same as /api/ai/image)
          const mappedBrandProfile: MappedBrandProfile = {
            name: brandProfile.name,
            description: brandProfile.description,
            logo: brandProfile.logo_url,
            primaryColor: brandProfile.primary_color,
            secondaryColor: brandProfile.secondary_color,
            toneOfVoice: brandProfile.tone_of_voice,
            toneTargets: brandProfile.settings?.toneTargets || [
              "campaigns",
              "posts",
              "images",
              "flyers",
            ],
          };

          const toneOverride =
            typeof enhancedParams.toneOfVoiceOverride === "string" &&
            ALLOWED_TONES.has(enhancedParams.toneOfVoiceOverride)
              ? enhancedParams.toneOfVoiceOverride
              : null;
          const fontStyleOverride =
            typeof enhancedParams.fontStyleOverride === "string" &&
            ALLOWED_FONT_STYLES.has(enhancedParams.fontStyleOverride)
              ? enhancedParams.fontStyleOverride
              : null;
          if (toneOverride) {
            mappedBrandProfile.toneOfVoice = toneOverride;
          }

          // 1. Prepare productImages with logo + optional client images
          const clientProductImages = Array.isArray(enhancedParams.productImages)
            ? enhancedParams.productImages.filter((img: InlineImage): img is InlineImage => !!img?.base64 && !!img?.mimeType)
            : [];
          const productImages: InlineImage[] = [...clientProductImages];
          let hasLogo = false;
          try {
            const logoInlineImage = await getLogoInlineImage(mappedBrandProfile.logo);
            if (logoInlineImage) {
              productImages.unshift(logoInlineImage);
              hasLogo = true;
              logger.debug({}, "[ImagePlayground] Brand logo included in prompt");
            }
          } catch (err) {
            const logoError = err as Error;
            logger.warn(
              { errorMessage: logoError.message },
              "[ImagePlayground] Failed to include brand logo",
            );
          }

          const hasStyleReference =
            (Array.isArray(enhancedParams.referenceImages) &&
              enhancedParams.referenceImages.length > 0) ||
            !!enhancedParams.imageUrl;
          const hasPersonReference = !!enhancedParams.personReferenceImage;
          const hasProductImagesBeyondLogo =
            productImages.length > (hasLogo ? 1 : 0);

          // Build clean prompt via buildImagePrompt (handles brand, refs, typography, language)
          const fullPrompt = buildImagePrompt({
            prompt: enhancedParams.prompt,
            brandProfile: mappedBrandProfile,
            hasStyleReference,
            hasLogo,
            hasPersonReference,
            hasProductImages: hasProductImagesBeyondLogo,
            fontStyle: fontStyleOverride,
          });

          logger.debug(
            { promptChars: fullPrompt.length, promptPreview: fullPrompt.slice(0, 200) },
            "[ImagePlayground] Prompt built",
          );

          enhancedParams = {
            ...enhancedParams,
            prompt: fullPrompt,
            productImages: productImages.length > 0 ? productImages : undefined,
            brandProfile: mappedBrandProfile,
          };

          logger.info(
            {
              brandName: mappedBrandProfile.name,
              hasLogo,
              hasStyleReference,
              hasProductImagesBeyondLogo,
              toneOverride,
              fontStyleOverride,
            },
            "[ImagePlayground] Brand profile applied",
          );
        }
      }

      // For non-brand prompts, still add quality + language via buildImagePrompt
      if (!enhancedParams.brandProfile) {
        enhancedParams.prompt = buildImagePrompt({
          prompt: enhancedParams.prompt,
        });
      }

      // Initialize Gemini
      const genai = getGeminiAi();

      const result = await createImageBatch(
        sql,
        {
          topicId,
          provider,
          model,
          imageNum: imageNum || 1,
          params: enhancedParams,
        },
        resolvedUserId,
        orgId,
        genai,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      if (req.destroyed || res.headersSent) {
        logger.warn(
          { err: error },
          "[ImagePlayground] Client disconnected during generate",
        );
        return;
      }
      logger.error({ err: error }, "[ImagePlayground] Generate error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Get generation status (for polling)
  app.get("/api/image-playground/status/:generationId", validateRequest({ params: imagePlaygroundStatusParamsSchema, query: imagePlaygroundStatusQuerySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { generationId } = req.params as ImagePlaygroundStatusParams;
      const { asyncTaskId } = req.query as ImagePlaygroundStatusQuery;

      const sql = getSql();
      const status = await getGenerationStatus(sql, generationId, asyncTaskId);

      // Disable caching on polling endpoints — stale ETags cause 304 loops
      // that prevent the frontend from ever seeing 'success' status
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.set("ETag", "");
      // Use sendSuccess directly to prevent the response middleware from
      // treating the GenerationStatus.error field as an HTTP error.
      // The status object always goes in data — even when generation failed.
      res.locals.skipResponseEnvelope = true;
      (res as unknown as { _rawJson: (p: unknown) => void })._rawJson({
        data: status,
        error: null,
        meta: null,
      });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Get status error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Delete generation
  app.delete("/api/image-playground/generations/:id", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      await deleteGeneration(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete generation error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Retry a failed generation in-place
  app.post("/api/image-playground/generations/:id/retry", validateRequest({ params: playgroundIdParamsSchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params as PlaygroundIdParams;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      const genai = getGeminiAi();
      const generation = await retryGeneration(sql, id, resolvedUserId, orgId, genai);

      res.json({ success: true, generation });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Retry generation error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  // Generate topic title
  app.post("/api/image-playground/generate-title", validateRequest({ body: playgroundGenerateTitleBodySchema }), async (req: Request, res: Response) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { prompts } = req.body as PlaygroundGenerateTitleBody;

      const genai = getGeminiAi();
      const title = await generateTopicTitle(prompts, genai);

      res.json({ title });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Generate title error");
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });
}
