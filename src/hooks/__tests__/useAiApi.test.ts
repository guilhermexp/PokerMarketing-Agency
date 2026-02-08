import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAiApi } from '../useAiApi';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

vi.mock('../../services/apiClient', () => ({
  generateAiImage: vi.fn(),
  generateAiFlyer: vi.fn(),
  editAiImage: vi.fn(),
  generateAiSpeech: vi.fn(),
  generateAiText: vi.fn(),
  generateAiCampaign: vi.fn(),
}));

describe('useAiApi', () => {
  it('should provide AI API functions', () => {
    const { result } = renderHook(() => useAiApi());

    expect(result.current.generateImage).toBeDefined();
    expect(result.current.generateFlyer).toBeDefined();
    expect(result.current.editImage).toBeDefined();
    expect(result.current.generateSpeech).toBeDefined();
    expect(result.current.generateText).toBeDefined();
    expect(result.current.generateCampaign).toBeDefined();
  });

  it('should provide getAuthToken function', async () => {
    const { result } = renderHook(() => useAiApi());
    const token = await result.current.getAuthToken();
    expect(token).toBe('mock-token');
  });
});
