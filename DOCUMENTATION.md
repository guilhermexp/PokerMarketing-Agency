# 🧠 Documentação Técnica: DirectorAi (Aura Engine)

Este documento serve como o guia mestre para engenheiros e designers. Ele detalha a arquitetura, o fluxo de dados e, principalmente, as integrações de Inteligência Artificial do ecossistema **DirectorAi**.

---

## 1. Arquitetura do Sistema

O DirectorAi é uma **Single Page Application (SPA)** de alta performance focada em marketing para o nicho de poker.

*   **Core:** React 19 + TypeScript + Tailwind CSS.
*   **Engine de IA:** SDK `@google/genai` (Google Gemini API).
*   **Persistência:** 
    *   `localStorage`: Preferências leves (perfil da marca).
    *   `IndexedDB` (via `storageService.ts`): Armazenamento de ativos pesados (imagens base64) para evitar limites de cota do navegador.
*   **Fluxo de Dados:** Unidirecional (Top-Down). O `App.tsx` gerencia o estado global e despacha funções de mutação para os componentes filhos.

---

## 2. Visão Geral das Sessões

### A. Protocolo de Identidade (`BrandProfileSetup.tsx`)
Onde o "DNA" da marca é extraído.
-   **Extração Neural:** Ao subir um logo, a função `extractColorsFromLogo` (Gemini 2.5 Flash) analisa a imagem e retorna cores primárias/secundárias em Hexadecimal.
-   **Configuração de Tom:** Define o comportamento da IA (Casual, Profissional, etc.) em todas as gerações subsequentes.

### B. Daily Protocol / Gerador de Flyers (`FlyerGenerator.tsx`)
Ferramenta de automação para torneios.
-   **Entrada Multimodal:** Aceita planilhas `.xlsx`, dados manuais, imagens de referência e logos de parceria.
-   **Fusão de Ativos:** Permite enviar até 5 imagens extras (Ativos de Composição) que a IA integra organicamente ao design.
-   **Clonagem de Estilo:** Se uma `styleReference` for enviada, a IA mimetiza o layout, fontes e iluminação daquela imagem.

### C. Geração de Campanhas (`UploadForm.tsx`)
Transforma texto em ecossistema de mídia.
-   **Processamento Pro:** O `gemini-3-pro-preview` converte a transcrição em um objeto JSON complexo (scripts de vídeo, posts e anúncios).

---

## 3. Deep Dive: Configurações do Gemini 3 Pro Image

O modelo `gemini-3-pro-image-preview` é o motor de alta fidelidade do app.

### Restrições de Aspect Ratio (Proporção)
O modelo Pro é rigoroso. Para evitar erros **400 (Bad Request)**, o serviço `geminiService.ts` utiliza um mapeador:
-   Formatos aceitos: `'1:1', '9:16', '16:9', '4:3', '3:2', '4:5'`.
-   **Lógica de Proteção:** Se o usuário solicitar um formato de anúncio `1.91:1`, o sistema mapeia automaticamente para `16:9` antes de enviar à API.

### Resolução e Tamanho
-   Suporte para `1K`, `2K` e `4K`.
-   Por padrão, o app usa `1K` para balancear velocidade e custo.

### Composição Multimodal (`parts`)
Diferente de modelos simples, enviamos múltiplas `parts` no conteúdo:
1.  **Instrução de Branding:** Define regras sobre o uso do logo.
2.  **Instrução de Estilo:** Define como usar a imagem de referência.
3.  **Prompt de Texto:** O comando específico do usuário.
4.  **InlineData:** Logotipos, referências e ativos codificados em Base64.

---

## 4. A Ponte "Publicar" (Interoperabilidade)

A função `handlePublishFlyerToCampaign` em `App.tsx` é o elo entre as ferramentas:
1.  **Captura:** Pega os dados brutos do torneio e a imagem gerada no Flyer.
2.  **Injeção:** Preenche automaticamente o campo de transcrição na aba de campanhas.
3.  **Transição:** Muda a visualização para `campaign` e inicia a geração.

---

## 5. Guia de Depuração (Troubleshooting)

### Falha na Narração/Áudio
-   **Causa:** Scripts gerados com tags `[0-3s: Som de Fichas]`. O TTS (Text-to-Speech) falha ao ler marcadores técnicos.
-   **Solução:** O `ClipsTab.tsx` possui um Regex que filtra especificamente o conteúdo após a tag `Narração:` ou remove blocos entre colchetes. Se o áudio não tocar, verifique se a IA não mudou o formato da tag no prompt.
-   **Voz:** Utilizamos a voz `Zephyr`, que é a mais fluida para o português brasileiro, minimizando erros de prosódia.

### Erro "Requested entity was not found"
-   **Causa:** A Chave de API selecionada não pertence a um projeto do Google Cloud com faturamento (Billing) ativo.
-   **Solução:** O app reseta o estado `hasPayedKey` e solicita que o usuário selecione uma chave válida via `window.aistudio.openSelectKey()`.

### Erro "forced is not defined"
-   **Causa:** Variável de controle de batch no `FlyerGenerator`.
-   **Fix:** Sempre garanta que a chamada `handleGenerate(true)` passe um booleano explícito.

### Desempenho do Banco de Dados
Se as imagens pararem de ser salvas na galeria, limpe o **IndexedDB** nas ferramentas de desenvolvedor (Application -> Storage -> IndexedDB -> DirectorAi_DB).

---

## 6. Tabela de Modelos

| Funcionalidade | Modelo | Motivo |
| :--- | :--- | :--- |
| Campanhas (JSON) | `gemini-3-pro-preview` | Raciocínio lógico e estruturação. |
| Flyers/Artes Pro | `gemini-3-pro-image-preview` | Fidelidade a logos e proporções. |
| Edição Rápida | `gemini-2.5-flash-image` | Velocidade em tarefas multimodais. |
| Logos | `imagen-4.0-generate-001` | Especializado em arte vetorial/flat. |
| Vídeos | `veo-3.1-fast-generate-preview` | Consistência temporal e rapidez. |
| Voz (TTS) | `gemini-2.5-flash-preview-tts` | Qualidade humana em raw PCM (Voz: Zephyr). |

---
*DirectorAi - Aura Engine Documentation v2.5*