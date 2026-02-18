export function buildCampaignPrompt(
  brandProfile,
  transcript,
  quantityInstructions,
  toneText,
  carouselSlidesPerCarousel = 5,
) {
  const narrativeStructure =
    carouselSlidesPerCarousel <= 1
      ? `5. Estrutura narrativa obrigatória:
   - Slide único (1) = gancho + mensagem principal + CTA em uma peça só`
      : `5. Estrutura narrativa obrigatória:
   - Slide 1 = título/gancho
   - Slides intermediários = conteúdo principal
   - Último slide (${carouselSlidesPerCarousel}) = CTA
   - Se o usuário pedir menos slides (ex: 3), compacte o conteúdo para manter clareza e impacto`;

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

**REGRAS PARA CARROSSÉIS (carousels):**
1. Cada carrossel deve ter EXATAMENTE ${carouselSlidesPerCarousel} slides
2. O cover_prompt DEVE seguir AS MESMAS REGRAS do image_prompt:
   - Cores da marca (${brandProfile.primaryColor}, ${brandProfile.secondaryColor})
   - Estilo cinematográfico, luxuoso e premium
   - Textos em fonte bold condensed sans-serif
   - Descrição detalhada da composição visual
   - Em PORTUGUÊS
3. Cada slide tem: slide (número), visual (descrição detalhada para gerar imagem), text (texto CURTO em MAIÚSCULAS, máx 10 palavras)
4. O campo "visual" de cada slide DEVE ser uma descrição completa para geração de imagem (estilo, cores, composição)
${narrativeStructure}
6. A tipografia e estilo visual DEVEM ser consistentes em todos os slides
7. Todos os textos em PORTUGUÊS

**MISSÃO:** Gere uma campanha completa em JSON com as QUANTIDADES EXATAS especificadas. Cada image_prompt DEVE ser em PORTUGUÊS e alinhado com seu content.`;
}

export function buildQuantityInstructions(options, mode = "prod") {
  const quantities = [];
  const isProd = mode === "prod";
  const slidesPerCarousel = Math.max(
    1,
    Math.min(8, Number(options?.carousels?.slidesPerCarousel || 5)),
  );

  if (options.videoClipScripts.generate && options.videoClipScripts.count > 0) {
    quantities.push(
      `- Roteiros de vídeo (videoClipScripts): EXATAMENTE ${options.videoClipScripts.count} roteiro(s)`,
    );
  } else {
    quantities.push(`- Roteiros de vídeo (videoClipScripts): 0 (array vazio)`);
  }

  const postPlatforms = [];
  if (options.posts.instagram?.generate && options.posts.instagram.count > 0) {
    postPlatforms.push(
      isProd
        ? `EXATAMENTE ${options.posts.instagram.count} post(s) Instagram`
        : `${options.posts.instagram.count}x Instagram`,
    );
  }
  if (options.posts.facebook?.generate && options.posts.facebook.count > 0) {
    postPlatforms.push(
      isProd
        ? `EXATAMENTE ${options.posts.facebook.count} post(s) Facebook`
        : `${options.posts.facebook.count}x Facebook`,
    );
  }
  if (options.posts.twitter?.generate && options.posts.twitter.count > 0) {
    postPlatforms.push(
      isProd
        ? `EXATAMENTE ${options.posts.twitter.count} post(s) Twitter`
        : `${options.posts.twitter.count}x Twitter`,
    );
  }
  if (options.posts.linkedin?.generate && options.posts.linkedin.count > 0) {
    postPlatforms.push(
      isProd
        ? `EXATAMENTE ${options.posts.linkedin.count} post(s) LinkedIn`
        : `${options.posts.linkedin.count}x LinkedIn`,
    );
  }
  if (postPlatforms.length > 0) {
    quantities.push(
      isProd
        ? `- Posts (posts): ${postPlatforms.join(", ")} - NÃO GERE MAIS NEM MENOS`
        : `- Posts (posts): ${postPlatforms.join(", ")}`,
    );
  } else {
    quantities.push(`- Posts (posts): 0 (array vazio)`);
  }

  const adPlatforms = [];
  if (
    options.adCreatives.facebook?.generate &&
    options.adCreatives.facebook.count > 0
  ) {
    adPlatforms.push(
      isProd
        ? `EXATAMENTE ${options.adCreatives.facebook.count} anúncio(s) Facebook`
        : `${options.adCreatives.facebook.count}x Facebook`,
    );
  }
  if (
    options.adCreatives.google?.generate &&
    options.adCreatives.google.count > 0
  ) {
    adPlatforms.push(
      isProd
        ? `EXATAMENTE ${options.adCreatives.google.count} anúncio(s) Google`
        : `${options.adCreatives.google.count}x Google`,
    );
  }
  if (adPlatforms.length > 0) {
    quantities.push(
      isProd
        ? `- Anúncios (adCreatives): ${adPlatforms.join(", ")} - NÃO GERE MAIS NEM MENOS`
        : `- Anúncios (adCreatives): ${adPlatforms.join(", ")}`,
    );
  } else {
    quantities.push(`- Anúncios (adCreatives): 0 (array vazio)`);
  }

  if (options.carousels?.generate && options.carousels.count > 0) {
    quantities.push(
      isProd
        ? `- Carrosséis Instagram (carousels): EXATAMENTE ${options.carousels.count} carrossel(éis) com EXATAMENTE ${slidesPerCarousel} slides cada`
        : `- Carrosséis (carousels): ${options.carousels.count} carrossel(éis) com ${slidesPerCarousel} slides cada`,
    );
  } else {
    quantities.push(`- Carrosséis (carousels): 0 (array vazio)`);
  }

  return quantities.join("\n    ");
}
