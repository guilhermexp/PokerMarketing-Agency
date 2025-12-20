import React, { useState } from 'react';
import type { ScheduledPost } from '../../types';
import { Icon } from '../common/Icon';

interface ScheduledPostCardProps {
  post: ScheduledPost;
  variant: 'compact' | 'full';
  onUpdate: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDelete: (postId: string) => void;
}

export const ScheduledPostCard: React.FC<ScheduledPostCardProps> = ({
  post,
  variant,
  onUpdate,
  onDelete
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusColors = {
    scheduled: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    publishing: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    published: 'bg-green-500/20 border-green-500/30 text-green-400',
    failed: 'bg-red-500/20 border-red-500/30 text-red-400',
    cancelled: 'bg-white/10 border-white/10 text-white/40'
  };

  const statusLabels = {
    scheduled: 'Agendado',
    publishing: 'Publicando',
    published: 'Publicado',
    failed: 'Falhou',
    cancelled: 'Cancelado'
  };

  const platformIcons: Record<string, string> = {
    instagram: 'instagram',
    facebook: 'facebook',
    both: 'share'
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(post.caption + '\n\n' + post.hashtags.join(' '));
  };

  const handleOpenPlatform = (platform: 'instagram' | 'facebook') => {
    if (platform === 'instagram') {
      window.open('https://www.instagram.com/', '_blank');
    } else {
      window.open('https://www.facebook.com/', '_blank');
    }
  };

  const handleMarkAsPublished = () => {
    onUpdate(post.id, { status: 'published', publishedAt: Date.now() });
  };

  if (variant === 'compact') {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
        className={`
          p-1.5 rounded-md border cursor-pointer transition-all
          ${statusColors[post.status]}
          hover:scale-[1.02]
        `}
      >
        <div className="flex items-center gap-1.5">
          <Icon
            name={platformIcons[post.platforms] as any}
            className="w-2.5 h-2.5 flex-shrink-0"
          />
          <span className="text-[8px] font-bold truncate flex-1">
            {post.scheduledTime}
          </span>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
          >
            <div
              className="bg-[#111111] border border-white/10 rounded-2xl max-w-md w-full mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-1 rounded text-[8px] font-black uppercase ${statusColors[post.status]}`}>
                    {statusLabels[post.status]}
                  </div>
                  <span className="text-[9px] text-white/40">
                    {post.scheduledDate} {post.scheduledTime}
                  </span>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 text-white/40 hover:text-white transition-colors"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                {/* Image Preview */}
                {post.imageUrl && (
                  <div className="aspect-square w-full max-w-[200px] mx-auto rounded-xl overflow-hidden border border-white/10">
                    <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Caption */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">Caption</label>
                  <p className="text-xs text-white/60 whitespace-pre-wrap">{post.caption}</p>
                </div>

                {/* Hashtags */}
                {post.hashtags.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">Hashtags</label>
                    <p className="text-xs text-primary/60">{post.hashtags.join(' ')}</p>
                  </div>
                )}

                {/* Platform */}
                <div className="flex items-center gap-2">
                  <Icon name={platformIcons[post.platforms] as any} className="w-4 h-4 text-white/40" />
                  <span className="text-[9px] font-bold text-white/40 uppercase">
                    {post.platforms === 'both' ? 'Instagram & Facebook' : post.platforms}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t border-white/5 flex gap-2">
                {post.status === 'scheduled' && (
                  <>
                    <button
                      onClick={handleCopyCaption}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black text-white/60 uppercase tracking-wider transition-colors"
                    >
                      <Icon name="copy" className="w-3 h-3" />
                      Copiar
                    </button>
                    {(post.platforms === 'instagram' || post.platforms === 'both') && (
                      <button
                        onClick={() => handleOpenPlatform('instagram')}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 rounded-lg text-[9px] font-black text-white uppercase tracking-wider transition-colors"
                      >
                        <Icon name="instagram" className="w-3 h-3" />
                        Abrir
                      </button>
                    )}
                    {(post.platforms === 'facebook' || post.platforms === 'both') && (
                      <button
                        onClick={() => handleOpenPlatform('facebook')}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-[9px] font-black text-white uppercase tracking-wider transition-colors"
                      >
                        <Icon name="facebook" className="w-3 h-3" />
                        Abrir
                      </button>
                    )}
                    <button
                      onClick={handleMarkAsPublished}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-[9px] font-black text-green-400 uppercase tracking-wider transition-colors"
                    >
                      <Icon name="check" className="w-3 h-3" />
                      Publicado
                    </button>
                  </>
                )}
                <button
                  onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-[9px] font-black text-red-400 uppercase tracking-wider transition-colors"
                >
                  <Icon name="trash" className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full variant (for list views)
  return (
    <div className={`p-4 rounded-xl border ${statusColors[post.status]} bg-[#0a0a0a]`}>
      <div className="flex items-start gap-4">
        {/* Image Thumbnail */}
        {post.imageUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
            <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusColors[post.status]}`}>
              {statusLabels[post.status]}
            </div>
            <Icon name={platformIcons[post.platforms] as any} className="w-3 h-3 text-white/40" />
          </div>

          <p className="text-xs text-white/60 line-clamp-2 mb-2">{post.caption}</p>

          <div className="flex items-center gap-3 text-[9px] text-white/30">
            <span className="flex items-center gap-1">
              <Icon name="calendar" className="w-3 h-3" />
              {post.scheduledDate}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="clock" className="w-3 h-3" />
              {post.scheduledTime}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {post.status === 'scheduled' && (
            <>
              <button
                onClick={handleCopyCaption}
                className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                title="Copiar caption"
              >
                <Icon name="copy" className="w-4 h-4" />
              </button>
              <button
                onClick={handleMarkAsPublished}
                className="p-2 text-green-400/50 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                title="Marcar como publicado"
              >
                <Icon name="check" className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(post.id)}
            className="p-2 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Excluir"
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
