import React from 'react';
import { Button } from '../common/Button';
import { Icon, type IconName } from '../common/Icon';
import type { GenerationOptions, GenerationSetting } from '../../types';

interface GenerationOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  onConfirm: () => void;
  isGenerating: boolean;
  mode?: 'generate' | 'edit';
}

const CountSelector: React.FC<{
  count: number;
  disabled?: boolean;
  onChange: (count: number) => void;
}> = ({ count, disabled, onChange }) => (
  <div className={`flex items-center gap-1 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
    {[1, 2, 3].map((num) => (
      <button
        key={num}
        onClick={() => onChange(num)}
        disabled={disabled}
        className={`
          w-7 h-7 rounded-md text-xs font-semibold transition-all
          ${count === num
            ? 'bg-white/15 text-white'
            : 'bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10'
          }
        `}
      >
        {num}
      </button>
    ))}
  </div>
);

const SectionCard: React.FC<{
  icon: IconName;
  title: string;
  description: string;
  enabled: boolean;
  count: number;
  onToggle: () => void;
  onCountChange: (count: number) => void;
  children?: React.ReactNode;
}> = ({
  icon,
  title,
  description,
  enabled,
  count,
  onToggle,
  onCountChange,
  children,
}) => (
  <div
    onClick={onToggle}
    className={`rounded-lg border p-3 transition-all cursor-pointer ${
      enabled
        ? 'border-white/20 bg-white/[0.04]'
        : 'border-white/10 bg-white/[0.02] hover:border-white/15'
    }`}
  >
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-3 flex-1">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            enabled ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'
          }`}
        >
          <Icon name={icon} className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h3 className={`text-sm font-semibold ${enabled ? 'text-white' : 'text-white/60'}`}>
            {title}
          </h3>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
      </div>

      <div
        className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase ${
          enabled
            ? 'bg-white/10 text-white'
            : 'bg-white/5 text-white/30'
        }`}
      >
        {enabled ? 'Ativo' : 'Off'}
      </div>
    </div>

    <div className="flex items-center justify-between pt-3 border-t border-white/10">
      <span className="text-xs text-white/40">Quantidade:</span>
      <div onClick={(e) => e.stopPropagation()}>
        <CountSelector count={count} disabled={!enabled} onChange={onCountChange} />
      </div>
    </div>

    {enabled && children && <div className="mt-3" onClick={(e) => e.stopPropagation()}>{children}</div>}
  </div>
);

const SubOption: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: () => void;
}> = ({ label, enabled, onToggle }) => (
  <button
    onClick={onToggle}
    className={`
      px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2
      ${enabled
        ? 'bg-white/10 text-white border border-white/20'
        : 'text-white/40 hover:text-white/60 border border-white/10 hover:border-white/15 bg-white/5'
      }
    `}
  >
    <span
      className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
        enabled ? 'border-white bg-white' : 'border-white/30 bg-transparent'
      }`}
    >
      {enabled && <Icon name="check" className="w-2 h-2 text-black" />}
    </span>
    {label}
  </button>
);

export const GenerationOptionsModal: React.FC<GenerationOptionsModalProps> = ({
  isOpen,
  onClose,
  options,
  setOptions,
  onConfirm,
  isGenerating,
  mode = 'generate'
}) => {
  if (!isOpen) return null;

  const postsEnabled = Object.values(options.posts).some((v: GenerationSetting) => v.generate);
  const adsEnabled = Object.values(options.adCreatives).some((v: GenerationSetting) => v.generate);
  const nothingSelected = !options.videoClipScripts.generate && !postsEnabled && !adsEnabled;

  const totalCount = (options.videoClipScripts.generate ? options.videoClipScripts.count : 0) +
    Object.entries(options.posts).reduce((sum, [, s]: [string, GenerationSetting]) => sum + (s.generate ? s.count : 0), 0) +
    Object.entries(options.adCreatives).reduce((sum, [, s]: [string, GenerationSetting]) => sum + (s.generate ? s.count : 0), 0);

  const togglePosts = () => {
    const newEnabled = !postsEnabled;
    setOptions(prev => ({
      ...prev,
      posts: {
        instagram: { ...prev.posts.instagram, generate: newEnabled },
        facebook: { ...prev.posts.facebook, generate: false },
        twitter: { ...prev.posts.twitter, generate: false },
        linkedin: { ...prev.posts.linkedin, generate: false },
      }
    }));
  };

  const toggleAds = () => {
    const newEnabled = !adsEnabled;
    setOptions(prev => ({
      ...prev,
      adCreatives: {
        facebook: { ...prev.adCreatives.facebook, generate: newEnabled },
        google: { ...prev.adCreatives.google, generate: false },
      }
    }));
  };

  const togglePostPlatform = (key: string) => {
    setOptions(prev => ({
      ...prev,
      posts: {
        ...prev.posts,
        [key]: { ...prev.posts[key], generate: !prev.posts[key].generate }
      }
    }));
  };

  const toggleAdPlatform = (key: string) => {
    setOptions(prev => ({
      ...prev,
      adCreatives: {
        ...prev.adCreatives,
        [key]: { ...prev.adCreatives[key], generate: !prev.adCreatives[key].generate }
      }
    }));
  };

  const setPostsCount = (count: number) => {
    setOptions(prev => {
      const newPosts = { ...prev.posts };
      for (const key in newPosts) {
        if (newPosts[key].generate) {
          newPosts[key] = { ...newPosts[key], count };
        }
      }
      return { ...prev, posts: newPosts };
    });
  };

  const setAdsCount = (count: number) => {
    setOptions(prev => {
      const newAds = { ...prev.adCreatives };
      for (const key in newAds) {
        if (newAds[key].generate) {
          newAds[key] = { ...newAds[key], count };
        }
      }
      return { ...prev, adCreatives: newAds };
    });
  };

  const getPostsCount = () => (Object.values(options.posts) as GenerationSetting[]).find(s => s.generate)?.count || 1;
  const getAdsCount = () => (Object.values(options.adCreatives) as GenerationSetting[]).find(s => s.generate)?.count || 1;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
        <div className="bg-[#0a0a0a] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white mb-1">O que você quer criar?</h2>
            <p className="text-xs text-white/50">
              Escolha os tipos de conteúdo e quantos você quer gerar
            </p>
          </div>

          <div className="p-4 space-y-3">
            <SectionCard
              icon="film"
              title="Roteiros de Vídeo & Carrosséis"
              description="Scripts com cenas, narração e carrosséis"
              enabled={options.videoClipScripts.generate}
              count={options.videoClipScripts.count}
              onToggle={() => setOptions(prev => ({
                ...prev,
                videoClipScripts: { ...prev.videoClipScripts, generate: !prev.videoClipScripts.generate }
              }))}
              onCountChange={(count) => setOptions(prev => ({
                ...prev,
                videoClipScripts: { ...prev.videoClipScripts, count }
              }))}
            />

            <SectionCard
              icon="image"
              title="Posts para Redes Sociais"
              description="Textos e imagens para cada plataforma"
              enabled={postsEnabled}
              count={getPostsCount()}
              onToggle={togglePosts}
              onCountChange={setPostsCount}
            >
              <div className="bg-black/20 border border-white/10 rounded-lg p-2">
                <p className="text-[10px] text-white/50 mb-2">
                  Plataformas:
                </p>
                <div className="flex flex-wrap gap-2">
                  <SubOption
                    label="Instagram"
                    enabled={options.posts.instagram.generate}
                    onToggle={() => togglePostPlatform('instagram')}
                  />
                  <SubOption
                    label="Facebook"
                    enabled={options.posts.facebook.generate}
                    onToggle={() => togglePostPlatform('facebook')}
                  />
                  <SubOption
                    label="Twitter"
                    enabled={options.posts.twitter.generate}
                    onToggle={() => togglePostPlatform('twitter')}
                  />
                  <SubOption
                    label="LinkedIn"
                    enabled={options.posts.linkedin.generate}
                    onToggle={() => togglePostPlatform('linkedin')}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon="zap"
              title="Anúncios Pagos"
              description="Criativos otimizados para conversão"
              enabled={adsEnabled}
              count={getAdsCount()}
              onToggle={toggleAds}
              onCountChange={setAdsCount}
            >
              <div className="bg-black/20 border border-white/10 rounded-lg p-2">
                <p className="text-[10px] text-white/50 mb-2">
                  Canais:
                </p>
                <div className="flex flex-wrap gap-2">
                  <SubOption
                    label="Meta Ads"
                    enabled={options.adCreatives.facebook.generate}
                    onToggle={() => toggleAdPlatform('facebook')}
                  />
                  <SubOption
                    label="Google Ads"
                    enabled={options.adCreatives.google.generate}
                    onToggle={() => toggleAdPlatform('google')}
                  />
                </div>
              </div>
            </SectionCard>
          </div>


        <div className="p-4 flex items-center justify-between border-t border-white/10">
          <span className="text-xs text-white/40">
            {totalCount > 0 ? `${totalCount} ${totalCount === 1 ? 'item' : 'itens'}` : 'Selecione uma opção'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isGenerating} size="small">
              Cancelar
            </Button>
            <Button
              onClick={mode === 'edit' ? onClose : onConfirm}
              isLoading={isGenerating}
              disabled={isGenerating || nothingSelected}
              size="small"
            >
              {mode === 'edit' ? 'Salvar' : 'Gerar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
