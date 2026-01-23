import { describe, it, expect } from 'vitest';
import { parseApiError, getErrorMessage, isQuotaError, isRecoverableError } from '../errorMessages';

describe('errorMessages', () => {
  describe('parseApiError', () => {
    it('should parse Google API quota error JSON', () => {
      const error = '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}';
      const result = parseApiError(error);

      expect(result.type).toBe('quota');
      expect(result.message).toBe('Limite de uso da API atingido');
      expect(result.action).toBeDefined();
    });

    it('should parse rate limit errors', () => {
      const error = { error: { message: 'Too many requests', code: 429 } };
      const result = parseApiError(error);

      expect(result.type).toBe('rate_limit');
      expect(result.message).toBe('Muitas requisições simultâneas');
    });

    it('should parse authentication errors', () => {
      const error = { error: 'Unauthorized', status: 401 };
      const result = parseApiError(error);

      expect(result.type).toBe('auth');
      expect(result.message).toBe('Erro de autenticação');
    });

    it('should parse server errors', () => {
      const error = 'Internal server error';
      const result = parseApiError(error);

      expect(result.type).toBe('server');
      expect(result.message).toBe('Erro interno do servidor');
    });

    it('should parse network errors', () => {
      const error = new Error('Network error: ECONNREFUSED');
      const result = parseApiError(error.message);

      expect(result.type).toBe('network');
      expect(result.message).toBe('Erro de conexão');
    });

    it('should handle unknown errors', () => {
      const error = 'Some random error message';
      const result = parseApiError(error);

      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Ocorreu um erro inesperado');
    });

    it('should handle null/undefined errors', () => {
      expect(parseApiError(null).type).toBe('unknown');
      expect(parseApiError(undefined).type).toBe('unknown');
    });

    it('should extract error code from nested error object', () => {
      const error = { error: { code: 403, message: 'Forbidden' } };
      const result = parseApiError(error);

      expect(result.code).toBe(403);
    });
  });

  describe('getErrorMessage', () => {
    it('should return user-friendly message with action', () => {
      const error = '{"error":{"status":"RESOURCE_EXHAUSTED"}}';
      const message = getErrorMessage(error);

      expect(message).toContain('Limite de uso');
      expect(message).toContain('Aguarde');
    });

    it('should return simple message for unknown errors', () => {
      const message = getErrorMessage('random error');
      expect(message).toContain('erro inesperado');
    });
  });

  describe('isQuotaError', () => {
    it('should return true for quota errors', () => {
      expect(isQuotaError('RESOURCE_EXHAUSTED')).toBe(true);
      expect(isQuotaError('quota exceeded')).toBe(true);
    });

    it('should return true for rate limit errors', () => {
      expect(isQuotaError({ error: { code: 429 } })).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isQuotaError('Internal server error')).toBe(false);
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for rate limit errors', () => {
      expect(isRecoverableError({ error: { code: 429 } })).toBe(true);
    });

    it('should return true for server errors', () => {
      expect(isRecoverableError('Internal server error')).toBe(true);
    });

    it('should return true for network errors', () => {
      expect(isRecoverableError('Network connection failed')).toBe(true);
    });

    it('should return false for auth errors', () => {
      expect(isRecoverableError('Unauthorized')).toBe(false);
    });
  });
});
