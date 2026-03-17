# ROADMAP

## Horizonte imediato

### Backend maturity
- consolidar output validation e contratos de saída em todas as rotas JSON do server;
- manter `/api/docs` como fonte única da superfície HTTP do backend;
- estabilizar a suíte de backend com coverage orientada a `schemas`, `middleware`, `lib` e serviços críticos;
- remover `@ts-nocheck` remanescentes nas rotas com maior tráfego.

### Frontend stabilization
- decompor `src/App.tsx` em shells/domínios menores;
- decompor `src/components/tabs/clips/ClipCard.tsx`;
- fatiar `src/services/apiClient.ts` por domínio para reduzir acoplamento e facilitar testes;
- fechar pendências de `exhaustive-deps`, logs de debug e lint histórico fora do escopo da fase rápida.

## Próximo ciclo

### Infra e dados
- substituir rate limiting em memória por storage compartilhado;
- revisar a adoção de ORM tipado após a fase de contratos e cobertura;
- padronizar observabilidade de filas e jobs assíncronos com métricas e rastreabilidade;
- reduzir a heterogeneidade dos contratos de providers externos de IA.

### Produto
- aprofundar o Studio Agent com mais contexto seguro de campanhas, galeria e carrosséis;
- melhorar os fluxos de reuso/publicação de mídia entre gallery, scheduler e Instagram;
- expandir analytics do admin com métricas operacionais e financeiras mais consistentes.

## Critérios para a próxima revisão

- lint global verde;
- coverage estável nas camadas críticas do backend e revisão dos fluxos críticos do frontend;
- redução de arquivos monolíticos no frontend;
- decisão reavaliada sobre Drizzle quando houver janela dedicada para migração de acesso a dados.
