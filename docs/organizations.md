# Organizações e Membros

Este documento descreve a implementação do sistema de organizações multi-tenant usando **Clerk Organizations**.

## Visão Geral

O sistema permite que usuários criem organizações e convidem membros para compartilhar dados (marca, galeria, campanhas, torneios, posts agendados). Utilizamos o Clerk Organizations nativo em vez de uma implementação customizada.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ OrganizationSwitcher │  │ useOrganization │  │  Components   │  │
│  │   (Clerk UI)    │  │   (Clerk Hook)  │  │  (org-aware)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                │                                 │
│                    organizationId                                │
│                                │                                 │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend API                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ clerkMiddleware │  │ organization_id │  │   Permissions   │  │
│  │   (JWT Auth)    │  │   (filtering)   │  │    (roles)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Database                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Todas as tabelas têm coluna: organization_id VARCHAR   │    │
│  │  - NULL = contexto pessoal (dados do usuário)           │    │
│  │  - "org_xxx" = contexto de organização (dados compartilhados)│
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Clerk Organizations

### Configuração

1. **Dashboard do Clerk**: Settings → Organization Settings → Enable Organizations
2. **Variáveis de ambiente**:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
   CLERK_SECRET_KEY=sk_test_xxx
   ```

### Limitações do Plano Gratuito

| Limite | Valor |
|--------|-------|
| Membros por organização | 5 |
| Roles disponíveis | 2 (`org:admin`, `org:member`) |
| Organizações ativas | 100 |

### Componentes Clerk Utilizados

```tsx
// Frontend - React
import { useOrganization } from '@clerk/clerk-react';
import { OrganizationSwitcher } from '@clerk/clerk-react';

// Backend - Express
import { clerkMiddleware, getAuth } from '@clerk/express';
```

## Fluxo de Dados

### Contexto Pessoal (sem organização)

Quando `organizationId = null`:
- Dados filtrados por `user_id`
- Usuário vê apenas seus próprios dados
- Todas as permissões liberadas

```sql
SELECT * FROM campaigns
WHERE user_id = $1 AND organization_id IS NULL
```

### Contexto de Organização

Quando `organizationId = "org_xxx"`:
- Dados filtrados por `organization_id`
- Todos os membros veem os mesmos dados
- Permissões baseadas no role

```sql
SELECT * FROM campaigns
WHERE organization_id = $1
```

## Sistema de Permissões

### Roles do Clerk

| Role | Descrição |
|------|-----------|
| `org:admin` | Administrador da organização (criador) |
| `org:member` | Membro convidado |

### Mapeamento de Permissões

```typescript
// api/db/_helpers/permissions.ts

export const PERMISSIONS = {
  CREATE_CAMPAIGN: 'create_campaign',
  EDIT_CAMPAIGN: 'edit_campaign',
  DELETE_CAMPAIGN: 'delete_campaign',
  CREATE_FLYER: 'create_flyer',
  SCHEDULE_POST: 'schedule_post',
  PUBLISH_POST: 'publish_post',
  VIEW_GALLERY: 'view_gallery',
  DELETE_GALLERY: 'delete_gallery',
  MANAGE_BRAND: 'manage_brand',
  MANAGE_MEMBERS: 'manage_members',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_ORGANIZATION: 'manage_organization',
  VIEW_ANALYTICS: 'view_analytics',
};

// org:admin = todas as permissões
// org:member = subset limitado
export const MEMBER_PERMISSIONS = [
  PERMISSIONS.CREATE_CAMPAIGN,
  PERMISSIONS.EDIT_CAMPAIGN,
  PERMISSIONS.CREATE_FLYER,
  PERMISSIONS.SCHEDULE_POST,
  PERMISSIONS.PUBLISH_POST,
  PERMISSIONS.VIEW_GALLERY,
  PERMISSIONS.VIEW_ANALYTICS,
];
```

### Matriz de Permissões

| Permissão | `org:admin` | `org:member` |
|-----------|:-----------:|:------------:|
| Ver galeria/campanhas/torneios | ✅ | ✅ |
| Criar campanhas | ✅ | ✅ |
| Editar campanhas | ✅ | ✅ |
| Deletar campanhas | ✅ | ❌ |
| Criar flyers | ✅ | ✅ |
| Deletar imagens da galeria | ✅ | ❌ |
| Agendar posts | ✅ | ✅ |
| Publicar posts | ✅ | ✅ |
| Gerenciar marca | ✅ | ❌ |
| Gerenciar membros | ✅ | ❌ |

## Implementação

### Frontend

#### 1. Hook de Organização (App.tsx)

```tsx
import { useOrganization } from '@clerk/clerk-react';

function AppContent() {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const organizationId = organization?.id || null;

  // Aguardar carregamento do contexto de org
  if (!orgLoaded) return <Loader />;

  // Passar organizationId para todas as chamadas de API
  const data = await getCampaigns(userId, organizationId);
}
```

#### 2. API Client (services/apiClient.ts)

Todas as funções de dados aceitam `organizationId`:

```typescript
export async function getCampaigns(
  userId: string,
  organizationId?: string | null
): Promise<DbCampaign[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<DbCampaign[]>(`/campaigns?${params}`);
}

export async function createCampaign(userId: string, data: {
  name?: string;
  organization_id?: string | null;
  // ... outros campos
}): Promise<DbCampaign> {
  return fetchApi<DbCampaign>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}
```

#### 3. Componentes com Dados Próprios

Componentes que fazem fetch próprio (como `CampaignsList`) precisam receber `organizationId`:

```tsx
interface CampaignsListProps {
  userId: string;
  organizationId?: string | null;
  // ...
}

export function CampaignsList({ userId, organizationId, ... }: CampaignsListProps) {
  useEffect(() => {
    loadCampaigns();
  }, [userId, organizationId]); // Recarregar quando org mudar

  const loadCampaigns = async () => {
    const dbCampaigns = await getCampaigns(userId, organizationId);
    // ...
  };
}
```

### Backend (Vercel Serverless Functions)

#### 1. Helpers Compartilhados (api/db/_helpers/)

```typescript
// api/db/_helpers/index.ts
export { getSql, resolveUserId } from './database';
export { setupCors } from './cors';
// ... outros helpers
```

#### 2. Filtragem por Organização

```typescript
// api/db/campaigns.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { user_id, organization_id } = req.query;

  let campaigns;
  if (organization_id) {
    // Contexto de organização - dados compartilhados
    campaigns = await sql`
      SELECT * FROM campaigns
      WHERE organization_id = ${organization_id} AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
  } else {
    // Contexto pessoal - dados do usuário
    campaigns = await sql`
      SELECT * FROM campaigns
      WHERE user_id = ${resolvedUserId}
        AND organization_id IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
  }

  res.json(campaigns);
});
```

#### 3. Verificação de Permissões

```typescript
// api/db/campaigns.ts
import { getSql, setupCors, resolveUserId } from './_helpers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (setupCors(req.method, res)) return;

  const sql = getSql();
  const { id, user_id } = req.query;

  // Resolver user_id (Clerk ID -> DB UUID)
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return res.status(400).json({ error: 'User not found' });
  }

  // Filtragem por organização
  const isOrgContext = !!organization_id;
  // ... queries com filtro apropriado
}
```

## Database Schema

### Migração para Clerk Organizations

```sql
-- Alterar coluna organization_id de UUID para VARCHAR (IDs Clerk são strings)
ALTER TABLE brand_profiles
  ALTER COLUMN organization_id TYPE VARCHAR(50);

ALTER TABLE campaigns
  ALTER COLUMN organization_id TYPE VARCHAR(50);

ALTER TABLE gallery_images
  ALTER COLUMN organization_id TYPE VARCHAR(50);

-- ... outras tabelas

-- Remover tabelas customizadas (agora gerenciadas pelo Clerk)
DROP TABLE IF EXISTS organization_invites;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organization_roles;
DROP TABLE IF EXISTS organizations;
```

### Tabelas Afetadas

| Tabela | Coluna | Tipo |
|--------|--------|------|
| brand_profiles | organization_id | VARCHAR(50) |
| campaigns | organization_id | VARCHAR(50) |
| gallery_images | organization_id | VARCHAR(50) |
| scheduled_posts | organization_id | VARCHAR(50) |
| week_schedules | organization_id | VARCHAR(50) |
| tournament_events | organization_id | VARCHAR(50) |
| posts | organization_id | VARCHAR(50) |
| ad_creatives | organization_id | VARCHAR(50) |
| video_clip_scripts | organization_id | VARCHAR(50) |

## Fluxo de Convite

```
1. Admin cria organização no Clerk Dashboard ou via OrganizationSwitcher
2. Admin convida membro pelo email
3. Clerk envia email de convite automaticamente
4. Membro clica no link e faz login/cadastro
5. Membro é automaticamente associado à organização
6. Membro seleciona a organização no OrganizationSwitcher
7. Todos os dados da organização ficam visíveis
```

## Troubleshooting

### Membro não vê dados da organização

1. Verificar se está no contexto correto (OrganizationSwitcher)
2. Verificar se dados têm `organization_id` correto no banco
3. Verificar se API está passando `organization_id` nas requisições

### Erro "Permission denied"

1. Verificar role do usuário no Clerk Dashboard
2. Verificar se permissão está em `MEMBER_PERMISSIONS`
3. Promover usuário para `org:admin` se necessário

### Dados pessoais misturados com organização

Verificar se ao criar dados o `organization_id` está sendo passado:

```typescript
// Correto
await createCampaign(userId, {
  name: 'Campanha',
  organization_id: organizationId, // Passar o ID da org
});

// Incorreto (vai para contexto pessoal)
await createCampaign(userId, {
  name: 'Campanha',
  // organization_id ausente
});
```

## Scripts de Migração

### Executar Migração de Schema

```bash
node db/run-clerk-migration.mjs
```

### Migrar Dados Existentes

```bash
# Atualizar organization_id em dados existentes
node db/migrate-to-clerk-orgs.mjs
```

## Referências

- [Clerk Organizations Documentation](https://clerk.com/docs/organizations/overview)
- [Clerk React SDK](https://clerk.com/docs/references/react/use-organization)
- [Clerk Express SDK](https://clerk.com/docs/references/express/overview)
