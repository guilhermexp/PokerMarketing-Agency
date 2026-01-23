# Focus Standards - PokerMarketing Agency

> Padrões de foco para navegação por teclado e acessibilidade

## Índice
1. [Visão Geral](#visão-geral)
2. [Padrão Padrão](#padrão-padrão)
3. [Por que focus-visible?](#por-que-focus-visible)
4. [Implementação](#implementação)
5. [Tailwind Utilities](#tailwind-utilities)
6. [CSS Class Utility](#css-class-utility)
7. [Componentes UI](#componentes-ui)
8. [Acessibilidade](#acessibilidade)
9. [Testes](#testes)

---

## Visão Geral

Este documento define o padrão de focus ring para todos os elementos interativos no PokerMarketing Agency. O objetivo é fornecer uma experiência consistente e acessível para usuários de teclado.

### Princípios

1. **Consistência**: Todos os elementos interativos usam o mesmo padrão de foco
2. **Visibilidade**: Focus rings devem ser claramente visíveis contra o fundo escuro
3. **Apenas Teclado**: Usar `focus-visible` para mostrar focus apenas em navegação por teclado
4. **Cor de Marca**: Usar a cor primária amber/gold (#f59e0b) para focus rings

---

## Padrão Padrão

### Especificações

| Propriedade | Valor | Descrição |
|-------------|-------|-----------|
| **Cor** | `#f59e0b` (amber/gold) | Cor primária da marca |
| **Largura** | `2px` (CSS) ou `3px` (Tailwind) | Espessura do anel de foco |
| **Opacidade** | `50%` para Tailwind (`ring-ring/50`) | Semi-transparente para suavidade |
| **Offset** | `2px` | Espaçamento entre elemento e anel |
| **Seletor** | `focus-visible:` | Apenas navegação por teclado |

### Variável CSS

A cor do focus ring está definida como variável CSS global:

```css
/* src/styles/main.css */
@theme {
  --color-ring: #f59e0b;
}
```

---

## Por que focus-visible?

### focus vs focus-visible

| Seletor | Comportamento | Problema |
|---------|---------------|----------|
| `focus:` | Mostra em **todos** os focos (mouse + teclado) | Mostra anel ao clicar com mouse (ruído visual) |
| `focus-visible:` | Mostra apenas em navegação por **teclado** | ✅ Comportamento ideal para UX |

### Exemplo Comparativo

```tsx
// ❌ Evitar - mostra focus ao clicar com mouse
<button className="focus:ring-2 focus:ring-primary">
  Botão
</button>

// ✅ Correto - mostra focus apenas com teclado (Tab)
<button className="focus-visible:ring-[3px] focus-visible:ring-ring/50">
  Botão
</button>
```

---

## Implementação

### Abordagem 1: Tailwind Utilities (Recomendado)

Para a maioria dos componentes, use as classes Tailwind:

```tsx
className="focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
```

**Componentes que usam este padrão:**
- Botões (`button.tsx`)
- Inputs (`input.tsx`)
- Textareas (`textarea.tsx`)
- Selects (`select.tsx`)
- Links interativos

### Abordagem 2: CSS Class Utility

Para casos onde Tailwind não é ideal, use a classe `.focus-ring-standard`:

```tsx
<button className="focus-ring-standard">
  Botão Customizado
</button>
```

---

## Tailwind Utilities

### Padrão Completo

```tsx
// Padrão completo para elementos interativos
className="
  outline-none
  focus-visible:ring-[3px]
  focus-visible:ring-ring/50
  focus-visible:outline-none
"
```

### Breakdown

```tsx
// 1. Remove outline padrão do navegador
outline-none

// 2. Adiciona anel de foco de 3px (apenas teclado)
focus-visible:ring-[3px]

// 3. Define cor do anel (amber/gold com 50% opacidade)
focus-visible:ring-ring/50

// 4. Garante que não há outline nativo ao focar
focus-visible:outline-none
```

### Exemplo em Componente

```tsx
import { cn } from "@/lib/utils"

export function Button({ className, ...props }) {
  return (
    <button
      className={cn(
        // Base styles
        "px-4 py-2 rounded-lg bg-primary text-white",
        // Focus styles
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        // Custom overrides
        className
      )}
      {...props}
    />
  )
}
```

---

## CSS Class Utility

### Definição

```css
/* src/styles/main.css */

/* Standard focus ring for interactive elements */
.focus-ring-standard {
    outline: 2px solid transparent;
    outline-offset: 2px;
}

.focus-ring-standard:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
}
```

### Quando Usar

Use `.focus-ring-standard` quando:

1. Você está trabalhando com HTML puro (sem Tailwind)
2. Precisa de um padrão CSS reutilizável
3. Está criando componentes de baixo nível

### Exemplo

```tsx
// Componente customizado sem Tailwind
export function CustomLink({ href, children }) {
  return (
    <a
      href={href}
      className="focus-ring-standard custom-link-styles"
    >
      {children}
    </a>
  )
}
```

---

## Componentes UI

### Botões

#### shadcn/ui Button

```tsx
// src/components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-hover",
      },
    },
    // Focus pattern
    className: "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
  }
)
```

#### Botão Customizado

```tsx
<button className="px-4 py-2 bg-black/40 border border-white/10 rounded-full text-white/90 hover:border-white/30 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
  Criar Post
</button>
```

### Inputs

#### shadcn/ui Input

```tsx
// src/components/ui/input.tsx
<input
  className={cn(
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2",
    "text-sm ring-offset-background",
    // Focus pattern
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    className
  )}
  {...props}
/>
```

#### Input Customizado

```tsx
<input
  type="text"
  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-white/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all"
  placeholder="Digite aqui..."
/>
```

### Textareas

```tsx
<textarea
  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-white/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all"
  placeholder="Escreva seu texto..."
/>
```

### Selects

```tsx
// src/components/ui/select.tsx
<SelectTrigger
  className={cn(
    "flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2",
    // Focus pattern
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
  )}
>
  {/* ... */}
</SelectTrigger>
```

### Links

```tsx
<a
  href="/dashboard"
  className="text-primary hover:text-primary-hover outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded"
>
  Ir para Dashboard
</a>
```

### Dialog Close Buttons

```tsx
<button
  className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
  aria-label="Fechar modal"
>
  <Icon name="x" className="w-4 h-4" />
</button>
```

---

## Acessibilidade

### WCAG 2.1 Compliance

O padrão de focus segue as diretrizes WCAG 2.1:

| Critério | Nível | Status | Nota |
|----------|-------|--------|------|
| **2.4.7 Focus Visible** | AA | ✅ Compliant | Focus sempre visível para teclado |
| **1.4.11 Non-text Contrast** | AA | ✅ Compliant | Contraste 3:1 mínimo para UI |
| **2.1.1 Keyboard** | A | ✅ Compliant | Todos elementos acessíveis via teclado |

### Contraste de Cores

```
Fundo escuro (#000000) + Anel amber (#f59e0b)
Contraste: ~4.8:1 ✅ Passa WCAG AA
```

### Navegação por Teclado

Todos os elementos interativos devem ser acessíveis via `Tab`:

```tsx
// Garantir ordem lógica de tab
<form>
  <input tabIndex={1} {...} />
  <input tabIndex={2} {...} />
  <button tabIndex={3}>Enviar</button>
</form>
```

### Screen Readers

Sempre incluir `aria-label` para botões sem texto:

```tsx
<button
  aria-label="Fechar modal"
  className="outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
>
  <Icon name="x" />
</button>
```

---

## Testes

### Testes Manuais

#### 1. Navegação por Teclado

```
1. Abrir a página
2. Pressionar Tab repetidamente
3. Verificar que:
   - Todos elementos interativos recebem foco
   - Focus ring é visível (anel amber de 3px)
   - Ordem de foco é lógica
   - Não há "armadilhas" de foco (focus traps)
```

#### 2. Navegação por Mouse

```
1. Clicar em elementos interativos com mouse
2. Verificar que:
   - NÃO aparece focus ring ao clicar
   - Apenas hover states são visíveis
   - Comportamento é limpo e sem ruído visual
```

#### 3. Contraste Visual

```
1. Usar DevTools para simular diferentes ambientes de luz
2. Verificar visibilidade do focus ring em:
   - Fundos escuros (#000000, #121212)
   - Fundos semi-transparentes (black/40)
   - Sobre imagens
```

### Testes Automatizados

#### Axe DevTools

```bash
# Instalar extensão Axe DevTools no Chrome/Firefox
# Rodar scan de acessibilidade em cada página
# Verificar que não há erros relacionados a focus
```

#### Lighthouse

```bash
# Rodar Lighthouse audit
npm run build
lighthouse http://localhost:5173 --view

# Verificar score de Acessibilidade > 95
```

### Checklist de QA

- [ ] Todos inputs têm focus ring consistente (3px amber)
- [ ] Todos botões têm focus ring consistente
- [ ] Links têm focus ring visível
- [ ] Modals e dialogs têm focus management correto
- [ ] Não aparece focus ring ao clicar com mouse
- [ ] Focus ring é visível em todos fundos (dark theme)
- [ ] Navegação por Tab segue ordem lógica
- [ ] Score de acessibilidade Lighthouse > 95

---

## Exemplos Práticos

### Antes vs Depois

#### ❌ Antes (Inconsistente)

```tsx
// Mistura de padrões diferentes
<input className="focus:border-white/30" />
<button className="focus:outline-none focus:ring-1" />
<textarea className="focus:border-primary" />
```

**Problemas:**
- Focus ring diferente em cada elemento
- Alguns usam `focus:`, outros não
- Larguras inconsistentes
- Sem padrão definido

#### ✅ Depois (Consistente)

```tsx
// Padrão unificado
<input className="outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
<button className="outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
<textarea className="outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
```

**Benefícios:**
- Padrão consistente em todos elementos
- Apenas teclado (`focus-visible`)
- Cor e largura unificadas
- Fácil de manter

### Exemplo Completo: Form

```tsx
export function ContactForm() {
  return (
    <form className="space-y-4">
      {/* Input de texto */}
      <div>
        <label htmlFor="name" className="text-sm text-white/70">
          Nome
        </label>
        <input
          id="name"
          type="text"
          className="w-full px-3 py-2 mt-1 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-white/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all"
          placeholder="Seu nome"
        />
      </div>

      {/* Textarea */}
      <div>
        <label htmlFor="message" className="text-sm text-white/70">
          Mensagem
        </label>
        <textarea
          id="message"
          rows={4}
          className="w-full px-3 py-2 mt-1 bg-black/30 border border-white/10 rounded-lg text-sm text-white/80 placeholder:text-white/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all"
          placeholder="Sua mensagem"
        />
      </div>

      {/* Botão de submit */}
      <button
        type="submit"
        className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-all"
      >
        Enviar Mensagem
      </button>
    </form>
  )
}
```

---

## Referências

### Documentos Relacionados

- [STYLE_GUIDE.md](./STYLE_GUIDE.md) - Guia de estilo geral
- [COMPONENT_LIBRARY.md](./COMPONENT_LIBRARY.md) - Biblioteca de componentes
- [src/styles/main.css](../src/styles/main.css) - CSS global com variáveis

### Recursos Externos

- [WCAG 2.1 Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html)
- [MDN: :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)
- [WebAIM: Keyboard Accessibility](https://webaim.org/techniques/keyboard/)

---

## Manutenção

### Atualizando o Padrão

Se precisar alterar o padrão de focus:

1. **Atualizar variável CSS** em `src/styles/main.css`
   ```css
   --color-ring: #nova-cor;
   ```

2. **Atualizar documentação** neste arquivo

3. **Testar em todos componentes** UI core:
   - Button
   - Input
   - Textarea
   - Select
   - Dialog
   - Dropdown Menu

4. **Rodar testes de acessibilidade**
   - Lighthouse audit
   - Axe DevTools scan
   - Navegação manual por teclado

5. **Comunicar mudança** à equipe

---

## FAQ

### Por que 3px no Tailwind e 2px no CSS?

Tailwind usa uma escala ligeiramente diferente. `ring-[3px]` no Tailwind é visualmente similar a `outline: 2px` no CSS puro devido a diferenças de renderização.

### Posso usar focus: em vez de focus-visible:?

**Não recomendado.** Use sempre `focus-visible:` para evitar mostrar focus ring ao clicar com mouse, o que cria ruído visual desnecessário.

### E se eu precisar de um focus ring diferente?

Para casos especiais, você pode sobrescrever:

```tsx
<button className="outline-none focus-visible:ring-[3px] focus-visible:ring-red-500/50">
  Botão Especial
</button>
```

Mas mantenha consistência o máximo possível.

### Como testar se está funcionando?

1. Use `Tab` para navegar (deve aparecer anel amber)
2. Clique com mouse (NÃO deve aparecer anel)
3. Use DevTools para inspecionar `:focus-visible` state

---

**Última atualização:** 2026-01-23
**Responsável:** Auto-Claude
**Status:** ✅ Ativo
