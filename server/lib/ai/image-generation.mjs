/**
 * Image generation with Gemini and Replicate fallback.
 *
 * Exports: generateGeminiImage, generateImageWithFallback, generateImageWithReplicate,
 *          mapAspectRatio, DEFAULT_IMAGE_MODEL, REPLICATE_IMAGE_MODEL
 */

import { getGeminiAi, getReplicate } from "./clients.mjs";
import { withRetry, isQuotaOrRateLimitError } from "./retry.mjs";
import logger from "../logger.mjs";

export const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const REPLICATE_IMAGE_MODEL = "google/nano-banana-pro";
const REPLICATE_OUTPUT_FORMAT = "png";
const REPLICATE_SAFETY_FILTER_LEVEL = "block_only_high";

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

const toDataUrl = (img) => `data:${img.mimeType};base64,${img.base64}`;

const normalizeReplicateOutputUrl = (output) => {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first.url === "function") return first.url();
    if (first && typeof first.url === "string") return first.url;
  }
  if (output && typeof output.url === "function") return output.url();
  if (output && typeof output.url === "string") return output.url;
  return null;
};

export const generateImageWithReplicate = async (
  prompt,
  aspectRatio,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  const replicate = getReplicate();

  const imageInputs = [];
  if (personReferenceImage) imageInputs.push(personReferenceImage);
  if (styleReferenceImage) imageInputs.push(styleReferenceImage);
  if (productImages && productImages.length > 0)
    imageInputs.push(...productImages);

  const input = {
    prompt,
    output_format: REPLICATE_OUTPUT_FORMAT,
    safety_filter_level: REPLICATE_SAFETY_FILTER_LEVEL,
  };

  if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  if (["1K", "2K", "4K"].includes(imageSize)) {
    input.resolution = imageSize;
  }

  if (imageInputs.length > 0) {
    input.image_input = imageInputs.slice(0, 14).map(toDataUrl);
  }

  const output = await replicate.run(REPLICATE_IMAGE_MODEL, { input });
  const outputUrl = normalizeReplicateOutputUrl(output);
  if (!outputUrl) {
    throw new Error("[Replicate] No image URL in output");
  }
  return outputUrl;
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
        "[generateImageWithFallback] Gemini falhou com erro de quota/rate limit, tentando fallback para Replicate",
      );

      try {
        const result = await generateImageWithReplicate(
          prompt,
          aspectRatio,
          imageSize,
          productImages,
          styleReferenceImage,
          personReferenceImage,
        );
        logger.info(
          {},
          "[generateImageWithFallback] Replicate fallback bem sucedido",
        );
        return {
          imageUrl: result,
          usedModel: REPLICATE_IMAGE_MODEL,
          usedProvider: "replicate",
          usedFallback: true,
        };
      } catch (fallbackError) {
        logger.error(
          { err: fallbackError },
          "[generateImageWithFallback] ❌ Replicate fallback também falhou",
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
