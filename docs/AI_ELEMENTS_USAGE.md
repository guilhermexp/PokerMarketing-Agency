# AI Elements - Guia de Uso

## Visão Geral

Este projeto utiliza **ai-elements** da Vercel, uma biblioteca oficial de componentes UI para o AI SDK. Esses componentes foram refatorados para substituir componentes customizados, reduzindo manutenção duplicada e alinhando com padrões da comunidade.

## Componentes Oficiais Instalados

### Message Components
- `Message` - Container principal de mensagem
- `MessageContent` - Conteúdo da mensagem
- `MessageActions` - Container de ações
- `MessageAction` - Ação individual (botão)
- `MessageResponse` - Renderizador de resposta (usa Streamdown)
- `MessageAttachment` - Anexos de mensagem
- `MessageBranch` - Navegação entre branches de conversa

### Tool Components
- `Tool` - Container principal de tool (Collapsible)
- `ToolHeader` - Cabeçalho com título e status badge
- `ToolContent` - Conteúdo colapsável
- `ToolInput` - Preview de parâmetros de entrada
- `ToolOutput` - Resultado da execução

### Confirmation Components
- `Confirmation` - Container de confirmação
- `ConfirmationRequest` - Solicitação de aprovação
- `ConfirmationActions` - Container de botões
- `ConfirmationAction` - Botão de ação
- `ConfirmationAccepted` - Feedback de aprovação
- `ConfirmationRejected` - Feedback de rejeição

### Loader Component
- `Loader` - Spinner animado oficial

### Prompt Input Components
- `PromptInput` - Input de prompt completo
- `PromptInputTextarea` - Textarea customizada
- `PromptInputSubmit` - Botão de envio

## Componentes Customizados (Extensões)

### ToolDisplay
**Localização**: `src/components/assistant/ToolDisplay.tsx`

Componente focado apenas em **exibir informações** da tool usando componentes ai-elements oficiais.

**Características**:
- Usa `<Tool>`, `<ToolHeader>`, `<ToolContent>`, `<ToolInput>` oficiais
- Mostra parâmetros, ações, estimativas
- Separação clara de responsabilidades (display vs approval)

**Exemplo**:
```tsx
<ToolDisplay
  toolName="createImage"
  args={{ description: "...", aspectRatio: "16:9" }}
  metadata={{
    title: "Criar Imagem",
    estimatedTime: "15-30 segundos",
    willDo: ["Gerar imagem com IA", "Salvar na galeria"]
  }}
/>
```

### ToolApproval
**Localização**: `src/components/assistant/ToolApproval.tsx`

Componente focado apenas em **aprovação/negação** usando `<Confirmation>` oficial.

**Características**:
- Usa `<Confirmation>`, `<ConfirmationRequest>`, `<ConfirmationActions>` oficiais
- Botões: Aprovar, Negar, Sempre permitir
- Feedback visual de aprovação/rejeição

**Exemplo**:
```tsx
<ToolApproval
  approvalId="abc123"
  toolName="createImage"
  onApprove={handleApprove}
  onDeny={handleDeny}
  onAlwaysAllow={(toolName) => console.log('Always allow:', toolName)}
/>
```

### ToolWithApproval
**Localização**: `src/components/assistant/ToolWithApproval.tsx`

Componente composto que combina `ToolDisplay` + `ToolApproval` para fornecer o fluxo completo de aprovação.

**Características**:
- Mostra preview da tool
- Mostra UI de aprovação quando necessário
- Indicadores de status (executing, complete, denied)

**Exemplo**:
```tsx
<ToolWithApproval
  toolCallId="abc123"
  toolName="createImage"
  args={{ description: "...", aspectRatio: "16:9" }}
  metadata={{
    title: "Criar Imagem",
    estimatedTime: "15-30 segundos"
  }}
  state="approval-requested"
  approvalId="approval-123"
  onApprove={handleApprove}
  onDeny={handleDeny}
/>
```

### MessageActionsEnhanced
**Localização**: `src/components/assistant/MessageActionsEnhanced.tsx`

Estende `MessageActions` oficial com ações customizadas.

**Características**:
- Usa `<MessageActions>`, `<MessageAction>` oficiais como base
- Ações built-in: Copiar, Copiar como código
- Ações customizadas: Compartilhar, Pin, Fork
- Toast de feedback integrado

**Exemplo**:
```tsx
<MessageActionsEnhanced
  messageId="msg-123"
  content="Texto da mensagem..."
  chatId="chat-456"
  onPin={(id) => console.log('Pin:', id)}
  onFork={(id) => console.log('Fork:', id)}
/>
```

### LoadingIndicatorEnhanced
**Localização**: `src/components/assistant/LoadingIndicatorEnhanced.tsx`

Wrapper de `Loader` oficial com sistema de stages e skeleton placeholders.

**Características**:
- Usa `<Loader>` oficial
- Stage awareness (thinking → generating → processing)
- Skeleton placeholders customizados
- Mensagens contextuais

**Exemplo**:
```tsx
// Loading básico
<LoadingIndicatorEnhanced />

// Com stage específico
<LoadingIndicatorEnhanced stage="thinking" />

// Com mensagem customizada
<LoadingIndicatorEnhanced message="Analisando imagem..." />

// Sem skeleton
<LoadingIndicatorEnhanced stage="processing" showSkeleton={false} />
```

## Como Adicionar Novos Componentes

Para instalar novos componentes ai-elements:

```bash
# Listar componentes disponíveis
bunx ai-elements@latest list

# Instalar um componente específico
echo "y" | bunx ai-elements@latest add <component-name>
```

**Exemplos**:
```bash
echo "y" | bunx ai-elements@latest add message
echo "y" | bunx ai-elements@latest add tool
echo "y" | bunx ai-elements@latest add confirmation
echo "y" | bunx ai-elements@latest add loader
echo "y" | bunx ai-elements@latest add prompt-input
```

## Arquitetura

### Componentes Substituídos

| Componente Antigo | Componente Novo | Status |
|-------------------|-----------------|--------|
| `ToolPreview.tsx` | `ToolWithApproval.tsx` + `ToolDisplay.tsx` + `ToolApproval.tsx` | ✅ Refatorado |
| `MessageActions.tsx` | `MessageActionsEnhanced.tsx` | ✅ Refatorado |
| `LoadingIndicator.tsx` | `LoadingIndicatorEnhanced.tsx` | ✅ Refatorado |

### Componentes Mantidos Intactos

Esses componentes **não foram alterados** pois fornecem funcionalidades superiores ou customizadas específicas do projeto:

- `MessageResponse.tsx` - Usa Streamdown para streaming progressivo
- `DataStreamProvider.tsx` - Eventos customizados necessários
- `DataStreamHandler.tsx` - Lógica de processamento de events
- `useChatImageSync.ts` - Sincronização de imagens funciona independentemente

## Estrutura de Diretórios

```
src/
├── components/
│   ├── ai-elements/           # Componentes oficiais instalados via CLI
│   │   ├── message.tsx
│   │   ├── tool.tsx
│   │   ├── confirmation.tsx
│   │   ├── loader.tsx
│   │   ├── code-block.tsx
│   │   └── prompt-input.tsx
│   ├── ui/                    # Componentes shadcn/ui (instalados automaticamente)
│   │   ├── button.tsx
│   │   ├── alert.tsx
│   │   ├── tooltip.tsx
│   │   └── ...
│   └── assistant/             # Componentes customizados do projeto
│       ├── ToolDisplay.tsx
│       ├── ToolApproval.tsx
│       ├── ToolWithApproval.tsx
│       ├── MessageActionsEnhanced.tsx
│       ├── LoadingIndicatorEnhanced.tsx
│       ├── MessageResponse.tsx
│       ├── DataStreamProvider.tsx
│       └── DataStreamHandler.tsx
└── lib/
    └── utils.ts               # Utility functions (cn, etc)
```

## Troubleshooting

### "Cannot find module @/components/ai-elements/..."

**Solução**: Verifique que os componentes foram instalados corretamente com `bunx ai-elements add`.

### "Tailwind classes not working"

**Solução**: Confirme que `components.json` está configurado e Tailwind v4 é compatível.

### Erros de TypeScript com "icon-sm"

**Problema conhecido**: Alguns componentes ai-elements usam `size="icon-sm"` que pode não estar definido em versões mais antigas do Button.

**Solução**: Atualizar `src/components/ui/button.tsx` para incluir a variante `icon-sm`, ou usar `size="icon"` como fallback.

### Unused @ts-expect-error directives

**Problema**: Componentes ai-elements podem incluir `@ts-expect-error` para compatibilidade com AI SDK v6, mas já estão resolvidos.

**Solução**: Esses avisos podem ser ignorados ou removidos manualmente dos arquivos em `src/components/ai-elements/`.

## Vantagens da Migração

1. **Manutenibilidade** - Componentes oficiais recebem updates da Vercel
2. **Consistência** - Padrões estabelecidos pela comunidade AI SDK
3. **Features Gratuitas** - Accessibility, keyboard navigation, ARIA built-in
4. **Customização** - Componentes copiados para projeto (não npm), podem ser modificados
5. **Documentação** - Docs oficiais + exemplos da comunidade
6. **Integração Nativa** - Projetado especificamente para useChat/useCompletion
7. **Menos Bugs** - Código testado por milhares de devs na comunidade
8. **Separação de Responsabilidades** - Tool vs Confirmation, Display vs Approval

## Referências

- [AI Elements - Official Repository](https://github.com/vercel/ai-elements)
- [AI SDK Documentation](https://ai-sdk.dev/docs)
- [Introducing AI Elements - Vercel](https://vercel.com/changelog/introducing-ai-elements)
- [Tool Component](https://ai-sdk.dev/elements/components/tool)
- [Confirmation Component](https://ai-sdk.dev/elements/components/confirmation)
- [Message Component](https://ai-sdk.dev/elements/components/message)
