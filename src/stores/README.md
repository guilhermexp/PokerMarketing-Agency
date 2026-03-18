SWR fica responsável por server state e cache compartilhado: `brandProfile`, `gallery`, `scheduledPosts`, `campaigns` e `tournamentData`.

Zustand fica restrito a estado client-only: UI, seleção local, progresso transitório, editor state, jobs locais e dados ainda não persistidos.

Regra prática:
- não espelhar no store listas que já vêm de `useAppData`;
- preferir mutações otimistas no cache SWR em vez de duplicar dados no Zustand;
- usar store apenas quando o estado precisa existir independentemente de fetch, revalidação ou hidratação do servidor.
