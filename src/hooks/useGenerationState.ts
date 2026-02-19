import { useState, useCallback, useRef } from "react";

interface GenerationState {
  isGenerating: boolean[];
  errors: (string | null)[];
}

export function useGenerationState() {
  const [state, setState] = useState<GenerationState>({
    isGenerating: [],
    errors: [],
  });
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  // Track which indices are actively generating to prevent external resets
  const generatingIndicesRef = useRef<Set<number>>(new Set());

  const reset = useCallback((length: number) => {
    setState((prev) => ({
      isGenerating: Array(length)
        .fill(false)
        .map((_, idx) =>
          generatingIndicesRef.current.has(idx)
            ? (prev.isGenerating[idx] ?? false)
            : false,
        ),
      errors: Array(length)
        .fill(null)
        .map((_, idx) =>
          generatingIndicesRef.current.has(idx)
            ? (prev.errors[idx] ?? null)
            : null,
        ),
    }));
  }, []);

  const startGenerating = useCallback((index: number) => {
    generatingIndicesRef.current.add(index);
    setState((prev) => {
      const newGenerating = [...prev.isGenerating];
      const newErrors = [...prev.errors];
      newGenerating[index] = true;
      newErrors[index] = null;
      return { isGenerating: newGenerating, errors: newErrors };
    });
  }, []);

  const completeGenerating = useCallback((index: number) => {
    generatingIndicesRef.current.delete(index);
    setState((prev) => {
      const newGenerating = [...prev.isGenerating];
      newGenerating[index] = false;
      return { ...prev, isGenerating: newGenerating };
    });
  }, []);

  const failGenerating = useCallback((index: number, error: string) => {
    generatingIndicesRef.current.delete(index);
    setState((prev) => {
      const newGenerating = [...prev.isGenerating];
      const newErrors = [...prev.errors];
      newGenerating[index] = false;
      newErrors[index] = error;
      return { isGenerating: newGenerating, errors: newErrors };
    });
  }, []);

  const isActivelyGenerating = useCallback(
    (index: number) => generatingIndicesRef.current.has(index),
    [],
  );

  return {
    isGenerating: state.isGenerating,
    errors: state.errors,
    isGeneratingAll,
    setIsGeneratingAll,
    generatingIndicesRef,
    reset,
    startGenerating,
    completeGenerating,
    failGenerating,
    isActivelyGenerating,
    hasAnyGenerating: state.isGenerating.some(Boolean),
  };
}
