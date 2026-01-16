# Resumo Executivo: Sistema de Geração de Imagens
## PokerMarketing Agency

**Data:** 2026-01-15

---

## 📊 Visão Geral Rápida

O sistema utiliza **IA multimodal** para gerar conteúdo visual personalizado para campanhas de marketing, integrando:

- **3 provedores de IA** (Google, OpenAI, xAI)
- **4 tipos de geração** (imagens, vídeos, áudio, texto)
- **5 formatos de saída** (posts, anúncios, clips, flyers, carousels)
- **8+ aspect ratios** suportados

---

## 🎯 Parâmetros-Chave de Geração

### 1. BrandProfile (Obrigatório)
```typescript
{
  name: string,              // Ex: "Poker Club Premium"
  description: string,       // Ex: "Casa de poker de luxo"
  primaryColor: string,      // Ex: "#1E40AF" (azul royal)
  secondaryColor: string,    // Ex: "#FFD700" (dourado)
  toneOfVoice: string,       // Ex: "Profissional"
  creativeModel?: string     // Ex: "gemini-3-flash-preview"
}
```

**Impacto:** Define toda a identidade visual das imagens geradas

### 2. Prompt (string)
```typescript
// ❌ Ruim
"Criar imagem de poker"

// ✅ Bom
"Mesa de poker luxuosa com iluminação cinematográfica, fichas douradas empilhadas, ambiente premium com cores azul royal e dourado, texto 'TORNEIO EXCLUSIVO' em MAIÚSCULAS com fonte bold condensed sans-serif estilo Bebas Neue"
```

**Impacto:** Qualidade diretamente proporcional à especificidade

### 3. AspectRatio (string)
```typescript
"1:1"    // Posts quadrados (Instagram)
"9:16"   // Stories/Reels verticais
"16:9"   // YouTube horizontal
"4:5"    // Instagram feed otimizado
```

**Impacto:** Define a plataforma de destino

### 4. ImageSize (opcional)
```typescript
"1K"  // Rápido, baixa resolução
"2K"  // Padrão, boa qualidade
"4K"  // Alta qualidade, mais lento
```

**Impacto:** Balança velocidade vs qualidade

### 5. Imagens de Referência (opcional)
```typescript
{
  productImages?: ImageFile[],        // Produtos a preservar
  styleReferenceImage?: ImageFile,    // Estilo visual
  personReferenceImage?: ImageFile,   // Pessoa a incluir
  compositionAssets?: ImageFile[]     // Assets adicionais
}
```

**Impacto:** Controle preciso sobre elementos visuais

---

## 🔄 Fluxo de Geração Típico

```
USUÁRIO INPUTS
    ↓
1. Transcrição + Brand Profile + Opções
    ↓
2. Backend: buildCampaignPrompt()
    ↓
3. IA (Gemini/GPT): Gera estrutura JSON
    {
      posts: [{
        content: "...",
        image_prompt: "..."  ← PROMPT ESPECÍFICO
      }],
      clips: [...],
      ads: [...]
    }
    ↓
4. Job Queue: Processa image_prompts
    ↓
5. Para cada prompt:
   - buildImagePrompt() → Enrichment
   - generateGeminiImage() → Geração
   - Vercel Blob → Upload
   - Database → Update URL
    ↓
6. Frontend: Exibe imagens geradas
```

---

## 🤖 Modelos Disponíveis

### Texto/Campanha
| Modelo | Provedor | Custo | Velocidade |
|--------|----------|-------|------------|
| Gemini 3 Flash | Google | Baixo | Rápida |
| Gemini 3 Pro | Google | Médio | Média |
| GPT-5.2 | OpenAI | Alto | Lenta |
| Grok 4.1 Fast | xAI | Médio | Rápida |

### Imagem
| Modelo | Resolução | Multimodal |
|--------|-----------|------------|
| Gemini 3 Pro Image | 1K/2K/4K | Sim (logo, produto) |

### Vídeo
| Modelo | Duração | Audio |
|--------|---------|-------|
| Sora 2 (Fal.ai) | Até 10s | Sim |
| Veo 3.1 (Fal.ai) | Até 8s | Sim |

---

## 📝 Anatomia de um Prompt Eficaz

### Estrutura Base
```
PROMPT TÉCNICO: [Descrição específica do conteúdo]
ESTILO VISUAL: [Tom de voz], Cores: [primária], [secundária].
              Cinematográfico e Luxuoso.
```

### + Se houver Logo
```
**LOGO DA MARCA (OBRIGATÓRIO):**
- Use o LOGO EXATO fornecido na imagem anexada
- NÃO CRIE UM LOGO DIFERENTE
- Deve aparecer de forma clara e legível
- Mantenha proporções e cores originais
```

### + Se houver Produto
```
**IMAGENS DE PRODUTO (OBRIGATÓRIO):**
- Preserve fielmente o produto (forma, cores, detalhes)
- Produto deve aparecer com destaque
```

### + Se houver Texto na Imagem
```
**TIPOGRAFIA OBRIGATÓRIA:**
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF
- Estilo: Bebas Neue, Oswald, Impact
- TODOS os textos na MESMA família tipográfica
- Títulos em MAIÚSCULAS com peso BLACK/EXTRA-BOLD
- PROIBIDO: script/cursivas, serifadas, handwriting
```

---

## 🎨 Regras de Estilo Aplicadas

### 1. Cores
- **SEMPRE** usar primaryColor + secondaryColor da marca
- Criar variações tonais para profundidade
- **NUNCA** introduzir cores aleatórias

### 2. Tipografia
- **Padrão:** Bold Condensed Sans-Serif (Bebas Neue, Oswald, Impact)
- **Títulos:** MAIÚSCULAS, peso BLACK/EXTRA-BOLD
- **Máximo:** 2-3 famílias tipográficas por design

### 3. Composição
- **Menos é mais:** espaços negativos estratégicos
- **Hierarquia visual clara**
- **Não sobrecarregar** com elementos decorativos

### 4. Atmosfera
- Alta classe, luxo e sofisticação
- Cinematográfico (não exagerado)
- Profissional mas criativo
- Impactante mas elegante

---

## 🔥 Prompts Especializados

### 1. Campanha Completa
```javascript
buildCampaignPrompt(brandProfile, transcript, options)
```
**Output:** JSON com posts, clips, ads, carousels
- Cada item tem seu próprio `image_prompt`
- Prompts alinhados com o conteúdo textual
- Quantidades exatas respeitadas

### 2. Flyer
```javascript
buildFlyerPrompt(brandProfile)
```
**Output:** Prompt como "Diretor de Arte Sênior"
- Destaca informações importantes (valores, datas)
- Princípios de design profissional
- Anti-poluição visual

### 3. Clip Scene
```javascript
buildClipSceneImagePrompt(sceneNumber, visual, narration)
```
**Output:** Prompt para cena de vídeo vertical
- Formato 9:16 obrigatório
- Tipografia consistente com referência
- Contexto da narração

### 4. Quick Post
```javascript
buildQuickPostPrompt(brandProfile, context)
```
**Output:** JSON { platform, content, hashtags, image_prompt }
- Gancho explosivo
- CTA forte
- 5-8 hashtags estratégicas

---

## ⚡ Exemplos Práticos

### Exemplo 1: Post Instagram
```typescript
// INPUT
const prompt = "Novo torneio de poker com prêmio de R$ 100.000";
const brand = {
  name: "Poker Club Premium",
  primaryColor: "#1E40AF",
  secondaryColor: "#FFD700",
  toneOfVoice: "Profissional"
};

// PROCESSAMENTO
const enrichedPrompt = buildImagePrompt(
  prompt,
  brand,
  false,  // hasLogo
  false,  // hasProductImages
  false   // hasStyleReference
);

// OUTPUT (enrichedPrompt)
`PROMPT TÉCNICO: Novo torneio de poker com prêmio de R$ 100.000
ESTILO VISUAL: Profissional, Cores: #1E40AF, #FFD700.
              Cinematográfico e Luxuoso.`

// IMAGEM GERADA
// → Mesa de poker premium
// → Fichas em tons azul royal e dourado
// → Texto "R$ 100.000" em destaque
// → Atmosfera luxuosa e profissional
```

### Exemplo 2: Flyer com Logo
```typescript
// INPUT
const prompt = "Torneio de Aniversário - 5 anos";
const logo = uploadedLogoFile;

// PROCESSAMENTO
const enrichedPrompt = buildImagePrompt(
  prompt,
  brand,
  true,   // hasLogo = true
  false,
  false
);

// OUTPUT (enrichedPrompt inclui)
`**LOGO DA MARCA (OBRIGATÓRIO):**
- Use o LOGO EXATO fornecido na imagem anexada
- NÃO CRIE UM LOGO DIFERENTE
- Deve aparecer de forma clara e legível`

// IMAGEM GERADA
// → Design de flyer vertical
// → Logo original no topo
// → Texto "5 ANOS" em tipografia bold
// → Cores da marca (azul + dourado)
```

### Exemplo 3: Carrossel Instagram
```typescript
// INPUT (gerado pela IA)
{
  title: "5 Dicas para Vencer no Poker",
  cover_prompt: "Cartas de poker estilizadas, texto '5 DICAS' em destaque, cores azul e dourado, design moderno",
  slides: [
    {
      slide: 1,
      visual: "Fundo azul royal com cartas, texto 'DICA 1'",
      text: "CONHEÇA SEUS OPONENTES"
    },
    {
      slide: 2,
      visual: "Fichas empilhadas, texto 'DICA 2'",
      text: "GERENCIE SUA BANCA"
    },
    // ... slides 3-5
  ]
}

// PROCESSAMENTO
// 1. Gera cover_url a partir de cover_prompt
// 2. Para cada slide, gera image_url a partir de visual
// 3. Sobrepõe "text" na imagem gerada

// RESULTADO
// → 5 imagens consistentes visualmente
// → Mesma tipografia em todos os slides
// → Cores da marca aplicadas
// → Formato 1:1 (carrossel Instagram)
```

---

## 🛠️ API Endpoints

### Geração
```
POST /api/ai/image              Gera imagem individual
POST /api/ai/flyer              Gera flyer com logo
POST /api/ai/campaign           Gera campanha completa
POST /api/ai/video              Gera vídeo (Sora/Veo)
POST /api/ai/speech             Gera áudio TTS
```

### Utilidades
```
POST /api/ai/edit-image         Edita imagem existente
POST /api/ai/enhance-prompt     Melhora prompt do usuário
POST /api/ai/convert-prompt     Converte para JSON estruturado
POST /api/ai/extract-colors     Extrai cores de logo
```

---

## ✅ Checklist de Qualidade

### Antes de Gerar
- [ ] BrandProfile completo (nome, cores, tom)
- [ ] Prompt específico (não genérico)
- [ ] AspectRatio correto para a plataforma
- [ ] ImageSize adequado (2K padrão, 4K para alta qualidade)
- [ ] Referências visuais anexadas (se necessário)

### Durante Geração
- [ ] Enriquecimento de prompt (buildImagePrompt)
- [ ] Cores da marca aplicadas
- [ ] Tipografia especificada (se houver texto)
- [ ] Idioma definido (Português)

### Após Geração
- [ ] Imagem alinhada com o conteúdo textual
- [ ] Cores da marca visíveis
- [ ] Qualidade satisfatória
- [ ] URL salva no database
- [ ] Metadados corretos (campaign_id, post_id, etc.)

---

## 🚨 Problemas Comuns e Soluções

### Problema: Cores erradas na imagem
**Causa:** Prompt não enfatiza cores da marca
**Solução:** Sempre incluir `Cores: ${primaryColor}, ${secondaryColor}` no prompt

### Problema: Tipografia inconsistente
**Causa:** IA escolhe fontes aleatórias
**Solução:** Especificar `fonte BOLD CONDENSED SANS-SERIF, estilo Bebas Neue` no prompt

### Problema: Logo distorcido
**Causa:** IA tenta recriar o logo
**Solução:** Incluir `Use o LOGO EXATO fornecido - NÃO CRIE UM LOGO DIFERENTE`

### Problema: Aspect ratio incorreto
**Causa:** Mapeamento falhou
**Solução:** Usar `mapAspectRatio()` para validar antes de enviar

### Problema: Erro 503 (Gemini overloaded)
**Causa:** Sobrecarga temporária
**Solução:** Sistema aplica retry automático com backoff exponencial

---

## 📈 Métricas de Performance

### Latências Típicas
- **Texto (Campanha):** 5-15s (Gemini Flash) | 10-30s (GPT-5.2)
- **Imagem 2K:** 8-20s
- **Imagem 4K:** 15-40s
- **Vídeo 5s:** 30-120s (Sora) | 20-60s (Veo)
- **Áudio TTS:** 2-5s

### Custos Aproximados (por geração)
- **Gemini Flash (Texto):** $0.001 - $0.005
- **Gemini Pro (Texto):** $0.005 - $0.02
- **Gemini Image:** $0.02 - $0.10
- **GPT-5.2:** $0.10 - $0.50
- **Sora 2 (Vídeo):** $0.50 - $2.00

---

## 🔗 Links Úteis

- **Documentação Completa:** `docs/ARCHITECTURE-IMAGE-GENERATION.md`
- **Configuração de Modelos:** `src/config/ai-models.ts`
- **Exemplos de Prompts:** `src/ai-prompts/`
- **Código Backend:** `server/index.mjs`

---

**Preparado por:** Claude Code (Senior Architect)
**Última Atualização:** 2026-01-15
