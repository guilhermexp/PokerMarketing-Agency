# 🏗️ Plano de Refatoração - Backend Architecture

**Projeto:** PokerMarketing-Agency
**Data de Início:** 18/01/2026
**Objetivo:** Melhorar arquitetura backend seguindo Node.js best practices
**Estratégia:** Refatoração incremental e segura - ZERO riscos de quebrar funcionalidade existente

---

## 📊 Status Atual

### ❌ Problemas Identificados

| Problema | Impacto | Prioridade |
|----------|---------|------------|
| Arquivos monolíticos (6.000+ linhas) | Manutenibilidade baixa | 🔴 Alta |
| 60+ blocos try-catch duplicados | Código repetitivo | 🔴 Alta |
| Sem validação centralizada | Segurança comprometida | 🟡 Média |
| console.log/error em todo lugar | Debugging difícil | 🟡 Média |
| Rate limiting em memória | Não escalável | 🟡 Média |
| Sem separação de camadas | Difícil testar | 🔴 Alta |

### ✅ Pontos Fortes (Manter)

- ✓ Autenticação Clerk implementada
- ✓ Sistema de permissões funcional
- ✓ Background jobs com BullMQ
- ✓ PostgreSQL com Neon
- ✓ Redis disponível (ioredis instalado)
- ✓ TypeScript no frontend

---

## 🛡️ Princípios de Segurança

### Regras Invioláveis

1. **NUNCA quebrar funcionalidade existente**
2. **NUNCA tocar no frontend** (`src/` intocável)
3. **NUNCA alterar comportamento** (apenas estrutura interna)
4. **SEMPRE manter código antigo** (comentado, não deletado)
5. **SEMPRE testar antes de commit**
6. **SEMPRE poder reverter** (commits atômicos)

### Estratégia de Implementação

```
┌─────────────────────────────────────────────┐
│ 1. Criar código NOVO em paralelo           │
│ 2. Testar isoladamente                     │
│ 3. Integrar gradualmente (uma rota/vez)    │
│ 4. Manter código antigo como fallback      │
│ 5. Remover antigo só após 100% confiança   │
└─────────────────────────────────────────────┘
```

---

## 📋 Fases do Projeto

### ✅ Fase 0: Análise e Documentação
**Status:** ✅ COMPLETA
**Data:** 18/01/2026

- [x] Análise comparativa com nodejs-backend-patterns
- [x] Identificação de problemas críticos
- [x] Criação deste documento
- [x] Definição da estratégia segura

---

### 🔄 Fase 1: Infraestrutura Base (Risco: 0%)
**Status:** ⏳ PENDENTE
**Duração Estimada:** 2-3 horas
**Risco de Quebra:** 0% (apenas adiciona código novo)

#### Tarefas

- [ ] **1.1** Criar `server/middleware/error-handler.mjs`
  - Handler global de erros
  - Classes de erro customizadas (AppError, ValidationError, etc.)
  - Resposta padronizada de erros

- [ ] **1.2** Criar `server/lib/logger.mjs`
  - Configurar Pino para logging estruturado
  - Níveis de log (info, warn, error)
  - Formato JSON para produção

- [ ] **1.3** Integrar no `server/index.mjs`
  - Adicionar `app.use(errorHandler)` no final
  - Importar logger
  - **NÃO remover** console.log existentes

- [ ] **1.4** Testar
  - [ ] Servidor inicia sem erros
  - [ ] Todas as rotas funcionam
  - [ ] Logs aparecem corretamente

#### Arquivos Criados
```
server/
├── middleware/
│   └── error-handler.mjs          # NOVO
└── lib/
    └── logger.mjs                 # NOVO
```

#### Arquivos Modificados
```
server/index.mjs                   # +2 linhas (import + app.use)
server/dev-api.mjs                 # +2 linhas (import + app.use)
```

#### Checklist de Segurança
```bash
# ✅ Antes de commit
npm run dev                        # Servidor inicia?
curl http://localhost:3002/api/campaigns  # Rota funciona?
npm run build                      # Build passa?
```

#### Commit
```bash
git add server/middleware/error-handler.mjs server/lib/logger.mjs
git add server/index.mjs server/dev-api.mjs
git commit -m "refactor(server): add global error handler and structured logging

- Add centralized error handler middleware
- Add Pino structured logging
- No breaking changes - old code still works
- Error handling remains backward compatible"
```

---

### 🔄 Fase 2: Validação com Zod (Risco: 5%)
**Status:** ⏳ PENDENTE
**Duração Estimada:** 3-4 horas
**Risco de Quebra:** 5% (adiciona validação, mas não altera lógica)

#### Tarefas

- [ ] **2.1** Instalar Zod (se necessário)
  ```bash
  npm install zod
  ```

- [ ] **2.2** Criar `server/middleware/validation.mjs`
  - Middleware genérico de validação
  - Integração com error handler
  - Mensagens de erro claras

- [ ] **2.3** Criar schemas para rotas críticas
  - [ ] `server/schemas/campaign.schema.mjs` (POST /api/campaigns)
  - [ ] `server/schemas/flyer.schema.mjs` (POST /api/flyer/generate)
  - [ ] `server/schemas/gallery.schema.mjs` (POST /api/gallery)

- [ ] **2.4** Adicionar validação nas rotas
  - Adicionar middleware ANTES do handler existente
  - Testar com dados válidos
  - Testar com dados inválidos

- [ ] **2.5** Testar exaustivamente
  - [ ] Dados válidos passam (comportamento não muda)
  - [ ] Dados inválidos são rejeitados (nova proteção)
  - [ ] Mensagens de erro são claras

#### Arquivos Criados
```
server/
├── middleware/
│   └── validation.mjs             # NOVO
└── schemas/
    ├── campaign.schema.mjs        # NOVO
    ├── flyer.schema.mjs          # NOVO
    └── gallery.schema.mjs        # NOVO
```

#### Arquivos Modificados
```
server/index.mjs                   # +validação em ~5-10 rotas críticas
server/dev-api.mjs                 # +validação em ~5-10 rotas críticas
```

#### Exemplo de Integração
```javascript
// ANTES
app.post('/api/campaigns', requireAuth, async (req, res) => {
  // código existente
});

// DEPOIS
import { validate } from './middleware/validation.mjs';
import { createCampaignSchema } from './schemas/campaign.schema.mjs';

app.post('/api/campaigns',
  validate(createCampaignSchema),  // ← NOVO: valida antes
  requireAuth,                     // ← Mantém existente
  async (req, res) => {            // ← Mantém existente
    // código existente não muda
  }
);
```

#### Checklist de Segurança
```bash
# ✅ Antes de commit
npm run dev
curl -X POST http://localhost:3002/api/campaigns -H "Content-Type: application/json" -d '{"name":"test"}'
# Testar com dados válidos e inválidos
```

#### Commit
```bash
git commit -m "refactor(server): add Zod validation middleware

- Add validation middleware for request validation
- Add schemas for critical endpoints (campaigns, flyer, gallery)
- Validation happens before existing logic
- No breaking changes to functionality"
```

---

### 🔄 Fase 3: Estrutura em Camadas (Risco: 0%)
**Status:** ⏳ PENDENTE
**Duração Estimada:** 6-8 horas
**Risco de Quebra:** 0% (código novo paralelo, não conectado ainda)

#### Estratégia
Criar toda a estrutura nova em `server/v2/` **SEM CONECTAR** ao servidor principal.

#### Tarefas

- [ ] **3.1** Criar estrutura de diretórios
  ```
  server/v2/
  ├── controllers/
  ├── services/
  ├── repositories/
  ├── routes/
  └── middleware/
  ```

- [ ] **3.2** Implementar camadas para CAMPANHAS (exemplo)
  - [ ] `campaign.repository.mjs` - Acesso ao banco
  - [ ] `campaign.service.mjs` - Lógica de negócio
  - [ ] `campaign.controller.mjs` - HTTP handlers
  - [ ] `campaign.routes.mjs` - Definição de rotas

- [ ] **3.3** Criar DI Container simples
  - `server/v2/container.mjs`
  - Gerenciar dependências (db, services, controllers)

- [ ] **3.4** Testar isoladamente
  - Criar arquivo de teste manual `server/v2/test-campaign.mjs`
  - Verificar que camadas funcionam sem conectar ao servidor

#### Estrutura Completa
```
server/
├── index.mjs                      # ← NÃO MEXEMOS
├── dev-api.mjs                   # ← NÃO MEXEMOS
│
└── v2/                           # ← TUDO NOVO
    ├── controllers/
    │   └── campaign.controller.mjs
    ├── services/
    │   └── campaign.service.mjs
    ├── repositories/
    │   └── campaign.repository.mjs
    ├── routes/
    │   └── campaign.routes.mjs
    ├── container.mjs
    └── test-campaign.mjs          # Script de teste isolado
```

#### Exemplo de Arquitetura em Camadas

**Repository (Acesso a Dados)**
```javascript
// server/v2/repositories/campaign.repository.mjs
export class CampaignRepository {
  constructor(db) {
    this.db = db;
  }

  async findAll(userId, organizationId) {
    // SQL query
  }

  async create(data) {
    // SQL insert
  }
}
```

**Service (Lógica de Negócio)**
```javascript
// server/v2/services/campaign.service.mjs
export class CampaignService {
  constructor(campaignRepository, aiClient) {
    this.repo = campaignRepository;
    this.ai = aiClient;
  }

  async createCampaign(userId, orgId, data) {
    // Validação de negócio
    // Chamadas ao repository
    // Lógica de IA se necessário
  }
}
```

**Controller (HTTP Handler)**
```javascript
// server/v2/controllers/campaign.controller.mjs
export class CampaignController {
  constructor(campaignService) {
    this.service = campaignService;
  }

  async create(req, res, next) {
    try {
      const campaign = await this.service.createCampaign(
        req.authUserId,
        req.authOrgId,
        req.body
      );
      res.status(201).json(campaign);
    } catch (error) {
      next(error); // Error handler global cuida
    }
  }
}
```

#### Checklist de Segurança
```bash
# ✅ Antes de commit
node server/v2/test-campaign.mjs   # Teste isolado funciona?
npm run dev                        # Servidor ainda inicia?
# Nenhuma rota foi alterada, então tudo deve funcionar
```

#### Commit
```bash
git commit -m "refactor(server): create layered architecture in v2/

- Add Controller-Service-Repository pattern
- Implement campaign module as example
- Code is isolated, not connected to main server yet
- Zero risk - existing code untouched"
```

---

### 🔄 Fase 4: Migração Gradual (Risco: 10-15% por rota)
**Status:** ⏳ PENDENTE
**Duração Estimada:** 1-2 horas por rota
**Risco de Quebra:** 10-15% (substituindo código real)

#### Estratégia de Migração

```
Ordem de Migração (do menos crítico ao mais crítico):
1. GET /api/campaigns (leitura, baixo risco)
2. POST /api/campaigns (criação, médio risco)
3. PUT /api/campaigns/:id (atualização, médio risco)
4. DELETE /api/campaigns/:id (deleção, alto risco)
```

#### Tarefas por Rota

- [ ] **4.1** Migrar GET /api/campaigns
  - [ ] Conectar rota v2 ao servidor
  - [ ] Comentar código antigo (não deletar)
  - [ ] Testar exaustivamente
  - [ ] Commit atômico
  - [ ] Monitorar em produção 24-48h

- [ ] **4.2** Migrar POST /api/campaigns
  - [ ] Seguir mesmo processo
  - [ ] Testar criação de campanhas
  - [ ] Verificar integração com IA
  - [ ] Commit atômico

- [ ] **4.3** Migrar PUT /api/campaigns/:id
  - [ ] Seguir mesmo processo
  - [ ] Testar atualização
  - [ ] Commit atômico

- [ ] **4.4** Migrar DELETE /api/campaigns/:id
  - [ ] Seguir mesmo processo
  - [ ] Testar deleção
  - [ ] Commit atômico

#### Exemplo de Migração

```javascript
// server/index.mjs

// ============= CÓDIGO ANTIGO (COMENTADO) =============
/*
app.get('/api/campaigns', requireAuth, async (req, res) => {
  try {
    const sql = getSql();
    const campaigns = await sql`SELECT ...`;
    res.json(campaigns);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
*/

// ============= CÓDIGO NOVO (ATIVO) =============
import { campaignRouter } from './v2/routes/campaign.routes.mjs';
app.use('/api', campaignRouter);
```

#### Plano de Rollback

Se algo der errado:

```bash
# Passo 1: Comentar código novo
# Passo 2: Descomentar código antigo
# Passo 3: Restart servidor
# Passo 4: Tudo volta a funcionar
```

#### Checklist de Segurança POR ROTA
```bash
# ✅ Antes de cada commit
npm run dev

# Testar rota específica
curl http://localhost:3002/api/campaigns
curl -X POST http://localhost:3002/api/campaigns -H "Content-Type: application/json" -d '{...}'

# Testar fluxo completo na UI
# - Criar campanha
# - Listar campanhas
# - Editar campanha
# - Deletar campanha

# Verificar logs
# - Sem erros no console
# - Logs estruturados aparecem
```

#### Commit por Rota
```bash
# Exemplo para GET
git commit -m "refactor(campaigns): migrate GET endpoint to layered architecture

- Move GET /api/campaigns to v2 structure
- Old code preserved as comment
- Tested: listing campaigns works
- Easy rollback if issues found"

# Cada rota = 1 commit separado
```

---

### 🔄 Fase 5: Rate Limiting com Redis (Risco: 10%)
**Status:** ⏳ PENDENTE
**Duração Estimada:** 2-3 horas
**Risco de Quebra:** 10% (substitui sistema existente)

#### Tarefas

- [ ] **5.1** Verificar configuração Redis
  - Redis está rodando?
  - Credenciais em .env?

- [ ] **5.2** Criar `server/middleware/rate-limit.mjs`
  - Usar `express-rate-limit` + `rate-limit-redis`
  - Configurar diferentes limites por tipo de endpoint

- [ ] **5.3** Substituir rate limiting em memória
  - Manter código antigo comentado
  - Ativar novo rate limiting
  - Testar limites

- [ ] **5.4** Monitorar
  - Verificar que limites funcionam
  - Verificar que Redis persiste entre restarts

#### Arquivos Criados
```
server/middleware/rate-limit.mjs   # NOVO
```

#### Arquivos Modificados
```
server/index.mjs                   # Substituir rate limit
server/dev-api.mjs                 # Substituir rate limit
```

#### Checklist de Segurança
```bash
# ✅ Antes de commit
npm run dev
# Fazer 100+ requests rápidos
# Verificar que rate limit funciona
# Restart servidor
# Verificar que contador persiste
```

#### Commit
```bash
git commit -m "refactor(server): migrate rate limiting to Redis

- Replace in-memory rate limiting with Redis
- Survives server restarts
- Works in distributed environments
- Old code preserved as comment"
```

---

## 🔄 Outras Melhorias (Backlog)

### Baixa Prioridade (Implementar depois das fases 1-5)

- [ ] Implementar DI Container completo
- [ ] Adicionar testes unitários (Jest/Vitest)
- [ ] Migrar outros módulos para v2 (flyer, gallery, scheduler)
- [ ] Adicionar cache service (Redis)
- [ ] Melhorar tratamento de erros assíncronos
- [ ] Adicionar health check endpoints
- [ ] Documentar APIs com Swagger/OpenAPI
- [ ] Configurar CI/CD com testes automatizados

---

## 📊 Progresso Geral

```
Fase 0: Análise e Documentação        ████████████████████ 100%
Fase 1: Infraestrutura Base            ░░░░░░░░░░░░░░░░░░░░   0%
Fase 2: Validação com Zod              ░░░░░░░░░░░░░░░░░░░░   0%
Fase 3: Estrutura em Camadas           ░░░░░░░░░░░░░░░░░░░░   0%
Fase 4: Migração Gradual               ░░░░░░░░░░░░░░░░░░░░   0%
Fase 5: Rate Limiting Redis            ░░░░░░░░░░░░░░░░░░░░   0%

PROGRESSO TOTAL: ████░░░░░░░░░░░░░░░░ 20%
```

---

## 🚨 Protocolo de Emergência

### Se algo der errado durante implementação:

1. **PARE IMEDIATAMENTE**
2. **NÃO FAÇA COMMIT**
3. **Reverta mudanças:**
   ```bash
   git checkout -- <arquivo>
   # ou
   git stash
   ```
4. **Verifique que servidor volta a funcionar:**
   ```bash
   npm run dev
   # Testar rotas principais
   ```
5. **Analise o que deu errado**
6. **Documente o problema neste arquivo**

### Se algo der errado APÓS commit:

1. **Identifique o commit problemático:**
   ```bash
   git log --oneline
   ```
2. **Reverta o commit:**
   ```bash
   git revert <commit-hash>
   ```
3. **Ou volte ao commit anterior:**
   ```bash
   git reset --hard <commit-anterior>
   ```
4. **Documente o problema**

---

## 📝 Notas e Aprendizados

### Decisões Técnicas

- **Por que Pino?** Performance superior ao Winston, formato JSON nativo
- **Por que Zod?** Type-safe, integração perfeita com TypeScript
- **Por que v2/?** Isola código novo, permite desenvolvimento paralelo
- **Por que uma rota por vez?** Minimiza risco, permite rollback preciso

### Lições Aprendidas

_(Atualizar conforme o projeto avança)_

-

---

## 🎯 Critérios de Sucesso

### Fase 1-2 Completas
- [ ] Error handler captura todos os erros
- [ ] Logs estruturados em JSON
- [ ] Validação funciona em rotas críticas
- [ ] Zero regressões
- [ ] Performance mantida ou melhor

### Fase 3-4 Completas
- [ ] Módulo de campanhas completamente refatorado
- [ ] Código organizado em camadas
- [ ] Fácil adicionar testes
- [ ] Padrão estabelecido para outros módulos

### Fase 5 Completa
- [ ] Rate limiting persiste entre restarts
- [ ] Redis integrado corretamente

### Objetivo Final
- [ ] Código backend 100% refatorado
- [ ] Zero funcionalidades quebradas
- [ ] Manutenibilidade drasticamente melhorada
- [ ] Base sólida para testes automatizados
- [ ] Onboarding de novos devs mais fácil

---

## 📞 Contato e Suporte

**Dúvidas sobre o plano?**
- Consultar este documento primeiro
- Verificar checklist de segurança
- Em caso de emergência, seguir protocolo de rollback

**Atualizações do plano:**
- Manter este documento atualizado
- Documentar desvios e ajustes
- Marcar tarefas como completas ✅

---

**Última Atualização:** 18/01/2026
**Próxima Revisão:** Após conclusão da Fase 1
