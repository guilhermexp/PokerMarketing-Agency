import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../common/Button';
import { Icon, type IconName } from '../common/Icon';
import type { GenerationOptions, GenerationSetting } from '../../types';

// Animation variants
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.15 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12
    }
  }
};

// Brand Icons
const BrandIcons = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  meta: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.452.76-1.017 1.59-2.396 2.373-3.87.103-.19.205-.38.307-.57h3.832c.102.19.204.38.307.57.784 1.474 1.613 2.853 2.373 3.87 1.332 1.781 2.468 2.452 3.965 2.452 1.775 0 2.897-.768 3.593-1.927a5.3 5.3 0 0 0 .371-.761c.112-.282.2-.567.266-.86.139-.604.209-1.267.209-1.973 0-2.566-.703-5.24-2.044-7.306-1.188-1.832-2.903-3.113-4.871-3.113-1.773 0-2.994.767-3.913 1.692-.906-.925-2.14-1.692-3.913-1.692zm0 2.152c.874 0 1.512.333 2.088.804l.086.07v.002c-.187.303-.39.65-.61 1.035-.618 1.082-1.378 2.57-2.048 4.022-.238.514-.472 1.025-.692 1.517-.158-.34-.308-.68-.443-1.01-.745-1.822-1.225-3.432-1.225-4.575 0-1.036.343-1.865.9-1.865zm10.17 0c.557 0 .9.829.9 1.865 0 1.143-.48 2.753-1.225 4.575a37.95 37.95 0 0 1-.443 1.01c-.22-.492-.454-1.003-.692-1.517-.67-1.452-1.43-2.94-2.048-4.022-.22-.385-.423-.732-.61-1.035v-.002l.085-.07c.577-.471 1.215-.804 2.089-.804h-.056z" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
};

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
            ? 'bg-white/15 text-white border border-white/20'
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
  title: string;
  description: string;
  enabled: boolean;
  count: number;
  onToggle: () => void;
  onCountChange: (count: number) => void;
  children?: React.ReactNode;
}> = ({
  title,
  description,
  enabled,
  count,
  onToggle,
  onCountChange,
  children,
}) => (
  <motion.div
    variants={itemVariants}
    onClick={onToggle}
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.99 }}
    className={`rounded-lg border p-3 transition-colors cursor-pointer ${
      enabled
        ? 'border-white/20 bg-white/[0.04]'
        : 'border-white/10 bg-white/[0.02] hover:border-white/15'
    }`}
  >
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-3 flex-1">
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
  </motion.div>
);

const SubOption: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}> = ({ label, enabled, onToggle, icon }) => (
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
    {icon && (
      <span className={enabled ? 'text-white' : 'text-white/40'}>
        {icon}
      </span>
    )}
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-[#0a0a0a] rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10">
              <motion.h2
                variants={itemVariants}
                className="text-lg font-semibold text-white mb-1"
              >
                O que você quer criar?
              </motion.h2>
              <motion.p
                variants={itemVariants}
                className="text-xs text-white/50"
              >
                Escolha os tipos de conteúdo e quantos você quer gerar
              </motion.p>
            </div>

            <div className="p-4 space-y-3">
            <SectionCard
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
                    icon={BrandIcons.instagram}
                    enabled={options.posts.instagram.generate}
                    onToggle={() => togglePostPlatform('instagram')}
                  />
                  <SubOption
                    label="Facebook"
                    icon={BrandIcons.facebook}
                    enabled={options.posts.facebook.generate}
                    onToggle={() => togglePostPlatform('facebook')}
                  />
                  <SubOption
                    label="Twitter"
                    icon={BrandIcons.twitter}
                    enabled={options.posts.twitter.generate}
                    onToggle={() => togglePostPlatform('twitter')}
                  />
                  <SubOption
                    label="LinkedIn"
                    icon={BrandIcons.linkedin}
                    enabled={options.posts.linkedin.generate}
                    onToggle={() => togglePostPlatform('linkedin')}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
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
                    icon={BrandIcons.meta}
                    enabled={options.adCreatives.facebook.generate}
                    onToggle={() => toggleAdPlatform('facebook')}
                  />
                  <SubOption
                    label="Google Ads"
                    icon={BrandIcons.google}
                    enabled={options.adCreatives.google.generate}
                    onToggle={() => toggleAdPlatform('google')}
                  />
                </div>
              </div>
            </SectionCard>
          </div>


          <motion.div
            variants={itemVariants}
            className="p-4 flex items-center justify-between border-t border-white/10"
          >
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
          </motion.div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
