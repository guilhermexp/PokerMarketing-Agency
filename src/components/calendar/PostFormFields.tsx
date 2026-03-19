import React from 'react';
import type { InstagramContentType } from '../../types';
import { Icon, type IconName } from '../common/Icon';

interface PostFormFieldsProps {
  caption: string;
  onCaptionChange: (value: string) => void;
  hashtags: string;
  onHashtagsChange: (value: string) => void;
  contentType: InstagramContentType;
  onContentTypeChange: (type: InstagramContentType) => void;
}

const CONTENT_TYPE_OPTIONS: Array<{ id: InstagramContentType; label: string; icon: IconName }> = [
  { id: 'photo', label: 'Feed', icon: 'image' },
  { id: 'carousel', label: 'Carrossel', icon: 'layout' },
  { id: 'reel', label: 'Reel', icon: 'video' },
  { id: 'story', label: 'Story', icon: 'circle' },
];

export const PostFormFields: React.FC<PostFormFieldsProps> = ({
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange,
  contentType,
  onContentTypeChange,
}) => {
  return (
    <div className="flex-1 p-3 sm:p-4 space-y-2 sm:space-y-3 overflow-y-auto">
      {/* Caption */}
      <div>
        <label className="text-xs font-semibold text-white/70 mb-1.5 block">
          Legenda
        </label>
        <textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Escreva a legenda..."
          rows={2}
          className="w-full bg-background/60 backdrop-blur-xl border border-border rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-white/30 resize-none transition-all"
        />
      </div>

      {/* Hashtags */}
      <div>
        <label className="text-xs font-semibold text-white/70 mb-1.5 block">
          Hashtags
        </label>
        <input
          type="text"
          value={hashtags}
          onChange={(e) => onHashtagsChange(e.target.value)}
          placeholder="#poker #torneio"
          className="w-full bg-background/60 backdrop-blur-xl border border-border rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-white/30 transition-all"
        />
      </div>

      {/* Content Type */}
      <div>
        <label className="text-xs font-semibold text-white/70 mb-1.5 block">
          Tipo de Conteúdo
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_TYPE_OPTIONS.map((t) => (
            <button
              key={t.id}
              onClick={() => onContentTypeChange(t.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                contentType === t.id
                  ? 'bg-white text-black shadow-lg'
                  : 'text-muted-foreground bg-background/60 backdrop-blur-xl border border-border hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon name={t.icon} className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
