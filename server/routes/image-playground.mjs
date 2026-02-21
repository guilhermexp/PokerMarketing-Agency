import { GoogleGenAI } from "@google/genai";
import { urlToBase64 } from "../helpers/image-helpers.mjs";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getBatches,
  deleteBatch,
  deleteGeneration,
  getGenerationStatus,
  createImageBatch,
  generateTopicTitle,
} from "../helpers/image-playground.mjs";

export function registerImagePlaygroundRoutes(
  app,
  {
    getRequestAuthContext,
    getSql,
    resolveUserId,
    logger,
    buildImagePrompt,
  },
) {
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
  const inferMimeTypeFromSource = (source) => {
    if (!source || typeof source !== "string") return "image/png";
    const cleanSource = source.split("?")[0].toLowerCase();
    if (cleanSource.endsWith(".svg")) return "image/svg+xml";
    if (cleanSource.endsWith(".jpg") || cleanSource.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (cleanSource.endsWith(".webp")) return "image/webp";
    return "image/png";
  };

  const parseDataUrl = (value) => {
    if (!value || typeof value !== "string") return null;
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], base64: match[2] };
  };

  const getLogoInlineImage = async (logoSource) => {
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

  const buildCampaignGradeImagePrompt = (prompt, brandProfile) => {
    const toneText = brandProfile?.toneOfVoice
      ? `Tom de voz: ${brandProfile.toneOfVoice}.`
      : "";
    const colorsText = [
      brandProfile?.primaryColor,
      brandProfile?.secondaryColor,
    ]
      .filter(Boolean)
      .join(", ");

    return `BRIEF CRIATIVO (MODO CAMPAIGN-GRADE):
- Prompt base: ${prompt}
- Marca: ${brandProfile?.name || "Não especificado"}
- Descrição da marca: ${brandProfile?.description || "Não especificado"}
- Cores oficiais: ${colorsText || "Não especificado"}
- ${toneText || "Tom de voz: profissional."}

REGRAS OBRIGATÓRIAS:
1. A imagem deve parecer peça publicitária premium de agência.
2. Use composição cinematográfica, acabamento luxuoso e direção de arte profissional.
3. Preserve consistência de identidade visual (cores, tom e linguagem da marca).
4. Se houver texto na peça, ele deve estar em PORTUGUÊS e com alta legibilidade.
5. Evite visual genérico; entregue resultado autoral e sofisticado.
6. Priorize hierarquia visual forte, contraste e clareza da mensagem.
7. A identidade da marca deve aparecer de forma ORGÂNICA e envolvente na cena, não como elementos soltos.
8. Integre paleta, iluminação, textura e direção de arte para que a marca faça parte natural da composição.
9. O resultado final deve ser HIPER-REALISTA, com materiais, iluminação, profundidade e texturas fisicamente plausíveis, mantendo padrão profissional de campanha.`;
  };

  const buildInstagramPostPrompt = (userPrompt) => {
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

  const enforcePortugueseBrPrompt = (prompt) => {
    if (typeof prompt !== "string" || !prompt.trim()) return prompt;
    if (prompt.includes("IDIOMA OBRIGATÓRIO (pt-BR):")) return prompt;
    return `${prompt}

IDIOMA OBRIGATÓRIO (pt-BR):
- Responda e componha a direção criativa em PORTUGUÊS DO BRASIL.
- Se houver qualquer texto na imagem (título, CTA, preço, legenda, selo), ele DEVE estar em português do Brasil.
- Nunca use inglês ou outro idioma nos textos visíveis da arte.`;
  };

  const buildImagePromptSpec = ({
    basePrompt,
    aspectRatio,
    imageSize,
    brandProfile,
    toneOverride,
    fontStyleOverride,
    hasLogo,
    hasStyleReference,
    hasPersonReference,
    hasProductImagesBeyondLogo,
  }) => {
    const resolvedTone = toneOverride || brandProfile?.toneOfVoice || "Profissional";
    const resolvedFont = fontStyleOverride || "Bold condensed sans-serif";
    const resolvedAspectRatio = aspectRatio || "1:1";
    const resolvedImageSize = imageSize || "2K";

    return {
      prompt_spec_version: "image-studio-v1",
      language: "pt-BR",
      output: {
        aspect_ratio: resolvedAspectRatio,
        resolution: resolvedImageSize,
      },
      brand: {
        name: brandProfile?.name || "",
        description: brandProfile?.description || "",
        primary_color: brandProfile?.primaryColor || "#000000",
        secondary_color: brandProfile?.secondaryColor || "#FFFFFF",
        tone_of_voice: resolvedTone,
      },
      typography: {
        preferred_font: resolvedFont,
        family_policy: "single-family",
        allowed_style: "bold-condensed-sans-serif",
        uppercase_titles: true,
      },
      constraints: {
        campaign_grade: true,
        hyper_realistic: true,
        cinematic_composition: true,
        premium_finish: true,
        text_language: "pt-BR",
        integrate_brand_organically: true,
        avoid_sticker_logo_look: true,
        preserve_logo_fidelity: hasLogo,
      },
      references: {
        has_logo: hasLogo,
        has_style_reference: hasStyleReference,
        has_person_reference: hasPersonReference,
        has_product_images_beyond_logo: hasProductImagesBeyondLogo,
      },
      user_intent: {
        prompt_base: basePrompt,
      },
    };
  };

  // Get all topics
  app.get("/api/image-playground/topics", async (req, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  // Create topic
  app.post("/api/image-playground/topics", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { title } = req.body;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      const topic = await createTopic(sql, resolvedUserId, orgId, title);

      res.json({ success: true, topic });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Create topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Update topic
  app.patch("/api/image-playground/topics/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const { title, coverUrl } = req.body;
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
      res.status(500).json({ error: error.message });
    }
  });

  // Delete topic
  app.delete("/api/image-playground/topics/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteTopic(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete topic error");
      res.status(500).json({ error: error.message });
    }
  });

  // Get batches for topic
  app.get("/api/image-playground/batches", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const topicId = String(req.query.topicId || "");
      if (!topicId) return res.status(400).json({ error: "topicId required" });
      const requestedLimit = Number.parseInt(String(req.query.limit || ""), 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;

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
      if (
        typeof error?.message === "string" &&
        error.message.toLowerCase().includes("response is too large")
      ) {
        logger.warn(
          { err: error },
          "[ImagePlayground] Batches payload too large - returning empty list",
        );
        return res.json({ batches: [] });
      }
      if (error?.code === "42P01" || error?.code === "42703") {
        logger.warn(
          { err: error },
          "[ImagePlayground] Batches schema not ready - returning empty list",
        );
        return res.json({ batches: [] });
      }
      logger.error({ err: error }, "[ImagePlayground] Get batches error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete batch
  app.delete("/api/image-playground/batches/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteBatch(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete batch error");
      res.status(500).json({ error: error.message });
    }
  });

  // Create image generation
  app.post("/api/image-playground/generate", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { topicId, provider, model, imageNum, params } = req.body;
      if (!topicId || !provider || !model || !params?.prompt) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);

      // Enhanced params to pass to helper
      let enhancedParams = { ...params };

      // Instagram Post Mode: apply composition context + force brand + 1:1
      if (params.useInstagramMode) {
        enhancedParams.useBrandProfile = true;
        enhancedParams.aspectRatio = '1:1';
        enhancedParams.prompt = buildInstagramPostPrompt(params.prompt);
        logger.info({}, "[ImagePlayground] Instagram Post mode enabled");
      }

      // If useBrandProfile is enabled, use SAME logic as /api/ai/image
      if (enhancedParams.useBrandProfile) {
        const isOrgContext = !!orgId;
        const brandProfileResult = isOrgContext
          ? await sql`SELECT * FROM brand_profiles WHERE organization_id = ${orgId} AND deleted_at IS NULL LIMIT 1`
          : await sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`;

        const brandProfile = brandProfileResult[0];
        if (brandProfile) {
          // Map DB columns to expected format (same as /api/ai/image)
          const mappedBrandProfile = {
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
            ? enhancedParams.productImages.filter((img) => img?.base64 && img?.mimeType)
            : [];
          const productImages = [...clientProductImages];
          let hasLogo = false;
          try {
            const logoInlineImage = await getLogoInlineImage(mappedBrandProfile.logo);
            if (logoInlineImage) {
              productImages.unshift(logoInlineImage);
              hasLogo = true;
              logger.debug({}, "[ImagePlayground] Brand logo included in prompt");
            }
          } catch (err) {
            logger.warn(
              { errorMessage: err.message },
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

          // Optional safety valve for future UI toggle; defaults to enabled.
          const useCampaignGradePrompt = enhancedParams.useCampaignGradePrompt !== false;
          const basePromptCore = useCampaignGradePrompt
            ? buildCampaignGradeImagePrompt(enhancedParams.prompt, mappedBrandProfile)
            : enhancedParams.prompt;
          const brandIntegrationDirectives = hasLogo
            ? `

INTEGRAÇÃO DE MARCA (OBRIGATÓRIO):
- Use o logo/anexos da marca com fidelidade visual, mas integrado de forma natural ao layout.
- Evite aparência de "adesivo colado" ou elemento deslocado.
- O branding deve parecer parte nativa da arte, com harmonia de luz, cor e composição.
- Priorize acabamento premium/editorial com consistência visual entre todos os elementos.`
            : `

INTEGRAÇÃO DE MARCA (OBRIGATÓRIO):
- Reforce a presença da marca por direção de arte (paleta, contraste, textura e composição).
- O resultado deve parecer peça de campanha profissional de agência, com branding envolvente e coeso.`;
          const fontDirectives = fontStyleOverride
            ? `

TIPOGRAFIA PREFERENCIAL (OBRIGATÓRIO):
- Use prioritariamente a fonte "${fontStyleOverride}" para títulos e textos principais.
- Mantenha estilo bold/condensed com alta legibilidade e consistência visual.`
            : "";
          const basePrompt = `${basePromptCore}${brandIntegrationDirectives}${fontDirectives}`;

          // 2. Build deterministic prompt spec (no LLM conversion in image path)
          const promptSpec = buildImagePromptSpec({
            basePrompt: enhancedParams.prompt,
            aspectRatio: enhancedParams.aspectRatio,
            imageSize: enhancedParams.imageSize,
            brandProfile: mappedBrandProfile,
            toneOverride,
            fontStyleOverride,
            hasLogo,
            hasStyleReference,
            hasPersonReference,
            hasProductImagesBeyondLogo,
          });
          const jsonPrompt = JSON.stringify(promptSpec, null, 2);

          // 3. Build full prompt using buildImagePrompt (same as /api/ai/image)
          const fullPrompt = buildImagePrompt(
            basePrompt,
            mappedBrandProfile,
            hasStyleReference,
            hasLogo,
            hasPersonReference,
            hasProductImagesBeyondLogo,
            jsonPrompt,
          );

          // Log structured summary instead of raw prompt dump
          const jsonMatch = fullPrompt.match(/```json\n([\s\S]*?)```/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              logger.debug(
                {
                  subject: parsed.subject,
                  text: parsed.text?.content?.slice(0, 100),
                  style: parsed.style?.slice(0, 80),
                  aspectRatio: parsed.output?.aspect_ratio,
                  promptChars: fullPrompt.length,
                },
                "[ImagePlayground] Prompt (JSON estruturado)",
              );
            } catch {
              logger.debug(
                { promptChars: fullPrompt.length, promptPreview: fullPrompt.slice(0, 200) },
                "[ImagePlayground] Prompt (resumo)",
              );
            }
          } else {
            logger.debug(
              { promptChars: fullPrompt.length, promptPreview: fullPrompt.slice(0, 200) },
              "[ImagePlayground] Prompt (resumo)",
            );
          }

          // 4. Update enhanced params with full prompt and product images
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
              useCampaignGradePrompt,
              toneOverride,
              fontStyleOverride,
            },
            "[ImagePlayground] Brand profile applied",
          );
        }
      }

      // Enforce pt-BR in all image playground generations (with or without brand/instagram modes)
      enhancedParams.prompt = enforcePortugueseBrPrompt(enhancedParams.prompt);

      // Initialize Gemini
      const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
      res.status(500).json({ error: error.message });
    }
  });

  // Get generation status (for polling)
  app.get("/api/image-playground/status/:generationId", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { generationId } = req.params;
      const { asyncTaskId } = req.query;

      const sql = getSql();
      const status = await getGenerationStatus(sql, generationId, asyncTaskId);

      res.json(status);
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Get status error");
      res.status(500).json({ error: error.message });
    }
  });

  // Delete generation
  app.delete("/api/image-playground/generations/:id", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      const orgId = auth?.orgId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const sql = getSql();
      const resolvedUserId = await resolveUserId(sql, userId);
      await deleteGeneration(sql, id, resolvedUserId, orgId);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Delete generation error");
      res.status(500).json({ error: error.message });
    }
  });

  // Generate topic title
  app.post("/api/image-playground/generate-title", async (req, res) => {
    try {
      const auth = getRequestAuthContext(req);
      const userId = auth?.userId || null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { prompts } = req.body;
      if (!prompts || !Array.isArray(prompts)) {
        return res.status(400).json({ error: "prompts array required" });
      }

      const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const title = await generateTopicTitle(prompts, genai);

      res.json({ title });
    } catch (error) {
      logger.error({ err: error }, "[ImagePlayground] Generate title error");
      res.status(500).json({ error: error.message });
    }
  });
}
