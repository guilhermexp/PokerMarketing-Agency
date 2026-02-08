# Social Stories Widget

## Visão Geral

O componente Social Stories foi integrado ao app para exibir posts já publicados no estilo "Stories" do Instagram. O componente aparece como um avatar flutuante no canto inferior esquerdo da tela (desktop) e permite que os usuários visualizem os posts publicados em formato de stories.

## Como Funciona

### 1. **Componentes Criados**

- **`src/components/ui/social-stories.tsx`**: Componente base de stories com toda a lógica de navegação, progress bars, pause/play, etc.
- **`src/components/ui/published-stories-widget.tsx`**: Container que integra os posts agendados publicados com o componente de stories

### 2. **Integração com o Sistema**

O widget busca automaticamente todos os posts com:
- `status === "published"`
- `publishedAt` definido

Os posts são ordenados do mais recente para o mais antigo e limitados a 20 stories.

### 3. **Localização no App**

O componente está integrado no `Dashboard.tsx` e aparece:
- **Desktop**: Fixo no canto inferior esquerdo (acima do footer com logo)
- **Mobile**: Também visível no canto inferior esquerdo

### 4. **Características**

#### Visual
- Avatar com anel amarelo animado (igual ao Instagram)
- Modal em tela cheia ao clicar
- Progress bars no topo
- Informações da marca e plataforma
- Gradiente para melhor leitura do texto
- Botão de fechar no canto superior direito

#### Funcionalidades
- **Navegação**:
  - Toque/clique na parte esquerda volta ao story anterior
  - Toque/clique na parte direita avança ao próximo story
- **Pause/Resume**: Segurar o mouse/dedo pausa o story
- **Progress automático**: 7 segundos por story (configurável)
- **Suporte a vídeo e imagem**
- **Link externo**: Se o post tiver `instagramMediaId`, mostra botão para abrir no Instagram

#### Dados Exibidos
- Imagem/vídeo do post (`imageUrl`)
- Caption do post
- Plataforma de publicação
- Link para o post no Instagram (se disponível)

## Como Usar

### Para o Desenvolvedor

O componente já está integrado e funcionará automaticamente quando houver posts publicados. Não é necessário fazer nada além de publicar posts normalmente pelo sistema.

### Para o Usuário Final

1. Publique posts através do sistema de agendamento
2. Após a publicação bem-sucedida (status "published"), o avatar com anel amarelo aparecerá no canto inferior esquerdo
3. Clique no avatar para visualizar os stories
4. Navegue entre os stories tocando/clicando nos lados
5. Feche clicando no X ou fora do modal

## Customização

### Alterar Duração dos Stories

Edite `src/components/ui/published-stories-widget.tsx`:

```tsx
<SocialStories
  stories={stories}
  profile={profile}
  defaultDuration={10} // Altere de 7 para o valor desejado em segundos
/>
```

### Alterar Quantidade Máxima de Stories

Edite `src/components/ui/published-stories-widget.tsx`:

```tsx
.slice(0, 30) // Altere de 20 para a quantidade desejada
```

### Alterar Posicionamento

Edite `src/components/ui/published-stories-widget.tsx`:

```tsx
<div className="fixed bottom-6 left-6 z-50">
  {/* Altere bottom-6 e left-6 para reposicionar */}
```

Exemplos:
- Canto inferior direito: `bottom-6 right-6`
- Canto superior esquerdo: `top-6 left-6`
- Centro inferior: `bottom-6 left-1/2 -translate-x-1/2`

### Alterar Avatar Padrão

O avatar usa o logo da marca (`brandProfile.logo`) ou gera um avatar com as iniciais se não houver logo.

Para alterar o serviço de avatar padrão, edite em `published-stories-widget.tsx`:

```tsx
avatarUrl: brandProfile.logo ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent(brandProfile.name)}&background=random&size=128`
  // Substitua por outro serviço ou URL fixa
```

## Dependências

O componente usa as seguintes bibliotecas já instaladas:
- `framer-motion`: Animações e transições
- `lucide-react`: Ícones (X, ArrowUpRight, Loader2)
- `react-dom`: Portal para renderizar modal

## Notas Técnicas

### Adaptações do Componente Original

O componente foi adaptado de Next.js para Vite:
- Removido `"use client"` directive
- Substituído `next/image` por tags `<img>` nativas
- Mantida compatibilidade total com TypeScript
- Adaptados tipos para usar `ScheduledPost` do sistema

### Performance

- Carrega apenas posts publicados (filtrados em tempo de execução)
- Limite de 20 stories para melhor performance
- Imagens carregadas sob demanda (não todas de uma vez)
- Progress bars otimizadas com `requestAnimationFrame`

### Responsividade

- Funciona em desktop e mobile
- Adapta tamanho do avatar: 12x12 (mobile) / 16x16 (desktop)
- Modal ocupa 90% da largura em mobile, máx 420px em desktop
- Aspect ratio 9:16 (formato stories padrão)

## Solução de Problemas

### Avatar não aparece
- Verifique se há posts com `status: "published"`
- Confirme que o `scheduledPosts` está sendo passado corretamente para o Dashboard

### Stories não avançam automaticamente
- Verifique se a imagem/vídeo carregou completamente
- Cheque o console do navegador por erros

### Modal não abre
- Verifique se não há conflitos de z-index com outros componentes
- O componente usa `z-[9999]` para o modal

### Vídeos não reproduzem
- Verifique se a URL do vídeo está acessível
- Confirme que o formato é suportado (mp4, webm, ogg)

## Roadmap / Melhorias Futuras

Possíveis melhorias que podem ser implementadas:

1. **Analytics**: Rastrear visualizações de cada story
2. **Filtros**: Permitir filtrar stories por plataforma ou período
3. **Compartilhamento**: Botão para compartilhar o story
4. **Múltiplas contas**: Suporte para exibir stories de diferentes contas
5. **Agrupamento**: Agrupar stories por campanha
6. **Reactions**: Sistema de reações aos stories
7. **Modo escuro**: Tema escuro para o modal

## Suporte

Para dúvidas ou problemas, verifique:
- Console do navegador para erros
- Network tab para problemas de carregamento de mídia
- Este README para configurações e customizações
