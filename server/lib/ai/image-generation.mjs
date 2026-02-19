/**
 * Image generation with Gemini and FAL.ai fallback.
 *
 * Exports: generateGeminiImage, generateImageWithFallback,
 *          mapAspectRatio, DEFAULT_IMAGE_MODEL, FAL_IMAGE_MODEL
 */

import { getGeminiAi } from "./clients.mjs";
import { withRetry, isQuotaOrRateLimitError } from "./retry.mjs";
import { generateImageWithFal, FAL_IMAGE_MODEL } from "./fal-image-generation.mjs";
import logger from "../logger.mjs";

export const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
export { FAL_IMAGE_MODEL };

export const mapAspectRatio = (ratio) => {
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

export const generateGeminiImage = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  logger.debug(
    { model, aspectRatio: mapAspectRatio(aspectRatio), imageSize },
    "[generateGeminiImage] Iniciando geração",
  );

  const ai = getGeminiAi();
  const parts = [{ text: prompt }];

  if (personReferenceImage) {
    logger.debug(
      { mimeType: personReferenceImage.mimeType },
      "[generateGeminiImage] Adicionando personReferenceImage",
    );
    parts.push({
      inlineData: {
        data: personReferenceImage.base64,
        mimeType: personReferenceImage.mimeType,
      },
    });
  }

  if (styleReferenceImage) {
    logger.debug(
      { mimeType: styleReferenceImage.mimeType },
      "[generateGeminiImage] Adicionando styleReferenceImage",
    );
    parts.push({
      inlineData: {
        data: styleReferenceImage.base64,
        mimeType: styleReferenceImage.mimeType,
      },
    });
  }

  if (productImages) {
    logger.debug(
      { count: productImages.length },
      "[generateGeminiImage] Adicionando productImages",
    );
    productImages.forEach((img, idx) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  logger.debug(
    { partsCount: parts.length },
    "[generateGeminiImage] Chamando API do Gemini",
  );

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        temperature: 0.7,
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio),
          imageSize,
        },
      },
    }),
  );

  logger.debug({}, "[generateGeminiImage] Resposta recebida do Gemini");

  const responseParts = response?.candidates?.[0]?.content?.parts;
  logger.debug(
    {
      candidatesLength: response?.candidates?.length || 0,
      isArray: Array.isArray(responseParts),
      partsLength: responseParts?.length || 0,
    },
    "[generateGeminiImage] Processando resposta",
  );

  if (!Array.isArray(responseParts)) {
    logger.error(
      { response },
      "[generateGeminiImage] ❌ Estrutura de resposta inválida!",
    );
    throw new Error("Failed to generate image - invalid response structure");
  }

  for (const part of responseParts) {
    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType;
      const dataLength = part.inlineData.data?.length || 0;
      logger.info(
        { mimeType, dataLength },
        "[generateGeminiImage] Imagem encontrada na resposta",
      );
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  logger.error(
    { responseParts },
    "[generateGeminiImage] ❌ Nenhuma imagem encontrada nos parts da resposta",
  );
  throw new Error("Failed to generate image - no image data in response");
};

export const generateImageWithFallback = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  try {
    const imageUrl = await generateGeminiImage(
      prompt,
      aspectRatio,
      model,
      imageSize,
      productImages,
      styleReferenceImage,
      personReferenceImage,
    );
    return {
      imageUrl,
      usedModel: model,
      usedProvider: "google",
      usedFallback: false,
    };
  } catch (error) {
    if (isQuotaOrRateLimitError(error)) {
      logger.warn(
        { errorMessage: error.message },
        "[generateImageWithFallback] Gemini falhou com erro de quota/rate limit, tentando fallback para FAL.ai",
      );

      try {
        const result = await generateImageWithFal(
          prompt,
          mapAspectRatio(aspectRatio),
          imageSize,
          productImages,
          styleReferenceImage,
          personReferenceImage,
        );
        logger.info(
          {},
          "[generateImageWithFallback] FAL.ai fallback bem sucedido",
        );
        return {
          imageUrl: result,
          usedModel: FAL_IMAGE_MODEL,
          usedProvider: "fal",
          usedFallback: true,
        };
      } catch (fallbackError) {
        logger.error(
          { err: fallbackError },
          "[generateImageWithFallback] ❌ FAL.ai fallback também falhou",
        );
        throw error;
      }
    }

    throw error;
  }
};

// Generate structured content with Gemini
export const generateStructuredContent = async (
  model,
  parts,
  responseSchema,
  temperature = 0.7,
) => {
  const ai = getGeminiAi();

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature,
      },
    }),
  );

  return response.text.trim();
};

// Generate text with OpenRouter
export const generateTextWithOpenRouter = async (
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
) => {
  const { callOpenRouterApi } = await import("./clients.mjs");
  const data = await callOpenRouterApi({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature,
  });

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter (${model}) no content returned`);
  }

  return content;
};

// Generate text with OpenRouter + Vision
export const generateTextWithOpenRouterVision = async (
  model,
  textParts,
  imageParts,
  temperature = 0.7,
) => {
  const { callOpenRouterApi } = await import("./clients.mjs");
  const content = textParts.map((text) => ({ type: "text", text }));

  for (const img of imageParts) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    });
  }

  const data = await callOpenRouterApi({
    model,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    temperature,
  });

  const result = data.choices?.[0]?.message?.content;
  if (!result) {
    throw new Error(`OpenRouter (${model}) no content returned`);
  }

  return result;
};
