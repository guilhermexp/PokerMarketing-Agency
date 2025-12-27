import React from 'react';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import type { GenerationOptions, GenerationSetting } from '../types';

interface GenerationOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  onConfirm: () => void;
  isGenerating: boolean;
  mode?: 'generate' | 'edit';
}

const ContentRow: React.FC<{
  icon: string;
  label: string;
  enabled: boolean;
  count: number;
  onToggle: () => void;
  onCountChange: (count: number) => void;
}> = ({ icon, label, enabled, count, onToggle, onCountChange }) => {
  return (
    <div className="flex items-center justify-between py-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-3 group"
      >
        <div className={`
          w-4 h-4 rounded border-2 flex items-center justify-center transition-all
          ${enabled ? 'border-white bg-white' : 'border-white/20 group-hover:border-white/40'}
        `}>
          {enabled && <Icon name="check" className="w-2.5 h-2.5 text-black" />}
        </div>
        <Icon name={icon as any} className={`w-4 h-4 ${enabled ? 'text-white' : 'text-white/40'}`} />
        <span className={`text-sm ${enabled ? 'text-white' : 'text-white/50'}`}>{label}</span>
      </button>

      {enabled && (
        <div className="flex items-center gap-0.5">
          {[1, 2, 3].map((num) => (
            <button
              key={num}
              onClick={() => onCountChange(num)}
              className={`
                w-7 h-7 rounded text-xs font-medium transition-all
                ${count === num
                  ? 'bg-white/10 text-white'
                  : 'text-white/30 hover:text-white/60'
                }
              `}
            >
              {num}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SubOption: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: () => void;
}> = ({ label, enabled, onToggle }) => (
  <button
    onClick={onToggle}
    className={`
      px-3 py-1.5 rounded-full text-xs transition-all
      ${enabled
        ? 'bg-white/10 text-white'
        : 'text-white/30 hover:text-white/50'
      }
    `}
  >
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
    Object.entries(options.posts).reduce((sum, [, s]) => sum + (s.generate ? s.count : 0), 0) +
    Object.entries(options.adCreatives).reduce((sum, [, s]) => sum + (s.generate ? s.count : 0), 0);

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

  const getPostsCount = () => Object.values(options.posts).find(s => s.generate)?.count || 1;
  const getAdsCount = () => Object.values(options.adCreatives).find(s => s.generate)?.count || 1;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111] rounded-xl w-full max-w-sm border border-white/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-medium text-white">Gerar conteúdo</h2>
        </div>

        <div className="px-4 divide-y divide-white/[0.04]">
          {/* Video Scripts */}
          <ContentRow
            icon="film"
            label="Roteiros de vídeo"
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

          {/* Posts */}
          <div>
            <ContentRow
              icon="image"
              label="Posts"
              enabled={postsEnabled}
              count={getPostsCount()}
              onToggle={togglePosts}
              onCountChange={setPostsCount}
            />
            {postsEnabled && (
              <div className="flex flex-wrap gap-2 pb-3 pl-7">
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
            )}
          </div>

          {/* Ads */}
          <div>
            <ContentRow
              icon="megaphone"
              label="Anúncios"
              enabled={adsEnabled}
              count={getAdsCount()}
              onToggle={toggleAds}
              onCountChange={setAdsCount}
            />
            {adsEnabled && (
              <div className="flex flex-wrap gap-2 pb-3 pl-7">
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
            )}
          </div>
        </div>

        <div className="p-4 flex items-center justify-between border-t border-white/[0.06]">
          <span className="text-xs text-white/30">
            {totalCount > 0 && `${totalCount} ${totalCount === 1 ? 'item' : 'itens'}`}
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
