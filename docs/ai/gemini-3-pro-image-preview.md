# Gemini 3 Pro Image Preview (Nano Banana Pro) — Documentação Completa

## Visão Geral

**Gemini 3 Pro Image Preview** (também chamado de **Nano Banana Pro**) é o modelo mais avançado do Gemini para geração e edição de imagens profissionais. Ele foi projetado para seguir instruções complexas, renderizar texto com alta fidelidade e produzir recursos de marketing em alta resolução (1K, 2K, 4K).

**Características principais**
- Geração de imagem (text-to-image)
- Edição de imagem (image-to-image)
- Resolução de até 4K
- Renderização avançada de texto
- Suporte a múltiplas imagens de referência (até 14 no total)
- Raciocínio interno ("pensamento") para composições complexas
- Marca d'água SynthID em todas as imagens

---

## Modelos e Identificadores

- **Modelo:** `gemini-3-pro-image-preview`
- **Categoria:** imagem (geração + edição)
- **Provider:** Google Gemini (via API REST ou SDK `@google/genai`)

---

## Capacidades

### 1) Geração de imagens (Text → Image)
Cria imagens a partir de descrições textuais detalhadas. Ideal para branding, assets, anúncios e conteúdo visual profissional.

### 2) Edição de imagens (Image + Text → Image)
Permite alterar uma imagem existente com instruções textuais (adicionar, remover, modificar elementos, trocar estilo e cor, etc).

### 3) Fluxo multi-etapas (Chat)
O modelo funciona muito bem em sequência de edições: gerar → ajustar → refinar. O fluxo multi-turnos é o modo recomendado para iterar sobre imagens.

---

## Parâmetros e Configurações

### Modos de Resposta
Por padrão o Gemini retorna **texto + imagem**. É possível limitar para **apenas imagens**:

```js
config: {
  response_modalities: ['Image']
}
```

### Aspect Ratio
As proporções suportadas:

```
"1:1", "2:3", "3:2", "3:4", "4:3",
"4:5", "5:4", "9:16", "16:9", "21:9"
```

### Resoluções
- **1K** (padrão)
- **2K**
- **4K**

> Importante: use `1K`, `2K`, `4K` com **K maiúsculo**. (`1k` é inválido)

### Tabela de Resoluções e Tokens

| Aspect Ratio | 1K (px)     | Tokens | 2K (px)     | Tokens | 4K (px)     | Tokens |
|--------------|-------------|--------|-------------|--------|-------------|--------|
| 1:1          | 1024x1024   | 1120   | 2048x2048   | 1120   | 4096x4096   | 2000   |
| 2:3          | 848x1264    | 1120   | 1696x2528   | 1120   | 3392x5056   | 2000   |
| 3:2          | 1264x848    | 1120   | 2528x1696   | 1120   | 5056x3392   | 2000   |
| 3:4          | 896x1200    | 1120   | 1792x2400   | 1120   | 3584x4800   | 2000   |
| 4:3          | 1200x896    | 1120   | 2400x1792   | 1120   | 4800x3584   | 2000   |
| 4:5          | 928x1152    | 1120   | 1856x2304   | 1120   | 3712x4608   | 2000   |
| 5:4          | 1152x928    | 1120   | 2304x1856   | 1120   | 4608x3712   | 2000   |
| 9:16         | 768x1376    | 1120   | 1536x2752   | 1120   | 3072x5504   | 2000   |
| 16:9         | 1376x768    | 1120   | 2752x1536   | 1120   | 5504x3072   | 2000   |
| 21:9         | 1584x672    | 1120   | 3168x1344   | 1120   | 6336x2688   | 2000   |

---

## Exemplos REST/Node.js

### Geração de Imagem (Text → Image)

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: "Minimalist logo for a skincare brand, soft colors" }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      }
    })
  }
);

const data = await response.json();

// Extrair imagem da resposta
const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
const base64Image = imagePart?.inlineData?.data;
```

### Envio de Imagem em Base64 (para análise ou edição)

```javascript
// Converter arquivo para base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    resolve({ base64, mimeType: file.type });
  };
  reader.onerror = error => reject(error);
});

// Uso: análise de cores do logo
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Analise este logo e extraia as cores em JSON" },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image  // Sem prefixo data:image...
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            primaryColor: { type: "STRING" },
            secondaryColor: { type: "STRING" },
            tertiaryColor: { type: "STRING" }
          }
        }
      }
    })
  }
);

const colors = await response.json();
// { primaryColor: "#E53935", secondaryColor: "#1A1A1A", tertiaryColor: null }
```

### Edição de Imagem (Image + Text → Image)

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Add a party hat to the dog, keep everything else unchanged" },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      }
    })
  }
);
```

### Múltiplas Imagens de Referência (até 14)

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Group photo of these people in an office setting" },
          // Até 5 imagens de humanos para consistência de personagem
          // Até 14 imagens total (humanos + objetos)
          { inlineData: { mimeType: "image/png", data: base64Person1 } },
          { inlineData: { mimeType: "image/png", data: base64Person2 } },
          { inlineData: { mimeType: "image/png", data: base64Person3 } },
          { inlineData: { mimeType: "image/png", data: base64Person4 } },
          { inlineData: { mimeType: "image/png", data: base64Person5 } }
        ]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "5:4",
          imageSize: "2K"
        }
      }
    })
  }
);
```

### Resposta JSON com Schema

```javascript
// Útil para extrair dados estruturados de imagens
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Descreva os elementos desta imagem em JSON estruturado" },
          { inlineData: { mimeType: "image/png", data: base64Image } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            objetos: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            cores_predominantes: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            estilo: { type: "STRING" }
          }
        }
      }
    })
  }
);
```

### Inpainting (Edição com Máscara)

O Gemini suporta **inpainting** - edição de uma área específica da imagem usando uma máscara binária.

**Formato da máscara:**
- Preto ou transparente = área será editada/regenerada
- Branco = área será preservada
- Deve ser uma imagem PNG do mesmo tamanho que a imagem original

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Add a red rose in this area" },
          { inlineData: { mimeType: "image/png", data: base64Image } }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K",
          mask: {
            image: {
              inlineData: {
                mimeType: "image/png",
                data: base64Mask  // Preto=editar, Branco=preservar
              }
            }
          }
        }
      }
    })
  }
);
```

**Dicas para máscara:**
- Use o mesmo tamanho da imagem original
- PNG com transparência funciona bem
- Áreas pretas = serão substituídas
- Áreas brancas = serão mantidas intactas

---

## Multi-turn / Edição em Etapas

### Exemplo (Chat)
```javascript
const chat = ai.chats.create({
  model: "gemini-3-pro-image-preview",
  config: {
    responseModalities: ["TEXT", "IMAGE"]
  }
});

const response1 = await chat.sendMessage("Crie um infográfico colorido sobre fotossíntese");
const response2 = await chat.sendMessage("Atualize o infográfico para espanhol");
```

> **Importante:** Em chats multi-turn, reenvie a `thought_signature` exatamente como veio quando mandar o histórico de volta. Se não circular a assinatura, a resposta pode falhar. Os SDKs oficiais gerenciam isso automaticamente.

---

## Pensamento e Assinaturas de Pensamento

### Acessando os "Thoughts"
O modelo pode retornar partes marcadas com `thought=true`, incluindo texto e imagens provisórias:

```javascript
for (const part of response.parts) {
  if (part.thought) {
    if (part.text) console.log("Thought:", part.text);
    if (part.inlineData) {
      // Imagem de pensamento (não cobrada, útil para debug)
      saveThoughtImage(part.inlineData);
    }
  }
}
```

- Imagens em `thought=true` não são cobradas
- Ajudam a inspecionar o processo de raciocínio visual

### thought_signature
Todas as respostas incluem um campo `thought_signature`.

**Regras:**
- Todas as `inlineData` com mime_type de imagem que fazem parte da resposta final precisam de assinatura
- A primeira parte de texto não-thought após os pensamentos também recebe assinatura
- Partes dentro de `thought=true` não têm assinatura

---

## Grounding com Google Search

Para gerar imagens baseadas em informação em tempo real:

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: "Weather forecast chart for SF next 5 days" }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      },
      tools: [{ google_search: {} }]  // Grounding em tempo real
    })
  }
);

// A resposta inclui groundingMetadata com:
// - searchEntryPoint: HTML/CSS de sugestões de pesquisa
// - groundingChunks: top 3 fontes usadas
```

---

## Múltiplas Imagens de Referência

O modelo aceita **até 14 imagens** como referência:
- Até **6 imagens** de objetos com alta fidelidade
- Até **5 imagens** de humanos para consistência de personagem
- Total máximo: 14 imagens

Ideal para composições complexas e consistência de personagens.

---

## Geração em Lote (Batch API)

Para gerar muitas imagens de uma vez:

```javascript
// Usa a Batch API para ganhar limites de taxa mais altos
// Em troca de latência de até 24h
```

> **Nota:** A Batch API oferece limites de taxa mais altos em troca de latência de até 24h.

---

## Limitações e Boas Práticas

### Limitações
- Não aceita áudio ou vídeo
- Idiomas com melhor desempenho: EN, ar-EG, de-DE, es-MX, fr-FR, hi-IN, id-ID, it-IT, ja-JP, ko-KR, pt-BR, ru-RU, ua-UA, vi-VN, zh-CN
- Pode não seguir exatamente o número de imagens solicitado
- Todas as imagens retornadas possuem watermark **SynthID**

### Erros Comuns

| Código | Causa |
|--------|-------|
| 400 INVALID_ARGUMENT | Imagem inválida, base64 malformado, ou MIME incorreto |
| 500 INTERNAL_SERVER_ERROR | Modelo retorna saída sem imagem válida |
| 429 RATE_LIMIT_EXCEEDED | Limite de requisições atingido |

### Boas Práticas
- Seja específico (ambiente, iluminação, estilo, câmera)
- Contextualize intenção ("design de anúncio", "capa de campanha")
- Itere em passos curtos
- Use comandos positivos (ex: "rua vazia" vs "sem carros")

### Padrões de Prompt Úteis

**Cenas fotorrealistas:**
```
"A photorealistic [shot type] of [subject] ... captured with a [camera/lens] ..."
```

**Ilustrações/adesivos:**
```
"A [style] sticker of a [subject] ... background must be transparent."
```

**Texto preciso em imagens:**
```
"Create a [image type] for [brand] with the text [texto] in a [font style] ..."
```

**Produto/comercial:**
```
"A high-resolution, studio-lit product photograph of [produto] on [background] ..."
```

**Minimalismo:**
```
"A minimalist composition featuring a single [subject] positioned in [posição] ..."
```

---

## Quando Usar Este Modelo vs Outros

| Modelo | Quando Usar |
|--------|-------------|
| **gemini-3-pro-image-preview** | Resolução até 4K, texto nítido, prompts complexos, multi-turn |
| **gemini-2.5-flash-image** | Volume alto, baixa latência, resolução 1024px suficiente |
| **Imagen 4 / Imagen 4 Ultra** | Altíssima qualidade especializada, uma imagem por vez |

---

## Referências

- Gemini API Docs: https://ai.google.dev/gemini-api/docs
- Troubleshooting Gemini Image: https://developers.generativeai.google/guide/troubleshooting
- Cookbook: https://github.com/google/generative-ai-docs
