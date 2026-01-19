# Design System - PokerMarketing Agency

Bem-vindo à documentação do Design System do PokerMarketing Agency. Este conjunto de guias foi criado para garantir consistência, qualidade e manutenibilidade do código.

## 📚 Guias Disponíveis

### 🎨 [Style Guide](./STYLE_GUIDE.md)
**Guia completo de estilo visual e design**

Define todos os padrões visuais do aplicativo baseados na página de Agenda de Publicações:
- Paleta de cores e opacidades
- Tipografia e hierarquia
- Sistema de componentes visuais
- Layout e espaçamento
- Interações e transições
- Estados visuais
- Acessibilidade

**Quando usar:** Ao criar ou modificar qualquer elemento visual da interface.

---

### 🧩 [Component Library](./COMPONENT_LIBRARY.md)
**Biblioteca de componentes prontos para uso**

Coleção de componentes prontos para copiar e colar:
- Botões (7 variações)
- Cards (5 tipos)
- Inputs e Forms
- Modais
- Badges e Status
- Banners de Notificação
- Loading States
- Mensagens de Feedback
- Headers
- Listas

**Quando usar:** Quando precisar implementar rapidamente um componente já padronizado.

---

### ⚛️ [React Patterns](./REACT_PATTERNS.md)
**Padrões e boas práticas React/TypeScript**

Guia de código com padrões estabelecidos:
- Estrutura de componentes
- TypeScript avançado
- Hooks (useState, useEffect, useMemo, useCallback)
- Custom Hooks
- Estado e Props
- Event Handlers
- Conditional Rendering
- Performance e otimização
- Padrões comuns (Modal, Form, Loading, Error Boundary)

**Quando usar:** Ao escrever ou revisar código React/TypeScript.

---

## 🚀 Quick Start

### 1. Para Novos Desenvolvedores

1. **Leia primeiro:** [Style Guide](./STYLE_GUIDE.md) - Entenda o sistema de design
2. **Explore:** [Component Library](./COMPONENT_LIBRARY.md) - Veja os componentes disponíveis
3. **Codifique:** [React Patterns](./REACT_PATTERNS.md) - Siga as melhores práticas

### 2. Para Desenvolvedores Experientes

**Implementando uma nova feature:**
1. Consulte o [Component Library](./COMPONENT_LIBRARY.md) para componentes existentes
2. Revise o [Style Guide](./STYLE_GUIDE.md) para garantir consistência visual
3. Siga os padrões do [React Patterns](./REACT_PATTERNS.md) para código limpo

### 3. Para Code Review

**Checklist de revisão:**
- [ ] Segue o [Style Guide](./STYLE_GUIDE.md)?
- [ ] Usa componentes da [Component Library](./COMPONENT_LIBRARY.md)?
- [ ] Aplica os [React Patterns](./REACT_PATTERNS.md)?
- [ ] TypeScript está corretamente tipado?
- [ ] Performance está otimizada?
- [ ] Acessibilidade foi considerada?

---

## 🎯 Princípios do Design System

### Visual
- **Glassmorphism**: Efeito de vidro com backdrop-blur
- **Dark Theme**: Fundo preto (#0c0c0c) com elementos translúcidos
- **Primary Color**: Amber/Gold (#f59e0b)
- **Opacidades**: Sistema consistente (white/10, white/20, etc.)
- **Rounded Corners**: rounded-lg para cards, rounded-full para botões

### Código
- **TypeScript First**: Tipagem rigorosa em todo o código
- **Functional Components**: Usar React.FC e hooks
- **Performance**: Memoização quando necessário
- **Composição**: Componentes pequenos e reutilizáveis
- **Acessibilidade**: ARIA labels e keyboard navigation

### Processo
- **Consistência**: Seguir os padrões estabelecidos
- **Documentação**: Código autodocumentado com tipos claros
- **Testes**: Testar componentes e lógica crítica
- **Review**: Code review obrigatório

---

## 📖 Referências Rápidas

### Cores Principais

```css
Primary:     #f59e0b (Amber)
Background:  #0c0c0c (Black)
Surface:     #121212 (Dark Gray)
Text:        #ffffff (White)
```

### Espaçamentos

```css
px-2  py-1    /* Extra small */
px-3  py-2    /* Small */
px-4  py-3    /* Medium */
px-6  py-4    /* Large */
```

### Opacidades

```css
/10   /* Borders, dividers */
/20   /* Subtle backgrounds */
/40   /* Glassmorphism */
/60   /* Modais */
/80   /* Primary text */
```

### Arredondamento

```css
rounded-lg    /* Cards (8px) */
rounded-xl    /* Large cards (12px) */
rounded-2xl   /* Modals (16px) */
rounded-full  /* Pills, buttons */
```

### Transições

```css
transition-colors    /* Color changes */
transition-all       /* All properties */
duration-300         /* Default duration */
```

---

## 🔍 Exemplos Práticos

### Criar um Card

```tsx
<div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
  <h3 className="text-sm font-semibold text-white mb-2">Título</h3>
  <p className="text-xs text-white/50">Conteúdo</p>
</div>
```

### Criar um Botão

```tsx
<button className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all">
  <Icon name="plus" className="w-4 h-4" />
  Novo Item
</button>
```

### Criar um Badge de Status

```tsx
<div className="px-2.5 py-1 rounded-lg text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
  Publicado
</div>
```

---

## 🛠️ Ferramentas e Stack

### Frontend
- **React 18** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **Lucide Icons** - Sistema de ícones

### Desenvolvimento
- **Vite** - Build tool
- **ESLint** - Linter
- **Prettier** - Formatação

### Boas Práticas
- **Git Flow** - Versionamento
- **Conventional Commits** - Commits padronizados
- **Code Review** - Revisão obrigatória

---

## 📝 Atualizações e Manutenção

### Como Contribuir

1. **Encontrou um padrão melhor?**
   - Proponha mudanças via PR
   - Documente o motivo da mudança
   - Atualize exemplos afetados

2. **Novo componente comum?**
   - Adicione ao [Component Library](./COMPONENT_LIBRARY.md)
   - Inclua exemplos de uso
   - Documente props e variações

3. **Novo padrão de código?**
   - Adicione ao [React Patterns](./REACT_PATTERNS.md)
   - Inclua exemplos bons e ruins
   - Explique o raciocínio

### Versionamento

Estes guias seguem o mesmo versionamento do projeto principal. Mudanças significativas serão documentadas no CHANGELOG.

---

## 🎓 Aprendizado

### Para Iniciantes em React
1. Comece com componentes simples do [Component Library](./COMPONENT_LIBRARY.md)
2. Estude os exemplos do [React Patterns](./REACT_PATTERNS.md)
3. Pratique criando variações dos componentes existentes

### Para Desenvolvedores Intermediários
1. Aprofunde-se nos custom hooks
2. Otimize performance com useMemo/useCallback
3. Contribua com novos padrões

### Para Desenvolvedores Avançados
1. Revise e melhore os padrões existentes
2. Identifique oportunidades de abstração
3. Mentore outros desenvolvedores

---

## 📞 Suporte

### Dúvidas sobre os Guias
- Consulte os exemplos práticos em cada guia
- Verifique o código da página de Agenda (referência principal)
- Abra uma issue no repositório para discussão

### Sugestões de Melhoria
- Pull requests são bem-vindos!
- Documente suas mudanças claramente
- Inclua exemplos quando aplicável

---

## ✅ Checklist Final

Antes de fazer push do seu código:

- [ ] Código segue o [Style Guide](./STYLE_GUIDE.md)
- [ ] Componentes reutilizáveis estão na [Component Library](./COMPONENT_LIBRARY.md)
- [ ] Código React segue os [React Patterns](./REACT_PATTERNS.md)
- [ ] TypeScript sem erros
- [ ] Componentes acessíveis (ARIA, keyboard)
- [ ] Performance otimizada (memo, useMemo, useCallback quando necessário)
- [ ] Responsivo em diferentes tamanhos de tela
- [ ] Testado em diferentes cenários
- [ ] Documentação atualizada se necessário

---

## 🎉 Conclusão

Estes guias foram criados para:
- ✅ Manter consistência visual em todo o app
- ✅ Acelerar o desenvolvimento com componentes prontos
- ✅ Garantir qualidade de código com padrões estabelecidos
- ✅ Facilitar onboarding de novos desenvolvedores
- ✅ Reduzir débito técnico

**Lembre-se:** Estes guias são vivos e devem evoluir com o projeto. Contribua, questione e melhore!

---

*Última atualização: Janeiro 2026*
*Baseado na implementação da página de Agenda de Publicações*
