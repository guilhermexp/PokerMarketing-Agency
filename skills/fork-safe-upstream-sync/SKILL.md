---
name: fork-safe-upstream-sync
description: Sincronizar forks com upstream preservando customizacoes privadas locais. Use quando precisar comparar seu fork com upstream, registrar mudancas privadas em changelog, buscar novidades do upstream e aplicar atualizacoes seguras com prioridade para a base local (especialmente dados/DB) durante conflitos.
---

# Fork Safe Upstream Sync

Siga este fluxo para atualizar um fork sem perder customizacoes privadas.

## Preparar contexto

1. Confirmar que esta em um repositorio Git.
2. Identificar branch atual e branch base do upstream (padrao: `main`).
3. Confirmar remote upstream; se nao existir, interromper e pedir criacao do remote.
4. Verificar arvores sujas (`git status --porcelain`):
- Se houver mudancas nao commitadas, interromper por seguranca.

## Registrar mudancas privadas

1. Usar `scripts/sync_fork_preserve_local.sh` para atualizar ou criar o changelog privado.
2. Preferir `fork_changelog.md` na raiz do repositorio.
3. Registrar:
- Data/hora ISO 8601.
- Branch atual.
- Commit atual (`HEAD`).
- Ultimo commit upstream sincronizado (lido do changelog, quando existir).
- Quantidade e lista resumida de commits privados (`upstream/<base>..HEAD`).

## Trazer upstream com seguranca

1. Rodar fetch no upstream.
2. Identificar o ultimo commit upstream sincronizado no changelog e comparar com o upstream atual.
3. Se nao houver, encerrar sem merge.
4. Se houver, executar merge sem commit automatico, priorizando base local em conflitos (`-X ours`).
5. Resolver conflitos restantes preservando `ours` para todos os arquivos conflitantes.
6. Reforcar prioridade local para caminhos sensiveis (DB/dados) antes do commit.
7. Criar commit de merge com mensagem padrao (mesmo quando nao houver mudanca de arvore, para registrar sync do historico upstream).
8. Sempre gerar relatorio final com situacao atual, novidades trazidas e resultado esperado.
9. Sempre executar testes do app ao final e incluir resultado no relatorio.
10. Publicar a branch atual no `origin` ao final para concluir atualizacao do fork remoto.

## Comando recomendado

```bash
bash skills/fork-safe-upstream-sync/scripts/sync_fork_preserve_local.sh \
  --upstream upstream \
  --base-branch main \
  --origin origin \
  --changelog fork_changelog.md \
  --report fork_sync_report.md \
  --test-command "npm test" \
  --protected-paths "db/,database/,data/,prisma/,supabase/,*.db,*.sqlite"
```

## Regras de seguranca

1. Nao executar em working tree suja, exceto quando explicitamente permitido.
2. Se merge falhar sem resolucao automatica, abortar merge e reportar arquivos bloqueados.
3. Sempre priorizar o estado local para caminhos de dados definidos em `--protected-paths`.
4. Sempre revisar `fork_sync_report.md` ao final para validar o impacto das atualizacoes.
5. Se os testes falharem, nao publicar no origin e investigar antes de novo sync.

## Referencias

1. Ler `references/workflow.md` para parametros e comportamento detalhado.
