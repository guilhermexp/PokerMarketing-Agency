# Prompt para QA no Browser (Claude no Chrome)

> Copiar e colar no Claude que roda no Chrome com acesso ao app aberto.

---

## Prompt

```
Voce e um QA engineer testando o Socialab, um app de marketing para poker. O app esta aberto neste navegador. Seu trabalho e navegar por TODAS as telas, clicar em TODOS os botoes e interagir com TODOS os formularios para encontrar:

1. **Bugs** — coisas que quebram, dao erro, ou travam
2. **Funcoes falsas** — botoes/links que nao fazem nada, ou fazem algo diferente do esperado
3. **UI quebrada** — layouts desalinhados, textos cortados, elementos sobrepostos, estados de loading que nunca terminam
4. **Fluxos incompletos** — acoes que iniciam mas nao concluem (ex: clicou em salvar e nada aconteceu)

### Regras do teste

- Teste como um usuario REAL, nao como dev. Clique em tudo.
- Abra o Console do navegador (DevTools > Console) e reporte QUALQUER erro JavaScript que aparecer durante os testes.
- Abra a aba Network e reporte qualquer request que retorne 4xx ou 5xx inesperado.
- Tire screenshot de cada bug encontrado.
- NAO tente corrigir nada — apenas documente.

### Mapa de telas para testar (em ordem)

#### 1. Login / Autenticacao
- [ ] Tela de login aparece? Layout ok?
- [ ] Login com credenciais validas funciona?
- [ ] Apos login, vai direto pro app (sem flash de tela de criacao de marca)?
- [ ] Logout funciona?

#### 2. Campaign View (`/campaign`) — Tela principal
- [ ] Upload de transcricao funciona? (arrastar arquivo ou clicar)
- [ ] Botao de criar campanha funciona?
- [ ] Tabs de conteudo (Clips, Posts, Ads, Carousels) navegam corretamente?
- [ ] Cards de preview carregam imagens?
- [ ] Seletor de modelo de IA funciona?
- [ ] Deletar campanha funciona?
- [ ] Gerar imagem para um clip/post/ad funciona?
- [ ] Editar texto de post funciona?

#### 3. Campaigns List (`/campaigns`)
- [ ] Lista carrega? Grid aparece?
- [ ] Empty state aparece se nao tem campanhas?
- [ ] Clicar em campanha abre detalhes?
- [ ] Paginacao funciona (se houver)?
- [ ] Deletar campanha da lista funciona?

#### 4. Carousels (`/carousels`)
- [ ] Lista de carrosseis carrega?
- [ ] Preview dos slides funciona?
- [ ] Editar caption funciona?
- [ ] Gerar caption com IA funciona?
- [ ] Atualizar imagem de slide funciona?

#### 5. Tournament Flyers (`/flyer`)
- [ ] Lista de schedules carrega?
- [ ] Upload de planilha XLSX/CSV funciona?
- [ ] Calendario semanal renderiza?
- [ ] Gerar flyer para um dia funciona?
- [ ] Deletar schedule funciona?
- [ ] Adicionar evento manual funciona?

#### 6. Gallery (`/gallery`)
- [ ] Grid de imagens carrega?
- [ ] Filtros funcionam?
- [ ] Clicar na imagem abre preview/detalhes?
- [ ] Botoes de acao rapida funcionam (agendar, definir como referencia, etc)?
- [ ] Deletar imagem funciona?
- [ ] Acao de "Quick Post" funciona?

#### 7. Calendar (`/calendar`)
- [ ] Calendario mensal renderiza?
- [ ] Posts agendados aparecem nos dias corretos?
- [ ] Agendar novo post funciona?
- [ ] Editar post agendado funciona?
- [ ] Deletar post agendado funciona?
- [ ] Status de publicacao (scheduled, published, failed) aparece?

#### 8. Image Studio (`/image-playground`)
- [ ] Sidebar de topicos carrega?
- [ ] Criar novo topico funciona?
- [ ] Renomear topico funciona?
- [ ] Deletar topico funciona?
- [ ] Editor de prompt funciona?
- [ ] Seletor de aspect ratio funciona?
- [ ] Seletor de tamanho (1K/2K/4K) funciona?
- [ ] Upload de imagem de referencia (estilo/produto/pessoa) funciona?
- [ ] Gerar imagem funciona? Resultado aparece?
- [ ] Historico de geracoes aparece?
- [ ] Deletar geracao funciona?
- [ ] Retry de geracao que falhou funciona?
- [ ] Modos (Instagram, AI Influencer, Product Hero, etc) mudam o comportamento?

#### 9. Video Studio (`/playground`)
- [ ] Sidebar de topicos carrega?
- [ ] Criar/renomear/deletar topico funciona?
- [ ] Gerar video funciona? (pode demorar minutos)
- [ ] Preview de video funciona?
- [ ] Seletor de aspect ratio e resolucao funciona?

#### 10. AI Assistant (Chat lateral)
- [ ] Botao de abrir chat lateral funciona?
- [ ] Enviar mensagem funciona?
- [ ] Resposta da IA aparece com streaming?
- [ ] Referenciar imagem da galeria funciona?
- [ ] Fechar painel funciona?
- [ ] Content mentions (@gallery, @campaign) funcionam?

#### 11. Brand Profile / Settings
- [ ] Abrir settings funciona?
- [ ] Editar nome da marca funciona?
- [ ] Editar cores funciona?
- [ ] Upload de logo funciona?
- [ ] Salvar alteracoes funciona?
- [ ] Tom de voz pode ser alterado?
- [ ] Conectar conta Instagram (se disponivel) funciona?
- [ ] Team management aparece?

#### 12. Navegacao geral
- [ ] Sidebar/menu navega entre todas as telas?
- [ ] Todas as rotas carregam sem erro?
- [ ] Refresh da pagina (F5) mantem o estado?
- [ ] Back/forward do browser funciona?
- [ ] Nenhum link leva pra pagina 404 ou em branco?

### Como reportar

Para cada problema encontrado, reporte assim:

**[SEVERIDADE] Titulo curto**
- Tela: onde aconteceu
- Passos: o que voce fez
- Esperado: o que deveria ter acontecido
- Resultado: o que realmente aconteceu
- Console: erros JS se houver
- Network: requests com erro se houver
- Screenshot: sim/nao

Severidades:
- **P0** — App quebra, crasha, ou perde dados
- **P1** — Funcionalidade principal nao funciona
- **P2** — Funcionalidade secundaria com problema
- **P3** — Cosmetico / UX ruim mas funciona

### Contexto tecnico (para entender erros)

- Backend roda em Express 5 na porta 3002
- Frontend roda em Vite + React 19 na porta 3010
- Auth usa Better Auth (cookies, nao Bearer tokens)
- CSRF token e enviado via header `X-CSRF-Token`
- Envelope de resposta da API: `{ data, error, meta }`
- Imagens sao geradas via Gemini com fallback para Replicate e FAL.ai
- Redis pode nao estar disponivel — scheduled posts usam polling fallback
- Videos podem demorar varios minutos para gerar

Comece os testes agora. Navegue tela por tela na ordem acima. Reporte TUDO que encontrar.
```
