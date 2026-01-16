# Guia Rápido de Componentes - UI Examples

> Exemplos práticos e rápidos de uso dos componentes principais.

## Índice Rápido

1. [Markdown Rendering](#markdown-rendering) ⭐ **NOVO**
2. [Loading States](#loading-states)
3. [Tool Approval](#tool-approval)
4. [Thinking/Reasoning](#thinking--reasoning)
5. [Attachments](#attachments)
6. [Artifacts](#artifacts)
7. [Messages](#messages)
8. [Input](#input)
9. [Sidebar](#sidebar)

---

## Markdown Rendering

### 1. Renderizar Mensagem com Markdown Rico

```jsx
import { MessageResponse } from "@/components/ai-elements/message"

// Renderiza markdown progressivamente durante streaming
<MessageResponse>
  {message.content}
</MessageResponse>

// Exemplo de conteúdo:
// "Hello **world**\n\n```typescript\nconst x = 1;\n```"
```

**Resultado Visual**:
```
Hello world (em negrito)

const x = 1;  (syntax highlighting aplicado)
```

---

### 2. Usando Response Component

```jsx
import { Response } from "@/components/elements/response"

// Wrapper memoizado do Streamdown
<Response className="prose dark:prose-invert">
  {content}
</Response>
```

---

### 3. Markdown Suportado

**Texto Formatado**:
```markdown
**negrito** → negrito
*itálico* → itálico
~~riscado~~ → riscado
`code` → code inline
```

**Listas**:
```markdown
- Item 1
- Item 2

1. Primeiro
2. Segundo
```

**Code Blocks**:
````markdown
```typescript
const hello = (name: string) => {
  console.log(`Hello ${name}!`);
};
```
````

**Links e Imagens**:
```markdown
[Link](https://example.com)
![Image](https://example.com/image.png)
```

**Blockquotes**:
```markdown
> This is a quote
> with multiple lines
```

**Tabelas**:
```markdown
| Col 1 | Col 2 |
|-------|-------|
| A     | B     |
```

---

### 4. Exemplo Completo: Chat com Markdown

```tsx
"use client";

import { useChat } from "ai/react";
import { MessageResponse } from "@/components/ai-elements/message";

export function Chat() {
  const { messages, input, setInput, handleSubmit } = useChat();

  return (
    <div className="flex flex-col gap-4">
      {/* Mensagens */}
      {messages.map((message) => (
        <div
          key={message.id}
          className={message.role === "user" ? "ml-auto" : ""}
        >
          {message.role === "assistant" ? (
            // ✅ Renderiza markdown rico
            <MessageResponse>{message.content}</MessageResponse>
          ) : (
            // Usuário: texto simples
            <p>{message.content}</p>
          )}
        </div>
      ))}

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

---

### 5. Customizando Estilos

**Usando Tailwind Prose**:
```tsx
<MessageResponse className="prose prose-sm dark:prose-invert max-w-none">
  {content}
</MessageResponse>
```

**CSS Global** (app/globals.css):
```css
/* Code blocks */
.markdown-content pre {
  @apply rounded-lg bg-zinc-900 p-4 overflow-x-auto;
}

/* Code inline */
.markdown-content code:not(pre code) {
  @apply rounded bg-zinc-100 px-1 py-0.5 text-sm dark:bg-zinc-800;
}

/* Links */
.markdown-content a {
  @apply text-blue-500 underline hover:text-blue-700;
}

/* Headings */
.markdown-content h1 {
  @apply text-3xl font-bold mb-4 mt-6;
}

.markdown-content h2 {
  @apply text-2xl font-semibold mb-3 mt-5;
}

/* Blockquotes */
.markdown-content blockquote {
  @apply border-l-4 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400;
}

/* Lists */
.markdown-content ul {
  @apply list-disc pl-6 space-y-1;
}

.markdown-content ol {
  @apply list-decimal pl-6 space-y-1;
}

/* Tables */
.markdown-content table {
  @apply border-collapse w-full;
}

.markdown-content th {
  @apply border border-zinc-300 bg-zinc-100 px-4 py-2 text-left dark:border-zinc-700 dark:bg-zinc-800;
}

.markdown-content td {
  @apply border border-zinc-300 px-4 py-2 dark:border-zinc-700;
}
```

---

### 6. Performance: Memoização

```tsx
// MessageResponse já está memoizado internamente
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown {...props} />
  ),
  // ⚡ Só re-renderiza se conteúdo mudar
  (prevProps, nextProps) => prevProps.children === nextProps.children
);
```

**Benefícios**:
- ✅ Re-renders mínimos
- ✅ Smooth streaming
- ✅ Baixo uso de CPU

---

### 7. Fluxo de Streaming Visual

```
Backend                Frontend
─────────             ─────────

"Hello"        →      Hello
"Hello **w"    →      Hello w
"Hello **wo"   →      Hello wo
"Hello **wor"  →      Hello wor
"Hello **world"→      Hello world
"Hello **world**" →   Hello world (negrito aplicado!)
```

**Renderização Progressiva**:
- ✅ Texto aparece em tempo real
- ✅ Markdown é parseado on-the-fly
- ✅ Sem lag ou flickering

---

### 8. Exemplo: Streamdown com Classes Customizadas

```tsx
<MessageResponse
  className={cn(
    // Remove margens desnecessárias
    "[&>*:first-child]:mt-0",
    "[&>*:last-child]:mb-0",

    // Code inline quebra linha
    "[&_code]:whitespace-pre-wrap",
    "[&_code]:break-words",

    // Code blocks com scroll
    "[&_pre]:max-w-full",
    "[&_pre]:overflow-x-auto",

    // Espaçamento entre elementos
    "[&>*+*]:mt-4"
  )}
>
  {content}
</MessageResponse>
```

---

### 9. Troubleshooting

**Problema**: Markdown não renderiza
```tsx
// ❌ Errado
<p>{message.content}</p>

// ✅ Correto
<MessageResponse>{message.content}</MessageResponse>
```

**Problema**: Code blocks sem syntax highlighting
```bash
# Instalar Prism.js
npm install prismjs

# Ou usar Shiki
npm install shiki
```

**Problema**: Performance ruim
```tsx
// ✅ MessageResponse já está otimizado com memo
// Para mensagens muito longas, use virtualização:
import { Virtuoso } from "react-virtuoso"

<Virtuoso
  data={messages}
  itemContent={(index, message) => (
    <MessageResponse>{message.content}</MessageResponse>
  )}
/>
```

---

## Loading States

### 1. Spinner Básico

```jsx
import { Loader } from "@/components/elements/loader"

// Uso simples
<Loader size={16} />

// Com texto
<div className="flex items-center gap-2">
  <Loader size={20} />
  <span>Loading...</span>
</div>

// Em button
<Button disabled>
  <Loader size={16} className="mr-2" />
  Processing...
</Button>
```

### 2. Thinking Message

```jsx
import { ThinkingMessage } from "@/components/message"

// Renderiza automaticamente quando status === "submitted"
{status === "submitted" && <ThinkingMessage />}

// Resultado visual:
// ✨ Thinking...
// (com animação bounce nos dots)
```

### 3. Upload Loading

```jsx
import { PreviewAttachment } from "@/components/preview-attachment"

<PreviewAttachment
  attachment={{
    url: "/temp/file.jpg",
    filename: "photo.jpg",
    mediaType: "image/jpeg"
  }}
  isUploading={true}  // ← Mostra overlay com loader
  onRemove={() => removeFile(0)}
/>
```

### 4. Document Skeleton

```jsx
import { DocumentSkeleton } from "@/components/document-skeleton"

// Enquanto carrega documento
{isLoading ? (
  <DocumentSkeleton />
) : (
  <Document content={content} />
)}
```

---

## Tool Approval

### 1. Tool com Approval Pendente

```jsx
import { Tool, ToolHeader, ToolContent, ToolInput } from "@/components/elements/tool"

<Tool>
  <ToolHeader
    state="approval-requested"
    toolName="Get Weather"
  />
  <ToolContent>
    <ToolInput
      args={{
        city: "Tokyo",
        country: "Japan"
      }}
    />

    <div className="flex gap-2 mt-4">
      <Button
        onClick={() => approveTool(toolCallId)}
        variant="default"
      >
        ✓ Allow
      </Button>
      <Button
        onClick={() => denyTool(toolCallId)}
        variant="outline"
      >
        ✗ Deny
      </Button>
    </div>
  </ToolContent>
</Tool>
```

**Visual**:
```
┌─────────────────────────────────────┐
│ ⏰ Approval Needed  Get Weather  ▼ │
├─────────────────────────────────────┤
│ Input:                              │
│ {                                   │
│   "city": "Tokyo",                  │
│   "country": "Japan"                │
│ }                                   │
│                                     │
│ [✓ Allow]  [✗ Deny]                │
└─────────────────────────────────────┘
```

### 2. Tool Aprovada (Executando)

```jsx
<Tool>
  <ToolHeader
    state="approval-responded"
    toolName="Get Weather"
  />
  <ToolContent>
    <ToolInput args={{ city: "Tokyo" }} />
    <div className="text-sm text-gray-500 mt-2">
      Executing...
    </div>
  </ToolContent>
</Tool>
```

### 3. Tool com Resultado

```jsx
<Tool>
  <ToolHeader
    state="output-available"
    toolName="Get Weather"
  />
  <ToolContent>
    <ToolInput args={{ city: "Tokyo" }} />
    <ToolOutput>
      <Weather
        weatherAtLocation={{
          location_name: "Tokyo",
          current: {
            temperature_2m: 15,
            apparent_temperature: 13
          },
          // ... rest of data
        }}
      />
    </ToolOutput>
  </ToolContent>
</Tool>
```

**Visual**:
```
┌─────────────────────────────────────┐
│ ✓ Complete  Get Weather         ▼  │
├─────────────────────────────────────┤
│ Input: { "city": "Tokyo" }          │
│                                     │
│ Output:                             │
│ ┌─────────────────────────────┐   │
│ │ 🌤 Tokyo                    │   │
│ │ 15°C  Feels like 13°C       │   │
│ │ H: 18° L: 12°               │   │
│ └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 4. Tool Negada

```jsx
<Tool>
  <ToolHeader
    state="output-denied"
    toolName="Get Weather"
  />
  <ToolContent>
    <ToolInput args={{ city: "Tokyo" }} />
    <div className="text-sm text-red-600 mt-2">
      Tool execution denied by user
    </div>
  </ToolContent>
</Tool>
```

### 5. Tool com Erro

```jsx
<Tool>
  <ToolHeader
    state="output-error"
    toolName="Get Weather"
  />
  <ToolContent>
    <ToolInput args={{ city: "InvalidCity" }} />
    <ToolOutput error="City not found">
      <div className="text-red-600">
        Error: City not found
      </div>
    </ToolOutput>
  </ToolContent>
</Tool>
```

---

## Thinking / Reasoning

### 1. Reasoning Block (Colapsível)

```jsx
import { MessageReasoning } from "@/components/message-reasoning"

<MessageReasoning reasoning={reasoningText}>
  {/* Conteúdo do reasoning em Markdown */}
  Let me think about this step by step:

  1. First, I need to understand the user's question
  2. Then, I'll consider the relevant factors
  3. Finally, I'll provide a comprehensive answer
</MessageReasoning>
```

**Visual**:
```
┌─────────────────────────────────────┐
│ 🧠 Reasoning  ▼                     │
├─────────────────────────────────────┤
│ Let me think about this step by    │
│ step:                               │
│                                     │
│ 1. First, I need to understand...  │
│ 2. Then, I'll consider...          │
│ 3. Finally, I'll provide...        │
└─────────────────────────────────────┘
```

### 2. Thinking Message (Durante Geração)

```jsx
{status === "submitted" && (
  <div className="flex items-center gap-2 text-gray-500">
    <SparklesIcon className="animate-pulse" />
    <span>
      Thinking
      <span className="animate-bounce delay-0">.</span>
      <span className="animate-bounce delay-75">.</span>
      <span className="animate-bounce delay-150">.</span>
    </span>
  </div>
)}
```

**Visual**:
```
✨ Thinking...
   ↑ pisca   ↑ bounce animado
```

---

## Attachments

### 1. Preview de Imagem

```jsx
import { PreviewAttachment } from "@/components/preview-attachment"

<PreviewAttachment
  attachment={{
    url: "https://example.com/photo.jpg",
    filename: "vacation.jpg",
    mediaType: "image/jpeg"
  }}
  isUploading={false}
  onRemove={() => handleRemove()}
/>
```

**Visual**:
```
┌──────────┐
│ [IMG]    │ ← Thumbnail 80x80
│  🗑️      │ ← Remove button (hover)
└──────────┘
vacation.jpg
```

### 2. Preview de PDF

```jsx
<PreviewAttachment
  attachment={{
    url: "https://example.com/doc.pdf",
    filename: "report.pdf",
    mediaType: "application/pdf"
  }}
  isUploading={false}
  onRemove={() => handleRemove()}
/>
```

**Visual**:
```
┌──────────┐
│  📄      │ ← Ícone de arquivo
│  🗑️      │
└──────────┘
report.pdf
```

### 3. Upload em Progresso

```jsx
<PreviewAttachment
  attachment={{
    url: "/temp/uploading.jpg",
    filename: "photo.jpg",
    mediaType: "image/jpeg"
  }}
  isUploading={true}  // ← Overlay com spinner
  onRemove={undefined} // Disabled durante upload
/>
```

**Visual**:
```
┌──────────┐
│   ⏳     │ ← Overlay escuro
│   ...    │ ← Spinner girando
└──────────┘
photo.jpg
```

### 4. Grid de Múltiplos Attachments

```jsx
<div className="flex flex-wrap gap-2">
  {attachments.map((attachment, i) => (
    <PreviewAttachment
      key={i}
      attachment={attachment}
      isUploading={uploadQueue.includes(attachment)}
      onRemove={() => removeAttachment(i)}
    />
  ))}
</div>
```

---

## Artifacts

### 1. Abrir Artifact de Código

```jsx
import { DocumentPreview } from "@/components/document"

<DocumentPreview
  type="create"
  args={{
    title: "Python Calculator",
    kind: "code"
  }}
  result={{
    id: "doc-uuid-123",
    title: "Python Calculator",
    kind: "code"
  }}
  isReadonly={false}
/>
```

**Visual**:
```
┌─────────────────────────────────────┐
│ [📄 Open Python Calculator]        │
└─────────────────────────────────────┘
```

Ao clicar, abre painel lateral com:
```
┌─────────────────────────────────┐
│ Python Calculator         ✕     │
├─────────────────────────────────┤
│ [Copy] [Download] [More]        │
├─────────────────────────────────┤
│ 1  def calculate(a, b, op):     │
│ 2      if op == '+':            │
│ 3          return a + b         │
│ 4      elif op == '-':          │
│ 5          return a - b         │
│ ...                             │
├─────────────────────────────────┤
│ v1 • Updated 2 min ago          │
└─────────────────────────────────┘
```

### 2. Artifact de Texto (Rich Text)

```jsx
<DocumentPreview
  type="create"
  args={{
    title: "Blog Post: AI Trends",
    kind: "text"
  }}
  result={{
    id: "doc-uuid-456",
    title: "Blog Post: AI Trends",
    kind: "text"
  }}
  isReadonly={false}
/>
```

Painel com ProseMirror editor:
```
┌─────────────────────────────────┐
│ Blog Post: AI Trends      ✕     │
├─────────────────────────────────┤
│ [B] [I] [U] [Link] [List]       │← Toolbar
├─────────────────────────────────┤
│ The Future of AI                │
│                                 │
│ Artificial Intelligence is      │
│ transforming industries...      │
│                                 │
│ ## Key Trends                   │
│ 1. Generative AI                │
│ 2. Autonomous Agents            │
│ ...                             │
└─────────────────────────────────┘
```

### 3. Artifact de Planilha

```jsx
<DocumentPreview
  type="create"
  args={{
    title: "Sales Data",
    kind: "sheet"
  }}
  result={{
    id: "doc-uuid-789",
    title: "Sales Data",
    kind: "sheet"
  }}
  isReadonly={false}
/>
```

Painel com React Data Grid:
```
┌─────────────────────────────────┐
│ Sales Data               ✕      │
├─────────────────────────────────┤
│   │ A      │ B     │ C    │ D  ││
├───┼────────┼───────┼──────┼────┤│
│ 1 │Product │ Price │ Qty  │Total│
│ 2 │Widget  │ 10.00 │ 100  │1000││
│ 3 │Gadget  │ 25.00 │  50  │1250││
│...│        │       │      │    ││
└─────────────────────────────────┘
```

### 4. Update Document

```jsx
<DocumentPreview
  type="update"
  args={{
    id: "doc-uuid-123",
    description: "Add error handling"
  }}
  result={{
    id: "doc-uuid-123",
    title: "Python Calculator",
    kind: "code"
  }}
  isReadonly={false}
/>
```

**Visual**:
```
┌─────────────────────────────────────┐
│ [✏️ View Updated Python Calculator]│
└─────────────────────────────────────┘
```

### 5. Suggestions

```jsx
<DocumentPreview
  type="request-suggestions"
  args={{
    documentId: "doc-uuid-456"
  }}
  result={{
    suggestions: [
      {
        originalSentence: "AI is good",
        suggestedSentence: "AI has transformative potential",
        description: "More descriptive and professional"
      },
      // ... more suggestions
    ]
  }}
  isReadonly={false}
/>
```

**Visual**:
```
┌─────────────────────────────────────┐
│ Suggestions:                        │
│                                     │
│ ┌───────────────────────────────┐ │
│ │ Original: "AI is good"        │ │
│ │ Suggested: "AI has transform..│ │
│ │ More descriptive and prof...  │ │
│ │              [Apply] [Dismiss]│ │
│ └───────────────────────────────┘ │
│                                     │
│ ┌───────────────────────────────┐ │
│ │ ... more suggestions ...      │ │
│ └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## Messages

### 1. User Message

```jsx
<PreviewMessage
  message={{
    id: "msg-1",
    role: "user",
    content: "What's the weather in Tokyo?",
    parts: [
      { type: "text", text: "What's the weather in Tokyo?" }
    ],
    createdAt: new Date()
  }}
  vote={undefined}
  isLoading={false}
  chatId="chat-123"
  isReadonly={false}
  regenerate={() => {}}
  setMessages={() => {}}
  addToolApprovalResponse={() => {}}
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│               What's the weather│
│               in Tokyo?         │
│                     [Edit] [Copy]│
└─────────────────────────────────┘
```

### 2. Assistant Message

```jsx
<PreviewMessage
  message={{
    id: "msg-2",
    role: "assistant",
    content: "The current temperature in Tokyo is 15°C.",
    parts: [
      { type: "text", text: "The current temperature..." }
    ]
  }}
  vote={undefined}
  isLoading={false}
  chatId="chat-123"
  isReadonly={false}
  regenerate={() => {}}
  setMessages={() => {}}
  addToolApprovalResponse={() => {}}
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ 🤖                              │
│ The current temperature in      │
│ Tokyo is 15°C.                  │
│                                 │
│ [Copy] [👍] [👎]                │
└─────────────────────────────────┘
```

### 3. Message com Attachment

```jsx
<PreviewMessage
  message={{
    id: "msg-3",
    role: "user",
    content: "What's in this image?",
    parts: [
      { type: "text", text: "What's in this image?" },
      {
        type: "file",
        mediaType: "image/jpeg",
        name: "photo.jpg",
        url: "https://example.com/photo.jpg"
      }
    ]
  }}
  // ... other props
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│               ┌──────────┐      │
│               │ [IMAGE]  │      │
│               └──────────┘      │
│               photo.jpg         │
│                                 │
│               What's in this    │
│               image?            │
│                     [Edit] [Copy]│
└─────────────────────────────────┘
```

### 4. Message com Reasoning

```jsx
<PreviewMessage
  message={{
    id: "msg-4",
    role: "assistant",
    content: "Based on my analysis...",
    parts: [
      {
        type: "reasoning",
        reasoning: "Let me think:\n1. First...\n2. Then..."
      },
      {
        type: "text",
        text: "Based on my analysis..."
      }
    ]
  }}
  // ... other props
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ 🤖                              │
│ ┌─────────────────────────────┐│
│ │ 🧠 Reasoning  ▼             ││
│ │ Let me think:               ││
│ │ 1. First...                 ││
│ │ 2. Then...                  ││
│ └─────────────────────────────┘│
│                                 │
│ Based on my analysis...         │
│                                 │
│ [Copy] [👍] [👎]                │
└─────────────────────────────────┘
```

### 5. Edit Mode

```jsx
// User message in edit mode
<PreviewMessage
  message={{ ... }}
  // ... quando clica Edit
/>

// Renderiza MessageEditor
<MessageEditor
  message={message}
  setMode={setMode}
  setMessages={setMessages}
  regenerate={regenerate}
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐│
│ │What's the weather in Tokyo? ││← Textarea editável
│ └─────────────────────────────┘│
│                                 │
│         [Cancel] [Send & Update]│
└─────────────────────────────────┘
```

---

## Input

### 1. Input Vazio (Com Suggestions)

```jsx
<MultimodalInput
  input=""
  setInput={setInput}
  status="awaiting_input"
  messages={[]}  // Empty
  attachments={[]}
  // ... other props
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ ┌─────────────┬─────────────┐  │
│ │Explain tech │Draft email  │  │← Suggested actions
│ │concepts     │to boss      │  │
│ ├─────────────┼─────────────┤  │
│ │Write story  │Compare langs│  │
│ └─────────────┴─────────────┘  │
│                                 │
│ ┌─────────────────────────────┐│
│ │Send a message...            ││← Textarea
│ └─────────────────────────────┘│
│ [📎] [🤖 Claude] [↑]           ││
└─────────────────────────────────┘
```

### 2. Input com Texto

```jsx
<MultimodalInput
  input="Tell me about TypeScript"
  setInput={setInput}
  status="awaiting_input"
  messages={[...]}
  attachments={[]}
  // ... other props
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐│
│ │Tell me about TypeScript     ││
│ └─────────────────────────────┘│
│ [📎] [🤖 Claude] [↑]           ││
│                          ↑ ativo│
└─────────────────────────────────┘
```

### 3. Input com Attachments

```jsx
<MultimodalInput
  input="Analyze this"
  setInput={setInput}
  status="awaiting_input"
  messages={[...]}
  attachments={[
    {
      url: "photo.jpg",
      filename: "photo.jpg",
      mediaType: "image/jpeg"
    }
  ]}
  // ... other props
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ ┌──────────┐                    │
│ │ [IMG]  🗑️│ ← Preview + remove │
│ └──────────┘                    │
│ photo.jpg                       │
│                                 │
│ ┌─────────────────────────────┐│
│ │Analyze this                 ││
│ └─────────────────────────────┘│
│ [📎] [🤖 Claude] [↑]           ││
└─────────────────────────────────┘
```

### 4. Input Streaming (Stop Button)

```jsx
<MultimodalInput
  input=""
  setInput={setInput}
  status="streaming"  // ← Muda para stop button
  stop={stopGeneration}
  // ... other props
/>
```

**Visual**:
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐│
│ │                             ││
│ └─────────────────────────────┘│
│ [📎] [🤖 Claude] [■ Stop]      ││
│                       ↑ quadrado│
└─────────────────────────────────┘
```

### 5. Model Selector

```jsx
<ModelSelectorCompact
  selectedModelId="anthropic/claude-sonnet-4.5"
  onModelChange={setModelId}
/>
```

**Visual quando aberto**:
```
┌─────────────────────────────────┐
│ 🤖 Claude Sonnet 4.5       ▼   │← Trigger
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Search models...                │
├─────────────────────────────────┤
│ Anthropic                       │
│   ✓ Claude Sonnet 4.5          │← Selected
│     Claude Haiku 4.5            │
│     Claude Opus 4.5             │
├─────────────────────────────────┤
│ OpenAI                          │
│     GPT-4.1 Mini                │
│     GPT-5.2                     │
├─────────────────────────────────┤
│ Google                          │
│     Gemini 2.5 Flash            │
└─────────────────────────────────┘
```

---

## Sidebar

### 1. Sidebar Completa

```jsx
<AppSidebar user={user} />
```

**Visual**:
```
┌───────────────────┐
│ 🤖 Chatbot        │← Header
│          [+] [🗑️] │
├───────────────────┤
│ Today             │← History groups
│ • Chat about AI   │
│ • Python help     │
│                   │
│ Yesterday         │
│ • Weather query   │
│                   │
│ Last 7 days       │
│ • Code review     │
│ • ... more        │
│                   │
│ [Load more]       │
├───────────────────┤
│ 👤 John Doe       │← Footer
│    john@email.com │
│               [→] │
└───────────────────┘
```

### 2. Sidebar Mobile (Collapsed)

```jsx
<SidebarToggle />  // Button para abrir
```

**Visual**:
```
Mobile:
[☰] ← Toggle button

Ao clicar, sidebar slide from left
```

### 3. Chat Item

```jsx
<SidebarHistoryItem
  chat={{
    id: "chat-123",
    title: "Python help session",
    createdAt: new Date()
  }}
  onDelete={handleDelete}
/>
```

**Visual**:
```
┌───────────────────┐
│ Python help       │
│ session      [🗑️] │← Hover para mostrar
└───────────────────┘
```

### 4. Delete All Dialog

```jsx
<AlertDialog open={showDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        Delete all chats?
      </AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete all your chat history.
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDeleteAll}>
        Delete All
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Visual**:
```
┌─────────────────────────────────┐
│ Delete all chats?               │
│                                 │
│ This will permanently delete    │
│ all your chat history. This     │
│ action cannot be undone.        │
│                                 │
│         [Cancel] [Delete All]   │
└─────────────────────────────────┘
```

---

## Combinações Comuns

### 1. User Message → Tool → Result → Assistant Response

```jsx
// 1. User message
<PreviewMessage
  message={{
    role: "user",
    content: "What's the weather in Tokyo?"
  }}
/>

// 2. Tool approval
<Tool>
  <ToolHeader state="approval-requested" toolName="getWeather" />
  <ToolInput args={{ city: "Tokyo" }} />
  <div>
    <Button onClick={approve}>Allow</Button>
    <Button onClick={deny}>Deny</Button>
  </div>
</Tool>

// 3. Tool result
<Tool>
  <ToolHeader state="output-available" toolName="getWeather" />
  <ToolOutput>
    <Weather weatherAtLocation={data} />
  </ToolOutput>
</Tool>

// 4. Assistant response
<PreviewMessage
  message={{
    role: "assistant",
    content: "The current temperature in Tokyo is 15°C..."
  }}
/>
```

### 2. User Message → Create Document → Open Artifact

```jsx
// 1. User message
<PreviewMessage
  message={{
    role: "user",
    content: "Write a Python calculator"
  }}
/>

// 2. Create document tool
<Tool>
  <ToolHeader state="output-available" toolName="createDocument" />
  <ToolOutput>
    <DocumentPreview
      type="create"
      result={{
        id: "doc-123",
        title: "Python Calculator",
        kind: "code"
      }}
    />
  </ToolOutput>
</Tool>

// 3. Artifact panel opens
<Artifact
  artifact={{
    documentId: "doc-123",
    title: "Python Calculator",
    kind: "code",
    content: "def calculate(a, b, op):\n    ...",
    isVisible: true,
    status: "idle"
  }}
/>
```

### 3. Complete Chat Flow

```jsx
<Chat id="chat-123">
  <ChatHeader />

  <Messages>
    <Greeting />  {/* Se vazio */}

    <PreviewMessage role="user" />
    <PreviewMessage role="assistant" />
    <PreviewMessage role="user" />

    {/* Com tool */}
    <PreviewMessage role="assistant">
      <Tool state="approval-requested" />
    </PreviewMessage>

    <ThinkingMessage />  {/* Se streaming */}
  </Messages>

  <MultimodalInput>
    <SuggestedActions />  {/* Se vazio */}
    <PromptInput />
  </MultimodalInput>

  {/* Artifact panel (condicional) */}
  <Artifact isVisible={true} />
</Chat>
```

---

## Cheatsheet de Estados

| Estado | Visual | Componente |
|--------|--------|-----------|
| Loading | `⏳` spinning | `<Loader />` |
| Thinking | `✨ Thinking...` | `<ThinkingMessage />` |
| Approval Pending | `⏰ Approval Needed` | `<ToolHeader state="approval-requested" />` |
| Approved | `✓ Approved` | `<ToolHeader state="approval-responded" />` |
| Complete | `✓ Complete` | `<ToolHeader state="output-available" />` |
| Error | `✗ Error` | `<ToolHeader state="output-error" />` |
| Denied | `✗ Denied` | `<ToolHeader state="output-denied" />` |
| Streaming | `■ Stop` button | `status="streaming"` |
| Uploading | Overlay + spinner | `isUploading={true}` |

---

## Copy-Paste Templates

### Template: Mensagem Simples

```jsx
<div className="message user">
  <div className="message-content">
    {message.content}
  </div>
  <div className="message-actions">
    <Button variant="ghost" size="icon-sm">
      <CopyIcon />
    </Button>
  </div>
</div>
```

### Template: Tool com Approval

```jsx
<Tool>
  <ToolHeader state="approval-requested" toolName={toolName} />
  <ToolContent>
    <ToolInput args={args} />
    <div className="flex gap-2 mt-4">
      <Button onClick={() => approve(toolCallId)}>Allow</Button>
      <Button variant="outline" onClick={() => deny(toolCallId)}>Deny</Button>
    </div>
  </ToolContent>
</Tool>
```

### Template: Input com Attachments

```jsx
<div className="input-container">
  {attachments.length > 0 && (
    <div className="attachments-preview flex gap-2">
      {attachments.map((att, i) => (
        <PreviewAttachment
          key={i}
          attachment={att}
          onRemove={() => remove(i)}
        />
      ))}
    </div>
  )}

  <textarea
    value={input}
    onChange={(e) => setInput(e.target.value)}
    placeholder="Send a message..."
  />

  <div className="toolbar">
    <Button variant="ghost" size="icon-sm" onClick={openFilePicker}>
      <PaperclipIcon />
    </Button>
    <Button type="submit" disabled={!input.trim()}>
      <ArrowUpIcon />
    </Button>
  </div>
</div>
```

---

Esta documentação fornece exemplos visuais e código copy-paste para todos os componentes principais do projeto ai-chatbot!
