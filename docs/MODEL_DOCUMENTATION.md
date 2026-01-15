# Documentação dos Modelos de Geração e Edição de Imagem

Este documento serve como um guia para desenvolvedores entenderem como os diferentes modelos de IA para manipulação de imagens são integrados e utilizados na aplicação DirectorAi.

## Visão Geral da Arquitetura

Toda a lógica de interação com as APIs de imagem está centralizada no arquivo `services/geminiService.ts`. Isso garante que qualquer componente que precise gerar ou editar uma imagem utilize uma função padronizada, facilitando a manutenção.

As funções-chave são:
- `generateImage()`: Para criação de imagens a partir de um prompt de texto (Text-to-Image).
- `editImage()`: Para edições complexas em uma imagem existente.
- `createBrandedImageVariant()`: Para criar uma nova imagem baseada em uma referência, aplicando a identidade visual da marca.
- `generateFlyer()`: Uma função multimodal que pode tanto gerar uma imagem do zero quanto usar um logo e uma imagem de referência para criar um design.

---

## 1. Geração de Imagens (Text-to-Image)

Esta é a funcionalidade mais básica, usada quando uma imagem precisa ser criada puramente a partir de uma descrição textual.

### Função Principal

`generateImage(prompt: string, aspectRatio: string, model: ImageModel)`

### Modelos Suportados

A aplicação suporta dois modelos, selecionáveis pela interface do usuário através do tipo `ImageModel` (`'gemini-imagen' | 'bytedance-seedream'`).

#### a) Google Gemini (Imagen 4.0)

- **ID na Aplicação:** `gemini-imagen`
- **Modelo Real:** `imagen-4.0-generate-001`
- **Uso:** É o modelo padrão. O prompt do usuário é enriquecido com um prefixo para garantir um estilo consistente: `Imagem de marketing vibrante e de alta qualidade para um post de rede social. O estilo deve ser moderno e limpo. Assunto: ${prompt}`.
- **Quando Usar:** É a escolha principal para resultados de alta qualidade, especialmente quando se busca um estilo mais limpo e corporativo.

#### b) Bytedance Seedream 4.0

- **ID na Aplicação:** `bytedance-seedream`
- **Modelo Real:** `fal-ai/bytedance/seedream/v4/text-to-image`
- **Uso:** Utiliza a API da [Fal.ai](http://fal.ai/). Requer uma chave de API separada (`FAL_API_KEY`). O prompt também é enriquecido para guiar o modelo: `vibrant, high-quality marketing image for a social media post. clean modern style. Subject: ${prompt}`. A função também converte a URL da imagem retornada para base64.
- **Quando Usar:** Oferece um estilo visual alternativo, que pode ser mais artístico ou estilizado. É uma ótima opção para dar variedade criativa ao usuário.

### Como Modificar ou Adicionar um Novo Modelo

1.  **Atualizar o Tipo:** Adicione o novo ID do modelo ao tipo `ImageModel` em `types.ts`.
2.  **Implementar a Lógica:** Na função `generateImage` em `services/geminiService.ts`, adicione um novo bloco `if` ou `case` para lidar com a chamada à API do novo modelo.
3.  **Atualizar a UI:** Adicione a nova opção nos componentes de seletor de modelo (`ClipsTab.tsx`, `PostsTab.tsx`, `AdCreativesTab.tsx`, `FlyerGenerator.tsx`).

---

## 2. Edição e Variação de Imagens (Image-to-Image)

Para tarefas que envolvem modificar uma imagem existente ou criar uma nova a partir de referências visuais, a aplicação utiliza exclusivamente o modelo multimodal do Gemini.

### Modelo Principal

- **Modelo Real:** `gemini-2.5-flash-image-preview`
- **Importante:** Este é o **único** modelo utilizado para todas as tarefas de edição, variante e geração multimodal. Isso garante consistência e aproveita seus recursos avançados, como o entendimento de múltiplas imagens e máscaras.

### Funções e Casos de Uso

#### a) Edição Geral (`editImage`)

- **Função:** `editImage(base64ImageData, mimeType, prompt, mask?, referenceImage?)`
- **Uso:** Chamada a partir do `ImagePreviewModal.tsx`. É a função mais flexível.
- **Lógica:** Constrói um array de `parts` que pode conter:
    1.  A imagem a ser editada.
    2.  Uma máscara (opcional), que instrui o modelo a aplicar a edição apenas na área pintada.
    3.  Uma imagem de referência (opcional), para inspirar o estilo ou conteúdo da edição.
    4.  Um prompt de texto detalhado descrevendo a alteração.
- **Modificações:** Para alterar o comportamento, ajuste o `instructionPrompt` dentro da função. A ordem das `parts` é crucial e segue a documentação do Gemini.

#### b) Variação de Marca (`createBrandedImageVariant`)

- **Função:** `createBrandedImageVariant(referenceImage, brandProfile, contextPrompt)`
- **Uso:** Chamada nas abas de Posts e Anúncios quando uma imagem de referência da campanha é fornecida.
- **Lógica:** Cria um prompt extremamente detalhado que instrui o modelo a atuar como um designer de marca. Envia a imagem de referência e o logo da marca (se existir) e pede para o modelo reimaginar a imagem de referência aplicando as cores, o tom de voz e o logo da marca.
- **Modificações:** O `instructionPrompt` nesta função é a chave para a qualidade dos resultados. Ajustes finos neste prompt podem alterar drasticamente o quão bem o modelo incorpora a identidade da marca.

#### c) Geração de Flyer Multimodal (`generateFlyer`)

- **Função:** `generateFlyer(basePrompt, logo?, referenceImage?, aspectRatio, model)`
- **Uso:** Chamada a partir do `FlyerGenerator.tsx`.
- **Lógica:**
    - Se **nenhum** logo ou imagem de referência for fornecido, a função simplesmente chama `generateImage` (Text-to-Image) com o modelo selecionado pelo usuário (Gemini ou Bytedance).
    - Se um logo e/ou imagem de referência **forem fornecidos**, a função **ignora o modelo selecionado na UI e usa `gemini-2.5-flash-image-preview`**. Ela constrói um prompt multimodal que instrui o modelo a usar a imagem de referência como inspiração de estilo e a integrar o logo profissionalmente no novo design.
- **Modificações:** O `imageHandlingInstructions` dentro da função é vital. Ele instrui o modelo a não simplesmente "colar" a imagem de referência em um novo fundo, mas a criar um design completamente novo, o que é crucial para respeitar a `aspectRatio` solicitada.

## Boas Práticas e Considerações

- **Centralização:** Mantenha toda a lógica de API em `services/geminiService.ts`.
- **Tipagem:** Sempre que adicionar um novo modelo ou funcionalidade, atualize as interfaces em `types.ts`.
- **Prompts:** A qualidade da saída da IA é diretamente proporcional à qualidade dos prompts. Os prompts nas funções de serviço foram cuidadosamente elaborados. Ao modificar, seja claro, específico e forneça contexto.
- **Segurança:** A chave `FAL_API_KEY` está hardcoded. Em um ambiente de produção, ela deve ser movida para uma variável de ambiente segura.
