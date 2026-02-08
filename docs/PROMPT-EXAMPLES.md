# Exemplos Práticos de Prompts
## Sistema de Geração de Imagens

**Data:** 2026-01-15

---

## 📚 Índice

1. [Prompts de Campanha](#prompts-de-campanha)
2. [Prompts de Posts](#prompts-de-posts)
3. [Prompts de Flyers](#prompts-de-flyers)
4. [Prompts de Vídeo (Clips)](#prompts-de-vídeo-clips)
5. [Prompts de Carrosséis](#prompts-de-carrosséis)
6. [Prompts com Referências Visuais](#prompts-com-referências-visuais)
7. [Exemplos de Saídas da IA](#exemplos-de-saídas-da-ia)

---

## 1. Prompts de Campanha

### Exemplo 1: Torneio de Poker

**INPUT:**
```typescript
const brandProfile = {
  name: "Poker Club Premium",
  description: "Casa de poker de luxo em São Paulo",
  primaryColor: "#1E40AF",
  secondaryColor: "#FFD700",
  toneOfVoice: "Profissional"
};

const transcript = `
Novo torneio de poker com prêmio de R$ 100.000!
Data: 15 de fevereiro
Buy-in: R$ 500
Vagas limitadas
`;

const options = {
  videoClipScripts: { generate: true, count: 2 },
  posts: {
    instagram: { generate: true, count: 3 },
    facebook: { generate: true, count: 1 },
  },
  adCreatives: {
    facebook: { generate: true, count: 1 },
  },
};
```

**PROMPT ENVIADO À IA:**
```
**PERFIL DA MARCA:**
- Nome: Poker Club Premium
- Descrição: Casa de poker de luxo em São Paulo
- Tom de Voz: Profissional
- Cores Oficiais: Primária #1E40AF, Secundária #FFD700

**CONTEÚDO PARA ESTRUTURAR:**
Novo torneio de poker com prêmio de R$ 100.000!
Data: 15 de fevereiro
Buy-in: R$ 500
Vagas limitadas

**QUANTIDADES EXATAS A GERAR (OBRIGATÓRIO SEGUIR):**
- Roteiros de vídeo (videoClipScripts): EXATAMENTE 2 roteiro(s)
- Posts (posts): EXATAMENTE 3 post(s) Instagram, EXATAMENTE 1 post(s) Facebook
- Anúncios (adCreatives): EXATAMENTE 1 anúncio(s) Facebook
- Carrosséis Instagram (carousels): EXATAMENTE 1 carrossel com 5 slides

**REGRAS CRÍTICAS PARA IMAGE_PROMPT (OBRIGATÓRIO):**

1. **IDIOMA (REGRA INVIOLÁVEL):**
   - TODOS os image_prompts DEVEM ser escritos em PORTUGUÊS
   - QUALQUER texto que apareça na imagem DEVE estar em PORTUGUÊS
   - PROIBIDO usar inglês nos textos da imagem

2. **ALINHAMENTO CONTEÚDO-IMAGEM:**
   - O image_prompt DEVE refletir o tema da legenda (content)
   - NUNCA gere prompts genéricos desconectados do conteúdo

3. **ELEMENTOS OBRIGATÓRIOS:**
   - Cores da marca (#1E40AF, #FFD700)
   - Estilo cinematográfico, luxuoso e premium
   - Textos em fonte bold condensed sans-serif
```

**OUTPUT (JSON):**
```json
{
  "videoClipScripts": [
    {
      "title": "Torneio Exclusivo de Poker",
      "hook": "Prepare-se para o maior torneio do ano!",
      "scenes": [
        {
          "scene": 1,
          "visual": "Mesa de poker luxuosa, fichas empilhadas, iluminação dramática",
          "narration": "O maior torneio de poker está chegando",
          "duration_seconds": 3
        },
        {
          "scene": 2,
          "visual": "Close nas cartas sendo distribuídas, mãos de jogador",
          "narration": "Prêmio de R$ 100.000 em jogo",
          "duration_seconds": 2
        },
        {
          "scene": 3,
          "visual": "Jogadores concentrados, atmosfera tensa",
          "narration": "15 de fevereiro, não perca!",
          "duration_seconds": 2
        }
      ],
      "image_prompt": "Mesa de poker premium com iluminação cinematográfica azul royal (#1E40AF), fichas douradas (#FFD700) empilhadas profissionalmente, cartas de baralho em foco, ambiente luxuoso com reflexos dramáticos, texto em MAIÚSCULAS 'TORNEIO EXCLUSIVO' com fonte bold condensed sans-serif estilo Bebas Neue, atmosfera elegante e profissional, composição widescreen 16:9",
      "audio_script": "O maior torneio de poker está chegando. Prêmio de R$ 100.000 em jogo. 15 de fevereiro, não perca!"
    },
    {
      "title": "Vagas Limitadas - Inscreva-se Já",
      "hook": "As vagas estão acabando!",
      "scenes": [
        {
          "scene": 1,
          "visual": "Relógio em close, contagem regressiva",
          "narration": "Faltam apenas 30 dias",
          "duration_seconds": 2
        },
        {
          "scene": 2,
          "visual": "Mesa de poker sendo preparada, dealer organizando fichas",
          "narration": "Buy-in de apenas R$ 500",
          "duration_seconds": 2
        },
        {
          "scene": 3,
          "visual": "Logotipo do clube aparecendo, call to action",
          "narration": "Garanta sua vaga agora!",
          "duration_seconds": 2
        }
      ],
      "image_prompt": "Design vertical 9:16 para Stories, relógio de luxo em close com efeito motion blur, fichas de poker douradas (#FFD700) no fundo desfocado, iluminação azul royal (#1E40AF) criando profundidade, texto 'VAGAS LIMITADAS' em MAIÚSCULAS com tipografia bold condensed sans-serif, estilo urgente mas elegante, composição cinematográfica vertical",
      "audio_script": "Faltam apenas 30 dias. Buy-in de apenas R$ 500. Garanta sua vaga agora!"
    }
  ],
  "posts": [
    {
      "platform": "Instagram",
      "content": "🃏 TORNEIO EXCLUSIVO DE POKER!\n\n💰 Prêmio: R$ 100.000\n📅 Data: 15 de Fevereiro\n💵 Buy-in: R$ 500\n\n⚠️ VAGAS LIMITADAS! As inscrições estão abertas, mas não vão durar muito.\n\nVocê tem o que é preciso para levar o prêmio?\n\n👉 Link na bio para inscrição\n\n#PokerClubPremium #TorneioDePoker #PokerSP #R100Mil",
      "hashtags": [
        "#PokerClubPremium",
        "#TorneioDePoker",
        "#PokerSP",
        "#R100Mil",
        "#PokerProfissional"
      ],
      "image_prompt": "Post Instagram 1:1 (quadrado), mesa de poker de luxo vista de cima, cartas de baralho premium espalhadas artisticamente, fichas douradas (#FFD700) organizadas em pilhas estratégicas, iluminação azul royal (#1E40AF) dramática criando sombras longas, texto centralizado 'R$ 100.000' em MAIÚSCULAS com fonte bold condensed sans-serif estilo Bebas Neue dourada brilhante, subtexto '15 DE FEVEREIRO' menor, atmosfera cinematográfica premium, composição equilibrada e profissional"
    },
    {
      "platform": "Instagram",
      "content": "⏰ ÚLTIMA CHAMADA!\n\nFaltam apenas 7 dias para o maior torneio de poker de São Paulo!\n\n🎯 O que você precisa saber:\n✅ Prêmio de R$ 100.000\n✅ Buy-in acessível: R$ 500\n✅ Estrutura profissional\n✅ Ambiente premium\n\n🔥 As últimas vagas estão sendo preenchidas AGORA!\n\nNão fique de fora dessa oportunidade.\n\n📲 Garanta sua vaga pelo link da bio\n\n#PokerTournament #PokerLife #CardGames",
      "hashtags": [
        "#PokerTournament",
        "#PokerLife",
        "#CardGames",
        "#UltimaChance",
        "#PokerBrasil"
      ],
      "image_prompt": "Composição vertical 4:5 (formato feed Instagram otimizado), relógio de luxo em primeiro plano marcando 7 dias, mesa de poker premium desfocada ao fundo com iluminação azul royal (#1E40AF), fichas douradas (#FFD700) criando bokeh luminoso, cartas Royal Flush visíveis parcialmente, texto em camadas 'ÚLTIMA CHAMADA' em MAIÚSCULAS bold condensed sans-serif no topo, '7 DIAS' em destaque maior no centro, atmosfera de urgência mas mantendo elegância, composição profissional com hierarquia visual clara"
    },
    {
      "platform": "Facebook",
      "content": "🎰 TORNEIO DE POKER - PRÊMIO DE R$ 100.000! 🎰\n\nO Poker Club Premium tem o prazer de anunciar o maior torneio da temporada!\n\n📌 DETALHES DO EVENTO:\n• Prêmio total: R$ 100.000\n• Data: 15 de Fevereiro de 2026\n• Buy-in: R$ 500\n• Vagas: LIMITADAS\n• Local: Poker Club Premium - São Paulo\n\nPor que participar?\n✓ Estrutura profissional de torneio\n✓ Ambiente premium e confortável\n✓ Premiação garantida para os top 10\n✓ Experiência inesquecível\n\n⚠️ ATENÇÃO: As vagas estão se esgotando rapidamente!\n\nPara garantir sua inscrição, entre em contato pelos nossos canais ou visite nossa sede.\n\n#PokerClubPremium #TorneioDePoker #PokerProfissional",
      "hashtags": [
        "#PokerClubPremium",
        "#TorneioDePoker",
        "#PokerProfissional",
        "#PokerSP",
        "#EventosPoker"
      ],
      "image_prompt": "Banner horizontal 1.91:1 (formato link preview Facebook), visão panorâmica de sala de poker luxuosa com múltiplas mesas, iluminação azul royal (#1E40AF) criando ambiente sofisticado, destaque central para mesa principal com fichas douradas (#FFD700), jogadores em silhueta ao fundo, logo 'POKER CLUB PREMIUM' discreto no canto superior, texto principal 'R$ 100.000' em MAIÚSCULAS com tipografia bold condensed sans-serif dourada brilhante centralizado, subtexto '15 DE FEVEREIRO' abaixo, composição cinematográfica widescreen, estética premium e profissional"
    }
  ],
  "adCreatives": [
    {
      "platform": "Facebook",
      "headline": "Torneio de Poker - R$ 100.000 em Prêmios",
      "body": "Participe do maior torneio de poker de São Paulo. Buy-in de R$ 500, vagas limitadas. Inscreva-se agora!",
      "cta": "Inscrever-se Agora",
      "image_prompt": "Anúncio Facebook Ads 1:1, design clean e impactante, mesa de poker em perspectiva diagonal dramática, cartas Royal Flush em destaque no centro, fichas douradas (#FFD700) empilhadas criando profundidade, iluminação azul royal (#1E40AF) com gradiente sutil, texto hierárquico 'TORNEIO DE POKER' no topo em tipografia bold condensed sans-serif, 'R$ 100.000' em tamanho gigante centralizado com brilho dourado, 'VAGAS LIMITADAS' em banner vermelho no rodapé, composição otimizada para capturar atenção em feed, call-to-action visual forte"
    }
  ],
  "carousels": [
    {
      "title": "5 Motivos Para Participar",
      "hook": "Descubra por que este torneio é imperdível!",
      "cover_prompt": "Capa de carrossel Instagram 1:1, design moderno e minimalista, fundo degradê azul royal (#1E40AF) para dourado (#FFD700), cartas de poker estilizadas flutuando com efeito 3D sutil, texto '5 MOTIVOS' em MAIÚSCULAS com tipografia bold condensed sans-serif ultra large centralizado, ícone de seta deslizante indicando carrossel, composição clean com muito espaço negativo, estética premium e convidativa",
      "slides": [
        {
          "slide": 1,
          "visual": "Fundo azul royal sólido, troféu dourado em destaque, partículas luminosas ao redor",
          "text": "PRÊMIO DE R$ 100 MIL"
        },
        {
          "slide": 2,
          "visual": "Mesa de poker profissional, dealer em ação, iluminação cinematográfica",
          "text": "ESTRUTURA PROFISSIONAL"
        },
        {
          "slide": 3,
          "visual": "Interior luxuoso do clube, poltronas de couro, ambiente sofisticado",
          "text": "AMBIENTE PREMIUM"
        },
        {
          "slide": 4,
          "visual": "Grupo de jogadores celebrando, atmosfera de camaradagem",
          "text": "NETWORKING EXCLUSIVO"
        },
        {
          "slide": 5,
          "visual": "CTA visual forte, botão 'INSCREVER-SE', texto de urgência, design impactante",
          "text": "GARANTA SUA VAGA AGORA"
        }
      ]
    }
  ]
}
```

---

## 2. Prompts de Posts

### Exemplo 2: Post Instagram Promocional

**INPUT:**
```typescript
const prompt = "Promoção especial: 50% off no buy-in para novos jogadores";
const brandProfile = {
  name: "Poker Club Premium",
  primaryColor: "#1E40AF",
  secondaryColor: "#FFD700",
  toneOfVoice: "Espirituoso"
};
```

**PROMPT ENRIQUECIDO (buildImagePrompt):**
```
PROMPT TÉCNICO: Promoção especial: 50% off no buy-in para novos jogadores
ESTILO VISUAL: Espirituoso, Cores: #1E40AF, #FFD700. Cinematográfico e Luxuoso.
```

**IMAGE_PROMPT GERADO PELA IA:**
```
Post Instagram 1:1, design promocional vibrante e energético, cartas de poker explodindo em movimento dinâmico, fichas douradas (#FFD700) voando em trajetórias curvas, fundo azul royal (#1E40AF) com raios de luz radiantes, selo '50% OFF' em vermelho vibrante no canto superior direito, texto principal 'NOVOS JOGADORES' em MAIÚSCULAS com tipografia bold condensed sans-serif estilo Bebas Neue branco com contorno dourado, subtexto 'BEM-VINDOS!' menor abaixo, elementos gráficos divertidos mas mantendo sofisticação, composição assimétrica balanceada, atmosfera celebratória e convidativa
```

---

## 3. Prompts de Flyers

### Exemplo 3: Flyer de Evento com Logo

**INPUT:**
```typescript
const prompt = `
Torneio de Aniversário - 5 Anos Poker Club Premium
Data: 20 de Março, 2026
Horário: 19h
Buy-in: R$ 300
Prêmio garantido: R$ 50.000
Open bar e jantar inclusos
`;

const logo = uploadedLogoFile; // Logo do clube
const aspectRatio = "9:16"; // Vertical para impressão
```

**PROMPT COMPLETO (buildFlyerPrompt + buildImagePrompt):**
```
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**IDENTIDADE DA MARCA - Poker Club Premium:**
- Descrição: Casa de poker de luxo em São Paulo
- Tom de Comunicação: Profissional
- Cor Primária (dominante): #1E40AF
- Cor de Acento (destaques, CTAs): #FFD700

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: #1E40AF (primária) e #FFD700 (acento)
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
- Impactante mas elegante

---

PROMPT TÉCNICO: Torneio de Aniversário - 5 Anos Poker Club Premium
Data: 20 de Março, 2026
Horário: 19h
Buy-in: R$ 300
Prêmio garantido: R$ 50.000
Open bar e jantar inclusos

ESTILO VISUAL: Profissional, Cores: #1E40AF, #FFD700. Cinematográfico e Luxuoso.

**LOGO DA MARCA (OBRIGATÓRIO):**
- Use o LOGO EXATO fornecido na imagem de referência anexada - NÃO CRIE UM LOGO DIFERENTE
- O logo deve aparecer de forma clara e legível na composição
- Mantenha as proporções e cores originais do logo
```

**RESULTADO ESPERADO:**
- Flyer vertical 9:16 elegante
- Logo no topo centralizado
- Texto "5 ANOS" em destaque gigante
- Informações organizadas hierarquicamente
- Cores azul royal e dourado dominantes
- Elementos de poker sutis (fichas, cartas) como decoração
- Espaço para detalhes do evento (data, hora, buy-in)
- Call-to-action no rodapé

---

## 4. Prompts de Vídeo (Clips)

### Exemplo 4: Scene de Vídeo Vertical (Reels/TikTok)

**INPUT:**
```typescript
const scene = {
  scene: 1,
  visual: "Mesa de poker luxuosa com fichas empilhadas",
  narration: "Prepare-se para a maior experiência de poker",
  duration_seconds: 3
};

const brandProfile = {
  name: "Poker Club Premium",
  description: "Casa de poker de luxo",
  primaryColor: "#1E40AF",
  secondaryColor: "#FFD700",
  toneOfVoice: "Profissional"
};
```

**PROMPT (buildVeoScenePrompt):**
```
Cena de vídeo promocional:

VISUAL: Mesa de poker luxuosa com fichas empilhadas

NARRAÇÃO (falar em português brasileiro, voz impactante, empolgante e profissional): "Prepare-se para a maior experiência de poker"

CONTEXTO DA MARCA: Poker Club Premium - Casa de poker de luxo

Estilo: Profissional, cinematográfico, cores #1E40AF e #FFD700.
Movimento de câmera suave, iluminação dramática profissional.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED SANS-SERIF, MAIÚSCULAS, impactante.
```

**Para Imagem de Thumbnail:**
```typescript
buildClipSceneImagePrompt({
  sceneNumber: 1,
  visual: "Mesa de poker luxuosa com fichas empilhadas",
  narration: "Prepare-se para a maior experiência de poker"
});
```

**OUTPUT:**
```
FORMATO OBRIGATÓRIO: 9:16 VERTICAL (REELS/STORIES)

CENA 1 DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: Mesa de poker luxuosa com fichas empilhadas
Texto/Narração para incluir: Prepare-se para a maior experiência de poker

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.
```

---

## 5. Prompts de Carrosséis

### Exemplo 5: Carrossel Educacional

**INPUT (gerado pela IA na campanha):**
```json
{
  "title": "5 Dicas para Iniciantes no Poker",
  "hook": "Aprenda as estratégias essenciais!",
  "cover_prompt": "Carrossel Instagram 1:1, design educativo moderno, cartas de poker estilizadas formando número '5' gigante, fundo gradiente azul royal (#1E40AF) para dourado (#FFD700), texto '5 DICAS' em MAIÚSCULAS tipografia bold condensed sans-serif branco, ícone de cerebro ou lâmpada indicando aprendizado, composição minimalista e profissional",
  "slides": [
    {
      "slide": 1,
      "visual": "Fundo azul royal, ícone de usuário com lupa, elementos de análise",
      "text": "CONHEÇA SEUS OPONENTES"
    },
    {
      "slide": 2,
      "visual": "Pilhas de fichas organizadas, gráfico de gestão, calculadora",
      "text": "GERENCIE SUA BANCA"
    },
    {
      "slide": 3,
      "visual": "Cartas sendo dobradas, ícone de 'X' vermelho, decisão estratégica",
      "text": "SAIBA QUANDO DESISTIR"
    },
    {
      "slide": 4,
      "visual": "Jogador concentrado, ícone de mente focada, atmosfera zen",
      "text": "MANTENHA A CALMA"
    },
    {
      "slide": 5,
      "visual": "Call-to-action visual, botão 'SABER MAIS', logo do clube, link",
      "text": "APRENDA MAIS NO CLUBE"
    }
  ]
}
```

**PROCESSAMENTO:**

1. **Cover Image** → Gera a partir de `cover_prompt`
2. **Slide 1** → Gera a partir de `visual` + sobrepõe `text`
3. **Slide 2** → Gera a partir de `visual` + sobrepõe `text`
4. **Slide 3** → Gera a partir de `visual` + sobrepõe `text`
5. **Slide 4** → Gera a partir de `visual` + sobrepõe `text`
6. **Slide 5** → Gera a partir de `visual` + sobrepõe `text`

**REGRA IMPORTANTE:**
Todos os slides devem ter **tipografia consistente** (mesma fonte, peso, estilo).

---

## 6. Prompts com Referências Visuais

### Exemplo 6: Geração com Produto + Logo

**INPUT:**
```typescript
const prompt = "Novo conjunto de fichas premium de cerâmica";
const productImages = [
  { base64: "...", mimeType: "image/png" }, // Foto das fichas
  { base64: "...", mimeType: "image/png" }  // Close-up da textura
];
const logo = { base64: "...", mimeType: "image/png" };
```

**PROMPT ENRIQUECIDO:**
```
PROMPT TÉCNICO: Novo conjunto de fichas premium de cerâmica
ESTILO VISUAL: Profissional, Cores: #1E40AF, #FFD700. Cinematográfico e Luxuoso.

**LOGO DA MARCA (OBRIGATÓRIO):**
- Use o LOGO EXATO fornecido na imagem de referência anexada - NÃO CRIE UM LOGO DIFERENTE
- O logo deve aparecer de forma clara e legível na composição
- Mantenha as proporções e cores originais do logo

**IMAGENS DE PRODUTO (OBRIGATÓRIO):**
- As imagens anexadas são referências de produto
- Preserve fielmente o produto (forma, cores e detalhes principais)
- O produto deve aparecer com destaque na composição
```

**RESULTADO ESPERADO:**
- Composição com as fichas reais do produto
- Logo da marca integrado naturalmente
- Iluminação cinematográfica azul e dourada
- Destaque para a textura premium das fichas
- Atmosfera luxuosa e profissional

---

### Exemplo 7: Edição de Imagem com Máscara

**INPUT:**
```typescript
const originalImage = existingImageData;
const mask = userDrawnMask; // Região pintada pelo usuário
const prompt = "Adicionar troféu dourado no centro da mesa";
```

**PROMPT DE EDIÇÃO:**
```
INSTRUÇÃO DE EDIÇÃO: Adicionar troféu dourado no centro da mesa

REGRAS:
1. Preserve TODO o restante da imagem original EXATAMENTE como está
2. Aplique a modificação APENAS na área indicada pela máscara
3. Garanta transição suave entre área editada e original
4. Mantenha iluminação e estilo consistentes com a imagem base
5. Use cores #FFD700 (dourado) para o troféu
6. O troféu deve parecer integrado naturalmente à cena

IMAGEM ANEXADA: [original]
MÁSCARA ANEXADA: [região a editar]
```

---

## 7. Exemplos de Saídas da IA

### Output 1: Post Instagram (JSON)

```json
{
  "platform": "Instagram",
  "content": "🃏 NOVA PROMOÇÃO!\n\n🔥 50% OFF no buy-in para NOVOS JOGADORES!\n\n✨ É a oportunidade perfeita para começar sua jornada no poker profissional.\n\n💎 O que você ganha:\n✅ Desconto exclusivo\n✅ Ambiente premium\n✅ Estrutura profissional\n✅ Comunidade acolhedora\n\n⏰ Promoção válida apenas este mês!\n\n👉 Link na bio para se cadastrar\n\n#NovoJogador #PokerClub #Promocao #PokerSP",
  "hashtags": [
    "#NovoJogador",
    "#PokerClub",
    "#Promocao",
    "#PokerSP",
    "#BemVindo"
  ],
  "image_prompt": "Post Instagram 1:1, design promocional vibrante e energético, cartas de poker explodindo em movimento dinâmico, fichas douradas (#FFD700) voando em trajetórias curvas, fundo azul royal (#1E40AF) com raios de luz radiantes, selo '50% OFF' em vermelho vibrante no canto superior direito com efeito de brilho, texto principal 'NOVOS JOGADORES' em MAIÚSCULAS com tipografia bold condensed sans-serif estilo Bebas Neue branco com contorno dourado e sombra, subtexto 'BEM-VINDOS!' menor abaixo, elementos gráficos divertidos mas mantendo sofisticação, composição assimétrica balanceada, atmosfera celebratória e convidativa, estética premium mas acessível"
}
```

### Output 2: Video Clip Script (JSON)

```json
{
  "title": "O Poder da Estratégia",
  "hook": "No poker, cada decisão conta!",
  "scenes": [
    {
      "scene": 1,
      "visual": "Close em mãos de jogador analisando cartas",
      "narration": "Cada decisão no poker pode mudar tudo",
      "duration_seconds": 3
    },
    {
      "scene": 2,
      "visual": "Fichas sendo empurradas para o centro da mesa",
      "narration": "Você precisa saber quando arriscar",
      "duration_seconds": 2
    },
    {
      "scene": 3,
      "visual": "Jogador vencedor celebrando com troféu",
      "narration": "E quando a vitória chegar, você estará pronto",
      "duration_seconds": 3
    }
  ],
  "image_prompt": "Thumbnail vertical 9:16 para Reels, composição cinematográfica dramática, mãos de jogador profissional segurando cartas Royal Flush em foco nítido, mesa de poker desfocada ao fundo com iluminação azul royal (#1E40AF) criando profundidade, fichas douradas (#FFD700) empilhadas nas laterais emoldurando a composição, texto 'O PODER DA ESTRATÉGIA' em MAIÚSCULAS com tipografia bold condensed sans-serif estilo Bebas Neue branco com efeito de brilho dourado, atmosfera tensa e profissional, composição vertical otimizada para mobile",
  "audio_script": "Cada decisão no poker pode mudar tudo. Você precisa saber quando arriscar. E quando a vitória chegar, você estará pronto."
}
```

### Output 3: Ad Creative (JSON)

```json
{
  "platform": "Facebook",
  "headline": "Aprenda Poker com os Profissionais",
  "body": "Aulas exclusivas, ambiente premium, resultados garantidos. Comece sua jornada hoje!",
  "cta": "Saiba Mais",
  "image_prompt": "Anúncio Facebook Ads 1:1 otimizado para conversão, design split-screen: lado esquerdo mostra professor profissional de poker explicando estratégia com gráficos flutuantes holográficos, lado direito mostra aluno praticando em mesa premium, iluminação azul royal (#1E40AF) no lado do professor gradiente para dourado (#FFD700) no lado do aluno simbolizando evolução, texto hierárquico 'APRENDA COM OS MELHORES' no topo em tipografia bold condensed sans-serif branco, ícones de benefícios (certificado, troféu, estrelas) no rodapé, call-to-action visual forte com botão 'COMEÇAR AGORA' dourado brilhante, composição balanceada e profissional otimizada para capturar atenção em feed móvel"
}
```

---

## 📝 Dicas para Criar Bons Prompts

### ✅ DO (Faça)

1. **Seja Específico:**
   ```
   ❌ "Mesa de poker"
   ✅ "Mesa de poker premium com iluminação cinematográfica azul, fichas douradas empilhadas profissionalmente, cartas em foco"
   ```

2. **Inclua Cores da Marca:**
   ```
   ✅ "cores azul royal (#1E40AF) e dourado (#FFD700)"
   ```

3. **Especifique Tipografia:**
   ```
   ✅ "tipografia bold condensed sans-serif estilo Bebas Neue"
   ```

4. **Defina Atmosfera:**
   ```
   ✅ "atmosfera cinematográfica luxuosa e profissional"
   ```

5. **Indique Aspect Ratio:**
   ```
   ✅ "composição vertical 9:16 para Stories"
   ```

### ❌ DON'T (Não faça)

1. **Prompts Genéricos:**
   ```
   ❌ "Fazer algo legal"
   ```

2. **Sem Contexto de Marca:**
   ```
   ❌ Não mencionar cores ou tom de voz
   ```

3. **Misturar Idiomas:**
   ```
   ❌ "Create poker table with fichas douradas"
   ```

4. **Instruções Ambíguas:**
   ```
   ❌ "Adicionar alguns elementos"
   ```

---

**Autor:** Claude Code (Senior Architect)
**Última Atualização:** 2026-01-15
