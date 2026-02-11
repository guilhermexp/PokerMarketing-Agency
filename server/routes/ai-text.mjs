/**
 * AI Text Generation Routes
 * Extracted from server/index.mjs
 *
 * Routes:
 *   POST /api/ai/flyer
 *   POST /api/ai/text
 *   POST /api/ai/enhance-prompt
 *   POST /api/ai/convert-prompt
 */

import { getAuth } from "@clerk/express";
import { put } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { getGeminiAi } from "../lib/ai/clients.mjs";
import {
  withRetry,
  sanitizeErrorForClient,
  isQuotaOrRateLimitError,
} from "../lib/ai/retry.mjs";
import {
  generateStructuredContent,
  generateTextWithOpenRouter,
  generateTextWithOpenRouterVision,
  generateImageWithReplicate,
  mapAspectRatio,
  DEFAULT_IMAGE_MODEL,
  REPLICATE_IMAGE_MODEL,
} from "../lib/ai/image-generation.mjs";
import {
  buildFlyerPrompt,
  buildQuickPostPrompt,
  convertImagePromptToJson,
  getVideoPromptSystemPrompt,
  quickPostSchema,
  DEFAULT_TEXT_MODEL,
  DEFAULT_FAST_TEXT_MODEL,
} from "../lib/ai/prompt-builders.mjs";
import {
  logAiUsage,
  extractGeminiTokens,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import { validateContentType } from "../lib/validation/contentType.mjs";
import logger from "../lib/logger.mjs";

export function registerAiTextRoutes(app) {
  // -------------------------------------------------------------------------
  // POST /api/ai/flyer
  // -------------------------------------------------------------------------
  app.post("/api/ai/flyer", async (req, res) => {
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
        collabLogo: collabLogoSingular,
        collabLogos, // Frontend sends array
        imageSize = "1K",
        compositionAssets,
      } = req.body;

      // Support both singular and array format for collab logos
      const collabLogo =
        collabLogoSingular || (collabLogos && collabLogos[0]) || null;

      if (!prompt || !brandProfile) {
        return res
          .status(400)
          .json({ error: "prompt and brandProfile are required" });
      }

      logger.info(
        {
          aspectRatio,
          hasLogo: !!logo,
          collabLogosCount: collabLogos?.length || 0,
        },
        "[Flyer API] Generating flyer",
      );

      const ai = getGeminiAi();
      const brandingInstruction = buildFlyerPrompt(brandProfile);

      const parts = [
        { text: brandingInstruction },
        { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
      ];

      const jsonPrompt = await convertImagePromptToJson(
        prompt,
        aspectRatio,
        organizationId,
        sql,
      );
      if (jsonPrompt) {
        parts.push({
          text: `JSON ESTRUTURADO (REFERÊNCIA):\n\`\`\`json\n${jsonPrompt}\n\`\`\``,
        });
      }

      // Determine collab logos count for instructions
      const collabLogosCount =
        collabLogos && collabLogos.length > 0
          ? collabLogos.length
          : collabLogo
            ? 1
            : 0;
      const hasCollabLogos = collabLogosCount > 0;

      // Instruções de logo (se fornecido)
      if (logo || hasCollabLogos) {
        let logoInstructions = `
**LOGOS DA MARCA - PRESERVAÇÃO E POSICIONAMENTO:**

PRESERVAÇÃO (INVIOLÁVEL):
- COPIE os logos EXATAMENTE como fornecidos - pixel por pixel
- NÃO redesenhe, NÃO reinterprete, NÃO estilize os logos
- NÃO altere cores, formas, proporções ou tipografia
- NÃO adicione efeitos (brilho, sombra, gradiente, 3D)
- Mantenha bordas nítidas e definidas

POSICIONAMENTO MINIMALISTA:`;

        if (logo && hasCollabLogos) {
          // Collab mode: logos side by side at the bottom like a sponsor bar
          const totalLogos = 1 + collabLogosCount; // main logo + collab logos
          logoInstructions += `
- CRIAR UMA BARRA DE PATROCINADORES na parte INFERIOR da imagem
- Posicione TODOS os logos (${totalLogos}) LADO A LADO horizontalmente nessa barra
- O logo principal fica à ESQUERDA, seguido dos logos parceiros à direita
- A barra deve ter fundo escuro/semi-transparente para contraste
- Tamanho dos logos: pequeno e uniforme (altura ~8-10% da imagem)
- Espaçamento igual entre os logos
- Estilo: clean, profissional, como rodapé de patrocinadores em eventos
- Os logos NÃO devem competir com o conteúdo principal do flyer`;
        } else if (hasCollabLogos && !logo) {
          // Only collab logos, no main logo
          logoInstructions += `
- CRIAR UMA BARRA DE PARCEIROS na parte INFERIOR da imagem
- Posicione os logos LADO A LADO horizontalmente
- Fundo escuro/semi-transparente para contraste
- Tamanho pequeno e uniforme (altura ~8-10% da imagem)
- Espaçamento igual entre os logos`;
        } else {
          logoInstructions += `
- Posicione o logo em um CANTO da imagem (superior ou inferior)
- Use tamanho DISCRETO (10-15% da largura) - como marca d'água profissional
- O logo NÃO deve competir com o conteúdo principal do flyer
- Deixe espaço de respiro entre o logo e as bordas`;
        }

        logoInstructions += `

Os logos devem parecer assinaturas elegantes da marca, não elementos principais.`;

        parts.push({ text: logoInstructions });
      }

      if (logo) {
        parts.push({ text: "LOGO PRINCIPAL DA MARCA (copiar fielmente):" });
        parts.push({
          inlineData: { data: logo.base64, mimeType: logo.mimeType },
        });
      }

      // Support both single collabLogo and array collabLogos
      const allCollabLogos =
        collabLogos && collabLogos.length > 0
          ? collabLogos
          : collabLogo
            ? [collabLogo]
            : [];

      if (allCollabLogos.length > 0) {
        allCollabLogos.forEach((cLogo, index) => {
          if (cLogo && cLogo.base64) {
            const label =
              allCollabLogos.length > 1
                ? `LOGO PARCEIRO ${index + 1} (copiar fielmente):`
                : "LOGO PARCEIRO/COLABORAÇÃO (copiar fielmente):";
            parts.push({ text: label });
            parts.push({
              inlineData: { data: cLogo.base64, mimeType: cLogo.mimeType },
            });
          }
        });
        console.log(
          `[Flyer API] Added ${allCollabLogos.length} collab logo(s) to parts`,
        );
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

      let imageDataUrl = null;
      let usedProvider = "google";
      let usedModel = DEFAULT_IMAGE_MODEL;

      try {
        // Try Gemini first
        const response = await withRetry(() =>
          ai.models.generateContent({
            model: DEFAULT_IMAGE_MODEL,
            contents: { parts },
            config: {
              imageConfig: {
                aspectRatio: mapAspectRatio(aspectRatio),
                imageSize,
              },
            },
          }),
        );

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            // Upload to Vercel Blob instead of returning data URL
            console.log("[Flyer API] Uploading Gemini image to Vercel Blob...");
            try {
              const imageBuffer = Buffer.from(part.inlineData.data, "base64");
              const contentType = part.inlineData.mimeType || "image/png";

              // SECURITY: Validate Gemini API response content type (defense in depth)
              validateContentType(contentType);

              const ext = contentType.includes("png") ? "png" : "jpg";
              const filename = `flyer-${Date.now()}.${ext}`;

              const blob = await put(filename, imageBuffer, {
                access: "public",
                contentType,
              });

              imageDataUrl = blob.url;
              console.log("[Flyer API] Uploaded to Vercel Blob:", blob.url);
            } catch (uploadError) {
              console.error(
                "[Flyer API] Failed to upload to Vercel Blob:",
                uploadError.message,
              );
              // Fallback to data URL only if Blob upload fails
              imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            break;
          }
        }

        if (!imageDataUrl) {
          throw new Error("A IA falhou em produzir o Flyer.");
        }
      } catch (geminiError) {
        // Check if quota/rate limit error - fallback to Replicate
        if (isQuotaOrRateLimitError(geminiError)) {
          logger.warn(
            {},
            "[Flyer API] Gemini quota exceeded, trying Replicate fallback",
          );

          // Build text prompt for Replicate (combine all text parts)
          const textPrompt = parts
            .filter((p) => p.text)
            .map((p) => p.text)
            .join("\n\n");

          // Collect image inputs for Replicate
          const imageInputs = parts
            .filter((p) => p.inlineData)
            .map((p) => ({
              base64: p.inlineData.data,
              mimeType: p.inlineData.mimeType,
            }));

          const replicateUrl = await generateImageWithReplicate(
            textPrompt,
            aspectRatio,
            imageSize,
            imageInputs.length > 0 ? imageInputs : undefined,
            undefined,
            undefined,
          );

          logger.info({}, "[Flyer API] Replicate fallback successful");

          // Upload to Vercel Blob (Replicate URLs are temporary)
          logger.debug(
            {},
            "[Flyer API] Uploading Replicate image to Vercel Blob",
          );
          try {
            const imageResponse = await fetch(replicateUrl);
            if (!imageResponse.ok) {
              throw new Error(`Failed to fetch image: ${imageResponse.status}`);
            }
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            const contentType =
              imageResponse.headers.get("content-type") || "image/png";

            // SECURITY: Validate external image fetch content type
            validateContentType(contentType);

            const ext = contentType.includes("png") ? "png" : "jpg";
            const filename = `flyer-${Date.now()}.${ext}`;

            const blob = await put(filename, imageBuffer, {
              access: "public",
              contentType,
            });

            imageDataUrl = blob.url;
            logger.info(
              { blobUrl: blob.url },
              "[Flyer API] Uploaded to Vercel Blob",
            );
          } catch (uploadError) {
            logger.error(
              { err: uploadError },
              "[Flyer API] Failed to upload to Vercel Blob",
            );
            imageDataUrl = replicateUrl; // Use temporary URL as fallback
          }

          usedProvider = "replicate";
          usedModel = REPLICATE_IMAGE_MODEL;
        } else {
          throw geminiError;
        }
      }

      logger.info(
        { provider: usedProvider },
        "[Flyer API] Flyer generated successfully",
      );

      // Log AI usage
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/flyer",
        operation: "flyer",
        model: usedModel,
        provider: usedProvider,
        imageCount: 1,
        imageSize: imageSize || "1K",
        latencyMs: timer(),
        status: "success",
        metadata: {
          aspectRatio,
          hasLogo: !!logo,
          hasReference: !!referenceImage,
          fallbackUsed: usedProvider === "replicate",
        },
      });

      res.json({
        success: true,
        imageUrl: imageDataUrl,
      });
    } catch (error) {
      logger.error({ err: error }, "[Flyer API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/flyer",
        operation: "flyer",
        model: DEFAULT_IMAGE_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/text
  // -------------------------------------------------------------------------
  app.post("/api/ai/text", async (req, res) => {
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

      logger.info({ type }, "[Text API] Generating text");

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

      logger.info({}, "[Text API] Text generated successfully");

      // Log AI usage
      const inputTokens = (userPrompt?.length || 0) / 4;
      const outputTokens = result.length / 4;
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/text",
        operation: "text",
        model,
        inputTokens: Math.round(inputTokens),
        outputTokens: Math.round(outputTokens),
        latencyMs: timer(),
        status: "success",
        metadata: { type, hasImage: !!image },
      });

      res.json({
        success: true,
        result: JSON.parse(result),
        model,
      });
    } catch (error) {
      logger.error({ err: error }, "[Text API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/text",
        operation: "text",
        model: req.body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/enhance-prompt
  // -------------------------------------------------------------------------
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

      logger.info({}, "[Enhance Prompt API] Enhancing prompt with Grok");

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

      const userPrompt = `BRIEFING ORIGINAL:\n${prompt}`;

      // Direct API call to OpenRouter (bypassing SDK validation issues)
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY not configured");
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://socialab.app",
        },
        body: JSON.stringify({
          model: "x-ai/grok-4.1-fast",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || "";

      logger.info(
        {},
        "[Enhance Prompt API] Successfully enhanced prompt with Grok",
      );

      // Log AI usage
      const inputTokens = data.usage?.prompt_tokens || Math.round((systemPrompt.length + userPrompt.length) / 4);
      const outputTokens = data.usage?.completion_tokens || Math.round(enhancedPrompt.length / 4);
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/enhance-prompt",
        operation: "text",
        model: "x-ai/grok-4.1-fast",
        inputTokens,
        outputTokens,
        latencyMs: timer(),
        status: "success",
      });

      res.json({ enhancedPrompt });
    } catch (error) {
      logger.error({ err: error }, "[Enhance Prompt API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/enhance-prompt",
        operation: "text",
        model: "x-ai/grok-4.1-fast",
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/convert-prompt
  // -------------------------------------------------------------------------
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

      logger.info(
        { durationSeconds: duration },
        "[Convert Prompt API] Converting prompt to JSON",
      );

      const ai = getGeminiAi();
      const systemPrompt = getVideoPromptSystemPrompt(duration, aspectRatio);

      const response = await withRetry(() =>
        ai.models.generateContent({
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
        }),
      );

      const text = response.text?.trim() || "";

      // Try to parse as JSON
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        // If not valid JSON, return as-is
        result = text;
      }

      logger.info({}, "[Convert Prompt API] Conversion successful");

      // Log AI usage
      const tokens = extractGeminiTokens(response);
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/convert-prompt",
        operation: "text",
        model: DEFAULT_FAST_TEXT_MODEL,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        latencyMs: timer(),
        status: "success",
      });

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ err: error }, "[Convert Prompt API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/convert-prompt",
        operation: "text",
        model: DEFAULT_FAST_TEXT_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });
}
