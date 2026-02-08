import { describe, it, expect } from 'vitest';
import { getEnv } from '../env';

describe('env', () => {
  describe('getEnv', () => {
    it('should read environment variables', () => {
      // Test with existing env var from vitest setup
      const result = getEnv('MODE');
      expect(result).toBeDefined();
    });

    it('should return undefined for non-existent keys', () => {
      const result = getEnv('NON_EXISTENT_KEY_12345');
      expect(result).toBeUndefined();
    });

    it('should handle empty string key gracefully', () => {
      const result = getEnv('');
      expect(result).toBeUndefined();
    });
  });
});
