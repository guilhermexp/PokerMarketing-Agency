# Guia de Estilo - PokerMarketing Agency

> Baseado nos padrões estabelecidos na página de Agenda de Publicações

## Índice
1. [Cores](#cores)
2. [Tipografia](#tipografia)
3. [Componentes](#componentes)
4. [Layout](#layout)
5. [Interações](#interações)
6. [Ícones](#ícones)
7. [Estados](#estados)
8. [Acessibilidade](#acessibilidade)

---

## Cores

### Paleta Principal

```css
/* Primary - Amber/Gold */
--color-primary: #f59e0b;
--color-primary-hover: #d97706;

/* Background - Dark Theme */
--color-background: #0c0c0c;
--color-surface: #121212;
--color-muted: #181818;
--color-subtle: #303030;

/* Text */
--color-text-main: #ffffff;
--color-text-muted: #646464;
```

### Cores Semânticas

```css
/* Status Colors */
--color-scheduled: #f59e0b;  /* Amber - Agendado */
--color-publishing: #f59e0b; /* Amber - Publicando */
--color-published: #22c55e;  /* Green - Publicado */
--color-failed: #ef4444;     /* Red - Falhou */
--color-cancelled: #6b7280;  /* Gray - Cancelado */
```

### Opacidades

O app usa extensivamente o sistema de opacidades do Tailwind:

```css
/* Backgrounds */
bg-black/40     /* 40% opacity - Glassmorphism cards */
bg-black/60     /* 60% opacity - Modals */
bg-black/90     /* 90% opacity - Overlays */
bg-white/5      /* 5% opacity - Subtle backgrounds */
bg-white/10     /* 10% opacity - Borders and dividers */

/* Text */
text-white/90   /* 90% opacity - Primary text */
text-white/70   /* 70% opacity - Secondary text */
text-white/50   /* 50% opacity - Tertiary text */
text-white/40   /* 40% opacity - Disabled/muted text */
text-white/30   /* 30% opacity - Very subtle text */
```

---

## Tipografia

### Fonte

```css
font-family: 'Inter', sans-serif;
```

### Escala de Tamanhos

| Uso | Classe Tailwind | Tamanho |
|-----|----------------|---------|
| Hero números (datas) | `text-7xl` | 72px |
| Título principal | `text-3xl` | 30px |
| Subtítulo | `text-lg` | 18px |
| Título de seção | `text-base` | 16px |
| Corpo de texto | `text-sm` | 14px |
| Texto secundário | `text-xs` | 12px |
| Labels pequenos | `text-[10px]` | 10px |
| Micro texto | `text-[9px]` | 9px |
| Ultra pequeno | `text-[8px]` | 8px |
| Mínimo | `text-[7px]` | 7px |

### Pesos

```css
font-light    /* 300 - Para números grandes */
font-normal   /* 400 - Texto padrão */
font-medium   /* 500 - Ênfase suave */
font-semibold /* 600 - Títulos */
font-bold     /* 700 - Botões e labels */
font-black    /* 900 - Status badges */
```

### Exemplos de Uso

```tsx
// Hero número (data)
<h3 className="text-7xl font-light text-white/80">
  15
</h3>

// Título principal
<h1 className="text-3xl font-semibold text-white tracking-tight">
  Agenda de Publicações
</h1>

// Subtítulo
<p className="text-sm text-white/50 mt-1">
  Gerencie seus posts agendados
</p>

// Micro label
<span className="text-[10px] font-medium text-white/60">
  24 agendados
</span>
```

---

## Componentes

### Cards

#### Card Base - Glassmorphism

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
  {/* Conteúdo */}
</div>
```

#### Card Interativo

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg p-3
  hover:bg-black/60 hover:border-white/20 cursor-pointer transition-all">
  {/* Conteúdo */}
</div>
```

#### Card de Post Compacto

```tsx
<div className="w-full p-2 rounded-lg bg-black/40 border border-white/10
  hover:bg-black/60 hover:border-white/20 transition-all">
  <div className="flex items-start gap-2">
    {/* Ícone */}
    {/* Conteúdo */}
    {/* Status indicator */}
  </div>
</div>
```

### Botões

#### Botão Primary

```tsx
<button className="flex items-center gap-2 px-4 py-2
  bg-black/40 backdrop-blur-2xl border border-white/10
  rounded-full text-sm font-medium text-white/90
  hover:border-white/30 transition-all
  shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
  <Icon name="plus" className="w-4 h-4" />
  Agendar Post
</button>
```

#### Botão Secondary (Outline)

```tsx
<button className="px-3 py-1.5
  bg-black/40 backdrop-blur-2xl border border-white/10
  rounded-lg text-xs font-medium text-white/60
  hover:text-white hover:border-white/30 transition-all">
  Hoje
</button>
```

#### Botão Icon

```tsx
<button className="p-2 text-white/40
  hover:text-white hover:bg-white/10
  rounded-lg transition-colors">
  <Icon name="chevron-left" className="w-4 h-4" />
</button>
```

#### Botão Icon Circular

```tsx
<button className="p-2 bg-black/40 backdrop-blur-2xl
  border border-white/10 hover:border-white/30
  rounded-full text-white/50 transition-all">
  <Icon name="copy" className="w-4 h-4" />
</button>
```

#### Botão Destrutivo

```tsx
<button className="flex items-center gap-2 px-4 py-2
  bg-black/40 backdrop-blur-2xl border border-white/10
  hover:bg-red-500/10 hover:border-red-500/30
  rounded-full text-sm font-medium
  text-white/40 hover:text-red-400 transition-all">
  <Icon name="trash" className="w-4 h-4" />
  Excluir
</button>
```

### Badges de Status

```tsx
// Status Agendado
<div className="px-2.5 py-1 rounded-lg text-[9px] font-medium
  bg-amber-500/10 text-amber-400 border border-amber-500/20">
  Agendado
</div>

// Status Publicado
<div className="px-2.5 py-1 rounded-lg text-[9px] font-medium
  bg-green-500/10 text-green-400 border border-green-500/20">
  Publicado
</div>

// Status Falhou
<div className="px-2.5 py-1 rounded-lg text-[9px] font-medium
  bg-red-500/10 text-red-400 border border-red-500/20">
  Falhou
</div>

// Status Publishing
<div className="px-2.5 py-1 rounded-lg text-[9px] font-medium
  bg-amber-500/10 text-amber-400 border border-amber-500/20">
  Publicando
</div>
```

### Indicadores de Status (Dots)

```tsx
// Dot Verde (Publicado)
<div className="w-2 h-2 rounded-full bg-green-500" />

// Dot Âmbar (Agendado)
<div className="w-2 h-2 rounded-full bg-amber-500" />

// Dot Vermelho (Falhou)
<div className="w-2 h-2 rounded-full bg-red-500" />

// Dot Pulsante (Publicando)
<div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
```

### Stats Pills

```tsx
<div className="flex items-center gap-3 px-4 py-2
  bg-black/40 backdrop-blur-2xl border border-white/10
  rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
  <div className="flex items-center gap-1.5">
    <div className="w-2 h-2 rounded-full bg-amber-500" />
    <span className="text-[10px] font-medium text-white/60">
      24 agendados
    </span>
  </div>
  <div className="h-3 w-px bg-white/10" />
  <div className="flex items-center gap-1.5">
    <div className="w-2 h-2 rounded-full bg-green-500" />
    <span className="text-[10px] font-medium text-white/60">
      12 publicados
    </span>
  </div>
</div>
```

### Modais

#### Modal Base

```tsx
// Overlay
<div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50
  flex items-center justify-center p-4"
  onClick={onClose}>

  {/* Modal Container */}
  <div className="bg-black/60 backdrop-blur-2xl
    border border-white/10 rounded-2xl
    max-w-lg w-full overflow-hidden
    shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
    onClick={(e) => e.stopPropagation()}>

    {/* Header */}
    <div className="px-5 py-4 border-b border-white/10
      flex justify-between items-center">
      <h3 className="text-lg font-semibold text-white">
        Título do Modal
      </h3>
      <button className="p-2 text-white/40 hover:text-white
        rounded-lg hover:bg-white/10 transition-colors">
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>

    {/* Content */}
    <div className="px-5 py-4">
      {/* Conteúdo */}
    </div>

    {/* Footer */}
    <div className="px-5 py-4 border-t border-white/10 flex gap-2">
      {/* Botões */}
    </div>
  </div>
</div>
```

### Inputs

#### Input de Texto

```tsx
<input
  type="text"
  className="w-full px-3 py-2
    bg-black/30 border border-white/10 rounded-lg
    text-sm text-white/80
    placeholder:text-white/30
    focus:outline-none focus:border-primary/50
    transition-colors"
  placeholder="Digite aqui..."
/>
```

#### Input de Data

```tsx
<input
  type="date"
  className="px-3 py-2
    bg-black/30 border border-white/10 rounded-lg
    text-xs text-white/80
    focus:outline-none focus:border-primary/50"
/>
```

#### Input de Hora

```tsx
<input
  type="time"
  className="px-3 py-2
    bg-black/30 border border-white/10 rounded-lg
    text-xs text-white/80
    focus:outline-none focus:border-primary/50"
/>
```

### Dividers

```tsx
// Divider Horizontal
<div className="border-b border-white/10" />

// Divider Vertical
<div className="h-3 w-px bg-white/10" />

// Divider com Texto
<div className="flex items-center gap-3">
  <div className="flex-1 border-t border-white/10" />
  <span className="text-xs text-white/40">ou</span>
  <div className="flex-1 border-t border-white/10" />
</div>
```

### Loading States

#### Spinner

```tsx
<div className="w-4 h-4 border-2 border-white/20
  border-t-white/60 rounded-full animate-spin" />
```

#### Progress Bar

```tsx
<div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
  <div
    className="h-full bg-white/50 transition-all duration-300"
    style={{ width: `${progress}%` }}
  />
</div>
```

### Banners

#### Banner de Notificação

```tsx
<div className="px-6 py-3
  bg-amber-500/10 border-b border-amber-500/20
  flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Icon name="bell" className="w-4 h-4 text-amber-400" />
    <p className="text-xs font-semibold text-amber-400">
      3 posts pendentes
    </p>
  </div>
  <button className="p-1 text-amber-400/40 hover:text-amber-400">
    <Icon name="x" className="w-3 h-3" />
  </button>
</div>
```

---

## Layout

### Container Principal

```tsx
<div className="min-h-screen flex flex-col">
  {/* Header */}
  {/* Content */}
  {/* Footer */}
</div>
```

### Sticky Header

```tsx
<header className="sticky top-0
  bg-black border-b border-white/10 z-50">
  <div className="px-6 py-4">
    {/* Header content */}
  </div>
</header>
```

### Grid de Calendário

```tsx
<div className="grid grid-cols-7 gap-px
  bg-white/5 border border-white/10
  rounded-lg overflow-hidden">
  {/* Calendar cells */}
</div>
```

### Grid de Cards

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
  gap-4 p-6">
  {/* Cards */}
</div>
```

### Espaçamento Padrão

```css
/* Padding de containers */
px-6 py-4    /* Container padrão */
px-4 py-3    /* Cards */
px-3 py-2    /* Inputs */
p-2          /* Botões icon */

/* Gaps entre elementos */
gap-2        /* Botões adjacentes */
gap-3        /* Elementos relacionados */
gap-4        /* Seções */
gap-6        /* Grandes seções */
```

---

## Interações

### Transições

```css
/* Transições padrão */
transition-colors    /* Mudanças de cor */
transition-all       /* Todas as propriedades */
duration-300         /* Duração padrão */

/* Exemplo completo */
className="hover:bg-white/10 transition-colors"
className="hover:scale-105 transition-all duration-300"
```

### Hover States

```tsx
// Card hover
className="hover:bg-black/60 hover:border-white/20"

// Botão hover
className="hover:text-white hover:bg-white/10"

// Link hover
className="hover:text-primary"

// Destrutivo hover
className="hover:bg-red-500/10 hover:text-red-400"
```

### Active/Focus States

```tsx
// Input focus
className="focus:outline-none focus:border-primary/50"

// Botão focus
className="focus:ring-2 focus:ring-primary/50 focus:outline-none"
```

### Disabled States

```tsx
<button
  disabled={isLoading}
  className="disabled:opacity-50 disabled:cursor-not-allowed">
  Botão
</button>
```

---

## Ícones

### Sistema de Ícones

O app usa um componente `Icon` centralizado com Lucide Icons.

#### Ícones Comuns

```tsx
// Navegação
<Icon name="chevron-left" />
<Icon name="chevron-right" />
<Icon name="x" />

// Ações
<Icon name="plus" />
<Icon name="edit" />
<Icon name="trash" />
<Icon name="send" />
<Icon name="copy" />
<Icon name="check" />

// Status
<Icon name="clock" />
<Icon name="calendar" />
<Icon name="bell" />
<Icon name="alert-circle" />

// Social
<Icon name="instagram" />
<Icon name="facebook" />
<Icon name="share" />

// Mídia
<Icon name="image" />
<Icon name="external-link" />
```

#### Tamanhos

```tsx
// Extra pequeno
<Icon className="w-3 h-3" />

// Pequeno
<Icon className="w-4 h-4" />

// Médio (padrão)
<Icon className="w-5 h-5" />

// Grande
<Icon className="w-6 h-6" />
```

---

## Estados

### Estados de Post

| Estado | Cor | Badge | Dot |
|--------|-----|-------|-----|
| `scheduled` | Amber | `bg-amber-500/10 text-amber-400` | `bg-amber-500` |
| `publishing` | Amber | `bg-amber-500/10 text-amber-400` | `bg-amber-400 animate-pulse` |
| `published` | Green | `bg-green-500/10 text-green-400` | `bg-green-500` |
| `failed` | Red | `bg-red-500/10 text-red-400` | `bg-red-500` |
| `cancelled` | Gray | `bg-white/5 text-white/30` | `bg-white/30` |

### Mensagens de Feedback

#### Sucesso

```tsx
<div className="px-3 py-2 bg-green-500/5
  border border-green-500/20 rounded-lg">
  <div className="flex items-center gap-2">
    <Icon name="check" className="w-4 h-4 text-green-400/70" />
    <span className="text-xs text-green-400/70">
      Operação concluída com sucesso!
    </span>
  </div>
</div>
```

#### Erro

```tsx
<div className="px-3 py-2 bg-red-500/5
  border border-red-500/20 rounded-lg">
  <div className="flex items-center gap-2">
    <Icon name="alert-circle" className="w-4 h-4 text-red-400/70" />
    <span className="text-xs text-red-400/70">
      Erro ao processar a operação
    </span>
  </div>
</div>
```

#### Aviso

```tsx
<div className="px-3 py-2 bg-amber-500/5
  border border-amber-500/20 rounded-lg">
  <div className="flex items-center gap-2">
    <Icon name="alert-circle" className="w-4 h-4 text-amber-400/70" />
    <span className="text-xs text-amber-400/70">
      Atenção: Verifique os dados
    </span>
  </div>
</div>
```

#### Info

```tsx
<div className="px-3 py-2 bg-white/5
  border border-white/10 rounded-lg">
  <div className="flex items-center gap-2">
    <Icon name="info" className="w-4 h-4 text-white/50" />
    <span className="text-xs text-white/50">
      Informação adicional
    </span>
  </div>
</div>
```

---

## Acessibilidade

### Princípios

1. **Contraste de Cores**: Manter contraste mínimo de 4.5:1 para texto
2. **Focus States**: Sempre fornecer indicadores visuais de foco
3. **Aria Labels**: Usar para ícones e botões sem texto
4. **Keyboard Navigation**: Suportar navegação completa por teclado
5. **Loading States**: Indicar claramente quando operações estão em progresso

### Exemplos

```tsx
// Botão acessível
<button
  aria-label="Fechar modal"
  className="p-2 hover:bg-white/10 rounded-lg
    focus:ring-2 focus:ring-primary/50 focus:outline-none">
  <Icon name="x" className="w-4 h-4" />
</button>

// Loading state
<button
  disabled={isLoading}
  aria-busy={isLoading}
  className="...">
  {isLoading ? (
    <>
      <div className="w-4 h-4 animate-spin ..." />
      <span className="sr-only">Carregando...</span>
    </>
  ) : (
    'Salvar'
  )}
</button>
```

---

## Exemplos de Implementação

### Card de Post Completo

```tsx
<div className="w-full p-2 rounded-lg
  bg-black/40 border border-white/10
  hover:bg-black/60 hover:border-white/20
  cursor-pointer transition-all">

  <div className="flex items-start gap-2">
    {/* Ícone da plataforma */}
    <Icon name="instagram" className="w-3 h-3 text-white/40 flex-shrink-0 mt-0.5" />

    {/* Conteúdo */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        {/* Horário */}
        <span className="text-[10px] font-medium text-white/80">
          14:30
        </span>
        {/* Tipo de conteúdo */}
        <span className="text-[8px] font-medium text-white/40">
          Story
        </span>
      </div>
      {/* Caption preview */}
      <p className="text-[9px] text-white/40 truncate">
        Confira as novidades do torneio de hoje...
      </p>
    </div>

    {/* Status indicator */}
    <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1" />
  </div>
</div>
```

### Header de Página

```tsx
<header className="sticky top-0 bg-black border-b border-white/10 z-50">
  <div className="px-6 py-4">
    <div className="flex flex-col gap-4">
      {/* Título */}
      <div>
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          Título da Página
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Descrição da página
        </p>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Navegação */}
        <div className="flex items-center gap-4">
          <button className="p-2 text-white/40 hover:text-white
            hover:bg-white/10 rounded-lg transition-colors">
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-medium text-white/70">
            Janeiro 2026
          </h3>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-3 px-4 py-2
            bg-black/40 backdrop-blur-2xl border border-white/10
            rounded-full">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10px] font-medium text-white/60">
                24 agendados
              </span>
            </div>
          </div>

          {/* Botão primary */}
          <button className="flex items-center gap-2 px-4 py-2
            bg-black/40 backdrop-blur-2xl border border-white/10
            rounded-full text-sm font-medium text-white/90
            hover:border-white/30 transition-all">
            <Icon name="plus" className="w-4 h-4" />
            Nova Ação
          </button>
        </div>
      </div>
    </div>
  </div>
</header>
```

---

## Melhores Práticas

### ✅ Fazer

- Usar glassmorphism para cards e overlays
- Manter opacidades consistentes (white/10, white/20, etc.)
- Usar rounded-full para botões pill
- Usar rounded-lg para cards
- Usar rounded-2xl para modais
- Incluir estados de loading e feedback visual
- Manter transições suaves
- Usar sombras dramáticas para profundidade
- Usar badges coloridos para status
- Usar micro tipografia (9px-10px) para labels

### ❌ Evitar

- Bordas sólidas e pesadas
- Fundos completamente opacos
- Transições bruscas
- Textos muito grandes em cards
- Cores muito saturadas
- Espaçamento inconsistente
- Misturar estilos de botão
- Esquecer estados de hover/focus
- Usar ícones sem tamanhos consistentes

---

## Responsividade

### Breakpoints Tailwind

```css
sm: 640px   /* Small screens */
md: 768px   /* Medium screens */
lg: 1024px  /* Large screens */
xl: 1280px  /* Extra large screens */
2xl: 1536px /* 2X large screens */
```

### Exemplo de Grid Responsivo

```tsx
<div className="grid grid-cols-1
  sm:grid-cols-2
  lg:grid-cols-3
  xl:grid-cols-4
  gap-4">
  {/* Cards */}
</div>
```

### Exemplo de Layout Responsivo

```tsx
<div className="flex flex-col md:flex-row
  items-start md:items-center
  gap-4">
  {/* Conteúdo */}
</div>
```

---

## Conclusão

Este guia de estilo estabelece os padrões visuais e de interação para o PokerMarketing Agency. Ao seguir estas diretrizes, você garantirá:

- **Consistência visual** em toda a aplicação
- **Experiência de usuário coesa** e profissional
- **Manutenibilidade** facilitada do código
- **Performance** otimizada com Tailwind CSS
- **Acessibilidade** para todos os usuários

Para dúvidas ou sugestões de melhorias, consulte o código da página de Agenda de Publicações como referência principal.
