/**
 * Hook para gerenciar sugestoes de IA para logs de erro
 * Fornece estado e funcoes para buscar sugestoes de correcao
 */

import { useState, useCallback } from 'react';
import { getCsrfToken, getCurrentCsrfToken } from '../services/apiClient';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface AiSuggestionsState {
  suggestions: string | null;
  isLoading: boolean;
  error: string | null;
  isCached: boolean;
}

/**
 * Hook que gerencia o estado de sugestoes de IA para um log especifico
 */
export function useAiSuggestions(logId: string | null) {
  const [state, setState] = useState<AiSuggestionsState>({
    suggestions: null,
    isLoading: false,
    error: null,
    isCached: false,
  });

  const fetchSuggestions = useCallback(async () => {
    if (!logId) {
      setState(prev => ({
        ...prev,
        error: 'ID do log nao fornecido',
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      // Get CSRF token if not cached
      if (!getCurrentCsrfToken()) {
        await getCsrfToken();
      }

      const response = await fetch(`${API_BASE}/api/admin/logs/${logId}/ai-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getCurrentCsrfToken() ? { 'X-CSRF-Token': getCurrentCsrfToken()! } : {}),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const data = await response.json();

      setState({
        suggestions: data.suggestions,
        isLoading: false,
        error: null,
        isCached: data.cached || false,
      });
    } catch (err) {
      console.error('Error fetching AI suggestions:', err);
      setState({
        suggestions: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Falha ao gerar sugestoes de IA',
        isCached: false,
      });
    }
  }, [logId]);

  const reset = useCallback(() => {
    setState({
      suggestions: null,
      isLoading: false,
      error: null,
      isCached: false,
    });
  }, []);

  return {
    ...state,
    fetchSuggestions,
    reset,
  };
}

export default useAiSuggestions;
