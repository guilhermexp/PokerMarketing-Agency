/**
 * PlaygroundPromptForm Component
 * Prompt textarea with generate button for video generation.
 */

import React, { useRef, useCallback } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface PlaygroundPromptFormProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  isCreating: boolean;
  placeholder: string;
}

// =============================================================================
// PlaygroundPromptForm Component
// =============================================================================

export const PlaygroundPromptForm: React.FC<PlaygroundPromptFormProps> = ({
  prompt,
  onPromptChange,
  onGenerate,
  canGenerate,
  isCreating,
  placeholder,
}) => {
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onGenerate();
    }
  }, [onGenerate]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPromptChange(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  }, [onPromptChange]);

  return (
    <div className="relative bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden focus-within:border-white/[0.15] focus-within:bg-white/[0.06] transition-all duration-200 group/prompt">
      <textarea
        ref={promptRef}
        value={prompt}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none"
        placeholder={placeholder}
        style={{ minHeight: '56px', maxHeight: '180px' }}
      />

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <span className="text-[10px] text-white/20 hidden group-focus-within/prompt:inline">
          {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter
        </span>
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
            canGenerate
                ? 'bg-white/[0.1] border border-white/[0.15] text-white hover:bg-white/[0.15] active:scale-95'
              : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-transparent'
          }`}
          title="Gerar video (Ctrl/Cmd + Enter)"
        >
          {isCreating ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Sparkles className="w-4.5 h-4.5" />}
        </button>
      </div>
    </div>
  );
};
