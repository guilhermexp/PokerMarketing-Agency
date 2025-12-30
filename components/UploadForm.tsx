import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { ContentInput, GenerationOptions, BrandProfile, CreativeModel } from '../types';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { GenerationOptionsModal } from './GenerationOptionsModal';
import { creativeModelLabels } from '../services/llmService';

const creativeModelOptions: CreativeModel[] = ['gemini-3-pro', 'gemini-3-flash', 'openai/gpt-5.2', 'x-ai/grok-4.1-fast'];

interface ImageFile {
  base64: string;
  mimeType: string;
  preview: string;
}

const toBase64 = (file: File): Promise<{ base64: string, mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = error => reject(error);
  });

interface UploadFormProps {
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
  brandProfile: BrandProfile;
  onUpdateCreativeModel: (model: CreativeModel) => void;
}

export const UploadForm: React.FC<UploadFormProps> = ({ onGenerate, isGenerating, brandProfile, onUpdateCreativeModel }) => {
  const [transcript, setTranscript] = useState<string>('');
  const [productImages, setProductImages] = useState<ImageFile[]>([]);
  const [inspirationImages, setInspirationImages] = useState<ImageFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setIsModelSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [generationOptions, setGenerationOptions] = useState<GenerationOptions>({
    videoClipScripts: { generate: true, count: 2 },
    posts: {
      linkedin: { generate: true, count: 1 },
      twitter: { generate: true, count: 2 },
      instagram: { generate: true, count: 1 },
      facebook: { generate: true, count: 1 },
    },
    adCreatives: {
      facebook: { generate: true, count: 1 },
      google: { generate: true, count: 1 },
    },
  });
  const [pendingContentInput, setPendingContentInput] = useState<ContentInput | null>(null);

  const handleFileUpload = async (files: FileList | null, type: 'product' | 'inspiration') => {
    if (!files) return;
    const newImages: ImageFile[] = [];
    for (const file of Array.from(files)) {
      const { base64, mimeType } = await toBase64(file);
      newImages.push({ base64, mimeType, preview: URL.createObjectURL(file) });
    }
    if (type === 'product') {
      setProductImages(prev => [...prev, ...newImages]);
    } else {
      setInspirationImages(prev => [...prev, ...newImages]);
    }
  };

  const handleRemoveImage = (index: number, type: 'product' | 'inspiration') => {
    if (type === 'product') {
      setProductImages(prev => prev.filter((_, i) => i !== index));
    } else {
      setInspirationImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleGenerateClick = () => {
    if (!transcript.trim()) {
      setError('Cole um conteúdo para gerar a campanha.');
      return;
    }
    setError(null);
    const contentInput = {
      transcript,
      productImages: productImages.length > 0 ? productImages.map(img => ({ base64: img.base64, mimeType: img.mimeType })) : null,
      inspirationImages: inspirationImages.length > 0 ? inspirationImages.map(img => ({ base64: img.base64, mimeType: img.mimeType })) : null,
    };
    setPendingContentInput(contentInput);
    setIsOptionsModalOpen(true);
  };

  const handleConfirmGeneration = () => {
    if (pendingContentInput) {
      onGenerate(pendingContentInput, generationOptions);
      setIsOptionsModalOpen(false);
      setPendingContentInput(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && transcript.trim()) {
      handleGenerateClick();
    }
  };

  const canGenerate = transcript.trim().length > 0 && !isGenerating;
  const hasAttachments = productImages.length > 0 || inspirationImages.length > 0;

  // Generate summary of selected options
  const getOptionsSummary = () => {
    const items: string[] = [];

    if (generationOptions.videoClipScripts.generate) {
      items.push(`${generationOptions.videoClipScripts.count} Clips`);
    }

    if (generationOptions.posts.instagram?.generate) items.push(`${generationOptions.posts.instagram.count} Instagram`);
    if (generationOptions.posts.facebook?.generate) items.push(`${generationOptions.posts.facebook.count} Facebook`);
    if (generationOptions.posts.twitter?.generate) items.push(`${generationOptions.posts.twitter.count} Twitter`);
    if (generationOptions.posts.linkedin?.generate) items.push(`${generationOptions.posts.linkedin.count} LinkedIn`);

    if (generationOptions.adCreatives.facebook?.generate) items.push(`${generationOptions.adCreatives.facebook.count} Facebook Ads`);
    if (generationOptions.adCreatives.google?.generate) items.push(`${generationOptions.adCreatives.google.count} Google Ads`);

    return items.length > 0 ? items.join(' • ') : 'Nenhuma opção selecionada';
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in-up">
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <img src="/logo-socialab.png" alt="Socialab" className="w-48 h-48 md:w-64 md:h-64 -rotate-12 hover:rotate-0 transition-transform duration-500" />
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            O que vamos criar?
          </h1>
        </div>

        {/* Main Input Box */}
        <div className="w-full max-w-3xl relative">
          <div className="bg-[#111111] border border-white/10 rounded-2xl transition-all focus-within:border-white/20">
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent px-5 pt-5 pb-3 text-white text-sm placeholder:text-white/30 outline-none resize-none min-h-[100px] rounded-t-2xl"
              placeholder="Cole a transcrição do seu vídeo, post de blog ou descreva sua campanha..."
              rows={3}
            />

            {/* Bottom Bar */}
            <div className="px-4 py-3 flex items-center justify-between border-t border-white/5 rounded-b-2xl">
              {/* Model Selector */}
              <div className="relative" ref={modelSelectorRef}>
                <button
                  type="button"
                  onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
                >
                  <Icon name="zap" className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">
                    {creativeModelLabels[brandProfile.creativeModel || 'gemini-3-pro']?.label || 'Gemini 3 Pro'}
                  </span>
                  <Icon name="chevron-down" className="w-3 h-3 ml-1" />
                </button>

                {/* Model Dropdown */}
                {isModelSelectorOpen && (
                  <div className="absolute top-full left-0 mt-1 py-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 min-w-[180px]">
                    {creativeModelOptions.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          onUpdateCreativeModel(model);
                          setIsModelSelectorOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                          brandProfile.creativeModel === model || (!brandProfile.creativeModel && model === 'gemini-3-pro')
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                        }`}
                      >
                        <span>{creativeModelLabels[model]?.label}</span>
                        <span className="text-[9px] text-white/30">{creativeModelLabels[model]?.provider}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleGenerateClick}
                disabled={!canGenerate}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  canGenerate
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-white/10 text-white/20 cursor-not-allowed'
                }`}
              >
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="chevron-up" className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          
          {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}

          {/* Attachments Preview - Below Input */}
          {hasAttachments && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {productImages.map((img, i) => (
                <div key={`product-${i}`} className="relative group">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-full border border-white/10">
                    <img src={img.preview} className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-[9px] text-white/50 font-medium">Logo</span>
                    <button
                      onClick={() => handleRemoveImage(i, 'product')}
                      className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    >
                      <Icon name="x" className="w-2.5 h-2.5 text-white/50" />
                    </button>
                  </div>
                </div>
              ))}
              {inspirationImages.map((img, i) => (
                <div key={`inspiration-${i}`} className="relative group">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/10 rounded-full border border-primary/20">
                    <img src={img.preview} className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-[9px] text-primary/70 font-medium">Referência</span>
                    <button
                      onClick={() => handleRemoveImage(i, 'inspiration')}
                      className="w-4 h-4 rounded-full bg-primary/20 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    >
                      <Icon name="x" className="w-2.5 h-2.5 text-primary/70" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attachment Options */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <input
              ref={productInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files, 'product')}
            />
            <input
              ref={inspirationInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files, 'inspiration')}
            />

            <button
              onClick={() => productInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 transition-all text-xs"
            >
              <Icon name="image" className="w-3.5 h-3.5" />
              <span>Logo / Produto</span>
            </button>

            <button
              onClick={() => inspirationInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 transition-all text-xs"
            >
              <Icon name="copy" className="w-3.5 h-3.5" />
              <span>Referência Visual</span>
            </button>

            <button
              onClick={() => setIsOptionsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 transition-all text-xs"
            >
              <Icon name="settings" className="w-3.5 h-3.5" />
              <span>Opções</span>
            </button>
          </div>

          {/* Hint */}
          <p className="text-center text-[10px] text-white/20 mt-4">
            Pressione <span className="text-white/30 font-mono">⌘ Enter</span> para gerar
          </p>

          {/* Options Summary */}
          <p className="text-center text-[10px] text-white/15 mt-2">
            {getOptionsSummary()}
          </p>
        </div>
      </div>

      <GenerationOptionsModal
        isOpen={isOptionsModalOpen}
        onClose={() => { setIsOptionsModalOpen(false); setPendingContentInput(null); }}
        options={generationOptions}
        setOptions={setGenerationOptions}
        onConfirm={handleConfirmGeneration}
        isGenerating={isGenerating}
        mode={pendingContentInput ? 'generate' : 'edit'}
      />
    </>
  );
};
