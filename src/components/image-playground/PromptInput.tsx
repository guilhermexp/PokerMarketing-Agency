/**
 * PromptInput
 * Text input for entering image generation prompts with generate button
 * Design based on LobeChat reference - clean with sparkle button
 */

import React, { useCallback, useRef, KeyboardEvent } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useImagePlaygroundStore, imagePlaygroundSelectors } from '../../stores/imagePlaygroundStore';
import { useCreateImage } from '../../hooks/useImagePlayground';

export const PromptInput: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prompt = useImagePlaygroundStore(imagePlaygroundSelectors.prompt);
  const setParam = useImagePlaygroundStore((s) => s.setParam);
  const { createImage, isCreating, canGenerate } = useCreateImage();

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
        // Error already handled by useCreateImage hook via toast
        createImage().catch(() => {});
      }
    },
    [canGenerate, createImage]
  );

  const handleGenerate = useCallback(() => {
    if (canGenerate) {
      // Error already handled by useCreateImage hook via toast
      createImage().catch(() => {});
    }
  }, [canGenerate, createImage]);

  return (
    <div className="relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/20 transition-colors">
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={handlePromptChange}
        onKeyDown={handleKeyDown}
        placeholder="Descreva o conteúdo que deseja gerar"
        rows={1}
        disabled={isCreating}
        className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none disabled:opacity-50"
        style={{ minHeight: '56px', maxHeight: '200px' }}
      />

      {/* Generate Button - Clean sparkle button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          canGenerate
            ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95'
            : 'bg-white/5 text-white/30 cursor-not-allowed'
        }`}
        title={canGenerate ? 'Gerar imagem (⌘ Enter)' : 'Digite um prompt para gerar'}
      >
        {isCreating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Sparkles className="w-5 h-5" />
        )}
      </button>
    </div>
  );
};

export default PromptInput;
