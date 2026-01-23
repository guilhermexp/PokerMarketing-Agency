/**
 * Error Message Parser
 *
 * Converts raw API error responses into user-friendly messages.
 * Handles common error patterns from Google AI, OpenAI, and internal APIs.
 */

interface ParsedError {
  /** User-friendly error message */
  message: string;
  /** Error type/category */
  type: 'quota' | 'rate_limit' | 'auth' | 'invalid_request' | 'server' | 'network' | 'unknown';
  /** Original error code if available */
  code?: number | string;
  /** Suggested action for the user */
  action?: string;
}

/**
 * Maps known error patterns to user-friendly messages
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp | string;
  type: ParsedError['type'];
  message: string;
  action?: string;
}> = [
  // Google AI / Gemini quota errors
  {
    pattern: /RESOURCE_EXHAUSTED|exceeded.*quota|quota.*exceeded/i,
    type: 'quota',
    message: 'Limite de uso da API atingido',
    action: 'Aguarde alguns minutos ou verifique seu plano de uso.',
  },
  {
    pattern: /429|rate.*limit|too many requests/i,
    type: 'rate_limit',
    message: 'Muitas requisições simultâneas',
    action: 'Aguarde alguns segundos e tente novamente.',
  },
  // Authentication errors
  {
    pattern: /401|unauthorized|invalid.*key|api.*key.*invalid/i,
    type: 'auth',
    message: 'Erro de autenticação',
    action: 'Verifique suas credenciais de API.',
  },
  {
    pattern: /403|forbidden|permission.*denied/i,
    type: 'auth',
    message: 'Acesso negado',
    action: 'Você não tem permissão para esta ação.',
  },
  // Invalid request errors
  {
    pattern: /400|bad.*request|invalid.*parameter|invalid.*input/i,
    type: 'invalid_request',
    message: 'Requisição inválida',
    action: 'Verifique os dados enviados.',
  },
  {
    pattern: /content.*policy|safety|blocked|harmful/i,
    type: 'invalid_request',
    message: 'Conteúdo bloqueado pela política de segurança',
    action: 'Tente com um prompt diferente.',
  },
  // Server errors
  {
    pattern: /500|internal.*server|server.*error/i,
    type: 'server',
    message: 'Erro interno do servidor',
    action: 'Tente novamente em alguns instantes.',
  },
  {
    pattern: /503|service.*unavailable|temporarily/i,
    type: 'server',
    message: 'Serviço temporariamente indisponível',
    action: 'O serviço está em manutenção. Tente novamente mais tarde.',
  },
  {
    pattern: /504|timeout|timed.*out/i,
    type: 'server',
    message: 'Tempo limite excedido',
    action: 'A operação demorou muito. Tente novamente.',
  },
  // Network errors
  {
    pattern: /network|connection|ECONNREFUSED|ENOTFOUND|fetch.*failed/i,
    type: 'network',
    message: 'Erro de conexão',
    action: 'Verifique sua conexão com a internet.',
  },
];

/**
 * Attempts to parse a JSON error response from a string
 */
function tryParseJsonError(errorString: string): Record<string, unknown> | null {
  try {
    // Try to find JSON in the string
    const jsonMatch = errorString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts error message from various error response formats
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return '';

  // Already a string
  if (typeof error === 'string') {
    // Try to parse as JSON first
    const parsed = tryParseJsonError(error);
    if (parsed) {
      return extractErrorMessage(parsed);
    }
    return error;
  }

  // Error object with nested error property (Google API format)
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;

    // Google API format: { error: { message: "...", status: "..." } }
    if (obj.error && typeof obj.error === 'object') {
      const innerError = obj.error as Record<string, unknown>;
      if (innerError.message) return String(innerError.message);
      if (innerError.status) return String(innerError.status);
    }

    // OpenAI format: { error: { message: "..." } }
    if (obj.error && typeof obj.error === 'string') {
      return obj.error;
    }

    // Standard formats
    if (obj.message) return String(obj.message);
    if (obj.error) return String(obj.error);
    if (obj.detail) return String(obj.detail);

    // Fallback: stringify the object
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  return String(error);
}

/**
 * Extracts error code from various error response formats
 */
function extractErrorCode(error: unknown): number | string | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const obj = error as Record<string, unknown>;

  // Google API format
  if (obj.error && typeof obj.error === 'object') {
    const innerError = obj.error as Record<string, unknown>;
    if (innerError.code) return innerError.code as number | string;
  }

  // Standard formats
  if (obj.code) return obj.code as number | string;
  if (obj.status) return obj.status as number | string;
  if (obj.statusCode) return obj.statusCode as number | string;

  return undefined;
}

/**
 * Parses an error (string, Error object, or API response) into a user-friendly format
 */
export function parseApiError(error: unknown): ParsedError {
  const errorMessage = extractErrorMessage(error);
  const errorCode = extractErrorCode(error);

  // Check error code first for common HTTP status codes
  if (errorCode) {
    const numericCode = typeof errorCode === 'number' ? errorCode : parseInt(String(errorCode), 10);
    if (!isNaN(numericCode)) {
      if (numericCode === 429) {
        return {
          message: 'Muitas requisições simultâneas',
          type: 'rate_limit',
          code: errorCode,
          action: 'Aguarde alguns segundos e tente novamente.',
        };
      }
      if (numericCode === 401) {
        return {
          message: 'Erro de autenticação',
          type: 'auth',
          code: errorCode,
          action: 'Verifique suas credenciais de API.',
        };
      }
      if (numericCode === 403) {
        return {
          message: 'Acesso negado',
          type: 'auth',
          code: errorCode,
          action: 'Você não tem permissão para esta ação.',
        };
      }
      if (numericCode === 500) {
        return {
          message: 'Erro interno do servidor',
          type: 'server',
          code: errorCode,
          action: 'Tente novamente em alguns instantes.',
        };
      }
      if (numericCode === 503) {
        return {
          message: 'Serviço temporariamente indisponível',
          type: 'server',
          code: errorCode,
          action: 'O serviço está em manutenção. Tente novamente mais tarde.',
        };
      }
    }
  }

  // Try to match against known patterns in the message
  for (const { pattern, type, message, action } of ERROR_PATTERNS) {
    const matches = typeof pattern === 'string'
      ? errorMessage.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(errorMessage);

    if (matches) {
      return {
        message,
        type,
        code: errorCode,
        action,
      };
    }
  }

  // Default unknown error
  return {
    message: 'Ocorreu um erro inesperado',
    type: 'unknown',
    code: errorCode,
    action: 'Tente novamente. Se o problema persistir, entre em contato com o suporte.',
  };
}

/**
 * Converts an error into a simple user-friendly message string
 */
export function getErrorMessage(error: unknown): string {
  const parsed = parseApiError(error);
  return parsed.action
    ? `${parsed.message}. ${parsed.action}`
    : parsed.message;
}

/**
 * Checks if an error is a quota/rate limit error
 */
export function isQuotaError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.type === 'quota' || parsed.type === 'rate_limit';
}

/**
 * Checks if an error is recoverable (can retry)
 */
export function isRecoverableError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return ['rate_limit', 'server', 'network'].includes(parsed.type);
}
