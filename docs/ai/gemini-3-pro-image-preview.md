# Gemini 3 Pro Image Preview (Nano Banana Pro) — Documentação Completa

## Visão Geral

**Gemini 3 Pro Image Preview** (também chamado de **Nano Banana Pro**) é o modelo mais avançado do Gemini para geração e edição de imagens profissionais. Ele foi projetado para seguir instruções complexas, renderizar texto com alta fidelidade e produzir recursos de marketing em alta resolução (1K, 2K, 4K).

**Características principais**
- Geração de imagem (text-to-image)
- Edição de imagem (image-to-image)
- Resolução de até 4K
- Renderização avançada de texto
- Suporte a múltiplas imagens de referência (até 14 no total)
- Raciocínio interno (“pensamento”) para composições complexas
- Marca d’água SynthID em todas as imagens

---

## Modelos e Identificadores

- **Modelo:** `gemini-3-pro-image-preview`
- **Categoria:** imagem (geração + edição)
- **Provider:** Google Gemini (via SDK `@google/genai`)

---

## Capacidades

### 1) Geração de imagens (Text → Image)
Cria imagens a partir de descrições textuais detalhadas. Ideal para branding, assets, anúncios e conteúdo visual profissional.

### 2) Edição de imagens (Image + Text → Image)
Permite alterar uma imagem existente com instruções textuais (adicionar, remover, modificar elementos, trocar estilo e cor, etc).

### 3) Fluxo multi‑etapas (Chat)
O modelo funciona muito bem em sequência de edições: gerar → ajustar → refinar. O fluxo multi‑turnos é o modo recomendado para iterar sobre imagens.

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

---

## Exemplo: Geração de Imagem (Text → Image)

### JavaScript (SDK)
```js
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const prompt = "Create a picture of a nano banana dish in a fancy restaurant";

const response = await ai.models.generateContent({
  model: "gemini-3-pro-image-preview",
  contents: [{ text: prompt }],
  config: {
    imageConfig: {
      aspectRatio: "1:1",
      imageSize: "1K"
    }
  }
});
```

---

## Exemplo: Edição de Imagem (Image + Text → Image)

### JavaScript (SDK)
```js
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const prompt = "Adicione um chapéu de festa ao cachorro";

const response = await ai.models.generateContent({
  model: "gemini-3-pro-image-preview",
  contents: [
    { text: prompt },
    {
      inlineData: {
        data: base64Image,
        mimeType: "image/png"
      }
    }
  ],
  config: {
    imageConfig: {
      aspectRatio: "auto",
      imageSize: "1K"
    }
  }
});
```

---

## Multi‑turn / Edição em Etapas

### Exemplo (Chat)
```js
const chat = ai.chats.create({
  model: "gemini-3-pro-image-preview",
  config: {
    responseModalities: ["TEXT", "IMAGE"]
  }
});

const response1 = await chat.sendMessage("Crie um infográfico colorido sobre fotossíntese");
const response2 = await chat.sendMessage("Atualize o infográfico para espanhol");
```

---

## Múltiplas Imagens de Referência

O modelo aceita **até 14 imagens** como referência (com maior fidelidade em até 6 objetos + 5 humanos). Ideal para composições complexas e consistência de personagens.

---

## Limitações e Boas Práticas

### Limitações
- Não aceita áudio ou vídeo
- Texto complexo funciona melhor com descrições claras e diretas
- Pode ignorar o número exato de imagens solicitadas
- Todas as imagens retornadas possuem watermark **SynthID**

### Boas Práticas
- Seja específico (ambiente, iluminação, estilo, câmera)
- Contextualize intenção (“design de anúncio”, “capa de campanha”)
- Itere em passos curtos
- Use comandos positivos (ex: “rua vazia” vs “sem carros”)

---

## Erros Comuns

### 400 INVALID_ARGUMENT
- Normalmente causado por imagem inválida, base64 malformado, ou MIME incorreto.

### 500 INTERNAL_SERVER_ERROR
- Pode ocorrer quando o modelo retorna saída sem imagem válida ou falha interna.

---

## Referências

- Gemini API Docs: https://ai.google.dev/gemini-api/docs
- Troubleshooting Gemini Image: https://developers.generativeai.google/guide/troubleshooting
