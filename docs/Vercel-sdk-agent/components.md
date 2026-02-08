# Documentação Completa de Componentes - AI Chatbot

> Documentação detalhada de todos os 90+ componentes do projeto ai-chatbot.

## Índice

1. [Componentes de Chat](#componentes-de-chat)
2. [Componentes de Loading](#componentes-de-loading)
3. [Componentes de Tools](#componentes-de-tools)
4. [Renderização de Markdown Rico](#renderização-de-markdown-rico) ⭐ **NOVO**
5. [Componentes de Input](#componentes-de-input)
6. [Componentes de Artifacts](#componentes-de-artifacts)
7. [Componentes de UI Básicos](#componentes-de-ui-básicos)
8. [Componentes de Layout](#componentes-de-layout)
9. [Componentes de Mensagem](#componentes-de-mensagem)
10. [Componentes AI-Elements](#componentes-ai-elements)
11. [Componentes Utilitários](#componentes-utilitários)
12. [Hierarquia e Patterns](#hierarquia-e-patterns)

---

## Componentes de Chat

### `chat.tsx`

**Localização**: `/components/chat.tsx`

**Descrição**: Componente orquestrador principal que gerencia todo o fluxo do chat.

**Props**:
```typescript
interface ChatProps {
  id: string                              // UUID do chat
  initialMessages?: ChatMessage[]         // Histórico de mensagens
  initialChatModel?: string              // Modelo LLM selecionado
  initialVisibilityType?: VisibilityType // "public" | "private"
  isReadonly?: boolean                   // Chat público é readonly
  autoResume?: boolean                   // SSR auto-resume
}
```

**Estado Local**:
```typescript
const [input, setInput] = useState("")
const [attachments, setAttachments] = useState<Attachment[]>([])
const [currentModelId, setCurrentModelId] = useState(initialChatModel)
const [showCreditCardAlert, setShowCreditCardAlert] = useState(false)
const [dataStream, setDataStream] = useState<DataUIPart[]>([])
```

**Hooks Principais**:
- `useChat` (AI SDK): Gerencia mensagens, status, streaming
- `useChatVisibility`: Controla visibilidade do chat
- `useAutoResume`: Resume streaming interrompido
- `useArtifactSelector`: Gerencia artifact selecionado
- `useSWR`: Cache de histórico de chats
- `useRouter`, `useSearchParams`: Navegação e query params

**Funcionalidades**:
1. **Tool Approval Flow**:
   - Detecta quando LLM pede para usar tool
   - Auto-continua após aprovação do usuário

2. **Auto-Resume**:
   - Retoma streaming após interrupção
   - Usa GET /api/chat/[id]/stream

3. **Error Handling**:
   - Captura `CartoonCredit` errors
   - Mostra alert para ativar gateway

4. **Query Parameters**:
   - Suporta `?message=texto` para iniciar conversa
   - Envia mensagem automaticamente

5. **Local Storage**:
   - Salva input não enviado
   - Recupera em reload

**Estrutura de Renderização**:
```jsx
<DataStreamProvider>
  <ChatHeader chatId={id} ... />

  <Messages
    messages={messages}
    status={status}
    chatId={id}
    isReadonly={isReadonly}
    ...
  />

  <MultimodalInput
    input={input}
    setInput={setInput}
    attachments={attachments}
    sendMessage={sendMessage}
    ...
  />

  {artifact.isVisible && (
    <Artifact ... />
  )}

  <DataStreamHandler ... />
</DataStreamProvider>
```

---

### `messages.tsx`

**Localização**: `/components/messages.tsx`

**Descrição**: Renderiza lista de mensagens com scroll automático e estados de loading.

**Props**:
```typescript
interface MessagesProps {
  messages: ChatMessage[]
  status: "submitted" | "streaming" | "awaiting_input"
  votes?: Vote[]
  chatId: string
  isReadonly: boolean
  isArtifactVisible: boolean
  selectedModelId: string
  regenerate: (messageId: string) => void
  setMessages: (messages: ChatMessage[]) => void
  addToolApprovalResponse: (response: ToolApprovalResponse) => void
}
```

**Funcionalidades**:
1. **Scroll Automático**:
   - Scroll to bottom quando nova mensagem
   - Detecção de scroll manual do usuário
   - Botão "scroll to bottom" quando não no fim

2. **Greeting**:
   - Mostra quando `messages.length === 0`
   - Animação de entrada

3. **Thinking State**:
   - Mostra `ThinkingMessage` quando `status === "submitted"`
   - Animação de pulse + bounce dots

4. **Memoização**:
   - Usa `React.memo` com custom comparator
   - `fast-deep-equal` para deep comparison

**Estrutura**:
```jsx
<div className="messages-container">
  {messages.length === 0 && <Greeting />}

  {messages.map(message => (
    <PreviewMessage
      key={message.id}
      message={message}
      vote={votes.find(v => v.messageId === message.id)}
      isLoading={status === "streaming"}
      chatId={chatId}
      isReadonly={isReadonly}
      regenerate={regenerate}
      setMessages={setMessages}
      addToolApprovalResponse={addToolApprovalResponse}
    />
  ))}

  {status === "submitted" && <ThinkingMessage />}

  {!isAtBottom && (
    <button onClick={scrollToBottom}>
      ↓ Scroll to bottom
    </button>
  )}
</div>
```

---

### `message.tsx` (PreviewMessage & ThinkingMessage)

**Localização**: `/components/message.tsx`

**Descrição**: Renderiza mensagens individuais com suporte a tools, reasoning, attachments e edição.

#### **PreviewMessage**

**Props**:
```typescript
interface PreviewMessageProps {
  message: ChatMessage
  vote?: Vote
  isLoading: boolean
  chatId: string
  isReadonly: boolean
  regenerate: (messageId: string) => void
  setMessages: (messages: ChatMessage[]) => void
  addToolApprovalResponse: (response: ToolApprovalResponse) => void
}
```

**Estados Internos**:
```typescript
const [mode, setMode] = useState<"view" | "edit">("view")
```

**Renderização Condicional**:

1. **User Messages**:
   - Modo "view": Mostra texto + attachments
   - Modo "edit": `MessageEditor` inline
   - Botões: Edit + Copy

2. **Assistant Messages**:
   - Texto da resposta (Markdown)
   - Reasoning blocks (colapsível)
   - Tool outputs
   - Botões: Copy + Upvote + Downvote

**Tool Outputs Suportados**:

```typescript
// Weather Tool
if (part.toolName === "getWeather" && part.state === "output-available") {
  return <Weather weatherAtLocation={part.result} />
}

// Create Document Tool
if (part.toolName === "createDocument") {
  return (
    <DocumentPreview
      type="create"
      args={part.toolInput}
      result={part.result}
      isReadonly={isReadonly}
    />
  )
}

// Update Document Tool
if (part.toolName === "updateDocument") {
  return (
    <DocumentPreview
      type="update"
      args={part.toolInput}
      result={part.result}
      isReadonly={isReadonly}
    />
  )
}

// Request Suggestions Tool
if (part.toolName === "requestSuggestions") {
  return (
    <Tool>
      <ToolHeader state={part.state} toolName="Request Suggestions" />
      <ToolInput args={part.toolInput} />
      <ToolOutput>
        <DocumentToolResult
          type="request-suggestions"
          args={part.toolInput}
          result={part.result}
        />
      </ToolOutput>
    </Tool>
  )
}
```

**Tool Approval States**:

```typescript
// Pending approval
if (part.state === "approval-requested") {
  return (
    <Tool>
      <ToolHeader state="approval-requested" toolName={part.toolName} />
      <ToolInput args={part.toolInput} />
      <div className="approval-buttons">
        <Button onClick={() => approve(part.toolCallId)}>
          Allow
        </Button>
        <Button onClick={() => deny(part.toolCallId)}>
          Deny
        </Button>
      </div>
    </Tool>
  )
}

// Approved (waiting execution)
if (part.state === "approval-responded" && part.approval?.approved) {
  return (
    <Tool>
      <ToolHeader state="approval-responded" toolName={part.toolName} />
      <ToolInput args={part.toolInput} />
      <div>Waiting for execution...</div>
    </Tool>
  )
}

// Denied
if (part.state === "output-denied") {
  return (
    <Tool>
      <ToolHeader state="output-denied" toolName={part.toolName} />
      <ToolInput args={part.toolInput} />
      <div>Tool execution denied</div>
    </Tool>
  )
}
```

**Attachments**:
```jsx
{message.parts.filter(p => p.type === "file").map(attachment => (
  <PreviewAttachment
    key={attachment.url}
    attachment={attachment}
    isUploading={false}
  />
))}
```

#### **ThinkingMessage**

**Props**: Nenhuma

**Renderização**:
```jsx
<div className="thinking-message">
  <SparklesIcon className="animate-pulse" />
  <span>
    Thinking
    <span className="dot animate-bounce delay-0">.</span>
    <span className="dot animate-bounce delay-75">.</span>
    <span className="dot animate-bounce delay-150">.</span>
  </span>
</div>
```

**CSS**:
```css
.dot {
  animation: bounce 1s infinite;
}
.delay-75 { animation-delay: 75ms; }
.delay-150 { animation-delay: 150ms; }
```

---

## Componentes de Loading

### `elements/loader.tsx`

**Localização**: `/components/elements/loader.tsx`

**Descrição**: Spinner SVG animado para estados de loading.

**Props**:
```typescript
interface LoaderProps extends HTMLAttributes<SVGElement> {
  size?: number  // Default: 16px
}
```

**Renderização**:
```jsx
<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  className="animate-spin"
>
  <circle
    cx="12"
    cy="12"
    r="10"
    stroke="currentColor"
    strokeWidth="4"
    fill="none"
    strokeDasharray="32"
    strokeLinecap="round"
  />
</svg>
```

**Uso**:
```jsx
// Em attachments durante upload
<PreviewAttachment isUploading={true}>
  <Loader size={20} />
</PreviewAttachment>

// Em buttons
<Button disabled>
  <Loader size={16} className="mr-2" />
  Loading...
</Button>
```

---

### ThinkingMessage (já documentado acima)

Indica que o modelo está processando a resposta.

---

## Componentes de Tools

### `elements/tool.tsx`

**Localização**: `/components/elements/tool.tsx`

**Descrição**: Componentes para renderizar tools com estados visuais.

#### **Tool** (Container)

```typescript
interface ToolProps {
  children: React.ReactNode
  className?: string
}
```

Renderiza um container colapsível com border:
```jsx
<Collapsible
  defaultOpen={true}
  className="border rounded-lg p-4"
>
  {children}
</Collapsible>
```

#### **ToolHeader**

```typescript
interface ToolHeaderProps {
  state: ToolState
  toolName: string
}

type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"
```

Renderiza header com badge de status:

```jsx
<CollapsibleTrigger className="flex items-center gap-2">
  <ToolBadge state={state} />
  <span className="font-medium">{toolName}</span>
  <ChevronIcon className="ml-auto" />
</CollapsibleTrigger>
```

**Badges por Estado**:

| Estado | Badge | Cor | Ícone |
|--------|-------|-----|-------|
| `input-streaming` | Pending | Gray | ⏳ Clock |
| `input-available` | Pending | Gray | ⏳ Clock animado |
| `approval-requested` | Approval Needed | Yellow | ⏳ Clock |
| `approval-responded` | Approved | Blue | ✓ Check |
| `output-available` | Complete | Green | ✓ Check |
| `output-error` | Error | Red | ✗ X |
| `output-denied` | Denied | Orange | ✗ X |

#### **ToolContent**

```typescript
interface ToolContentProps {
  children: React.ReactNode
}
```

Conteúdo colapsível:
```jsx
<CollapsibleContent className="mt-3 space-y-3">
  {children}
</CollapsibleContent>
```

#### **ToolInput**

```typescript
interface ToolInputProps {
  args: Record<string, any>
}
```

Exibe inputs da tool em JSON formatado:
```jsx
<div className="tool-input">
  <div className="label">Input</div>
  <pre className="code-block">
    {JSON.stringify(args, null, 2)}
  </pre>
</div>
```

#### **ToolOutput**

```typescript
interface ToolOutputProps {
  children: React.ReactNode
  error?: string
}
```

Exibe resultado ou erro:
```jsx
<div className="tool-output">
  <div className="label">Output</div>
  {error ? (
    <div className="error">{error}</div>
  ) : (
    <div className="result">{children}</div>
  )}
</div>
```

**Exemplo de Uso Completo**:
```jsx
<Tool>
  <ToolHeader
    state="output-available"
    toolName="getWeather"
  />
  <ToolContent>
    <ToolInput args={{ city: "Tokyo" }} />
    <ToolOutput>
      <Weather weatherAtLocation={result} />
    </ToolOutput>
  </ToolContent>
</Tool>
```

---

### `weather.tsx`

**Localização**: `/components/weather.tsx`

**Descrição**: Componente rico para exibir dados meteorológicos.

**Props**:
```typescript
interface WeatherProps {
  weatherAtLocation?: WeatherAtLocation
}

interface WeatherAtLocation {
  latitude: number
  longitude: number
  generationtime_ms: number
  utc_offset_seconds: number
  timezone: string
  timezone_abbreviation: string
  elevation: number
  location_name: string
  current: {
    time: string
    interval: number
    temperature_2m: number
    apparent_temperature: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
  }
  daily: {
    time: string[]
    sunrise: string[]
    sunset: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}
```

**Detecção de Responsividade**:
```typescript
const [isMobile, setIsMobile] = useState(false)

useEffect(() => {
  const checkMobile = () => setIsMobile(window.innerWidth < 768)
  checkMobile()
  window.addEventListener("resize", checkMobile)
  return () => window.removeEventListener("resize", checkMobile)
}, [])
```

**Cálculo de Dia/Noite**:
```typescript
const currentTime = new Date(current.time)
const sunrise = new Date(daily.sunrise[0])
const sunset = new Date(daily.sunset[0])
const isNight = currentTime < sunrise || currentTime > sunset
```

**Renderização**:
```jsx
<div className={cn(
  "weather-card rounded-xl p-6",
  isNight
    ? "bg-gradient-to-br from-indigo-900 to-purple-900"
    : "bg-gradient-to-br from-sky-400 to-blue-500"
)}>
  {/* Header */}
  <div className="header">
    <h3>{location_name}</h3>
    <p>{format(currentTime, "EEEE, MMMM d, h:mm a")}</p>
  </div>

  {/* Temperatura Atual */}
  <div className="current-temp">
    {isNight ? <MoonIcon /> : <SunIcon />}
    <span className="text-6xl font-bold">
      {Math.round(current.temperature_2m)}°
    </span>
    <p>Feels like {Math.round(current.apparent_temperature)}°</p>
  </div>

  {/* High/Low */}
  <div className="temp-range">
    <div>H: {Math.round(daily.temperature_2m_max[0])}°</div>
    <div>L: {Math.round(daily.temperature_2m_min[0])}°</div>
  </div>

  {/* Hourly Forecast */}
  <div className="hourly-forecast grid">
    {hourly.time.slice(0, isMobile ? 5 : 6).map((time, i) => (
      <div key={i} className="hour-item">
        <p>{format(new Date(time), "ha")}</p>
        <CloudIcon />
        <p>{Math.round(hourly.temperature_2m[i])}°</p>
      </div>
    ))}
  </div>

  {/* Sunrise/Sunset */}
  <div className="sun-times">
    <div>
      <SunIcon />
      <span>Sunrise</span>
      <span>{format(sunrise, "h:mm a")}</span>
    </div>
    <div>
      <SunIcon />
      <span>Sunset</span>
      <span>{format(sunset, "h:mm a")}</span>
    </div>
  </div>
</div>
```

**Ícones Customizados**:
```jsx
const SunIcon = () => (
  <svg>
    <circle cx="12" cy="12" r="5" fill="currentColor" />
    {/* Rays */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
      <line
        key={angle}
        x1={12 + Math.cos(angle * Math.PI / 180) * 7}
        y1={12 + Math.sin(angle * Math.PI / 180) * 7}
        x2={12 + Math.cos(angle * Math.PI / 180) * 9}
        y2={12 + Math.sin(angle * Math.PI / 180) * 9}
        stroke="currentColor"
        strokeWidth="2"
      />
    ))}
  </svg>
)

const MoonIcon = () => (
  <svg>
    <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.11-1.36a5.5 5.5 0 0 1-7.53-7.53A9 9 0 0 0 12 3z" />
  </svg>
)

const CloudIcon = () => (
  <svg>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
)
```

---

### `document.tsx`

**Localização**: `/components/document.tsx`

**Descrição**: Componentes para criar/atualizar documents (artifacts).

#### **DocumentToolResult**

```typescript
interface DocumentToolResultProps {
  type: "create" | "update" | "request-suggestions"
  args: Record<string, any>
  result?: {
    id: string
    title: string
    kind: string
  }
  isReadonly: boolean
}
```

**Renderização**:

```jsx
// Create Document
if (type === "create" && result) {
  return (
    <Button
      onClick={() => openArtifact(result.id)}
      disabled={isReadonly}
      variant="outline"
      className="w-full"
    >
      <FileIcon className="mr-2" />
      Open {result.title}
    </Button>
  )
}

// Update Document
if (type === "update" && result) {
  return (
    <Button
      onClick={() => openArtifact(result.id)}
      disabled={isReadonly}
      variant="outline"
      className="w-full"
    >
      <PencilEditIcon className="mr-2" />
      View Updated {result.title}
    </Button>
  )
}

// Request Suggestions
if (type === "request-suggestions") {
  return (
    <div className="suggestions-list">
      {result?.suggestions.map((suggestion, i) => (
        <Suggestion key={i} {...suggestion} />
      ))}
    </div>
  )
}
```

#### **DocumentToolCall** (Durante Execução)

```typescript
interface DocumentToolCallProps {
  type: "create" | "update"
  args: Record<string, any>
}
```

```jsx
// Mostra enquanto tool está executando
<div className="tool-call-loading">
  <Loader size={16} />
  <span>
    {type === "create" ? "Creating" : "Updating"} "{args.title}"...
  </span>
</div>
```

---

## Renderização de Markdown Rico

### Visão Geral

O chat utiliza **Streamdown** (biblioteca externa) para renderizar markdown de forma **progressiva durante o streaming**. Isso permite que o conteúdo seja exibido em tempo real enquanto a IA está escrevendo.

**Biblioteca**: `streamdown` v1.4.0

**Features**:
- ✅ Renderização progressiva durante streaming
- ✅ Suporte completo a Markdown (CommonMark)
- ✅ Syntax highlighting para código
- ✅ Lazy rendering para performance
- ✅ Memoização automática

---

### `elements/response.tsx`

**Localização**: `/components/elements/response.tsx`

**Descrição**: Wrapper memoizado do Streamdown com estilos customizados.

**Código Completo**:
```typescript
"use client";

import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
```

**Estilos Aplicados**:
```css
/* Remove margens top/bottom desnecessárias */
[&>*:first-child]:mt-0
[&>*:last-child]:mb-0

/* Code inline quebra linha corretamente */
[&_code]:whitespace-pre-wrap
[&_code]:break-words

/* Code blocks com scroll horizontal */
[&_pre]:max-w-full
[&_pre]:overflow-x-auto
```

**Uso**:
```tsx
import { Response } from "@/components/elements/response";

<Response>
  {message.content}  // ← Markdown é renderizado progressivamente
</Response>
```

---

### `ai-elements/message.tsx` - MessageResponse

**Localização**: `/components/ai-elements/message.tsx`

**Descrição**: Versão do Streamdown para mensagens do chat (idêntica ao Response, mas com estilos ligeiramente diferentes).

**Código**:
```typescript
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";
```

**Uso no PreviewMessage**:
```tsx
import { MessageResponse } from "@/components/ai-elements/message";

function PreviewMessage({ message }: { message: Message }) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.role === "assistant" ? (
          <MessageResponse>
            {message.content}  // ← Renderiza markdown rico
          </MessageResponse>
        ) : (
          <p>{message.content}</p>
        )}
      </MessageContent>
    </Message>
  );
}
```

---

### Como Funciona o Streaming de Markdown

**Fluxo Completo**:

```
┌─────────────────┐
│ LLM (Backend)   │
│ Gera texto      │
└────────┬────────┘
         │ SSE Stream
         ▼
┌─────────────────┐
│ useChat hook    │
│ Recebe chunks   │
└────────┬────────┘
         │ message.content atualiza
         ▼
┌─────────────────┐
│ MessageResponse │
│ (Streamdown)    │
└────────┬────────┘
         │ Renderiza progressivamente
         ▼
┌─────────────────┐
│ Markdown Rico   │
│ na tela         │
└─────────────────┘
```

**Exemplo em Ação**:

```typescript
// Backend envia chunks via SSE:
"Hello **world**"
"Hello **world**\n\nThis is"
"Hello **world**\n\nThis is a `code`"
"Hello **world**\n\nThis is a `code` example"

// Frontend renderiza progressivamente:
// Render 1: Hello world (negrito)
// Render 2: Hello world + quebra linha + "This is"
// Render 3: Hello world + quebra linha + "This is a code" (code inline)
// Render 4: Hello world + quebra linha + "This is a code example"
```

---

### Markdown Suportado

**Elementos Básicos**:
```markdown
# Heading 1
## Heading 2
### Heading 3

**negrito**
*itálico*
~~riscado~~

[link](https://example.com)

> blockquote

- lista
- não ordenada

1. lista
2. ordenada
```

**Code Blocks com Syntax Highlighting**:
````markdown
```typescript
const hello = (name: string) => {
  console.log(`Hello ${name}!`);
};
```
````

Renderiza como:
```typescript
const hello = (name: string) => {
  console.log(`Hello ${name}!`);
};
```

**Tabelas**:
```markdown
| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |
```

**Imagens**:
```markdown
![Alt text](https://example.com/image.png)
```

---

### Customização do Markdown

**Adicionar Classes CSS**:
```tsx
<MessageResponse className="custom-markdown prose dark:prose-invert">
  {content}
</MessageResponse>
```

**Estilos Globais** (app/globals.css):
```css
/* Customizar code blocks */
.markdown-content pre {
  @apply rounded-lg bg-zinc-900 p-4;
}

/* Customizar code inline */
.markdown-content code:not(pre code) {
  @apply rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800;
}

/* Customizar links */
.markdown-content a {
  @apply text-blue-500 underline hover:text-blue-700;
}

/* Customizar headings */
.markdown-content h1 {
  @apply mb-4 mt-6 text-3xl font-bold;
}

.markdown-content h2 {
  @apply mb-3 mt-5 text-2xl font-semibold;
}
```

---

### Performance e Otimizações

**Memoização**:
```typescript
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown {...props} />
  ),
  // ⚡ Só re-renderiza se o conteúdo mudar
  (prevProps, nextProps) => prevProps.children === nextProps.children
);
```

**Lazy Rendering**:
- Streamdown renderiza apenas o conteúdo visível
- Code blocks grandes são renderizados sob demanda
- Syntax highlighting é aplicado de forma lazy

**Benefícios**:
- ✅ Smooth streaming sem lag
- ✅ Baixo uso de CPU durante typing
- ✅ Sem flickering ou re-renders desnecessários

---

### Exemplo Completo de Uso

**Componente de Chat Básico**:
```tsx
"use client";

import { useChat } from "ai/react";
import { MessageResponse } from "@/components/ai-elements/message";

export function Chat() {
  const { messages, input, setInput, handleSubmit } = useChat();

  return (
    <div>
      {/* Mensagens */}
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.role === "assistant" ? (
            // ✅ Usa MessageResponse para renderizar markdown
            <MessageResponse>{message.content}</MessageResponse>
          ) : (
            // Mensagens do usuário em texto simples
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

### Troubleshooting

**Problema**: Code blocks não têm syntax highlighting

**Solução**: Instalar Prism.js ou Shiki:
```bash
npm install prismjs
```

**Problema**: Markdown não renderiza durante streaming

**Solução**: Verificar se está usando `MessageResponse` ou `Response`:
```tsx
// ❌ Errado - não renderiza markdown
<p>{message.content}</p>

// ✅ Correto - renderiza markdown progressivamente
<MessageResponse>{message.content}</MessageResponse>
```

**Problema**: Performance ruim com mensagens longas

**Solução**: Streamdown já otimiza, mas você pode adicionar virtualização:
```tsx
import { Virtuoso } from "react-virtuoso";

<Virtuoso
  data={messages}
  itemContent={(index, message) => (
    <MessageResponse>{message.content}</MessageResponse>
  )}
/>
```

---

## Componentes de Input

### `multimodal-input.tsx`

**Localização**: `/components/multimodal-input.tsx`

**Descrição**: Input principal do chat com suporte a texto, arquivos e voice.

**Props**:
```typescript
interface MultimodalInputProps {
  input: string
  setInput: (input: string) => void
  status: "submitted" | "streaming" | "awaiting_input"
  stop: () => void
  attachments: Attachment[]
  setAttachments: (attachments: Attachment[]) => void
  messages: ChatMessage[]
  selectedModelId: string
  selectedVisibilityType: VisibilityType
  chatId: string
  sendMessage: (message: ChatMessage) => void
  isReadonly: boolean
}
```

**Estado Local**:
```typescript
const [localStorageInput, setLocalStorageInput] = useLocalStorage("input", "")
const [uploadQueue, setUploadQueue] = useState<File[]>([])
```

**Hooks**:
- `useAutoFocus`: Focus no textarea (100ms delay)
- `useLocalStorage`: Salva input não enviado
- `useHandleFileUpload`: Gerencia uploads

**Funcionalidades Principais**:

1. **Auto-Resize Textarea**:
```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null)

useEffect(() => {
  if (textareaRef.current) {
    const element = textareaRef.current
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }
}, [input])
```

Limites:
- Min height: 44px
- Max height: 200px
- Overflow: auto

2. **File Upload**:
```typescript
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || [])

  for (const file of files) {
    // Validação
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)")
      continue
    }

    // Upload
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData
    })

    const { url, filename, type } = await response.json()

    // Adicionar attachment
    setAttachments(prev => [
      ...prev,
      { url, filename, mediaType: type }
    ])
  }
}
```

3. **Paste de Imagens**:
```typescript
const handlePaste = (e: React.ClipboardEvent) => {
  const items = Array.from(e.clipboardData.items)

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (file) {
        handleFileUpload(file)
      }
    }
  }
}
```

4. **Suggested Actions**:
```jsx
{messages.length === 0 && attachments.length === 0 && (
  <SuggestedActions
    chatId={chatId}
    sendMessage={sendMessage}
    selectedVisibilityType={selectedVisibilityType}
  />
)}
```

5. **Attachments Preview**:
```jsx
{attachments.length > 0 && (
  <div className="attachments-preview flex gap-2 p-2">
    {attachments.map((attachment, i) => (
      <PreviewAttachment
        key={i}
        attachment={attachment}
        isUploading={uploadQueue.includes(attachment)}
        onRemove={() => {
          setAttachments(prev =>
            prev.filter((_, index) => index !== i)
          )
        }}
      />
    ))}
  </div>
)}
```

**Estrutura Completa**:
```jsx
<div className="multimodal-input-container">
  {/* Hidden file input */}
  <input
    ref={fileInputRef}
    type="file"
    multiple
    accept="image/*,.pdf"
    onChange={handleFileChange}
    className="hidden"
  />

  {/* Suggested actions */}
  {messages.length === 0 && attachments.length === 0 && (
    <SuggestedActions ... />
  )}

  {/* Main input */}
  <PromptInput onSubmit={handleSubmit}>
    {/* Attachments preview */}
    {attachments.length > 0 && (
      <div className="attachments-preview">
        {attachments.map(...)}
      </div>
    )}

    {/* Textarea */}
    <PromptInputTextarea
      ref={textareaRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onPaste={handlePaste}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSubmit()
        }
      }}
      placeholder="Send a message..."
      disabled={status === "streaming" || isReadonly}
      rows={1}
      className="resize-none"
      style={{
        minHeight: "44px",
        maxHeight: "200px"
      }}
    />

    {/* Toolbar */}
    <PromptInputToolbar className="flex items-center gap-2">
      {/* Attachments button */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={
          status === "streaming" ||
          isReadonly ||
          selectedModelId.includes("reasoning")
        }
      >
        <PaperclipIcon />
      </Button>

      {/* Model selector */}
      <ModelSelectorCompact
        selectedModelId={selectedModelId}
        onModelChange={setSelectedModelId}
      />

      {/* Submit/Stop button */}
      {status === "streaming" ? (
        <StopButton onClick={stop} />
      ) : (
        <PromptInputSubmit
          disabled={
            input.trim().length === 0 ||
            uploadQueue.length > 0 ||
            isReadonly
          }
        >
          <ArrowUpIcon />
        </PromptInputSubmit>
      )}
    </PromptInputToolbar>
  </PromptInput>
</div>
```

**Comportamento de Reasoning Models**:
```typescript
// Desabilita attachments para reasoning models
const isReasoningModel = selectedModelId.includes("reasoning") ||
                         selectedModelId.includes("thinking")

<Button
  disabled={isReasoningModel}
  title={isReasoningModel ? "Attachments not supported for reasoning models" : ""}
>
  <PaperclipIcon />
</Button>
```

---

### `preview-attachment.tsx`

**Localização**: `/components/preview-attachment.tsx`

**Descrição**: Preview de arquivo anexado com thumbnail e botão de remoção.

**Props**:
```typescript
interface PreviewAttachmentProps {
  attachment: Attachment
  isUploading: boolean
  onRemove?: () => void
}

interface Attachment {
  url: string
  filename: string
  mediaType: string  // "image/jpeg", "image/png", "application/pdf", etc
}
```

**Renderização**:
```jsx
<div className="relative group">
  {/* Imagem */}
  {attachment.mediaType.startsWith("image/") ? (
    <Image
      src={attachment.url}
      alt={attachment.filename}
      width={80}
      height={80}
      className="rounded-lg object-cover"
    />
  ) : (
    <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center">
      <FileIcon />
    </div>
  )}

  {/* Loader overlay se uploading */}
  {isUploading && (
    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
      <Loader size={20} className="text-white" />
    </div>
  )}

  {/* Botão remove */}
  {onRemove && (
    <button
      onClick={onRemove}
      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
    >
      <CrossSmallIcon />
    </button>
  )}

  {/* Filename */}
  <div className="mt-1 text-xs truncate max-w-[80px]">
    {attachment.filename}
  </div>
</div>
```

---

### `suggested-actions.tsx`

**Localização**: `/components/suggested-actions.tsx`

**Descrição**: Sugestões de prompts quando chat está vazio.

**Props**:
```typescript
interface SuggestedActionsProps {
  chatId: string
  sendMessage: (message: ChatMessage) => void
  selectedVisibilityType: VisibilityType
}
```

**Sugestões Hardcoded**:
```typescript
const suggestions = [
  {
    title: "Explain technical concepts",
    description: "What is a linked list?",
    action: "What is a linked list?"
  },
  {
    title: "Draft an email",
    description: "to my boss about PTO",
    action: "Draft an email to my boss requesting PTO for next week"
  },
  {
    title: "Write a bedtime story",
    description: "about a cat",
    action: "Write a bedtime story about a cat who goes on an adventure"
  },
  {
    title: "Compare programming languages",
    description: "Python vs JavaScript",
    action: "Compare Python and JavaScript for web development"
  }
]
```

**Renderização**:
```jsx
<motion.div
  className="grid grid-cols-1 sm:grid-cols-2 gap-2"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
>
  {suggestions.map((suggestion, i) => (
    <motion.button
      key={i}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      onClick={() => {
        sendMessage({
          id: generateUUID(),
          role: "user",
          content: suggestion.action
        })
      }}
      className="suggestion-card p-4 rounded-lg border hover:border-blue-500 transition text-left"
    >
      <div className="font-medium">{suggestion.title}</div>
      <div className="text-sm text-gray-600">{suggestion.description}</div>
    </motion.button>
  ))}
</motion.div>
```

---

## Componentes de Artifacts

### `artifact.tsx`

**Localização**: `/components/artifact.tsx`

**Descrição**: Painel lateral que exibe artifacts (documentos, código, planilhas).

**Props**:
Recebe todas as props do Chat component (mensagens, input, status, etc.)

**Estado Artifact**:
```typescript
interface UIArtifact {
  title: string
  documentId: string
  kind: "text" | "code" | "image" | "sheet"
  content: string
  isVisible: boolean
  status: "streaming" | "idle"
  boundingBox: {
    top: number
    left: number
    width: number
    height: number
  }
}
```

**Hooks**:
- `useArtifact`: Gerencia estado do artifact
- `useSWR`: Cache de documentos
- `useDebounceCallback`: Debounce de salvamento

**Funcionalidades**:

1. **Renderização Condicional por Tipo**:
```jsx
{artifact.kind === "text" && (
  <TextEditor
    content={artifact.content}
    saveContent={handleSave}
    status={artifact.status}
    ...
  />
)}

{artifact.kind === "code" && (
  <CodeEditor
    content={artifact.content}
    saveContent={handleSave}
    status={artifact.status}
    ...
  />
)}

{artifact.kind === "sheet" && (
  <SheetEditor
    content={artifact.content}
    saveContent={handleSave}
    status={artifact.status}
  />
)}

{artifact.kind === "image" && (
  <Image
    src={artifact.content}
    alt={artifact.title}
    fill
    className="object-contain"
  />
)}
```

2. **Animação de Entrada/Saída**:
```jsx
<motion.div
  initial={{ x: 300, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  exit={{ x: 300, opacity: 0 }}
  transition={{ type: "spring", damping: 20 }}
  className="artifact-panel"
>
  ...
</motion.div>
```

3. **Toolbar de Ações**:
```jsx
<ArtifactActions
  documentId={artifact.documentId}
  title={artifact.title}
  kind={artifact.kind}
  content={artifact.content}
  onClose={() => setArtifact({ ...artifact, isVisible: false })}
/>
```

4. **Version Footer**:
```jsx
<VersionFooter
  documentId={artifact.documentId}
  currentVersionIndex={currentVersionIndex}
  totalVersions={versions.length}
  updatedAt={document.updatedAt}
/>
```

5. **Mensagens do Artifact**:
```jsx
<ArtifactMessages
  messages={artifactMessages}
  sendMessage={sendMessage}
  status={status}
/>
```

**Estrutura Completa**:
```jsx
<AnimatePresence>
  {artifact.isVisible && (
    <motion.div className="artifact-panel">
      {/* Header */}
      <div className="artifact-header">
        <h2>{artifact.title}</h2>
        <ArtifactCloseButton onClick={handleClose} />
      </div>

      {/* Toolbar */}
      <ArtifactActions ... />

      {/* Editor/Viewer */}
      <div className="artifact-content">
        {renderEditor(artifact.kind)}
      </div>

      {/* Footer */}
      <VersionFooter ... />

      {/* Chat area */}
      <ArtifactMessages ... />
    </motion.div>
  )}
</AnimatePresence>
```

**Responsividade**:
```css
/* Desktop */
@media (min-width: 1024px) {
  .artifact-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 50%;
    height: 100vh;
  }
}

/* Mobile */
@media (max-width: 1023px) {
  .artifact-panel {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100vh;
    z-index: 50;
  }
}
```

---

### `code-editor.tsx`

**Localização**: `/components/code-editor.tsx`

**Descrição**: Editor de código com CodeMirror e syntax highlighting.

**Props**:
```typescript
interface CodeEditorProps {
  content: string
  onSaveContent: (content: string) => void
  status: "streaming" | "idle"
  isCurrentVersion: boolean
  currentVersionIndex: number
  suggestions?: Suggestion[]
}
```

**Setup CodeMirror**:
```typescript
import { EditorView, basicSetup } from "codemirror"
import { python } from "@codemirror/lang-python"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorState } from "@codemirror/state"

const editorRef = useRef<HTMLDivElement>(null)
const viewRef = useRef<EditorView>()

useEffect(() => {
  if (!editorRef.current) return

  const startState = EditorState.create({
    doc: content,
    extensions: [
      basicSetup,
      python(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString()
          onSaveContent(newContent)
        }
      })
    ]
  })

  const view = new EditorView({
    state: startState,
    parent: editorRef.current
  })

  viewRef.current = view

  return () => view.destroy()
}, [])
```

**Atualização de Conteúdo**:
```typescript
useEffect(() => {
  if (viewRef.current && content !== viewRef.current.state.doc.toString()) {
    const transaction = viewRef.current.state.update({
      changes: {
        from: 0,
        to: viewRef.current.state.doc.length,
        insert: content
      }
    })
    viewRef.current.dispatch(transaction)
  }
}, [content])
```

**Renderização**:
```jsx
<div className="code-editor-container">
  <div ref={editorRef} className="code-editor" />

  {status === "streaming" && (
    <div className="streaming-indicator">
      <Loader size={16} />
      <span>Generating code...</span>
    </div>
  )}

  {suggestions && suggestions.length > 0 && (
    <div className="suggestions-panel">
      {suggestions.map((suggestion, i) => (
        <SuggestionCard key={i} {...suggestion} />
      ))}
    </div>
  )}
</div>
```

---

### `text-editor.tsx`

**Localização**: `/components/text-editor.tsx`

**Descrição**: Editor rich text com ProseMirror.

**Props**: Similar ao CodeEditor

**Setup ProseMirror**:
```typescript
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { Schema, DOMParser } from "prosemirror-model"
import { schema } from "prosemirror-schema-basic"
import { addListNodes } from "prosemirror-schema-list"
import { exampleSetup } from "prosemirror-example-setup"

// Schema customizado
const documentSchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks
})

// Criar state
const state = EditorState.create({
  doc: DOMParser.fromSchema(documentSchema).parse(
    new DOMParser().parseFromString(content, "text/html")
  ),
  plugins: exampleSetup({ schema: documentSchema })
})

// Criar view
const view = new EditorView(editorRef.current, {
  state,
  dispatchTransaction: (transaction) => {
    const newState = view.state.apply(transaction)
    view.updateState(newState)

    if (transaction.docChanged) {
      const html = serializeToHTML(newState.doc)
      onSaveContent(html)
    }
  }
})
```

**Plugins Customizados**:
```typescript
// Suggestions plugin
const suggestionsPlugin = new Plugin({
  state: {
    init: () => ({ suggestions }),
    apply: (tr, value) => value
  },
  props: {
    decorations: (state) => {
      const { suggestions } = suggestionsPluginKey.getState(state)
      const decorations = []

      suggestions.forEach(suggestion => {
        // Encontrar posição do texto original
        const pos = findTextPosition(state.doc, suggestion.originalSentence)

        if (pos) {
          // Adicionar decoration (highlight)
          decorations.push(
            Decoration.inline(pos.from, pos.to, {
              class: "suggestion-highlight"
            })
          )
        }
      })

      return DecorationSet.create(state.doc, decorations)
    }
  }
})
```

---

### `sheet-editor.tsx`

**Localização**: `/components/sheet-editor.tsx`

**Descrição**: Editor de planilhas com React Data Grid.

**Props**:
```typescript
interface SheetEditorProps {
  content: string  // CSV string
  saveContent: (content: string) => void
  status: "streaming" | "idle"
}
```

**Parse CSV**:
```typescript
import Papa from "papaparse"

const parseCSV = (csv: string) => {
  const result = Papa.parse(csv, {
    header: false,
    skipEmptyLines: true
  })
  return result.data as string[][]
}

const unparseCSV = (data: string[][]) => {
  return Papa.unparse(data)
}
```

**Setup Grid**:
```typescript
import DataGrid from "react-data-grid"

const [rows, setRows] = useState<Row[]>([])
const [columns, setColumns] = useState<Column[]>([])

useEffect(() => {
  const data = parseCSV(content)

  // Garantir mínimo 50 rows x 26 cols
  const minRows = 50
  const minCols = 26

  const paddedData = Array.from({ length: minRows }, (_, i) =>
    Array.from({ length: minCols }, (_, j) =>
      data[i]?.[j] || ""
    )
  )

  // Criar columns (A, B, C, ...)
  const cols: Column[] = [
    {
      key: "rowNumber",
      name: "",
      width: 50,
      frozen: true,
      renderCell: ({ rowIdx }) => rowIdx + 1
    },
    ...paddedData[0].map((_, i) => ({
      key: String.fromCharCode(65 + i),  // A, B, C...
      name: String.fromCharCode(65 + i),
      width: 120,
      editable: true,
      renderEditCell: TextEditor
    }))
  ]

  // Criar rows
  const rows: Row[] = paddedData.map((row, i) => ({
    id: i,
    ...Object.fromEntries(
      row.map((cell, j) => [String.fromCharCode(65 + j), cell])
    )
  }))

  setColumns(cols)
  setRows(rows)
}, [content])
```

**Handle Updates**:
```typescript
const handleRowsChange = (updatedRows: Row[]) => {
  setRows(updatedRows)

  // Converter de volta para CSV
  const data = updatedRows.map(row =>
    columns.slice(1).map(col => row[col.key] || "")
  )

  const csv = unparseCSV(data)
  saveContent(csv)
}
```

**Renderização**:
```jsx
<div className="sheet-editor-container">
  <DataGrid
    columns={columns}
    rows={rows}
    onRowsChange={handleRowsChange}
    className="rdg-light"  // ou rdg-dark
    style={{ height: "100%" }}
  />

  {status === "streaming" && (
    <div className="streaming-overlay">
      <Loader size={24} />
      <span>Generating spreadsheet...</span>
    </div>
  )}
</div>
```

---

## Componentes de UI Básicos

### `ui/button.tsx`

**Localização**: `/components/ui/button.tsx`

**Descrição**: Botão reutilizável com variants.

**Props**:
```typescript
interface ButtonProps extends HTMLButtonAttributes {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm"
  asChild?: boolean
}
```

**Variants (CVA)**:
```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "underline-offset-4 hover:underline text-primary"
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)
```

**Implementação com Slot**:
```typescript
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
```

**Exemplos de Uso**:
```jsx
<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive">Delete</Button>
<Button variant="ghost" size="icon">
  <PlusIcon />
</Button>
<Button asChild>
  <Link href="/chat">Go to chat</Link>
</Button>
```

---

### `ui/badge.tsx`

**Localização**: `/components/ui/badge.tsx`

**Props**:
```typescript
interface BadgeProps extends HTMLDivAttributes {
  variant?: "default" | "secondary" | "destructive" | "outline"
}
```

**Variants**:
```typescript
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)
```

---

### `ui/tooltip.tsx`

Wrapper do Radix UI Tooltip:

```typescript
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
      className
    )}
    {...props}
  />
))
```

**Uso**:
```jsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <TrashIcon />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      Delete chat
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

### Outros Componentes UI

- `ui/dialog.tsx`: Modal dialogs
- `ui/alert-dialog.tsx`: Confirmação crítica
- `ui/input.tsx`: Input estilizado
- `ui/textarea.tsx`: Textarea estilizado
- `ui/card.tsx`: Card container
- `ui/separator.tsx`: Linha divisória
- `ui/avatar.tsx`: Avatar com fallback
- `ui/dropdown-menu.tsx`: Menu dropdown
- `ui/collapsible.tsx`: Wrapper do Radix

Todos seguem o mesmo padrão: Radix UI + Tailwind + CVA

---

## Componentes de Layout

### `app-sidebar.tsx`

**Localização**: `/components/app-sidebar.tsx`

**Props**:
```typescript
interface AppSidebarProps {
  user: User | undefined
}
```

**Estrutura**:
```jsx
<Sidebar className="app-sidebar">
  <SidebarHeader className="h-16 border-b">
    <Link href="/" className="flex items-center gap-2">
      <BotIcon />
      <span className="font-semibold">Chatbot</span>
    </Link>

    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => router.push("/")}
      >
        <PlusIcon />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setShowDeleteDialog(true)}
      >
        <TrashIcon />
      </Button>
    </div>
  </SidebarHeader>

  <SidebarContent>
    <SidebarHistory user={user} />
  </SidebarContent>

  <SidebarFooter className="border-t p-4">
    <SidebarUserNav user={user} />
  </SidebarFooter>
</Sidebar>

{/* Delete all dialog */}
<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete all your chat history.
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

---

### `chat-header.tsx`

**Localização**: `/components/chat-header.tsx`

**Props**:
```typescript
interface ChatHeaderProps {
  chatId: string
  selectedVisibilityType: VisibilityType
  isReadonly: boolean
}
```

**Renderização Responsiva**:
```jsx
<header className="chat-header h-16 border-b flex items-center justify-between px-4">
  {/* Mobile: Sidebar toggle */}
  <div className="md:hidden">
    <SidebarToggle />
  </div>

  {/* Desktop: New chat button (se não é readonly) */}
  <div className="hidden md:flex">
    {!isReadonly && (
      <Button
        variant="ghost"
        onClick={() => router.push("/")}
      >
        <PlusIcon className="mr-2" />
        New Chat
      </Button>
    )}
  </div>

  {/* Center: Visibility selector (se não é readonly) */}
  {!isReadonly && (
    <VisibilitySelector
      chatId={chatId}
      selectedVisibilityType={selectedVisibilityType}
    />
  )}

  {/* Right: Deploy button (desktop only) */}
  <div className="hidden md:flex">
    <Button variant="outline" asChild>
      <a href="https://vercel.com/new/clone?repository-url=https://github.com/vercel/ai-chatbot" target="_blank">
        <VercelIcon className="mr-2" />
        Deploy with Vercel
      </a>
    </Button>
  </div>
</header>
```

---

### `sidebar-history.tsx`

**Localização**: `/components/sidebar-history.tsx`

**Props**:
```typescript
interface SidebarHistoryProps {
  user: User | undefined
}
```

**Paginação com SWR Infinite**:
```typescript
const { data, size, setSize, isLoading } = useSWRInfinite<Chat[]>(
  (pageIndex) => {
    if (!user) return null
    return `/api/chat/history?page=${pageIndex}&limit=20`
  },
  fetcher
)

const chats = data ? data.flat() : []
const isLoadingMore = size > 0 && data && typeof data[size - 1] === "undefined"
const isEmpty = data?.[0]?.length === 0
const isReachingEnd = isEmpty || (data && data[data.length - 1]?.length < 20)
```

**Agrupamento por Data**:
```typescript
const groupedChats = useMemo(() => {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = startOfDay(subDays(now, 1))
  const lastWeek = startOfDay(subDays(now, 7))
  const lastMonth = startOfDay(subDays(now, 30))

  return {
    today: chats.filter(c => new Date(c.createdAt) >= today),
    yesterday: chats.filter(c => {
      const date = new Date(c.createdAt)
      return date >= yesterday && date < today
    }),
    lastWeek: chats.filter(c => {
      const date = new Date(c.createdAt)
      return date >= lastWeek && date < yesterday
    }),
    lastMonth: chats.filter(c => {
      const date = new Date(c.createdAt)
      return date >= lastMonth && date < lastWeek
    }),
    older: chats.filter(c => new Date(c.createdAt) < lastMonth)
  }
}, [chats])
```

**Renderização com Motion**:
```jsx
<div className="sidebar-history overflow-y-auto">
  {Object.entries(groupedChats).map(([group, groupChats]) => {
    if (groupChats.length === 0) return null

    return (
      <div key={group} className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase px-2 mb-2">
          {group === "today" ? "Today" :
           group === "yesterday" ? "Yesterday" :
           group === "lastWeek" ? "Last 7 days" :
           group === "lastMonth" ? "Last 30 days" :
           "Older"}
        </h3>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } }
          }}
        >
          {groupChats.map(chat => (
            <motion.div
              key={chat.id}
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              <SidebarHistoryItem
                chat={chat}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    )
  })}

  {/* Load more button */}
  {!isReachingEnd && (
    <Button
      variant="ghost"
      onClick={() => setSize(size + 1)}
      disabled={isLoadingMore}
      className="w-full"
    >
      {isLoadingMore ? <Loader size={16} /> : "Load more"}
    </Button>
  )}
</div>
```

---

### `sidebar-user-nav.tsx`

**Localização**: `/components/sidebar-user-nav.tsx`

**Props**:
```typescript
interface SidebarUserNavProps {
  user: User | undefined
}
```

**Renderização**:
```jsx
<div className="sidebar-user-nav flex items-center gap-3">
  <Avatar>
    <AvatarImage src={user?.image} alt={user?.name} />
    <AvatarFallback>
      {user?.name?.[0] || user?.email?.[0] || "U"}
    </AvatarFallback>
  </Avatar>

  <div className="flex-1 min-w-0">
    <div className="font-medium truncate">{user?.name || "Guest"}</div>
    <div className="text-xs text-gray-500 truncate">{user?.email}</div>
  </div>

  <SignOutForm>
    <Button variant="ghost" size="icon-sm" type="submit">
      <ArrowRightIcon className="rotate-180" />
    </Button>
  </SignOutForm>
</div>
```

---

## Hierarquia e Patterns

### Hierarquia Completa de Componentes

```
App
└── RootLayout
    └── SidebarProvider
        ├── AppSidebar
        │   ├── SidebarHeader
        │   │   ├── Logo/Link
        │   │   └── Buttons (New, Delete All)
        │   ├── SidebarContent
        │   │   └── SidebarHistory
        │   │       └── SidebarHistoryItem[]
        │   └── SidebarFooter
        │       └── SidebarUserNav
        │           └── SignOutForm
        └── Main
            └── Page (Chat ou Home)
                └── DataStreamProvider
                    ├── ChatHeader
                    │   ├── SidebarToggle (mobile)
                    │   ├── New Chat button
                    │   ├── VisibilitySelector
                    │   └── Deploy button
                    ├── Messages
                    │   ├── Greeting (se empty)
                    │   ├── PreviewMessage[]
                    │   │   ├── Avatar
                    │   │   ├── MessageContent
                    │   │   │   ├── PreviewAttachment[] (se user)
                    │   │   │   ├── Response (Markdown)
                    │   │   │   ├── MessageReasoning (colapsível)
                    │   │   │   └── Tool Outputs
                    │   │   │       ├── Weather
                    │   │   │       ├── DocumentPreview
                    │   │   │       └── Tool (approval/result)
                    │   │   ├── MessageEditor (edit mode)
                    │   │   └── MessageActions
                    │   │       ├── EditButton
                    │   │       ├── CopyButton
                    │   │       ├── UpvoteButton
                    │   │       └── DownvoteButton
                    │   ├── ThinkingMessage (se loading)
                    │   └── ScrollToBottomButton
                    ├── MultimodalInput
                    │   ├── SuggestedActions (se empty)
                    │   ├── FileInput (hidden)
                    │   └── PromptInput
                    │       ├── PreviewAttachment[]
                    │       ├── PromptInputTextarea
                    │       └── PromptInputToolbar
                    │           ├── AttachmentsButton
                    │           ├── ModelSelectorCompact
                    │           └── SubmitButton | StopButton
                    ├── Artifact (modal panel)
                    │   ├── ArtifactHeader
                    │   │   ├── Title
                    │   │   └── ArtifactCloseButton
                    │   ├── ArtifactActions
                    │   │   ├── CopyButton
                    │   │   ├── DownloadButton
                    │   │   └── MoreMenu
                    │   ├── Editor/Viewer
                    │   │   ├── TextEditor (ProseMirror)
                    │   │   ├── CodeEditor (CodeMirror)
                    │   │   ├── SheetEditor (React Data Grid)
                    │   │   └── ImageViewer
                    │   ├── VersionFooter
                    │   └── ArtifactMessages
                    │       └── Mini Chat
                    └── DataStreamHandler (invisible)
```

### Design Patterns Utilizados

#### 1. **Compound Component Pattern**
```jsx
<Tool>
  <ToolHeader state="output-available" toolName="getWeather" />
  <ToolContent>
    <ToolInput args={{ city: "Tokyo" }} />
    <ToolOutput>
      <Weather ... />
    </ToolOutput>
  </ToolContent>
</Tool>
```

#### 2. **Render Props Pattern**
```jsx
<SidebarHistory>
  {({ chats }) => chats.map(chat => <ChatItem key={chat.id} {...chat} />)}
</SidebarHistory>
```

#### 3. **Context Provider Pattern**
```jsx
<DataStreamProvider>
  <Chat />
  <DataStreamHandler />
</DataStreamProvider>
```

#### 4. **Custom Hooks Pattern**
```jsx
const { artifact, setArtifact, openArtifact } = useArtifact()
const { messages, sendMessage, status } = useChat()
const { data, mutate } = useSWR(key, fetcher)
```

#### 5. **Memoization Pattern**
```jsx
const PreviewMessage = React.memo(
  ({ message, ...props }) => {
    // Component implementation
  },
  (prevProps, nextProps) => {
    return isEqual(prevProps.message, nextProps.message) &&
           prevProps.isLoading === nextProps.isLoading
  }
)
```

#### 6. **Composition Pattern**
```jsx
<PromptInput>
  <PromptInputTextarea />
  <PromptInputToolbar>
    <AttachmentsButton />
    <ModelSelector />
    <SubmitButton />
  </PromptInputToolbar>
</PromptInput>
```

---

## Resumo de Funcionalidades por Componente

| Componente | Funcionalidade Principal | Features Especiais |
|------------|-------------------------|-------------------|
| `chat.tsx` | Orquestração do chat | Tool approval, auto-resume, error handling |
| `messages.tsx` | Lista de mensagens | Auto-scroll, greeting, thinking state |
| `message.tsx` | Renderização individual | Edit mode, tools, reasoning, attachments |
| `multimodal-input.tsx` | Input do usuário | File upload, paste, auto-resize, suggestions |
| `artifact.tsx` | Painel de artifacts | 4 tipos de editor, versioning, animations |
| `weather.tsx` | Dados meteorológicos | Gradients dia/noite, hourly forecast, sunrise/sunset |
| `sidebar-history.tsx` | Histórico de chats | Paginação infinita, agrupamento por data |
| `code-editor.tsx` | Editor de código | CodeMirror, syntax highlight, auto-save |
| `text-editor.tsx` | Editor de texto | ProseMirror, rich text, suggestions |
| `sheet-editor.tsx` | Editor de planilhas | React Data Grid, CSV, 50x26 grid |

---

## Componentes por Categoria

### Chat Core (5)
- chat.tsx
- messages.tsx
- message.tsx
- message-editor.tsx
- message-actions.tsx

### Input (4)
- multimodal-input.tsx
- preview-attachment.tsx
- suggested-actions.tsx
- greeting.tsx

### Tools (5)
- elements/tool.tsx
- weather.tsx
- document.tsx
- document-preview.tsx
- document-tool-result.tsx

### Artifacts (7)
- artifact.tsx
- code-editor.tsx
- text-editor.tsx
- sheet-editor.tsx
- artifact-actions.tsx
- artifact-close-button.tsx
- version-footer.tsx

### Loading (3)
- elements/loader.tsx
- ThinkingMessage
- document-skeleton.tsx

### Layout (6)
- app-sidebar.tsx
- chat-header.tsx
- sidebar-history.tsx
- sidebar-history-item.tsx
- sidebar-user-nav.tsx
- sidebar-toggle.tsx

### UI Primitives (15+)
- ui/button.tsx
- ui/badge.tsx
- ui/tooltip.tsx
- ui/dialog.tsx
- ui/alert-dialog.tsx
- ui/input.tsx
- ui/textarea.tsx
- ui/card.tsx
- ui/separator.tsx
- ui/avatar.tsx
- ui/dropdown-menu.tsx
- ui/collapsible.tsx
- ui/sidebar.tsx
- ... e mais

### Utilities (10+)
- data-stream-provider.tsx
- data-stream-handler.tsx
- visibility-selector.tsx
- model-selector.tsx
- icons.tsx
- theme-provider.tsx
- toast.tsx
- auth-form.tsx
- sign-out-form.tsx
- submit-button.tsx

### AI Elements (20+)
Versões expandidas dos componentes core com features adicionais.

---

**Total**: 90+ componentes documentados

Esta documentação cobre todos os aspectos dos componentes do projeto ai-chatbot, desde os básicos até os mais complexos, com exemplos de uso, props, estados, e patterns implementados.
