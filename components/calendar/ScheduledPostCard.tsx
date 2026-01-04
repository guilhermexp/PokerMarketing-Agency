import React, { useState } from 'react';
import type { ScheduledPost, InstagramPublishState } from '../../types';
import { Icon } from '../common/Icon';
import { isRubeConfigured } from '../../services/rubeService';

interface ScheduledPostCardProps {
  post: ScheduledPost;
  variant: 'compact' | 'full';
  onUpdate: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDelete: (postId: string) => void;
  onPublishToInstagram?: (post: ScheduledPost) => void;
  publishingState?: InstagramPublishState | null;
}

export const ScheduledPostCard: React.FC<ScheduledPostCardProps> = ({
  post,
  variant,
  onUpdate,
  onDelete,
  onPublishToInstagram,
  publishingState
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const canPublishToInstagram = isRubeConfigured() && (post.platforms === 'instagram' || post.platforms === 'both');
  const isPublishing = publishingState && publishingState.step !== 'idle' && publishingState.step !== 'completed' && publishingState.step !== 'failed';

  const statusColors = {
    scheduled: 'bg-white/10 border-white/20 text-white/70',
    publishing: 'bg-amber-500/10 border-amber-500/20 text-amber-400/80',
    published: 'bg-green-500/10 border-green-500/20 text-green-400/80',
    failed: 'bg-red-500/10 border-red-500/20 text-red-400/80',
    cancelled: 'bg-white/5 border-white/10 text-white/30'
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
      <>
        {/* Simple indicator dot */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
          className={`
            w-full p-1 rounded-md border cursor-pointer transition-all
            ${statusColors[post.status]}
            hover:scale-105
          `}
          title={`${post.scheduledTime} - ${post.platforms}`}
        >
          <div className="flex items-center gap-1">
            <Icon
              name={platformIcons[post.platforms] as any}
              className="w-2.5 h-2.5 flex-shrink-0"
            />
            <span className="text-[7px] font-bold truncate">
              {post.scheduledTime}
            </span>
          </div>
        </button>

        {/* Expanded View - Portal-like fixed overlay */}
        {isExpanded && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsExpanded(false); }}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
          >
            <div
              className="bg-[#111111] border border-white/10 rounded-2xl max-w-md w-full mx-4 overflow-hidden max-h-[85vh] overflow-y-auto"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseMove={(e) => e.stopPropagation()}
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
                {post.caption && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">Caption</label>
                    <p className="text-xs text-white/60 whitespace-pre-wrap">{post.caption}</p>
                  </div>
                )}

                {/* Hashtags */}
                {post.hashtags.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-white/30 uppercase tracking-wider">Hashtags</label>
                    <p className="text-xs text-white/40">{post.hashtags.join(' ')}</p>
                  </div>
                )}

                {/* Platform & Content Type */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Icon name={platformIcons[post.platforms] as any} className="w-4 h-4 text-white/40" />
                    <span className="text-[9px] font-bold text-white/40 uppercase">
                      {post.platforms === 'both' ? 'Instagram & Facebook' : post.platforms}
                    </span>
                  </div>
                  {post.instagramContentType && post.platforms !== 'facebook' && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                      <Icon
                        name={
                          post.instagramContentType === 'photo' ? 'image' :
                          post.instagramContentType === 'reel' ? 'film' :
                          post.instagramContentType === 'story' ? 'circle' :
                          'layers'
                        }
                        className="w-3 h-3 text-white/50"
                      />
                      <span className="text-[8px] font-bold text-white/50 uppercase">
                        {post.instagramContentType === 'photo' ? 'Feed' :
                         post.instagramContentType === 'reel' ? 'Reel' :
                         post.instagramContentType === 'story' ? 'Story' :
                         'Carousel'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {isPublishing && publishingState && (
                <div className="px-4 py-3 border-t border-white/10 bg-white/5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-[10px] font-medium text-white/70 block">{publishingState.message}</span>
                      <span className="text-[9px] text-white/40">{publishingState.progress}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-white/50 transition-all duration-300"
                      style={{ width: `${publishingState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Success Message */}
              {publishingState?.step === 'completed' && (
                <div className="px-4 py-3 border-t border-white/10 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Icon name="check" className="w-4 h-4 text-white/70" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-white/80">Publicado com sucesso</p>
                      <p className="text-[9px] text-white/40 mt-0.5">{publishingState.message}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open('https://www.instagram.com/', '_blank')}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold text-white/60 transition-colors"
                  >
                    <Icon name="external-link" className="w-3 h-3" />
                    Ver no Instagram
                  </button>
                </div>
              )}

              {/* Error Message */}
              {publishingState?.step === 'failed' && (
                <div className="px-4 py-3 border-t border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon name="alert-circle" className="w-4 h-4 text-red-400/70" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-red-400/80">Falha na publicação</p>
                      <p className="text-[9px] text-red-400/50 mt-0.5">{publishingState.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="px-4 py-3 border-t border-white/5 space-y-2">
                {post.status === 'scheduled' && (
                  <>
                    {/* Primary Action - Publish to Instagram */}
                    {canPublishToInstagram && onPublishToInstagram && (
                      <button
                        onClick={() => onPublishToInstagram(post)}
                        disabled={isPublishing}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                          isPublishing
                            ? 'bg-white/10 text-white/50 cursor-wait'
                            : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white/80'
                        }`}
                      >
                        {isPublishing ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Publicando...
                          </>
                        ) : (
                          <>
                            <Icon name="send" className="w-3.5 h-3.5" />
                            Publicar no Instagram
                          </>
                        )}
                      </button>
                    )}

                    {/* Secondary Actions Row */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleCopyCaption}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black text-white/60 uppercase tracking-wider transition-colors"
                      >
                        <Icon name="copy" className="w-3 h-3" />
                        Copiar
                      </button>
                      {(post.platforms === 'instagram' || post.platforms === 'both') && (
                        <button
                          onClick={() => handleOpenPlatform('instagram')}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black text-white/60 uppercase tracking-wider transition-colors"
                        >
                          <Icon name="external-link" className="w-3 h-3" />
                          Abrir IG
                        </button>
                      )}
                      {(post.platforms === 'facebook' || post.platforms === 'both') && (
                        <button
                          onClick={() => handleOpenPlatform('facebook')}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black text-white/60 uppercase tracking-wider transition-colors"
                        >
                          <Icon name="external-link" className="w-3 h-3" />
                          Abrir FB
                        </button>
                      )}
                    </div>

                    {/* Tertiary Actions Row */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleMarkAsPublished}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-bold text-white/50 uppercase tracking-wider transition-colors"
                      >
                        <Icon name="check" className="w-3 h-3" />
                        Marcar Publicado
                      </button>
                      <button
                        onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-red-500/10 rounded-lg text-[9px] font-bold text-white/40 hover:text-red-400/80 uppercase tracking-wider transition-colors"
                      >
                        <Icon name="trash" className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
                {post.status !== 'scheduled' && (
                  <button
                    onClick={() => { onDelete(post.id); setIsExpanded(false); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-red-500/10 rounded-lg text-[9px] font-bold text-white/40 hover:text-red-400/80 uppercase tracking-wider transition-colors"
                  >
                    <Icon name="trash" className="w-3 h-3" />
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </>
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
            {post.instagramContentType && post.platforms !== 'facebook' && (
              <span className="text-[7px] font-bold text-white/40 uppercase">
                {post.instagramContentType === 'photo' ? 'Feed' :
                 post.instagramContentType === 'reel' ? 'Reel' :
                 post.instagramContentType === 'story' ? 'Story' :
                 'Carousel'}
              </span>
            )}
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
                className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                title="Marcar como publicado"
              >
                <Icon name="check" className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(post.id)}
            className="p-2 text-white/30 hover:text-red-400/80 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Excluir"
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
