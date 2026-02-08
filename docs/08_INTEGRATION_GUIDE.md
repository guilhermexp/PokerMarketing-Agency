# 08. Guia de Integração

> **Passo a passo completo de integração end-to-end**

---

## Ordem de Implementação

### Dia 1: Setup Inicial

**1. Criar Projeto**
```bash
npm create vite@latest my-campaign-app -- --template react-ts
cd my-campaign-app
```

**2. Instalar Dependências** (ver [04_DEPENDENCIES.md](./04_DEPENDENCIES.md))

**3. Configurar Ambiente**
```bash
cp .env.example .env
# Preencher variáveis de ambiente
```

**4. Setup do Banco de Dados** (ver [05_DATABASE_SETUP.md](./05_DATABASE_SETUP.md))
```bash
psql $DATABASE_URL < create_all_tables.sql
```

### Dia 2-3: Frontend

**5. Copiar Estrutura de Pastas**
```bash
mkdir -p src/{components/{campaigns,tabs,carousel,common,gallery,image-preview,dashboard},hooks,stores,services/api,contexts}
```

**6. Copiar Arquivos** (ver [06_FRONTEND_CLONE.md](./06_FRONTEND_CLONE.md))
- Ordem: Tipos → APIs → Hooks → Stores → Componentes

**7. Adaptar Integrações**
- Auth (Clerk ou seu provider)
- Rotas (React Router ou Next.js)
- BrandProfile (criar se não existe)

### Dia 3-4: Backend

**8. Criar Endpoints** (ver [07_BACKEND_CLONE.md](./07_BACKEND_CLONE.md))
```bash
mkdir -p api/{db/{campaigns,posts,ad-creatives,carousels,gallery,scheduled-posts,init},ai/campaign,generate/{queue,status}}
```

**9. Implementar Workers**
```bash
mkdir -p server/workers
# Criar generationWorker.mjs
```

**10. Configurar Redis**
```bash
docker run -d -p 6379:6379 redis:7-alpine
# Ou usar Upstash Redis
```

### Dia 5: Integração com IA

**11. Setup do Gemini**
- Criar projeto no Google Cloud
- Ativar Generative AI API
- Gerar API key
- Configurar .env

**12. Testar Geração**
```typescript
// Test script
const result = await generateCampaign(brandProfile, "Test campaign", options);
console.log(result);
```

### Dia 6-7: Testes

**13. Testes End-to-End**
- [ ] Criar campanha via UI
- [ ] Gerar conteúdo com IA
- [ ] Visualizar nas abas
- [ ] Gerar imagens
- [ ] Agendar posts
- [ ] Publicar no Instagram

**14. Troubleshooting** (ver abaixo)

---

## Adaptações Necessárias

### 1. Brand Profile

Se não existir no projeto:

```typescript
// src/contexts/BrandProfileContext.tsx
const BrandProfileContext = createContext<BrandProfile>(defaultBrandProfile);

export function BrandProfileProvider({ children }) {
  const [profile, setProfile] = useState<BrandProfile>(defaultBrandProfile);

  return (
    <BrandProfileContext.Provider value={profile}>
      {children}
    </BrandProfileContext.Provider>
  );
}
```

### 2. User Context

Adaptar para seu sistema de autenticação:

```typescript
// Com Clerk
import { useAuth } from '@clerk/clerk-react';
const { userId } = useAuth();

// Com Firebase
import { useAuth } from './hooks/useAuth';
const { user } = useAuth();
const userId = user?.uid;

// Com Auth0
import { useAuth0 } from '@auth0/auth0-react';
const { user } = useAuth0();
const userId = user?.sub;
```

### 3. Organization (Multi-tenant)

Se não precisar de multi-tenant:

```typescript
// Remover organizationId de todas as queries
// Ou usar null
const organizationId = null;
```

---

## Troubleshooting Comum

### Problema 1: "Database connection failed"

**Causa**: DATABASE_URL incorreta ou banco não criado

**Solução**:
```bash
# Verificar URL
echo $DATABASE_URL

# Testar conexão
psql $DATABASE_URL -c "SELECT 1"

# Recriar tabelas
psql $DATABASE_URL < create_all_tables.sql
```

### Problema 2: "Google AI API error"

**Causa**: API key inválida ou quota excedida

**Solução**:
```bash
# Verificar key
echo $GOOGLE_GENERATIVE_AI_API_KEY

# Testar API
curl "https://generativelanguage.googleapis.com/v1/models?key=$GOOGLE_GENERATIVE_AI_API_KEY"
```

### Problema 3: "Redis connection refused"

**Causa**: Redis não está rodando

**Solução**:
```bash
# Iniciar Redis
docker run -d -p 6379:6379 redis:7-alpine

# Ou usar Upstash
# Atualizar REDIS_URL no .env
```

### Problema 4: "SWR cache not updating"

**Causa**: Cache SWR não está revalidando

**Solução**:
```typescript
// Forçar revalidação
const { mutate } = useCampaigns(userId);
mutate(); // Força refetch
```

### Problema 5: "Images not uploading to Blob"

**Causa**: BLOB_READ_WRITE_TOKEN incorreto

**Solução**:
```bash
# Verificar token
echo $BLOB_READ_WRITE_TOKEN

# Gerar novo token no Vercel Dashboard
```

---

## Checklist Final de Validação

### ✅ Infraestrutura
- [ ] PostgreSQL rodando e acessível
- [ ] Redis rodando (se usar BullMQ)
- [ ] Vercel Blob configurado
- [ ] Google AI API key válida
- [ ] Clerk (ou auth provider) configurado

### ✅ Backend
- [ ] Todas as tabelas criadas
- [ ] Endpoints respondendo
- [ ] Workers processando jobs
- [ ] Geração de IA funcionando

### ✅ Frontend
- [ ] App compilando sem erros TypeScript
- [ ] Componentes renderizando
- [ ] SWR cache funcionando
- [ ] Navegação entre views funcionando

### ✅ Features
- [ ] Criar campanha
- [ ] Listar campanhas
- [ ] Gerar clips, posts, ads, carrosséis
- [ ] Gerar imagens
- [ ] Editar imagens
- [ ] Agendar posts
- [ ] Publicar no Instagram

### ✅ Performance
- [ ] Carregamento inicial < 3s
- [ ] Cache SWR funcionando
- [ ] Optimistic updates funcionando
- [ ] Background jobs processando

---

## Próximos Passos Após Setup

1. **Customizar** UI/UX para sua marca
2. **Adicionar** funcionalidades extras
3. **Otimizar** performance
4. **Configurar** CI/CD
5. **Monitorar** com Sentry/etc

---

**Última atualização**: 2026-01-18
