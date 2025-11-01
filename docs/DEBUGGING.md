# Guia de Depuração do DirectorAi

Este documento fornece orientações para depurar a aplicação DirectorAi, desde o fluxo de estado do React até as chamadas à API do Gemini.

## 1. Gerenciamento de Estado Principal

O coração da aplicação é o componente `App.tsx`. Ele atua como o principal contêiner de estado, gerenciando os dados mais importantes e passando-os para os componentes filhos através de props.

### Estados-Chave em `App.tsx`:

-   `brandProfile`: Armazena os dados da marca do usuário (nome, logo, cores, etc.). É carregado do `localStorage` na inicialização.
-   `campaign`: Contém os resultados da campanha de marketing gerada pela IA. É `null` até que uma campanha seja gerada com sucesso.
-   `galleryImages`: Um array com todas as imagens que o usuário gerou e salvou. Também é persistido no `localStorage`.
-   `tournamentEvents`, `flyerState`, `dailyFlyerState`: Gerenciam os dados e os flyers gerados para a funcionalidade do Gerador de Flyers.
-   `chatHistory`: Mantém o histórico da conversa com o Assistente de IA.

### Fluxo de Dados

O fluxo de dados é estritamente unidirecional (de cima para baixo):

1.  `App.tsx` mantém o estado.
2.  O estado é passado para o `Dashboard.tsx`.
3.  O `Dashboard.tsx` passa os dados relevantes para as abas ativas (ex: `ClipsTab.tsx`) ou outras visualizações (ex: `FlyerGenerator.tsx`).
4.  Funções para modificar o estado (ex: `handleGenerate`, `onAddImageToGallery`) também são passadas de `App.tsx` para baixo, permitindo que os componentes filhos solicitem alterações no estado central.

## 2. Depurando Chamadas à API de IA

Toda a comunicação com as APIs do Gemini está centralizada nos arquivos da pasta `/services`.

-   `geminiService.ts`: Contém a lógica para gerar campanhas, imagens, vídeos e áudio.
-   `assistantService.ts`: Gerencia a conversa com o Assistente de IA, incluindo o uso de ferramentas.

### Passos para Depuração:

1.  **Inspecione o Prompt:** A maneira mais eficaz de depurar é verificar exatamente o que está sendo enviado para a IA. Antes de qualquer chamada `await ai.models.generateContent(...)` ou similar, adicione um `console.log()` para inspecionar o prompt completo ou o objeto `contents`.

    ```typescript
    // Exemplo em geminiService.ts -> generateImage
    const fullPrompt = `**PROMPT:** ${prompt}...`;
    console.log("Enviando para a IA de Imagem:", fullPrompt); // Adicione esta linha
    
    const response = await ai.models.generateImages(...);
    ```

2.  **Verifique a Resposta da API:** Faça o log da resposta bruta da API para ver o que a IA está retornando. Para respostas em JSON, isso pode ajudar a identificar se o formato está quebrado.

    ```typescript
    // Exemplo em geminiService.ts -> generateCampaign
    const response = await ai.models.generateContent(...);
    console.log("Resposta da IA (bruta):", response.text); // Adicione esta linha

    const jsonText = response.text.trim();
    const campaignData = JSON.parse(jsonText);
    ```

3.  **Use a Aba de Rede (Network):** Abra as ferramentas de desenvolvedor do seu navegador e vá para a aba "Network". Você pode filtrar pelas chamadas para a API do Google (geralmente contendo `generativelanguage.googleapis.com`) para ver a requisição completa, os headers e a resposta.

### Erros Comuns:

-   **Erro de Chave de API:** Se você vir erros `401` ou `403`, sua `API_KEY` provavelmente está inválida ou faltando. Lembre-se que para o Veo (vídeo), uma chave de API específica com faturamento habilitado é necessária.
-   **Erro de Schema (JSON):** Se a IA retornar um JSON que não corresponde ao `responseSchema` definido, a chamada falhará. Verifique o prompt para ter certeza de que as instruções são claras o suficiente para que a IA siga o formato.
-   **Limite de Tokens Excedido:** Ocorre quando o prompt, o histórico da conversa ou as imagens são muito grandes. A aplicação tenta mitigar isso redimensionando imagens para o chat, mas pode acontecer. A mensagem de erro geralmente indica "token count exceeds".

## 3. Depurando Componentes da Interface (UI)

-   **React DevTools:** Use a extensão React DevTools no seu navegador. Ela permite inspecionar a árvore de componentes, ver as `props` que cada um recebe e verificar seu `state`. É a melhor maneira de entender por que um componente não está renderizando como esperado.
-   **Verifique as Props:** Se um componente não está se comportando corretamente, o primeiro passo é verificar as props que ele está recebendo no React DevTools. Por exemplo, se uma imagem não aparece no `PostsTab`, verifique se as props `posts` e `brandProfile` estão sendo passadas corretamente do `Dashboard.tsx`.

## 4. Problemas Comuns e Soluções

-   **Imagens não geram ou não aparecem:**
    -   Verifique o console por erros da `geminiService.ts`.
    -   Certifique-se de que os dados base64 da imagem estão sendo formatados corretamente (`data:image/png;base64,...`).
    -   Verifique o `localStorage` no seu navegador (em Application -> Local Storage) para ver se não excedeu a cota, o que impediria o salvamento na galeria.

-   **O Assistente não responde ou não usa a ferramenta certa:**
    -   Verifique o `systemInstruction` em `assistantService.ts`. Ele é a principal diretriz para o comportamento do assistente.
    -   Faça o `console.log` do `history` enviado para a função `runAssistantConversationStream` para ver o contexto que a IA está recebendo.
    -   Verifique se a lógica de chamada de função em `App.tsx` (`executeTool`) está correta.

-   **Estilos do Tailwind CSS não aplicando:**
    -   Certifique-se de que o nome da classe está correto.
    -   Lembre-se que as cores customizadas (ex: `bg-primary`) são definidas no `tailwind.config` dentro do `index.html`. Verifique se as variáveis CSS (`--color-primary`, etc.) estão definidas corretamente.
