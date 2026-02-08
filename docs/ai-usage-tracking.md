# AI Usage Tracking System

Sistema de monitoramento e registro de uso de todas as chamadas de AI da plataforma.

## Visao Geral

O sistema registra automaticamente todas as chamadas de AI em uma tabela do banco de dados (`api_usage_logs`), permitindo:

- Monitorar custos por organizacao/usuario
- Identificar endpoints mais utilizados
- Detectar falhas e erros
- Gerar relatorios de uso no admin dashboard

## Arquitetura

### Helper de Tracking

**Arquivo:** `server/helpers/usage-tracking.mjs`

```javascript
import { logAiUsage, createTimer, extractGeminiTokens } from './helpers/usage-tracking.mjs';
```

#### Funcoes Exportadas

| Funcao | Descricao |
|--------|-----------|
| `logAiUsage(sql, params)` | Registra uma chamada de AI no banco |
| `createTimer()` | Cria um timer para medir latencia |
| `extractGeminiTokens(response)` | Extrai contagem de tokens de resposta Gemini |
| `extractOpenRouterTokens(response)` | Extrai contagem de tokens de resposta OpenRouter |
| `calculateCost(params)` | Calcula custo estimado em centavos |

### Tabela de Dados

**Tabela:** `api_usage_logs`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | UUID | Identificador unico |
| `request_id` | VARCHAR | ID para rastreamento |
| `user_id` | UUID | Usuario que fez a chamada |
| `organization_id` | VARCHAR | Organizacao (Clerk org_id) |
| `endpoint` | VARCHAR | Endpoint chamado (ex: `/api/ai/image`) |
| `operation` | ENUM | Tipo de operacao (text, image, video, speech, flyer, edit_image, campaign) |
| `provider` | ENUM | Provedor (google, openrouter, fal) |
| `model_id` | VARCHAR | Modelo utilizado |
| `input_tokens` | INTEGER | Tokens de entrada (modelos de texto) |
| `output_tokens` | INTEGER | Tokens de saida (modelos de texto) |
| `image_count` | INTEGER | Quantidade de imagens geradas |
| `image_size` | VARCHAR | Tamanho da imagem (1K, 2K, 4K) |
| `video_duration_seconds` | INTEGER | Duracao do video em segundos |
| `character_count` | INTEGER | Caracteres para TTS |
| `estimated_cost_cents` | INTEGER | Custo estimado em centavos USD |
| `latency_ms` | INTEGER | Tempo de resposta em ms |
| `status` | ENUM | Status (success, failed, timeout, rate_limited) |
| `error_message` | TEXT | Mensagem de erro (se houver) |
| `metadata` | JSONB | Dados adicionais |
| `created_at` | TIMESTAMPTZ | Data/hora do registro |

## Endpoints Monitorados

### Geracao de Texto

| Endpoint | Modelo Padrao | Metricas |
|----------|---------------|----------|
| `/api/ai/campaign` | gemini-3-flash-preview | inputTokens, outputTokens |
| `/api/ai/text` | gemini-3-flash-preview | inputTokens, outputTokens |
| `/api/ai/convert-prompt` | gemini-3-flash-preview | inputTokens, outputTokens |
| `/api/ai/enhance-prompt` | gemini-3-flash-preview | inputTokens, outputTokens |
| `/api/ai/extract-colors` | gemini-3-flash-preview | inputTokens, outputTokens |
| `/api/ai/assistant` | gemini-3-flash-preview | inputTokens |

### Geracao de Imagem

| Endpoint | Modelo | Metricas |
|----------|--------|----------|
| `/api/ai/flyer` | gemini-3-pro-image-preview | imageCount, imageSize |
| `/api/ai/image` | gemini-3-pro-image-preview | imageCount, imageSize |
| `/api/ai/edit-image` | gemini-3-pro-image-preview | imageCount |

### Geracao de Video

| Endpoint | Modelo | Metricas |
|----------|--------|----------|
| `/api/ai/video` | veo-3.1-fast / sora-2 | videoDurationSeconds |

### Text-to-Speech

| Endpoint | Modelo | Metricas |
|----------|--------|----------|
| `/api/ai/speech` | gemini-2.5-flash-preview-tts | characterCount |

## Tabela de Precos

### Google Gemini

| Modelo | Input | Output |
|--------|-------|--------|
| gemini-3-pro-preview | $2.00/1M tokens | $12.00/1M tokens |
| gemini-3-flash-preview | $0.50/1M tokens | $3.00/1M tokens |
| gemini-3-pro-image-preview | - | $0.134/imagem (1K-2K), $0.24/imagem (4K) |
| gemini-2.5-flash-preview-tts | $0.50/1M tokens | $10.00/1M tokens (audio) |

### OpenRouter

| Modelo | Input | Output |
|--------|-------|--------|
| openai/gpt-5.2 | $1.75/1M tokens | $14.00/1M tokens |
| x-ai/grok-4.1-fast | $0.20/1M tokens | $0.50/1M tokens |

### FAL.ai (Video)

| Modelo | Preco |
|--------|-------|
| veo-3.1 (standard) | $0.40/segundo |
| veo-3.1-fast | $0.15/segundo |
| sora-2 | $0.10/segundo (estimado) |

## Como Usar

### Em um Endpoint

```javascript
import { logAiUsage, createTimer, extractGeminiTokens } from './helpers/usage-tracking.mjs';

app.post("/api/ai/exemplo", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    // ... fazer chamada de AI ...
    const response = await ai.models.generateContent({ ... });

    // Extrair tokens da resposta
    const tokens = extractGeminiTokens(response);

    // Logar uso com sucesso
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/exemplo',
      operation: 'text',
      model: 'gemini-3-flash-preview',
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: 'success',
      metadata: { /* dados extras */ }
    });

    res.json({ success: true, result });
  } catch (error) {
    // Logar uso com falha
    await logAiUsage(sql, {
      organizationId,
      endpoint: '/api/ai/exemplo',
      operation: 'text',
      model: 'gemini-3-flash-preview',
      latencyMs: timer(),
      status: 'failed',
      error: error.message,
    }).catch(() => {});

    res.status(500).json({ error: error.message });
  }
});
```

### Parametros de logAiUsage

```typescript
interface LogAiUsageParams {
  userId?: string;           // ID do usuario (opcional)
  organizationId?: string;   // ID da organizacao Clerk
  endpoint: string;          // Ex: '/api/ai/image'
  operation: string;         // 'text' | 'image' | 'video' | 'speech' | 'flyer' | 'edit_image' | 'campaign'
  model: string;             // Ex: 'gemini-3-flash-preview'
  inputTokens?: number;      // Para modelos de texto
  outputTokens?: number;     // Para modelos de texto
  imageCount?: number;       // Para geracao de imagem
  imageSize?: string;        // '1K' | '2K' | '4K'
  videoDurationSeconds?: number;  // Para geracao de video
  characterCount?: number;   // Para TTS
  latencyMs?: number;        // Tempo de resposta
  status: string;            // 'success' | 'failed' | 'timeout' | 'rate_limited'
  error?: string;            // Mensagem de erro
  metadata?: object;         // Dados extras em JSON
}
```

## Visualizacao no Admin

### Acessar Dashboard

1. Navegue para `/admin/usage`
2. Voce vera:
   - Total de chamadas por periodo
   - Custo total estimado
   - Breakdown por endpoint/modelo
   - Logs detalhados de cada chamada

### Consultas SQL Uteis

```sql
-- Total de uso por organizacao (ultimo mes)
SELECT
  organization_id,
  COUNT(*) as total_calls,
  SUM(estimated_cost_cents) / 100.0 as total_cost_usd
FROM api_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY organization_id
ORDER BY total_cost_usd DESC;

-- Uso por modelo
SELECT
  model_id,
  operation,
  COUNT(*) as calls,
  AVG(latency_ms) as avg_latency,
  SUM(estimated_cost_cents) / 100.0 as total_cost
FROM api_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model_id, operation
ORDER BY calls DESC;

-- Falhas recentes
SELECT
  endpoint,
  error_message,
  COUNT(*) as count,
  MAX(created_at) as last_occurrence
FROM api_usage_logs
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY endpoint, error_message
ORDER BY count DESC;
```

## Agregacao de Dados

O sistema tambem possui uma tabela `aggregated_usage` para relatorios eficientes:

```sql
-- View mensal pre-agregada
SELECT * FROM monthly_usage_summary
WHERE organization_id = 'org_xxx'
ORDER BY month DESC;
```

## Manutencao

### Limpeza de Logs Antigos

Para manter o banco otimizado, considere criar um job para limpar logs antigos:

```sql
-- Deletar logs com mais de 90 dias
DELETE FROM api_usage_logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Atualizacao de Precos

Os precos estao configurados em `server/helpers/usage-tracking.mjs` no objeto `MODEL_PRICING`. Atualize conforme necessario quando os provedores alterarem seus precos.

## Troubleshooting

### Logs nao aparecem

1. Verifique se o endpoint esta usando `await logAiUsage()`
2. Confirme que a conexao com o banco esta funcionando
3. Cheque os logs do servidor por erros de SQL

### Custos incorretos

1. Verifique se o modelo esta mapeado em `MODEL_PRICING`
2. Confirme que as metricas corretas estao sendo passadas (tokens, imageCount, etc.)
3. Atualize os precos se estiverem desatualizados

### Performance

O tracking e assincrono e nao deve impactar a latencia das chamadas de AI. Se notar lentidao:

1. Verifique indices na tabela `api_usage_logs`
2. Considere particionar a tabela por data
3. Use a tabela `aggregated_usage` para relatorios
