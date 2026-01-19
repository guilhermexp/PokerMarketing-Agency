/**
 * Hook para gerenciar sugestões de IA para logs de erro
 * Fornece estado e funções para buscar sugestões de correção
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface AiSuggestionsState {
  suggestions: string | null;
  isLoading: boolean;
  error: string | null;
  isCached: boolean;
}

/**
 * Hook que gerencia o estado de sugestões de IA para um log específico
 */
export function useAiSuggestions(logId: string | null) {
  const { getToken } = useAuth();
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
        error: 'ID do log não fornecido',
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const token = await getToken();

      const response = await fetch(`${API_BASE}/api/admin/logs/${logId}/ai-suggestions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
        error: err instanceof Error ? err.message : 'Falha ao gerar sugestões de IA',
        isCached: false,
      });
    }
  }, [logId, getToken]);

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
