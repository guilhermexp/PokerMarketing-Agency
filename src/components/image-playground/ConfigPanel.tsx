/**
 * ConfigPanel
 * Left sidebar with model selection, reference image, resolution, proportions, and quantity
 * Design based on LobeChat reference
 */

import React, { useCallback, useRef } from 'react';
import {
  Lock,
  Unlock,
  ImagePlus,
  Plus,
  X,
  Palette,
} from 'lucide-react';
import { useImagePlaygroundStore } from '../../stores/imagePlaygroundStore';

// =============================================================================
// Model Options - Only Gemini 3 Pro Image Preview
// =============================================================================

const MODEL_OPTIONS = [
  {
    provider: 'google',
    model: 'gemini-3-pro-image-preview',
    label: 'Gemini Pro Image',
    color: '#4285F4',
  },
];

const RESOLUTION_OPTIONS: Array<{ label: string; value: '1K' | '2K' | '4K' }> = [
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
];

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '2:3', value: '2:3' },
  { label: '3:2', value: '3:2' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '4:5', value: '4:5' },
  { label: '5:4', value: '5:4' },
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
];

const IMAGE_NUM_OPTIONS = [1, 2, 4, 8];

// =============================================================================
// Component
// =============================================================================

export const ConfigPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    model,
    parameters,
    imageNum,
    isAspectRatioLocked,
    activeAspectRatio,
    activeImageSize,
    useBrandProfile,
    setModelAndProvider,
    setParam,
    setImageNum,
    toggleAspectRatioLock,
    setAspectRatio,
    setImageSize,
    toggleBrandProfile,
  } = useImagePlaygroundStore();

  const selectedModel = MODEL_OPTIONS.find((m) => m.model === model);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = MODEL_OPTIONS.find((m) => m.model === e.target.value);
      if (selected) {
        setModelAndProvider(selected.model, selected.provider);
      }
    },
    [setModelAndProvider]
  );

  const handleResolutionChange = useCallback(
    (size: '1K' | '2K' | '4K') => {
      setImageSize(size);
    },
    [setImageSize]
  );

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
    },
    [setAspectRatio]
  );

  const handleImageNumChange = useCallback(
    (num: number) => {
      setImageNum(num);
    },
    [setImageNum]
  );

  const handleReferenceImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setParam('imageUrl', dataUrl);
        };
        reader.readAsDataURL(file);
      }
    },
    [setParam]
  );

  const handleRemoveReferenceImage = useCallback(() => {
    setParam('imageUrl', undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [setParam]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setParam('imageUrl', dataUrl);
        };
        reader.readAsDataURL(file);
      }
    },
    [setParam]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="text-2xl font-bold text-white">Pintura</h1>
        <p className="text-xs text-white/50 mt-1">
          Descrição simples, crie imediatamente
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Model Selection */}
        <div className="relative">
          <select
            value={model}
            onChange={handleModelChange}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.model} value={option.model} className="bg-black">
                {option.label}
              </option>
            ))}
          </select>
          {/* Model color indicator */}
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
            style={{ backgroundColor: selectedModel?.color || '#4285F4' }}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Brand Profile Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white/80">
            Usar perfil da marca
          </label>
          <button
            onClick={toggleBrandProfile}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
              useBrandProfile
                ? 'bg-white text-black shadow-md'
                : 'bg-white/5 text-white/60 border border-white/10 hover:text-white hover:border-white/20'
            }`}
            title={useBrandProfile ? "Usando cores e tom da marca" : "Sem personalização de marca"}
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>

        {/* Reference Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">
            Imagem de Referência
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {parameters.imageUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img
                src={parameters.imageUrl}
                alt="Reference"
                className="w-full h-40 object-cover"
              />
              <button
                onClick={handleRemoveReferenceImage}
                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <div
              onClick={handleReferenceImageClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-white/20 hover:bg-white/5 transition-colors"
            >
              <ImagePlus className="w-10 h-10 text-white/30" />
              <p className="text-xs text-white/40 text-center">
                Clique ou arraste para enviar imagens
              </p>
              <p className="text-[10px] text-white/30">
                Suporta seleção de múltiplas imagens
              </p>
            </div>
          )}
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">
            Resolução
          </label>
          <div className="flex gap-2">
            {RESOLUTION_OPTIONS.map((res) => (
              <button
                key={res.value}
                onClick={() => handleResolutionChange(res.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeImageSize === res.value
                    ? 'bg-white/15 border border-white/20 text-white'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio / Proporção */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">
              Proporção
            </label>
            <button
              onClick={toggleAspectRatioLock}
              className={`p-1.5 rounded-lg transition-colors ${
                isAspectRatioLocked
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-white/40 hover:text-white/60'
              }`}
              title={isAspectRatioLocked ? 'Proporção travada' : 'Travar proporção'}
            >
              {isAspectRatioLocked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ASPECT_RATIOS.map((ratio) => {
              const [w, h] = ratio.value.split(':').map(Number);
              const isVertical = h > w;
              const isSquare = w === h;
              const isWide = w > h * 1.5;

              return (
                <button
                  key={ratio.value}
                  onClick={() => handleAspectRatioChange(ratio.value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${
                    activeAspectRatio === ratio.value
                      ? 'bg-white/15 border border-white/20'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                  title={ratio.label}
                >
                  {/* Aspect ratio visual indicator */}
                  <div
                    className={`border border-white/40 rounded-sm ${
                      activeAspectRatio === ratio.value ? 'border-white' : ''
                    }`}
                    style={{
                      width: isVertical ? 10 : isWide ? 20 : isSquare ? 14 : 16,
                      height: isVertical ? (isWide ? 20 : 16) : isSquare ? 14 : 10,
                    }}
                  />
                  <span className={`text-[10px] ${
                    activeAspectRatio === ratio.value ? 'text-white' : 'text-white/50'
                  }`}>
                    {ratio.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Number of Images */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">
            Quantidade de Imagens
          </label>
          <div className="flex gap-2">
            {IMAGE_NUM_OPTIONS.map((num) => (
              <button
                key={num}
                onClick={() => handleImageNumChange(num)}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                  imageNum === num
                    ? 'bg-white/15 border border-white/20 text-white'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => {
                const custom = prompt('Quantidade personalizada (1-16):');
                if (custom) {
                  const num = parseInt(custom);
                  if (num >= 1 && num <= 16) {
                    handleImageNumChange(num);
                  }
                }
              }}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center"
              title="Quantidade personalizada"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
