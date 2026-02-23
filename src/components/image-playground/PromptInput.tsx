/**
 * PromptInput
 * Text input for entering image generation prompts with generate button
 * Professional design matching Video Studio
 */

import React, { useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useImagePlaygroundStore, imagePlaygroundSelectors } from '../../stores/imagePlaygroundStore';
import { useCreateImage } from '../../hooks/useImagePlayground';

export const PromptInput: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prompt = useImagePlaygroundStore(imagePlaygroundSelectors.prompt);
  const setParam = useImagePlaygroundStore((s) => s.setParam);
  const { createImage, isCreating, canGenerate } = useCreateImage();

  // Reset textarea height when prompt is cleared programmatically
  useEffect(() => {
    if (!prompt && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [prompt]);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setParam('prompt', e.target.value);

      // Auto-resize textarea
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    },
    [setParam]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter to generate
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canGenerate) {
        e.preventDefault();
        createImage().catch(() => {});
      }
    },
    [canGenerate, createImage]
  );

  const handleGenerate = useCallback(() => {
    if (canGenerate) {
      createImage().catch(() => {});
    }
  }, [canGenerate, createImage]);

  return (
    <div className="relative bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden focus-within:border-white/[0.15] focus-within:bg-white/[0.06] transition-all duration-200 group/prompt">
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={handlePromptChange}
        onKeyDown={handleKeyDown}
        placeholder="Descreva o conteudo que deseja gerar..."
        rows={1}
        disabled={isCreating}
        className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none disabled:opacity-50"
        style={{ minHeight: '56px', maxHeight: '200px' }}
      />

      {/* Generate Button */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <span className="text-[10px] text-white/20 hidden group-focus-within/prompt:inline">
          {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter
        </span>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
            canGenerate
                ? 'bg-white/[0.1] border border-white/[0.15] text-white hover:bg-white/[0.15] active:scale-95'
              : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-transparent'
          }`}
          title={canGenerate ? 'Gerar imagem (Cmd/Ctrl + Enter)' : 'Digite um prompt para gerar'}
        >
          {isCreating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default PromptInput;
