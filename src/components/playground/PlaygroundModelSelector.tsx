import React, { useCallback, useRef } from 'react';
import {
  Monitor,
  Palette,
  Smartphone,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  useVideoPlaygroundStore,
  type VideoModel,
  type VideoAspectRatio,
  type VideoResolution,
} from '../../stores/videoPlaygroundStore';

const MODEL_OPTIONS: Array<{ value: VideoModel; label: string; color: string; desc: string }> = [
  { value: 'veo-3.1', label: 'Veo 3.1', color: '#3B82F6', desc: 'Google DeepMind' },
  { value: 'sora-2', label: 'Sora 2', color: '#10B981', desc: 'OpenAI' },
];

const ASPECT_RATIO_OPTIONS: Array<{ value: VideoAspectRatio; label: string; icon: React.ReactNode }> = [
  { value: '9:16', label: '9:16', icon: <Smartphone className="w-3.5 h-3.5" /> },
  { value: '16:9', label: '16:9', icon: <Monitor className="w-3.5 h-3.5" /> },
];

const RESOLUTION_OPTIONS: Array<{ value: VideoResolution; label: string; desc: string }> = [
  { value: '720p', label: '720p', desc: 'HD' },
  { value: '1080p', label: '1080p', desc: 'Full HD' },
];

const ConfigSection: React.FC<{ label: string; children: React.ReactNode; action?: React.ReactNode }> = ({ label, children, action }) => (
  <div className="space-y-2.5">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</span>
      {action}
    </div>
    {children}
  </div>
);

export const PlaygroundModelSelector: React.FC = () => {
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const {
    model,
    aspectRatio,
    resolution,
    useBrandProfile,
    referenceImage,
    setModel,
    setAspectRatio,
    setResolution,
    toggleBrandProfile,
    setReferenceImage,
  } = useVideoPlaygroundStore(useShallow((s) => ({
    model: s.model,
    aspectRatio: s.aspectRatio,
    resolution: s.resolution,
    useBrandProfile: s.useBrandProfile,
    referenceImage: s.referenceImage,
    setModel: s.setModel,
    setAspectRatio: s.setAspectRatio,
    setResolution: s.setResolution,
    toggleBrandProfile: s.toggleBrandProfile,
    setReferenceImage: s.setReferenceImage,
  })));

  const handleReferenceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;

      const base64 = reader.result.split(',')[1];
      if (!base64) return;

      setReferenceImage({
        id: Date.now().toString(),
        dataUrl: base64,
        mimeType: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);

    if (referenceInputRef.current) {
      referenceInputRef.current.value = '';
    }
  }, [setReferenceImage]);

  const clearReferenceImage = useCallback(() => {
    setReferenceImage(null);
  }, [setReferenceImage]);

  return (
    <div className="h-full flex flex-col bg-black/30 backdrop-blur-2xl">
      {/* Header */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
              <Video className="w-4.5 h-4.5 text-white/50" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Studio Video</h1>
            <p className="text-[11px] text-white/35 mt-0.5">Configurações de geração</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Model Selection */}
        <ConfigSection label="Modelo">
          <div className="space-y-1.5">
            {MODEL_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setModel(option.value)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                  model === option.value
                    ? 'bg-white/[0.08] border border-white/[0.12] shadow-sm'
                    : 'bg-transparent border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                    model === option.value ? 'scale-110 shadow-lg' : 'opacity-50'
                  }`}
                  style={{
                    backgroundColor: option.color,
                    boxShadow: model === option.value ? `0 0 12px ${option.color}50` : 'none',
                  }}
                />
                <div className="flex-1 text-left">
                  <span className={`text-sm font-medium ${model === option.value ? 'text-white' : 'text-white/60'}`}>
                    {option.label}
                  </span>
                  <span className={`text-[10px] ml-2 ${model === option.value ? 'text-white/40' : 'text-white/25'}`}>
                    {option.desc}
                  </span>
                </div>
                {model === option.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                )}
              </button>
            ))}
          </div>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Brand Profile Toggle */}
        <ConfigSection label="Marca">
          <button
            onClick={toggleBrandProfile}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
              useBrandProfile
                ? 'bg-white/[0.08] border border-white/[0.12]'
                : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
            }`}
            title={useBrandProfile ? 'Diretrizes da marca ativas' : 'Diretrizes da marca desativadas'}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              useBrandProfile
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/40'
            }`}>
              <Palette className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <span className={`text-sm font-medium ${useBrandProfile ? 'text-white' : 'text-white/60'}`}>
                Perfil da marca
              </span>
              <p className="text-[10px] text-white/25 mt-0.5">
                {useBrandProfile ? 'Ativo - diretrizes aplicadas' : 'Desativado'}
              </p>
            </div>
            <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
              useBrandProfile ? 'bg-white/20' : 'bg-white/[0.06]'
            }`}>
              <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                useBrandProfile ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
              }`} />
            </div>
          </button>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Reference Image */}
        <ConfigSection
          label="Referencia"
          action={referenceImage ? (
            <button
              onClick={clearReferenceImage}
              className="text-[10px] font-medium text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider"
            >
              Remover
            </button>
          ) : undefined}
        >
          <input
            ref={referenceInputRef}
            type="file"
            accept="image/*"
            onChange={handleReferenceUpload}
            className="hidden"
          />

          {referenceImage ? (
            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] group/ref">
              <img
                src={`data:${referenceImage.mimeType};base64,${referenceImage.dataUrl}`}
                alt="Referencia"
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/ref:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={clearReferenceImage}
                  className="p-2 rounded-lg bg-black/60 hover:bg-black/80 transition-colors"
                  title="Remover imagem"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => referenceInputRef.current?.click()}
              className="w-full border border-dashed border-white/[0.1] rounded-xl p-5 flex flex-col items-center justify-center gap-2.5 hover:border-white/[0.2] hover:bg-white/[0.02] transition-all group/upload"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover/upload:bg-white/[0.08] transition-colors">
                <Upload className="w-4.5 h-4.5 text-white/30 group-hover/upload:text-white/50 transition-colors" />
              </div>
              <span className="text-[11px] text-white/30 group-hover/upload:text-white/50 transition-colors">
                Imagem para guiar o video
              </span>
            </button>
          )}
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Aspect Ratio */}
        <ConfigSection label="Proporção">
          <div className="grid grid-cols-2 gap-2">
            {ASPECT_RATIO_OPTIONS.map((ratio) => (
              <button
                key={ratio.value}
                onClick={() => setAspectRatio(ratio.value)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  aspectRatio === ratio.value
                    ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-sm'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}
              >
                <span className={aspectRatio === ratio.value ? 'text-white/70' : 'text-white/25'}>
                  {ratio.icon}
                </span>
                {ratio.label}
              </button>
            ))}
          </div>
        </ConfigSection>

        {/* Resolution */}
        <ConfigSection label="Resolução">
          <div className="grid grid-cols-2 gap-2">
            {RESOLUTION_OPTIONS.map((item) => (
              <button
                key={item.value}
                onClick={() => setResolution(item.value)}
                className={`flex flex-col items-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  resolution === item.value
                    ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-sm'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}
              >
                {item.label}
                <span className={`text-[10px] mt-0.5 ${resolution === item.value ? 'text-white/40' : 'text-white/20'}`}>
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </ConfigSection>
      </div>
    </div>
  );
};
