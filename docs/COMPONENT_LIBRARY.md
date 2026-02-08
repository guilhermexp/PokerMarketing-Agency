# Biblioteca de Componentes - PokerMarketing Agency

> Componentes prontos para copiar e usar no app

## Índice
- [Botões](#botões)
- [Cards](#cards)
- [Inputs](#inputs)
- [Modais](#modais)
- [Badges](#badges)
- [Banners](#banners)
- [Loading States](#loading-states)
- [Mensagens de Feedback](#mensagens-de-feedback)
- [Headers](#headers)
- [Listas](#listas)

---

## Botões

### Botão Primary - Ação Principal

```tsx
<button className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
  <Icon name="plus" className="w-4 h-4" />
  Agendar Post
</button>
```

### Botão Secondary - Ação Secundária

```tsx
<button className="px-3 py-1.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:border-white/30 transition-all">
  Hoje
</button>
```

### Botão Icon - Navegação

```tsx
<button className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
  <Icon name="chevron-left" className="w-4 h-4" />
</button>
```

### Botão Icon Circular - Ações Rápidas

```tsx
<button className="p-2 bg-black/40 backdrop-blur-2xl border border-white/10 hover:border-white/30 rounded-full text-white/50 transition-all" title="Copiar">
  <Icon name="copy" className="w-4 h-4" />
</button>
```

### Botão Destrutivo - Ações de Remoção

```tsx
<button className="flex items-center justify-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 hover:bg-red-500/10 rounded-full text-sm font-medium text-white/40 hover:text-red-400 transition-all">
  <Icon name="trash" className="w-4 h-4" />
  Excluir
</button>
```

### Botão Loading - Estado Carregando

```tsx
<button disabled className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white/50 cursor-wait border border-white/10 rounded-full text-sm font-medium transition-all">
  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  Publicando...
</button>
```

### Botão Disabled - Estado Desabilitado

```tsx
<button disabled className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 opacity-50 cursor-not-allowed">
  <Icon name="plus" className="w-4 h-4" />
  Indisponível
</button>
```

---

## Cards

### Card Base - Glassmorphism

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
  <h3 className="text-sm font-semibold text-white mb-2">Título do Card</h3>
  <p className="text-xs text-white/50">Conteúdo do card</p>
</div>
```

### Card Interativo - Com Hover

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg p-3 hover:bg-black/60 hover:border-white/20 cursor-pointer transition-all">
  <div className="flex items-center gap-3">
    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
      <Icon name="calendar" className="w-6 h-6 text-primary" />
    </div>
    <div>
      <h3 className="text-sm font-semibold text-white">Card Interativo</h3>
      <p className="text-xs text-white/50">Clique para expandir</p>
    </div>
  </div>
</div>
```

### Card de Post - Compacto

```tsx
<div className="w-full p-2 rounded-lg bg-black/40 border border-white/10 cursor-pointer transition-all hover:bg-black/60 hover:border-white/20">
  <div className="flex items-start gap-2">
    <Icon name="instagram" className="w-3 h-3 flex-shrink-0 text-white/40 mt-0.5" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-medium text-white/80">14:30</span>
        <span className="text-[8px] font-medium text-white/40">Story</span>
      </div>
      <p className="text-[9px] text-white/40 truncate">
        Confira as novidades do torneio de hoje...
      </p>
    </div>
    <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1" />
  </div>
</div>
```

### Card com Imagem - Preview

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden">
  <div className="aspect-video bg-black/40 flex items-center justify-center border-b border-white/10">
    <img src="/path/to/image.jpg" alt="" className="w-full h-full object-cover" />
  </div>
  <div className="p-4">
    <h3 className="text-sm font-semibold text-white mb-1">Título do Post</h3>
    <p className="text-xs text-white/50">Descrição do conteúdo</p>
  </div>
</div>
```

### Card de Estatística - Stats

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl p-4">
  <div className="flex items-center justify-between mb-3">
    <span className="text-xs text-white/50">Total Agendados</span>
    <Icon name="calendar" className="w-4 h-4 text-white/30" />
  </div>
  <div className="text-3xl font-light text-white mb-1">24</div>
  <div className="flex items-center gap-1 text-[10px]">
    <span className="text-green-400">+12%</span>
    <span className="text-white/40">vs. mês anterior</span>
  </div>
</div>
```

---

## Inputs

### Input de Texto - Padrão

```tsx
<div className="space-y-1">
  <label className="text-xs font-medium text-white/70">Nome</label>
  <input
    type="text"
    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-primary/50 transition-colors"
    placeholder="Digite seu nome..."
  />
</div>
```

### Input de Data e Hora

```tsx
<div className="flex gap-2">
  <input
    type="date"
    className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs text-white/80 focus:outline-none focus:border-primary/50"
  />
  <input
    type="time"
    className="w-28 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs text-white/80 focus:outline-none focus:border-primary/50"
  />
</div>
```

### Textarea - Texto Longo

```tsx
<div className="space-y-1">
  <label className="text-xs font-medium text-white/70">Legenda</label>
  <textarea
    rows={4}
    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-primary/50 transition-colors resize-none"
    placeholder="Digite a legenda do post..."
  />
</div>
```

### Select - Dropdown

```tsx
<div className="space-y-1">
  <label className="text-xs font-medium text-white/70">Plataforma</label>
  <select className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none focus:border-primary/50 transition-colors">
    <option value="">Selecione...</option>
    <option value="instagram">Instagram</option>
    <option value="facebook">Facebook</option>
    <option value="both">Ambos</option>
  </select>
</div>
```

### Checkbox - Seleção Múltipla

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="w-4 h-4 rounded border-white/10 bg-black/30 text-primary focus:ring-primary/50 focus:ring-offset-0"
  />
  <span className="text-sm text-white/70">Publicar automaticamente</span>
</label>
```

---

## Modais

### Modal Base - Estrutura Completa

```tsx
{isOpen && (
  <div
    className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
    onClick={onClose}>
    <div
      className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl max-w-lg w-full overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
      onClick={(e) => e.stopPropagation()}>

      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-white">Título do Modal</h3>
          <p className="text-sm text-white/50 mt-0.5">Descrição opcional</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-white/70">
          Conteúdo do modal aqui...
        </p>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10 flex gap-2">
        <button className="flex-1 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
          Confirmar
        </button>
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full text-sm font-medium text-white/50 transition-all">
          Cancelar
        </button>
      </div>
    </div>
  </div>
)}
```

### Modal com Imagem

```tsx
{isOpen && (
  <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl max-w-sm w-full overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.7)]" onClick={(e) => e.stopPropagation()}>

      <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Preview</h3>
        <button onClick={onClose} className="p-2 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="w-full rounded-xl overflow-hidden border border-white/10">
          <img src="/path/to/image.jpg" alt="" className="w-full h-auto object-contain" />
        </div>
      </div>

      <div className="px-4 py-4 border-t border-white/10">
        <button className="w-full px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
          Fechar
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Badges

### Badge de Status - Agendado

```tsx
<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
  Agendado
</div>
```

### Badge de Status - Publicado

```tsx
<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
  <Icon name="check" className="w-3 h-3" />
  Publicado
</div>
```

### Badge de Status - Falhou

```tsx
<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
  <Icon name="alert-circle" className="w-3 h-3" />
  Falhou
</div>
```

### Badge Simples - Etiqueta

```tsx
<span className="inline-block px-2 py-0.5 rounded-full text-[8px] font-medium bg-white/10 text-white/60">
  Story
</span>
```

### Badge com Número - Contador

```tsx
<div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-bold bg-primary/20 text-primary">
  <span>24</span>
  <span className="text-[7px] font-medium">novos</span>
</div>
```

---

## Banners

### Banner de Notificação - Aviso

```tsx
<div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Icon name="bell" className="w-4 h-4 text-amber-400" />
    <p className="text-xs font-semibold text-amber-400">
      3 posts pendentes de publicação
    </p>
  </div>
  <div className="flex items-center gap-2">
    <button className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-full text-xs font-medium text-white/90 hover:border-white/30 transition-all">
      <Icon name="send" className="w-3 h-3" />
      Publicar Todos
    </button>
    <button className="p-1 text-amber-400/40 hover:text-amber-400">
      <Icon name="x" className="w-3 h-3" />
    </button>
  </div>
</div>
```

### Banner de Sucesso

```tsx
<div className="px-6 py-3 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Icon name="check-circle" className="w-4 h-4 text-green-400" />
    <p className="text-xs font-semibold text-green-400">
      Post publicado com sucesso!
    </p>
  </div>
  <button className="p-1 text-green-400/40 hover:text-green-400">
    <Icon name="x" className="w-3 h-3" />
  </button>
</div>
```

### Banner de Erro

```tsx
<div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Icon name="alert-circle" className="w-4 h-4 text-red-400" />
    <p className="text-xs font-semibold text-red-400">
      Erro ao processar a publicação
    </p>
  </div>
  <button className="p-1 text-red-400/40 hover:text-red-400">
    <Icon name="x" className="w-3 h-3" />
  </button>
</div>
```

---

## Loading States

### Spinner - Pequeno

```tsx
<div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
```

### Spinner - Médio

```tsx
<div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
```

### Spinner com Texto

```tsx
<div className="flex items-center gap-3">
  <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
  <span className="text-sm text-white/60">Carregando...</span>
</div>
```

### Progress Bar - Barra de Progresso

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-xs text-white/60">Publicando...</span>
    <span className="text-xs text-white/60">75%</span>
  </div>
  <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
    <div
      className="h-full bg-white/50 transition-all duration-300"
      style={{ width: '75%' }}
    />
  </div>
</div>
```

### Skeleton - Placeholder de Carregamento

```tsx
<div className="space-y-3 animate-pulse">
  <div className="h-4 bg-white/10 rounded w-3/4" />
  <div className="h-4 bg-white/10 rounded w-1/2" />
  <div className="h-4 bg-white/10 rounded w-5/6" />
</div>
```

---

## Mensagens de Feedback

### Mensagem de Sucesso

```tsx
<div className="px-4 py-3 bg-green-500/5 border border-green-500/20 rounded-lg">
  <div className="flex items-start gap-3">
    <Icon name="check-circle" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-green-400 mb-1">Sucesso!</h4>
      <p className="text-xs text-green-400/70">
        Sua operação foi concluída com sucesso.
      </p>
    </div>
  </div>
</div>
```

### Mensagem de Erro

```tsx
<div className="px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-lg">
  <div className="flex items-start gap-3">
    <Icon name="alert-circle" className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-red-400 mb-1">Erro</h4>
      <p className="text-xs text-red-400/70">
        Ocorreu um erro ao processar sua solicitação. Tente novamente.
      </p>
    </div>
  </div>
</div>
```

### Mensagem de Aviso

```tsx
<div className="px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
  <div className="flex items-start gap-3">
    <Icon name="alert-triangle" className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-amber-400 mb-1">Atenção</h4>
      <p className="text-xs text-amber-400/70">
        Verifique os dados antes de continuar.
      </p>
    </div>
  </div>
</div>
```

### Mensagem de Informação

```tsx
<div className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg">
  <div className="flex items-start gap-3">
    <Icon name="info" className="w-5 h-5 text-white/50 flex-shrink-0 mt-0.5" />
    <div>
      <h4 className="text-sm font-semibold text-white/70 mb-1">Informação</h4>
      <p className="text-xs text-white/50">
        Esta é uma mensagem informativa para o usuário.
      </p>
    </div>
  </div>
</div>
```

---

## Headers

### Header de Página - Completo

```tsx
<header className="sticky top-0 bg-black border-b border-white/10 z-50">
  <div className="px-6 py-4">
    <div className="flex flex-col gap-4">
      {/* Título */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            Título da Página
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Descrição da página
          </p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <button className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-medium text-white/70">
            Janeiro 2026
          </h3>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
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

          <button className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <Icon name="plus" className="w-4 h-4" />
            Agendar Post
          </button>
        </div>
      </div>
    </div>
  </div>
</header>
```

### Header Simples

```tsx
<header className="border-b border-white/10 bg-black">
  <div className="px-6 py-4 flex items-center justify-between">
    <h1 className="text-2xl font-semibold text-white">
      Título da Página
    </h1>
    <button className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
      <Icon name="plus" className="w-4 h-4" />
      Nova Ação
    </button>
  </div>
</header>
```

---

## Listas

### Lista de Items - Vertical

```tsx
<div className="space-y-2">
  {items.map((item) => (
    <div
      key={item.id}
      className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/10 hover:bg-black/30 hover:border-white/20 transition-all cursor-pointer">

      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
        <Icon name="calendar" className="w-5 h-5 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white truncate">
          {item.title}
        </h3>
        <p className="text-xs text-white/50 truncate">
          {item.description}
        </p>
      </div>

      <Icon name="chevron-right" className="w-4 h-4 text-white/30 flex-shrink-0" />
    </div>
  ))}
</div>
```

### Lista com Avatares

```tsx
<div className="space-y-2">
  {users.map((user) => (
    <div
      key={user.id}
      className="flex items-center gap-3 p-3 rounded-lg bg-black/20 border border-white/10 hover:bg-black/30 transition-all">

      <img
        src={user.avatar}
        alt={user.name}
        className="w-10 h-10 rounded-full border border-white/10"
      />

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white truncate">
          {user.name}
        </h3>
        <p className="text-xs text-white/50 truncate">
          {user.email}
        </p>
      </div>

      <button className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
        <Icon name="more-vertical" className="w-4 h-4" />
      </button>
    </div>
  ))}
</div>
```

### Lista Vazia - Empty State

```tsx
<div className="flex flex-col items-center justify-center py-12">
  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
    <Icon name="inbox" className="w-8 h-8 text-white/20" />
  </div>
  <h3 className="text-sm font-semibold text-white/70 mb-1">
    Nenhum item encontrado
  </h3>
  <p className="text-xs text-white/40 text-center max-w-xs mb-4">
    Comece criando seu primeiro item clicando no botão abaixo.
  </p>
  <button className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
    <Icon name="plus" className="w-4 h-4" />
    Criar Item
  </button>
</div>
```

---

## Dividers

### Divider Horizontal

```tsx
<div className="border-b border-white/10" />
```

### Divider Vertical

```tsx
<div className="h-3 w-px bg-white/10" />
```

### Divider com Texto

```tsx
<div className="flex items-center gap-3">
  <div className="flex-1 border-t border-white/10" />
  <span className="text-xs text-white/40">ou</span>
  <div className="flex-1 border-t border-white/10" />
</div>
```

---

## Dicas de Uso

### ✅ Boas Práticas

1. **Sempre use glassmorphism** para cards e overlays
2. **Mantenha opacidades consistentes** (white/10, white/20, etc.)
3. **Use transições suaves** em todas as interações
4. **Adicione estados de loading** para operações assíncronas
5. **Forneça feedback visual** para todas as ações do usuário
6. **Use ícones consistentes** do sistema Icon
7. **Mantenha espaçamento uniforme** entre elementos

### 🎨 Personalização

Para personalizar os componentes:
- Ajuste os valores de opacidade (`/10`, `/20`, etc.)
- Modifique os arredondamentos (`rounded-lg`, `rounded-xl`, etc.)
- Altere os espaçamentos (`px-4`, `py-2`, etc.)
- Adapte as cores para outros estados

---

## Próximos Passos

1. Copie os componentes necessários
2. Ajuste para seu caso de uso específico
3. Mantenha a consistência visual
4. Teste a responsividade
5. Valide a acessibilidade

Para mais detalhes sobre o sistema de design, consulte o [STYLE_GUIDE.md](./STYLE_GUIDE.md).

---

## AI Elements (Oficial)

Componentes UI do Vercel AI SDK para chat, tools e aprovações.

### Componentes Instalados

- **Message**: Components oficiais para mensagens de chat
  - `Message`, `MessageContent`, `MessageActions`, `MessageAction`
  - `MessageResponse`, `MessageAttachment`, `MessageBranch`

- **Tool**: Componentes para preview e execução de tools
  - `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`

- **Confirmation**: Componentes para aprovação de tools
  - `Confirmation`, `ConfirmationRequest`, `ConfirmationActions`, `ConfirmationAction`

- **Loader**: Spinner animado oficial

- **Prompt Input**: Componentes de input de prompt
  - `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit`

### Componentes Customizados (Extensões)

**Baseados em ai-elements mas com funcionalidades adicionais do projeto:**

#### ToolWithApproval
Fluxo completo de aprovação de tools com preview e ações.

```tsx
<ToolWithApproval
  toolCallId="abc123"
  toolName="createImage"
  args={{ description: "...", aspectRatio: "16:9" }}
  metadata={{
    title: "Criar Imagem",
    estimatedTime: "15-30 segundos",
    willDo: ["Gerar imagem com IA", "Salvar na galeria"]
  }}
  state="approval-requested"
  approvalId="approval-123"
  onApprove={handleApprove}
  onDeny={handleDeny}
  onAlwaysAllow={(toolName) => console.log('Always allow:', toolName)}
/>
```

#### MessageActionsEnhanced
Ações de mensagem com funcionalidades customizadas (Pin, Fork, Share).

```tsx
<MessageActionsEnhanced
  messageId="msg-123"
  content="Texto da mensagem..."
  chatId="chat-456"
  onPin={(id) => console.log('Pin:', id)}
  onFork={(id) => console.log('Fork:', id)}
/>
```

#### LoadingIndicatorEnhanced
Loading com stages e skeleton placeholders.

```tsx
<LoadingIndicatorEnhanced stage="thinking" />
<LoadingIndicatorEnhanced stage="generating" />
<LoadingIndicatorEnhanced message="Analisando imagem..." />
```

### Documentação Completa

Para guia detalhado de uso, instalação e arquitetura, consulte [AI_ELEMENTS_USAGE.md](./AI_ELEMENTS_USAGE.md).
