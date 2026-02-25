/**
 * AI prompt builders and schemas.
 *
 * Exports: buildImagePrompt, buildVideoPrompt, buildFlyerPrompt, buildQuickPostPrompt,
 *          convertImagePromptToJson, expandAiInfluencerPrompt, expandProductHeroPrompt,
 *          expandExplodedProductPrompt, expandBrandIdentityPrompt,
 *          getVideoPromptSystemPrompt, getImagePromptSystemPrompt,
 *          campaignSchema, quickPostSchema, Type,
 *          shouldUseTone, getToneText,
 *          DEFAULT_TEXT_MODEL, DEFAULT_FAST_TEXT_MODEL, DEFAULT_ASSISTANT_MODEL, AI_INFLUENCER_FLASH_MODEL
 */

import { generateTextFromMessages } from "./text-generation.mjs";
import { withRetry } from "./retry.mjs";
import {
  DEFAULT_TEXT_MODEL,
  DEFAULT_FAST_TEXT_MODEL,
  DEFAULT_ASSISTANT_MODEL,
  AI_INFLUENCER_FLASH_MODEL,
  Type,
} from "./models.mjs";
import {
  logAiUsage,
  createTimer,
} from "../../helpers/usage-tracking.mjs";
import logger from "../logger.mjs";

// Re-export model constants and Type for backward compatibility
export { DEFAULT_TEXT_MODEL, DEFAULT_FAST_TEXT_MODEL, DEFAULT_ASSISTANT_MODEL, AI_INFLUENCER_FLASH_MODEL, Type };

export const shouldUseTone = (brandProfile, target) => {
  if (!brandProfile) return false;
  const targets = brandProfile.toneTargets || [
    "campaigns",
    "posts",
    "images",
    "flyers",
  ];
  return targets.includes(target);
};

export const getToneText = (brandProfile, target) => {
  if (!brandProfile) return "";
  return shouldUseTone(brandProfile, target)
    ? brandProfile.toneOfVoice || ""
    : "";
};

/**
 * Build a clean, non-redundant image generation prompt.
 *
 * Supports two call signatures for backward compatibility:
 *   1. Positional: buildImagePrompt(prompt, brandProfile, hasStyleRef, hasLogo, hasPerson, hasProduct, jsonPrompt)
 *   2. Options:    buildImagePrompt({ prompt, brandProfile, hasLogo, fontStyle, ... })
 *
 * The options signature adds `fontStyle` (not available via positional args).
 * The `jsonPrompt` positional arg is accepted but ignored (JSON spec removed).
 */
export const buildImagePrompt = (
  promptOrOpts,
  brandProfileArg,
  hasStyleReferenceArg = false,
  hasLogoArg = false,
  hasPersonReferenceArg = false,
  hasProductImagesArg = false,
  _jsonPrompt = null,
) => {
  let prompt, brandProfile, hasStyleReference, hasLogo, hasPersonReference, hasProductImages, fontStyle;

  if (typeof promptOrOpts === "object" && promptOrOpts !== null && "prompt" in promptOrOpts) {
    ({ prompt, brandProfile = null, hasStyleReference = false, hasLogo = false, hasPersonReference = false, hasProductImages = false, fontStyle = null } = promptOrOpts);
  } else {
    prompt = promptOrOpts;
    brandProfile = brandProfileArg;
    hasStyleReference = hasStyleReferenceArg;
    hasLogo = hasLogoArg;
    hasPersonReference = hasPersonReferenceArg;
    hasProductImages = hasProductImagesArg;
    fontStyle = null;
  }

  const parts = [prompt];

  // Brand context — once
  if (brandProfile) {
    const name = brandProfile.name || "";
    const description = brandProfile.description || "";
    const toneText = getToneText(brandProfile, "images");
    const colors = [brandProfile.primaryColor, brandProfile.secondaryColor].filter(Boolean).join(", ");

    let brandLine = `MARCA: ${name}`;
    if (description) brandLine += ` — ${description}`;
    let detailLine = "";
    if (colors) detailLine += `Cores: ${colors}`;
    if (toneText) detailLine += `${detailLine ? " | " : ""}Tom: ${toneText}`;
    if (detailLine) brandLine += `\n${detailLine}`;

    parts.push(brandLine);
  }

  // Reference directives — concise, no repetition
  if (hasPersonReference) {
    parts.push("PESSOA DE REFERÊNCIA: preservar fielmente rosto, tom de pele, cabelo e traços faciais. A pessoa é protagonista da cena.");
  }

  if (hasLogo) {
    parts.push("LOGO: copiar pixel a pixel sem redesenhar, estilizar ou adicionar efeitos. Integrar de forma orgânica na composição.");
  }

  if (hasProductImages) {
    parts.push("PRODUTO: preservar forma, cores e detalhes das imagens de produto anexadas. Destaque na composição.");
  }

  // Quality — one line
  parts.push(
    brandProfile
      ? "Qualidade: fotografia publicitária premium, hiper-realista, composição cinematográfica, acabamento de agência."
      : "Qualidade: fotografia profissional, hiper-realista, composição cinematográfica.",
  );

  // Typography — one line, only when relevant
  if (fontStyle) {
    parts.push(`Tipografia: usar "${fontStyle}" bold condensed para títulos em MAIÚSCULAS. Fonte única, alta legibilidade.`);
  } else if (hasStyleReference || brandProfile) {
    parts.push("Tipografia: bold condensed sans-serif (Bebas Neue, Oswald) para títulos em MAIÚSCULAS. Fonte única.");
  }

  // Language — one line
  parts.push("Idioma: todo texto visível na imagem deve estar em português do Brasil (pt-BR).");

  return parts.join("\n\n");
};

export const buildVideoPrompt = (
  prompt,
  brandProfile,
  {
    resolution = "720p",
    aspectRatio = "16:9",
    hasReferenceImage = false,
    isInterpolationMode = false,
    useCampaignGradePrompt = true,
    hasBrandLogoReference = false,
  } = {},
) => {
  const toneText =
    getToneText(brandProfile, "videos") || brandProfile?.toneOfVoice || "";
  const primaryColor = brandProfile?.primaryColor || "#000000";
  const secondaryColor = brandProfile?.secondaryColor || "#FFFFFF";
  const tertiaryColor = brandProfile?.tertiaryColor || "";
  const palette = [primaryColor, secondaryColor, tertiaryColor]
    .filter(Boolean)
    .join(", ");

  if (useCampaignGradePrompt) {
    return `BRIEF CRIATIVO (MODO CAMPAIGN-GRADE):
- Prompt base: ${prompt}
- Formato: ${aspectRatio}
- Qualidade alvo: ${resolution}
- Marca: ${brandProfile?.name || "Não especificado"}
- Descrição da marca: ${brandProfile?.description || "Não especificado"}
- Cores oficiais: ${palette || "Não especificado"}
- Tom de voz: ${toneText || "Profissional"}

REGRAS OBRIGATÓRIAS:
1. Gere um vídeo com padrão de agência premium, cinematográfico e altamente profissional.
2. Preserve a identidade da marca em TODOS os frames (paleta, linguagem visual e tom).
3. Use direção de arte sofisticada, iluminação profissional e composição com hierarquia clara.
4. Evite estética genérica: o resultado deve parecer campanha publicitária de alto nível.
5. Se houver texto em cena, ele deve estar em PORTUGUÊS e com legibilidade alta.
6. Mantenha consistência de continuidade visual entre início, meio e fim.

DIRETRIZES DE EXECUÇÃO:
- Garanta movimento de câmera intencional e fluido, sem jitter.
- Priorize acabamento clean/premium e contraste adequado.
- Evite elementos fora da paleta principal da marca.
- NÃO invente logos novos, variações de símbolo ou tipografias de marca.
${hasReferenceImage ? "- Use a imagem de referência como base de estilo/composição, sem perder identidade da marca." : ""}
${hasBrandLogoReference ? "- A imagem de referência contém o logo oficial da marca: preserve-o fielmente, sem redesenhar." : ""}
${isInterpolationMode ? "- Interpole de forma suave entre quadro inicial e final, preservando continuidade cinematográfica." : ""}`;
  }

  return `PROMPT TÉCNICO: ${prompt}
ESTILO DE VÍDEO: ${toneText ? `${toneText}, ` : ""}Identidade visual da marca (${palette}), composição cinematográfica, iluminação profissional e acabamento premium.
QUALIDADE VISUAL ALVO: ${resolution}.

CONTEXTO DA MARCA:
- Nome: ${brandProfile?.name || "Não especificado"}
- Descrição: ${brandProfile?.description || "Não especificado"}
- Cores oficiais: ${palette}
- Tom de voz: ${toneText || "Não especificado"}

REGRAS DE IDENTIDADE:
- Preserve consistência visual com a marca em todos os frames
- Evite elementos fora da paleta principal da marca
- Priorize estética de marketing premium e legibilidade visual
- Não invente logos novos; use apenas elementos oficiais da marca`;
};

export const convertImagePromptToJson = async (
  prompt,
  aspectRatio,
  organizationId,
  sql,
) => {
  const timer = createTimer();

  try {
    const systemPrompt = getImagePromptSystemPrompt(aspectRatio);

    const { text: rawText } = await withRetry(() =>
      generateTextFromMessages({
        model: DEFAULT_FAST_TEXT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `PROMPT: ${prompt}` },
        ],
        jsonMode: true,
        temperature: 0.2,
      }),
    );

    const text = rawText?.trim() || "";
    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const result = JSON.stringify(
      parsed || {
        subject: "",
        environment: "",
        style: "",
        camera: "",
        text: {
          enabled: false,
          content: "",
          language: "pt-BR",
          placement: "",
          font: "",
        },
        output: {
          aspect_ratio: aspectRatio,
          resolution: "2K",
        },
      },
      null,
      2,
    );

    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-image-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      inputTokens,
      outputTokens,
      latencyMs: timer(),
      status: "success",
    });

    return result;
  } catch (error) {
    logger.error({ err: error }, "[Image Prompt JSON] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-image-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return null;
  }
};

// --- AI Influencer Prompt Expansion ---

const AI_INFLUENCER_SYSTEM_PROMPT = `You are a photorealistic image prompt engineer specializing in AI influencer content.

TASK: Transform a simple user query into a rich, detailed image generation prompt that produces photorealistic results indistinguishable from real smartphone photos.

INPUT: JSON with { user_prompt, has_reference_images, reference_image_count, target_aspect_ratio }
OUTPUT: JSON with { image_analysis, generation_prompt }

MANDATORY RULES:
1. PHOTOREALISM: Every prompt MUST include skin texture details (visible pores, natural imperfections, subtle glow), realistic fabric textures (folds, creases, material type), and natural lighting descriptions.
2. CAMERA SUFFIX: Every generation_prompt MUST end with "Shot with Sony A7R V, 35mm prime lens, f/2.8 aperture, natural lighting."
3. ASPECT RATIO: Use {{ASPECT_RATIO}} format, optimized for portrait/selfie composition.
4. STYLE: Candid smartphone aesthetic — NOT studio photography, NOT 3D render, NOT illustration.
5. LANGUAGE: generation_prompt must be in English.

REFERENCE IMAGE BEHAVIOR:
- If has_reference_images is TRUE: Include identity preservation instructions in image_analysis.reference_constraints and in generation_prompt ("Preserve the same person, facial structure, proportions, and identity from the reference photo without alteration").
- If has_reference_images is FALSE: Create a generic attractive person description with detailed features.

FEW-SHOT EXAMPLES:

---
INPUT: { "user_prompt": "selfie com camisa de futebol amarela no quarto", "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "4:5" }
OUTPUT:
{
  "image_analysis": {
    "subject": {
      "demographics": "Young woman, fair skin tone",
      "hair": "Dark brown, long, straight to slightly wavy, falling behind shoulders",
      "face": { "skin_texture": "Highly detailed with prominent natural features, visible pores", "eyes": "Green/hazel, looking directly at the camera", "expression": "Soft, relaxed, confident", "makeup": "Natural look, minimal makeup" },
      "accessories": "Small gold hoop earrings"
    },
    "apparel": { "garment": "Soccer jersey (football kit)", "color_palette": "Bright yellow with navy blue accents", "brand_details": "Black Adidas logo on the right chest, signature navy blue three-stripes on the shoulders", "pattern": "Thin vertical navy blue pinstripes running down the front", "fit": "Casual, slightly loose fit, navy blue trim on sleeve cuffs" },
    "pose_and_composition": { "angle": "High-angle selfie perspective (arm extended)", "body_position": "Reclining back on a bed, legs bent at the knees", "framing": "Close-up on upper body" },
    "environment": { "setting": "Attic or loft bedroom", "architectural_features": "Slanted white ceiling with a rectangular skylight window", "furniture": "White 3-drawer chest/dresser, pink/mauve plush bedding and pillows", "decor": "Small mushroom-style table lamp, framed line-art print" },
    "lighting_and_atmosphere": { "source": "Natural daylight entering through the skylight", "quality": "Soft, diffused, high-key lighting", "shadows": "Gentle, natural shadows casting depth on the face and fabric folds" },
    "technical_specs": { "resolution": "4K HD", "style": "Photorealistic, candid selfie, social media aesthetic", "texture_quality": "High fidelity skin texture, realistic fabric creases" }
  },
  "generation_prompt": "A photorealistic 4K HD selfie of a young woman with dark hair, wearing a yellow Adidas soccer jersey with thin navy pinstripes and a central black sponsor logo. She is reclining comfortably on pink bedding in a bright attic bedroom with a slanted ceiling and skylight. In the background, a white dresser with a small lamp and framed art is visible. The lighting is soft natural daylight, highlighting the texture of her skin with visible pores and natural imperfections, and the realistic fabric creases of the jersey. High resolution, candid style, sharp focus. Shot with Sony A7R V, 35mm prime lens, f/2.8 aperture, natural lighting."
}

---
INPUT: { "user_prompt": "garota com hoodie cinza na sala de estar", "has_reference_images": true, "reference_image_count": 1, "target_aspect_ratio": "4:5" }
OUTPUT:
{
  "image_analysis": {
    "reference_constraints": { "identity": "Preserve the exact facial structure, proportions, eye shape, nose, lips, and skin tone from the reference image", "no_identity_drift": true, "no_face_stylization": true },
    "subject": {
      "demographics": "Young woman, fair skin tone (match reference exactly)",
      "hair": "Dark brown hair, tied back in a low loose ponytail, natural flyaways visible, realistic texture",
      "face": { "skin_texture": "High fidelity natural skin texture with subtle imperfections, match reference", "eyes": "Green/hazel eyes, same shape and spacing as reference, looking at the camera", "expression": "Neutral to soft relaxed expression, realistic and unposed", "makeup": "Very minimal makeup, natural look" },
      "accessories": "Small gold hoop earrings, subtle and realistic"
    },
    "apparel": { "garment": "Casual oversized hoodie", "color_palette": "Muted light gray", "fabric_texture": "Soft cotton fleece, visible folds and natural creases", "fit": "Relaxed, slightly oversized, realistic drape" },
    "pose_and_composition": { "angle": "Eye-level selfie perspective, arm slightly extended", "body_position": "Sitting upright on a sofa, relaxed posture", "framing": "Medium close-up, upper torso and shoulders in frame" },
    "environment": { "setting": "Modern living room", "architectural_features": "Large window with sheer white curtains", "furniture": "Neutral-toned fabric sofa, wooden side table", "decor": "Minimal decor, soft and realistic interior styling" },
    "lighting_and_atmosphere": { "source": "Natural daylight from the side window", "quality": "Soft, diffused, realistic indoor lighting", "shadows": "Subtle natural shadows, no harsh contrast" },
    "technical_specs": { "resolution": "4K HD", "style": "Photorealistic, candid smartphone selfie", "texture_quality": "High fidelity skin and fabric textures", "camera_behavior": "Slight smartphone lens softness, realistic depth" }
  },
  "generation_prompt": "Photorealistic 4K HD image based strictly on the provided reference photo. Preserve the same person, facial structure, proportions, and identity without alteration. A young woman with dark brown hair tied back loosely, minimal makeup, and small gold hoop earrings, wearing a light gray oversized hoodie with soft cotton fleece texture and visible folds. She is sitting on a neutral-toned sofa in a modern living room with soft natural daylight coming from a side window through sheer curtains. Eye-level selfie perspective, relaxed candid pose, realistic skin texture with visible pores and subtle imperfections, natural fabric drape, clean background, sharp focus, realistic smartphone photo aesthetic. Shot with Sony A7R V, 35mm prime lens, f/2.8 aperture, natural lighting."
}

---
INPUT: { "user_prompt": "foto noturna com flash na rua, vibe analog", "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "4:5" }
OUTPUT:
{
  "image_analysis": {
    "subject": {
      "demographics": "Young woman, warm olive skin tone",
      "hair": "Dark wavy hair, loose and slightly windswept",
      "face": { "skin_texture": "Visible pores and natural texture highlighted by direct flash, slight shine on forehead", "eyes": "Dark brown, half-squinting from flash, relaxed gaze", "expression": "Candid mid-laugh, spontaneous and unposed", "makeup": "Smudged eyeliner, glossy lips, lived-in night-out look" },
      "accessories": "Layered thin gold chain necklaces, small nose stud"
    },
    "apparel": { "garment": "Vintage leather jacket over a cropped white tank top", "color_palette": "Black leather, white cotton, faded denim", "fabric_texture": "Worn leather with natural creases, soft cotton with slight wrinkles", "fit": "Fitted jacket, relaxed tank" },
    "pose_and_composition": { "angle": "Slightly below eye-level, friend holding camera", "body_position": "Standing on sidewalk, weight on one leg, casual lean", "framing": "Medium shot from waist up, slight tilt" },
    "environment": { "setting": "Urban street at night", "background": "Blurred neon signs, wet asphalt reflections, parked cars", "atmosphere": "Gritty, moody, late-night city vibe" },
    "lighting_and_atmosphere": { "source": "Direct on-camera flash as primary, ambient neon as fill", "quality": "Harsh flash with rapid falloff, creating analog snapshot feel", "shadows": "Hard shadows behind subject, dark background" },
    "technical_specs": { "resolution": "4K HD", "style": "Analog flash photography, Terry Richardson aesthetic", "texture_quality": "Film grain visible, high contrast, slight red-eye effect", "camera_behavior": "Point-and-shoot flash, slight motion blur on edges" }
  },
  "generation_prompt": "Photorealistic 4K HD night street photo of a young woman with dark wavy hair and olive skin, wearing a vintage black leather jacket over a white cropped tank top. Direct on-camera flash illuminates her face showing visible pores and natural skin shine, with harsh shadows behind her on the urban street. She is mid-laugh in a candid moment, slightly squinting from the flash. Background shows blurred neon signs and wet asphalt reflections. Film grain texture, analog point-and-shoot aesthetic, high contrast, slight red-eye, gritty moody atmosphere. Shot with Sony A7R V, 35mm prime lens, f/2.8 aperture, natural lighting."
}
---

Now transform the user's query following these exact patterns. Always output valid JSON only, no markdown fences.`;

/**
 * Expand a simple AI Influencer prompt into a rich photorealistic generation prompt
 * using Gemini Flash as an agent. Returns null on failure (caller should fallback).
 *
 * Follows the same pattern as convertImagePromptToJson.
 */
export const expandAiInfluencerPrompt = async (
  userPrompt,
  { hasReferenceImages = false, referenceImageCount = 0, aspectRatio = "4:5", organizationId = null, sql = null } = {}
) => {
  const timer = createTimer();
  try {
    const systemPrompt = AI_INFLUENCER_SYSTEM_PROMPT.replace("{{ASPECT_RATIO}}", aspectRatio);

    const userMessage = JSON.stringify({
      user_prompt: userPrompt,
      has_reference_images: hasReferenceImages,
      reference_image_count: referenceImageCount,
      target_aspect_ratio: aspectRatio,
    });

    const { text: rawText, usage } = await withRetry(() =>
      generateTextFromMessages({
        model: AI_INFLUENCER_FLASH_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        temperature: 0.7,
        maxTokens: 2000,
      }),
    );

    const text = rawText?.trim() || "";
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const generationPrompt = parsed?.generation_prompt || null;
    const imageAnalysis = parsed?.image_analysis || null;

    if (!generationPrompt) {
      logger.warn({ rawLength: text.length }, "[AI Influencer] Flash returned no generation_prompt");
      return null;
    }

    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        inputTokens,
        outputTokens,
        latencyMs: timer(),
        status: "success",
      }).catch(() => {});
    }

    logger.info(
      { inputTokens, outputTokens, promptChars: generationPrompt.length },
      "[AI Influencer] Prompt expanded via Flash"
    );

    return { generationPrompt, imageAnalysis, rawResponse: parsed };
  } catch (error) {
    logger.error({ err: error }, "[AI Influencer] Flash expansion failed");

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
    }

    return null;
  }
};

// --- Product Hero Shot Prompt Expansion ---

const PRODUCT_HERO_SYSTEM_PROMPT = `You are a premium advertising photography prompt engineer specializing in product hero shots.

TASK: Transform a simple user query about a product into a rich, detailed image generation prompt that produces a luxury advertising hero shot.

INPUT: JSON with { user_prompt, has_reference_images, reference_image_count, target_aspect_ratio }
OUTPUT: JSON with { image_analysis, generation_prompt }

MANDATORY RULES:
1. HERO SHOT: Product must be centered, prominently displayed with clean background and beautiful bokeh.
2. CAMERA SUFFIX: Every generation_prompt MUST end with "Shot with Canon EOS R5, 85mm f/1.8 prime lens, studio lighting, product photography."
3. LIGHTING: Premium studio lighting — key light, fill light, rim light. Dramatic but clean.
4. TEXTURE: Macro-level detail on product surface — condensation, reflections, embossing, material texture.
5. COMPOSITION: Symmetrical, centered, with clear visual hierarchy. Product is the hero.
6. STYLE: Ultra-photorealistic luxury advertising photography — NOT lifestyle, NOT flat lay, NOT illustration.
7. LANGUAGE: generation_prompt must be in English.

REFERENCE IMAGE BEHAVIOR:
- If has_reference_images is TRUE: The reference images show the actual product. Preserve exact product appearance, branding, colors, shape, and packaging details.
- If has_reference_images is FALSE: Create an idealized premium version of the product described.

FEW-SHOT EXAMPLES:

---
INPUT: { "user_prompt": "garrafa de Coca-Cola edição de natal", "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "1:1" }
OUTPUT:
{
  "image_analysis": {
    "product": {
      "type": "Beverage bottle",
      "brand": "Coca-Cola Holiday Edition",
      "surface_details": "Rich texture, visible bubble patterns through glass, premium embossed logo, festive gold accents",
      "key_features": "Iconic red color, holiday illustrations, condensation droplets on surface"
    },
    "scene": {
      "environment": "Warm elegant Christmas ambiance with soft snowfall and golden fairy lights",
      "elements": ["Subtle bokeh lights forming soft halo", "Delicate snowflakes in foreground", "Clean wooden surface with warm reflections"],
      "tone": "Magical, luxurious, comforting"
    },
    "camera": {
      "angle": "Centered straight-on product shot",
      "lens": "85mm prime with strong background separation",
      "focus": "Absolute sharpness on bottle and label details"
    },
    "lighting": {
      "type": "Soft warm premium holiday lighting",
      "direction": "Golden backlight enhancing rim highlights and condensation",
      "effects": "Elegant glow, subtle light bloom, festive sparkle"
    },
    "composition": {
      "layout": "Central hero composition with symmetrical visual balance",
      "depth": "Foreground snow particles, mid-ground bottle, deep blurred bokeh lights"
    }
  },
  "generation_prompt": "Ultra-photorealistic luxury advertising hero shot of a Coca-Cola Christmas holiday edition bottle, centered in frame with perfect symmetry. The bottle features rich red color with festive gold accents, embossed logo, and visible condensation droplets catching the light. Set against a warm Christmas ambiance with golden bokeh fairy lights creating a soft halo behind the bottle. Delicate snowflakes drift in the foreground. Clean wooden surface with warm reflections beneath. Studio-grade lighting with golden backlight enhancing rim highlights and condensation drops. 8K resolution, macro detail on glass texture and label, premium advertising photography with cinematic warm color grading. Shot with Canon EOS R5, 85mm f/1.8 prime lens, studio lighting, product photography."
}

---
INPUT: { "user_prompt": "perfume feminino elegante dourado", "has_reference_images": true, "reference_image_count": 1, "target_aspect_ratio": "1:1" }
OUTPUT:
{
  "image_analysis": {
    "reference_constraints": { "identity": "Preserve exact bottle shape, cap design, color, and branding from reference image", "no_redesign": true },
    "product": {
      "type": "Luxury perfume bottle",
      "surface_details": "Faceted crystal glass with gold metallic accents, detailed cap with geometric patterns, liquid visible through glass",
      "key_features": "Premium gold finish, elegant feminine silhouette, sharp geometric facets catching light"
    },
    "scene": {
      "environment": "Minimalist luxury studio with gradient background from warm cream to soft gold",
      "elements": ["Subtle gold dust particles floating in air", "Reflective black acrylic surface beneath bottle", "Soft fabric drape suggestion in deep background"],
      "tone": "Opulent, sophisticated, aspirational"
    },
    "camera": {
      "angle": "Slight low angle to emphasize bottle stature",
      "lens": "85mm with creamy bokeh",
      "focus": "Tack sharp on bottle center, soft falloff on edges"
    },
    "lighting": {
      "type": "Three-point studio lighting",
      "key": "Soft directional from upper left",
      "rim": "Strong golden rim light from behind right",
      "effects": "Light refracting through glass facets, caustic light patterns on surface"
    },
    "composition": {
      "layout": "Centered with slight golden ratio offset",
      "depth": "Sharp product, soft gradient background, reflective surface"
    }
  },
  "generation_prompt": "Ultra-photorealistic luxury advertising hero shot based on the provided reference photo. Preserve exact product design, shape, and branding. An elegant gold feminine perfume bottle with faceted crystal glass and geometric cap, centered on a reflective black acrylic surface. Minimalist studio background with warm cream-to-gold gradient. Three-point lighting with soft key light from upper left, strong golden rim light from behind, creating beautiful light refraction through glass facets. Subtle gold dust particles floating in air. 8K resolution, macro-level detail on glass texture, metallic accents, and liquid inside. Premium luxury advertising aesthetic with sophisticated warm color grading. Shot with Canon EOS R5, 85mm f/1.8 prime lens, studio lighting, product photography."
}
---

Now transform the user's query following these exact patterns. Always output valid JSON only, no markdown fences.`;

/**
 * Expand a simple Product Hero Shot prompt into a rich advertising prompt
 * using Gemini Flash as an agent. Returns null on failure (caller should fallback).
 */
export const expandProductHeroPrompt = async (
  userPrompt,
  { hasReferenceImages = false, referenceImageCount = 0, aspectRatio = "1:1", organizationId = null, sql = null } = {}
) => {
  const timer = createTimer();
  try {
    const userMessage = JSON.stringify({
      user_prompt: userPrompt,
      has_reference_images: hasReferenceImages,
      reference_image_count: referenceImageCount,
      target_aspect_ratio: aspectRatio,
    });

    const { text: rawText, usage } = await withRetry(() =>
      generateTextFromMessages({
        model: AI_INFLUENCER_FLASH_MODEL,
        messages: [
          { role: "system", content: PRODUCT_HERO_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        temperature: 0.7,
        maxTokens: 2000,
      }),
    );

    const text = rawText?.trim() || "";
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    const generationPrompt = parsed?.generation_prompt || null;
    const imageAnalysis = parsed?.image_analysis || null;

    if (!generationPrompt) {
      logger.warn({ rawLength: text.length }, "[Product Hero] Flash returned no generation_prompt");
      return null;
    }

    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        inputTokens,
        outputTokens,
        latencyMs: timer(),
        status: "success",
      }).catch(() => {});
    }

    logger.info(
      { inputTokens, outputTokens, promptChars: generationPrompt.length },
      "[Product Hero] Prompt expanded via Flash"
    );

    return { generationPrompt, imageAnalysis, rawResponse: parsed };
  } catch (error) {
    logger.error({ err: error }, "[Product Hero] Flash expansion failed");

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
    }

    return null;
  }
};

// --- Exploded Product Prompt Expansion ---

const EXPLODED_PRODUCT_SYSTEM_PROMPT = `You are a premium product infographic prompt engineer specializing in exploded/deconstructed product visuals.

TASK: Transform a simple user query about a product (especially food/drinks) into a rich, detailed image generation prompt that produces a vertical exploded deconstruction infographic.

INPUT: JSON with { user_prompt, has_reference_images, reference_image_count, target_aspect_ratio }
OUTPUT: JSON with { image_analysis, generation_prompt }

MANDATORY RULES:
1. LAYOUT: Vertical center-aligned deconstruction. Each component/ingredient floats independently with clear spacing between layers.
2. DIRECTION: Top-to-bottom layer ordering: garnish/powder at top → main ingredients → liquid layers → base container at bottom.
3. BACKGROUND: Premium studio backdrop — either dark (graphite-to-charcoal gradient) or light (cream-to-beige gradient), chosen to contrast with product colors.
4. DETAIL: Ultra-sharp 8K macro realism. Every ingredient must show realistic texture at close range.
5. LABELS: Minimalist indicator lines with English labels on the right side of each component.
6. STYLE: High-end product infographic / beverage visual poster — NOT lifestyle, NOT flat lay, NOT illustration.
7. CONTAINER: The base glass/cup/container should be EMPTY at the bottom, showing the vessel the drink would be assembled in.
8. CAMERA SUFFIX: Every generation_prompt MUST end with "8K ultra-sharp macro photography, premium product infographic style."
9. LANGUAGE: generation_prompt must be in English.

REFERENCE IMAGE BEHAVIOR:
- If has_reference_images is TRUE: Analyze the product from reference images and deconstruct its visible ingredients into floating layers.
- If has_reference_images is FALSE: Imagine the most photogenic deconstruction of the described product.

FEW-SHOT EXAMPLES:

---
INPUT: { "user_prompt": "drink de chocolate com café", "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "9:16" }
OUTPUT:
{
  "image_analysis": {
    "product": "Chocolate coffee drink",
    "layers": [
      { "component": "Cocoa powder particles", "position": "top", "texture": "Fine dusty particles dispersing in air" },
      { "component": "Glossy dark chocolate sauce ribbons and drips", "position": "upper-mid", "texture": "Viscous, shiny, flowing ribbons" },
      { "component": "Light whipped cream pile", "position": "mid", "texture": "Fluffy peaks with natural swirls" },
      { "component": "Silky chocolate coffee liquid layer", "position": "lower-mid", "texture": "Rich brown liquid with subtle swirl patterns" },
      { "component": "Roasted coffee beans", "position": "lower", "texture": "Oily dark surface with natural cracks" },
      { "component": "Sugar crystals", "position": "near-bottom", "texture": "Sparkling translucent crystals" },
      { "component": "Small clear glass cup with weighted base (empty)", "position": "bottom", "texture": "Clean transparent glass with light reflections" }
    ],
    "background": "Premium dark: clean studio backdrop, near-black graphite-to-charcoal gradient",
    "lighting": "Soft controlled studio light with clear layered shadows beneath each component"
  },
  "generation_prompt": "Hyper-realistic vertical exploded deconstruction of a chocolate coffee drink. Center-aligned vertically, each component floating independently with clear spacing. From top to bottom: fine cocoa powder particles dispersing in air, glossy dark chocolate sauce ribbons and drips flowing mid-air, light fluffy whipped cream pile with natural swirl peaks, silky chocolate coffee liquid layer with subtle swirl patterns, scattered roasted coffee beans with oily dark surfaces, sparkling sugar crystals, and at the bottom a small clear threaded glass cup with weighted base (empty). Premium dark studio background with near-black graphite-to-charcoal gradient. Soft controlled studio lighting with clear layered shadows beneath each floating component. Minimalist indicator lines with English labels on the right side of each ingredient. 8K ultra-sharp macro photography, premium product infographic style."
}

---
INPUT: { "user_prompt": "drink de matcha com frutas", "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "9:16" }
OUTPUT:
{
  "image_analysis": {
    "product": "Matcha cream-top fruit coffee drink",
    "layers": [
      { "component": "Fine matcha powder particles", "position": "top", "texture": "Vibrant green powder dispersing" },
      { "component": "Fresh strawberry and mango slices with glistening moisture", "position": "upper-mid", "texture": "Juicy, wet, translucent fruit flesh" },
      { "component": "Thick salty cheese matcha cream cap with delicate foam", "position": "mid", "texture": "Dense creamy layer with micro-bubbles" },
      { "component": "Clear cold brew coffee merging with emerald matcha layer", "position": "lower-mid", "texture": "Two-tone liquid gradient" },
      { "component": "Crystal-clear ice cubes with mint leaves", "position": "lower", "texture": "Transparent ice with frozen mint" },
      { "component": "Concentrated raspberry fruit puree", "position": "near-bottom", "texture": "Rich red viscous sauce" },
      { "component": "Minimalist straight-sided striped glass cup (empty)", "position": "bottom", "texture": "Clean glass with subtle pattern" }
    ],
    "background": "Fresh minimal: bright studio, light beige to light gray soft gradient",
    "lighting": "Bright natural light feel with clear glass reflections and layered shadows"
  },
  "generation_prompt": "Hyper-realistic vertical exploded deconstruction of a matcha cream-top fruit coffee drink. Center-aligned vertically, each component floating independently with clear spacing. From top to bottom: fine vibrant green matcha powder particles dispersing in air, fresh strawberry and mango slices with glistening moisture and translucent flesh, thick salty cheese matcha cream cap with delicate micro-foam bubbles, clear cold brew coffee merging with emerald matcha in a two-tone liquid gradient, crystal-clear ice cubes with frozen mint leaves inside, concentrated raspberry fruit puree in rich red, and at the bottom a minimalist straight-sided striped glass cup (empty). Fresh minimal bright studio background with light beige to light gray soft gradient. Bright natural light feel with clear glass reflections and layered shadows beneath each component. Minimalist indicator lines with English labels on the right side. 8K ultra-sharp macro photography, premium product infographic style."
}

---
INPUT: { "user_prompt": "milkshake de pêssego com boba", "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "9:16" }
OUTPUT:
{
  "image_analysis": {
    "product": "Pink grapefruit peach milkshake with boba",
    "layers": [
      { "component": "Dried rose petal fragments with gold sugar powder", "position": "top", "texture": "Delicate petals with metallic shimmer" },
      { "component": "Crystal-clear grapefruit pulp particles", "position": "upper-mid", "texture": "Translucent citrus segments" },
      { "component": "Light cherry blossom pink whipped cream pile", "position": "mid", "texture": "Soft pink-tinted cream peaks" },
      { "component": "Silky peach oolong milkshake liquid layer", "position": "lower-mid", "texture": "Smooth peach-colored liquid with fine coating" },
      { "component": "Fresh juicy peach chunks", "position": "lower", "texture": "Bright orange flesh with natural juice" },
      { "component": "Bouncy semi-transparent amber boba pearls", "position": "near-bottom", "texture": "Glossy translucent spheres" },
      { "component": "Elegant thin-stemmed tulip glass (empty)", "position": "bottom", "texture": "Delicate clear glass" }
    ],
    "background": "Premium Morandi pink: soft warm cream pink to light beige gradient",
    "lighting": "Bright fresh natural light, high-key lighting with transparent shadows"
  },
  "generation_prompt": "Hyper-realistic vertical exploded deconstruction of a pink grapefruit peach milkshake with boba. Center-aligned vertically, each component floating independently with clear spacing. From top to bottom: dried rose petal fragments with shimmering gold sugar powder, crystal-clear grapefruit pulp particles with translucent segments, light cherry blossom pink whipped cream pile with soft peaks, silky peach oolong milkshake liquid layer with fine coating effect, fresh juicy peach chunks with bright orange flesh, bouncy semi-transparent amber boba pearls with glossy surface, and at the bottom an elegant thin-stemmed tulip glass (empty). Premium Morandi pink background with soft warm cream pink to light beige gradient. Bright fresh natural high-key lighting with light transparent shadows beneath each floating layer. Minimalist indicator lines with English labels on the right side. 8K ultra-sharp macro photography, premium product infographic style."
}
---

Now transform the user's query following these exact patterns. Always output valid JSON only, no markdown fences.`;

/**
 * Expand a simple Exploded Product prompt into a rich deconstruction infographic prompt
 * using Gemini Flash as an agent. Returns null on failure (caller should fallback).
 */
export const expandExplodedProductPrompt = async (
  userPrompt,
  { hasReferenceImages = false, referenceImageCount = 0, aspectRatio = "9:16", organizationId = null, sql = null } = {}
) => {
  const timer = createTimer();
  try {
    const userMessage = JSON.stringify({
      user_prompt: userPrompt,
      has_reference_images: hasReferenceImages,
      reference_image_count: referenceImageCount,
      target_aspect_ratio: aspectRatio,
    });

    const { text: rawText, usage } = await withRetry(() =>
      generateTextFromMessages({
        model: AI_INFLUENCER_FLASH_MODEL,
        messages: [
          { role: "system", content: EXPLODED_PRODUCT_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        temperature: 0.7,
        maxTokens: 2000,
      }),
    );

    const text = rawText?.trim() || "";
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    const generationPrompt = parsed?.generation_prompt || null;
    const imageAnalysis = parsed?.image_analysis || null;

    if (!generationPrompt) {
      logger.warn({ rawLength: text.length }, "[Exploded Product] Flash returned no generation_prompt");
      return null;
    }

    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        inputTokens,
        outputTokens,
        latencyMs: timer(),
        status: "success",
      }).catch(() => {});
    }

    logger.info(
      { inputTokens, outputTokens, promptChars: generationPrompt.length },
      "[Exploded Product] Prompt expanded via Flash"
    );

    return { generationPrompt, imageAnalysis, rawResponse: parsed };
  } catch (error) {
    logger.error({ err: error }, "[Exploded Product] Flash expansion failed");

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
    }

    return null;
  }
};

// --- Brand Identity Prompt Expansion ---

const BRAND_IDENTITY_SYSTEM_PROMPT = `You are a brand identity visual designer specializing in creating images that strictly adhere to brand guidelines.

TASK: Transform a user prompt + brand profile into a rich image generation prompt that respects ALL brand guidelines with surgical precision.

INPUT: JSON with { user_prompt, brand_profile, has_reference_images, reference_image_count, target_aspect_ratio }

The brand_profile contains:
- name: brand name
- description: brand description
- primaryColor, secondaryColor: hex colors
- toneOfVoice: brand voice
- Additional guidelines if available

OUTPUT: JSON with { image_analysis, generation_prompt }

MANDATORY RULES:
1. COLOR FIDELITY: Use ONLY the brand's color palette. Primary color for dominant areas, secondary for accents. Never introduce outside colors.
2. TYPOGRAPHY: If brand specifies fonts, use them. Default to bold condensed sans-serif (Monument Extended, Bebas Neue).
3. ABSOLUTE RULES: If the brand has "absolute rules" (no gradients, no rounded corners, no decorative elements, etc.), ENFORCE them in the prompt.
4. TONE: Match the brand's voice — if "Direct. Confident. Few words.", the visual must be bold and minimal, not playful.
5. COMPOSITION: Clean, architectural, respecting brand's design philosophy.
6. The image should look like it was created by someone who deeply understands and respects the brand's visual identity system.
7. CAMERA SUFFIX: Every generation_prompt MUST end with "Brand-compliant visual, strict adherence to brand guidelines."
8. LANGUAGE: generation_prompt must be in English.
9. LOW TEMPERATURE: Be precise and faithful to the brand. Do NOT add creative flourishes that conflict with guidelines.

FEW-SHOT EXAMPLE:

---
INPUT: { "user_prompt": "banner de lançamento de produto", "brand_profile": { "name": "VERMILLION THRESHOLD", "description": "Chromatic Brutalism — raw power meets surgical precision", "primaryColor": "#0C0C0C", "secondaryColor": "#E34234", "toneOfVoice": "Direct. Confident. Few words. No fluff.", "typography": "Monument Extended Ultra Bold for headlines, IBM Plex Mono for body", "absolute_rules": ["Never add colors outside the 5-color palette (#0C0C0C, #2A2A2F, #6B6B73, #E8E4DF, #E34234)", "Never use rounded corners", "Never center-align body text", "Never use vermillion for backgrounds or large fills", "Never use gradients", "Never use drop shadows", "Never use decorative elements"] }, "has_reference_images": false, "reference_image_count": 0, "target_aspect_ratio": "4:5" }
OUTPUT:
{
  "image_analysis": {
    "brand_compliance": {
      "palette_enforcement": "Strict 5-color system: #0C0C0C void, #2A2A2F concrete, #6B6B73 steel, #E8E4DF bone, #E34234 vermillion (accent only, max 10%)",
      "typography": "Monument Extended Ultra Bold for headline, IBM Plex Mono Regular for secondary text",
      "prohibited": ["Gradients", "Drop shadows", "Rounded corners", "Decorative elements", "Vermillion as background", "Center-aligned body text", "Colors outside palette"],
      "tone": "Monolithic, precise, explosive restraint"
    },
    "composition": {
      "layout": "Brutalist grid with sharp geometric divisions",
      "hierarchy": "Large bold headline dominates upper third, product in center, minimal text below",
      "negative_space": "Strategic empty areas for visual breathing, reinforcing brutalist aesthetic"
    },
    "visual_elements": {
      "background": "#0C0C0C void black, flat, no gradients",
      "primary_text": "#E8E4DF bone color, UPPERCASE, Monument Extended Ultra Bold",
      "accent_elements": "Small vermillion #E34234 line or block — precise, not large",
      "borders": "Sharp 90-degree corners only, thin #6B6B73 steel dividers",
      "product_area": "#2A2A2F concrete panel for product showcase"
    }
  },
  "generation_prompt": "Product launch banner for VERMILLION THRESHOLD brand. Chromatic Brutalism aesthetic — raw power meets surgical precision. Flat #0C0C0C void black background with absolutely no gradients. Sharp geometric brutalist grid layout with 90-degree corners only. Large UPPERCASE headline in #E8E4DF bone color using Monument Extended Ultra Bold typeface dominating the upper third. Product displayed in a #2A2A2F concrete panel in the center. A single precise thin vermillion #E34234 accent line (never as background, max 10% coverage). Secondary text in IBM Plex Mono Regular, left-aligned, never centered. #6B6B73 steel divider lines between sections. No drop shadows, no decorative elements, no rounded corners anywhere. Maximum contrast, geometric precision, negative space as power. Monolithic, confident, minimal. Brand-compliant visual, strict adherence to brand guidelines."
}
---

Now transform the user's query following these exact patterns. Always output valid JSON only, no markdown fences.`;

/**
 * Expand a Brand Identity prompt into a brand-compliant generation prompt
 * using Gemini Flash as an agent. Returns null on failure (caller should fallback).
 *
 * This function receives the brand profile to inject into the user message.
 */
export const expandBrandIdentityPrompt = async (
  userPrompt,
  { brandProfile = null, hasReferenceImages = false, referenceImageCount = 0, aspectRatio = "4:5", organizationId = null, sql = null } = {}
) => {
  const timer = createTimer();
  try {
    const brandData = brandProfile ? {
      name: brandProfile.name || "",
      description: brandProfile.description || "",
      primaryColor: brandProfile.primaryColor || "",
      secondaryColor: brandProfile.secondaryColor || "",
      toneOfVoice: brandProfile.toneOfVoice || "",
    } : {};

    const userMessage = JSON.stringify({
      user_prompt: userPrompt,
      brand_profile: brandData,
      has_reference_images: hasReferenceImages,
      reference_image_count: referenceImageCount,
      target_aspect_ratio: aspectRatio,
    });

    const { text: rawText, usage } = await withRetry(() =>
      generateTextFromMessages({
        model: AI_INFLUENCER_FLASH_MODEL,
        messages: [
          { role: "system", content: BRAND_IDENTITY_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        jsonMode: true,
        temperature: 0.5,
        maxTokens: 2000,
      }),
    );

    const text = rawText?.trim() || "";
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    const generationPrompt = parsed?.generation_prompt || null;
    const imageAnalysis = parsed?.image_analysis || null;

    if (!generationPrompt) {
      logger.warn({ rawLength: text.length }, "[Brand Identity] Flash returned no generation_prompt");
      return null;
    }

    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        inputTokens,
        outputTokens,
        latencyMs: timer(),
        status: "success",
      }).catch(() => {});
    }

    logger.info(
      { inputTokens, outputTokens, promptChars: generationPrompt.length },
      "[Brand Identity] Prompt expanded via Flash"
    );

    return { generationPrompt, imageAnalysis, rawResponse: parsed };
  } catch (error) {
    logger.error({ err: error }, "[Brand Identity] Flash expansion failed");

    if (sql) {
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/image-playground/generate",
        operation: "text",
        model: AI_INFLUENCER_FLASH_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
    }

    return null;
  }
};

export const buildFlyerPrompt = (brandProfile) => {
  const toneText = getToneText(brandProfile, "flyers");
  const brandName = brandProfile?.name || "a marca";
  const brandDescription = brandProfile?.description || "";
  const primaryColor = brandProfile?.primaryColor || "cores vibrantes";
  const secondaryColor = brandProfile?.secondaryColor || "tons complementares";

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**REGRAS DE CONTEÚDO:**
1. Destaque informações importantes (valores, datas, horários) de forma clara e legível.
2. Use a marca ${brandName}.
3. Siga a identidade visual da marca em todos os elementos.

**IDENTIDADE DA MARCA - ${brandName}:**
${brandDescription ? `- Descrição: ${brandDescription}` : ""}
${toneText ? `- Tom de Comunicação: ${toneText}` : ""}
- Cor Primária (dominante): ${primaryColor}
- Cor de Acento (destaques, CTAs): ${secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: ${primaryColor} (primária) e ${secondaryColor} (acento)
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

export const buildQuickPostPrompt = (brandProfile, context) => {
  const toneText = getToneText(brandProfile, "posts");
  const brandName = brandProfile?.name || "a marca";
  const brandDescription = brandProfile?.description || "";

  return `
Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandName}${brandDescription ? ` - ${brandDescription}` : ""}${toneText ? ` | **TOM:** ${toneText}` : ""}

**REGRAS DE OURO:**
1. GANCHO EXPLOSIVO com emojis relevantes ao tema.
2. DESTAQUE informações importantes (valores, datas, ofertas).
3. CTA FORTE (ex: Link na Bio, Saiba Mais).
4. 5-8 Hashtags estratégicas relevantes à marca e ao conteúdo.

Responda apenas JSON:
{ "platform": "Instagram", "content": "Texto Legenda", "hashtags": ["tag1", "tag2"], "image_prompt": "descrição visual" }`;
};

export const getVideoPromptSystemPrompt = (duration, aspectRatio) => {
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

**ÁUDIO E NARRAÇÃO (OBRIGATÓRIO):**
Se o prompt contiver uma NARRAÇÃO ou texto de fala, SEMPRE inclua o campo audio_context no JSON:
- audio_context.voiceover: o texto exato da narração em português brasileiro
- audio_context.language: "pt-BR"
- audio_context.tone: tom da narração (ex: "Exciting, professional, persuasive" ou "Calm, informative, trustworthy")
- audio_context.style: estilo de entrega (ex: "energetic announcer", "conversational", "dramatic narrator")

Exemplo de audio_context:
{
  "audio_context": {
    "voiceover": "Texto da narração aqui",
    "language": "pt-BR",
    "tone": "Exciting, professional, persuasive",
    "style": "energetic announcer"
  }
}

Mantenha a essência do prompt original mas expanda com detalhes visuais cinematográficos.`;
};

export const getImagePromptSystemPrompt = (aspectRatio) => {
  return `Você é especialista em prompt engineering para imagens de IA.
Converta o prompt fornecido em um JSON estruturado para geração de imagens.

REGRAS IMPORTANTES:
- NÃO invente detalhes que não existam no prompt original.
- Preserve exatamente o conteúdo e as instruções do prompt.
- Se uma informação não estiver explícita, deixe como string vazia.
- Use linguagem objetiva e direta.

O JSON deve seguir esta estrutura:
{
  "subject": "",
  "environment": "",
  "style": "",
  "camera": "",
  "text": {
    "enabled": false,
    "content": "",
    "language": "pt-BR",
    "placement": "",
    "font": ""
  },
  "output": {
    "aspect_ratio": "${aspectRatio}",
    "resolution": "2K"
  }
}

Se houver texto na imagem, marque text.enabled como true e preencha content/placement/font conforme o prompt.`;
};

// Campaign schema for structured generation
export const campaignSchema = {
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
export const quickPostSchema = {
  type: Type.OBJECT,
  properties: {
    platform: { type: Type.STRING },
    content: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    image_prompt: { type: Type.STRING },
  },
  required: ["platform", "content", "hashtags", "image_prompt"],
};
