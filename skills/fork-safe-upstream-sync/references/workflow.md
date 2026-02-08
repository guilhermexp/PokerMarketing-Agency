# Workflow e Parametros

## Objetivo

Atualizar um fork com novidades do upstream sem perder customizacoes privadas, mantendo rastreabilidade em changelog privado.

## Parametros do script

- `--upstream <nome>`: remote upstream (padrao: `upstream`).
- `--base-branch <branch>`: branch base no upstream (padrao: `main`).
- `--origin <nome>`: remote de publicacao do fork (padrao: `origin`).
- `--changelog <arquivo>`: caminho do changelog privado (padrao: `fork_changelog.md`).
- `--report <arquivo>`: caminho do relatorio final da execucao (padrao: `fork_sync_report.md`).
- `--test-command <cmd>`: comando de teste para validar o app ao final (padrao: `auto`).
- `--skip-tests`: pula testes finais (evitar, usar so em situacoes excepcionais).
- `--no-push-origin`: nao publica a branch no origin ao final.
- `--protected-paths <csv>`: lista CSV de padroes sensiveis para preservar local.
  - Exemplo: `db/,database/,data/,prisma/,supabase/,*.db,*.sqlite`
- `--allow-dirty`: permite executar mesmo com working tree suja.

## Comportamento de merge

1. Faz `git fetch <upstream>`.
2. Le do changelog o ultimo commit upstream sincronizado (quando existir) e calcula novidades desde esse ponto.
3. Calcula commits pendentes para merge (`HEAD..upstream/<base-branch>`).
4. Se nao houver pendencias, atualiza changelog/relatorio e encerra.
5. Se houver pendencias:
- Executa `git merge --no-ff --no-commit -X ours <upstream>/<base-branch>`.
- Em conflito, resolve com `--ours` para cada arquivo conflitante.
- Reaplica estado local nos caminhos protegidos antes de commitar.
- Gera commit de merge automatico.
- Se nao houver mudancas de arvore apos resolucao, ainda cria merge commit para registrar historico upstream sincronizado.
- Atualiza marcador `Last synced upstream commit` no changelog.
6. Sempre gera relatorio final com:
- Situacao atual da branch apos execucao.
- Lista de novidades detectadas no upstream na execucao.
- Resultado esperado das atualizacoes aplicadas.
7. Sempre executa testes do app ao final (por padrao em `auto`):
- Se detectar projeto Node com `package.json`, usa `bun run test` (quando Bun + lockfile) ou `npm test`.
- Se nao houver comando disponivel, marca como `skipped-no-command`.
- Em falha de teste, retorna codigo de saida `2` e registra detalhes no relatorio.
8. Publica no origin ao final (padrao):
- Faz push da branch atual para `<origin>/<branch-atual>`.
- Se testes falharem, nao faz push e sinaliza no relatorio.
- Se push falhar, retorna codigo de saida `3` e salva log de push.

## Observacoes

- A estrategia e deliberadamente conservadora para proteger customizacao local.
- Revisar diff do merge antes de push para producao.
