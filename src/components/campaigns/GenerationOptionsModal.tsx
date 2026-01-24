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
  <div className={`flex items-center gap-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
    {[1, 2, 3].map((num) => (
      <button
        key={num}
        onClick={() => onChange(num)}
        disabled={disabled}
        className={`
          w-10 h-10 rounded-xl text-sm font-bold transition-all
          ${count === num
            ? 'bg-primary text-white shadow-lg shadow-primary/30'
            : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border border-white/10'
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
    className={`rounded-2xl border-2 p-5 transition-all cursor-pointer group ${
      enabled
        ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10'
        : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
    }`}
  >
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-4 flex-1">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${
            enabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40 group-hover:bg-white/10'
          }`}
        >
          <Icon name={icon} className="w-7 h-7" />
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-bold mb-1 ${enabled ? 'text-white' : 'text-white/70'}`}>
            {title}
          </h3>
          <p className="text-sm text-white/50 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div
          className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
            enabled
              ? 'bg-primary/30 text-primary border-2 border-primary/50'
              : 'bg-white/5 text-white/40 border-2 border-white/10'
          }`}
        >
          {enabled ? '✓ Ativo' : 'Desativado'}
        </div>
      </div>
    </div>

    <div className="flex items-center justify-between pt-4 border-t border-white/10">
      <span className="text-sm font-medium text-white/60">Quantidade a gerar:</span>
      <div onClick={(e) => e.stopPropagation()}>
        <CountSelector count={count} disabled={!enabled} onChange={onCountChange} />
      </div>
    </div>

    {enabled && children && <div className="mt-4" onClick={(e) => e.stopPropagation()}>{children}</div>}
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
      px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2.5
      ${enabled
        ? 'bg-primary/20 text-white border-2 border-primary/50 shadow-md'
        : 'text-white/50 hover:text-white/80 border-2 border-white/10 hover:border-white/20 bg-white/5'
      }
    `}
  >
    <span
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
        enabled ? 'border-primary bg-primary' : 'border-white/30 bg-transparent'
      }`}
    >
      {enabled && <Icon name="check" className="w-3 h-3 text-white" />}
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
      className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
        <div className="bg-[#0a0a0a] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white mb-2">O que você quer criar?</h2>
            <p className="text-sm text-white/60">
              Escolha os tipos de conteúdo e quantos você quer gerar
            </p>
          </div>

          <div className="p-6 space-y-5">
            <SectionCard
              icon="film"
              title="Roteiros de Vídeo & Carrosséis"
              description="Scripts completos com cenas, narração e carrosséis prontos para usar"
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
              description="Textos e imagens otimizadas para cada plataforma"
              enabled={postsEnabled}
              count={getPostsCount()}
              onToggle={togglePosts}
              onCountChange={setPostsCount}
            >
              <div className="bg-black/40 border border-white/10 rounded-xl p-4">
                <p className="text-sm font-medium text-white/70 mb-3">
                  Escolha as plataformas:
                </p>
                <div className="grid grid-cols-2 gap-3">
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
              description="Criativos profissionais otimizados para conversão"
              enabled={adsEnabled}
              count={getAdsCount()}
              onToggle={toggleAds}
              onCountChange={setAdsCount}
            >
              <div className="bg-black/40 border border-white/10 rounded-xl p-4">
                <p className="text-sm font-medium text-white/70 mb-3">
                  Escolha os canais de anúncios:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <SubOption
                    label="Meta Ads (FB/IG)"
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


        <div className="p-6 flex items-center justify-between border-t border-white/10 bg-black/20">
          <div className="flex items-center gap-3">
            {totalCount > 0 ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-primary/20 border-2 border-primary/50 flex items-center justify-center">
                  <span className="text-xl font-bold text-primary">{totalCount}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{totalCount} {totalCount === 1 ? 'item' : 'itens'}</p>
                  <p className="text-xs text-white/50">serão gerados</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/40">Selecione pelo menos uma opção</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
              Cancelar
            </Button>
            <Button
              onClick={mode === 'edit' ? onClose : onConfirm}
              isLoading={isGenerating}
              disabled={isGenerating || nothingSelected}
            >
              {mode === 'edit' ? 'Salvar Configurações' : 'Gerar Conteúdo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
