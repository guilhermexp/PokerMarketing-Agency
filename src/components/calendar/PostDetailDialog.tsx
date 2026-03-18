import React from "react";
import type { ScheduledPost } from "../../types";
import { Icon } from "../common/Icon";
import { isRubeConfigured } from "../../services/rubeService";

interface PostDetailDialogProps {
  post: ScheduledPost;
  onClose: () => void;
  onPublishToInstagram: (post: ScheduledPost) => void;
  onRetryScheduledPost?: (postId: string) => void;
  onDeleteScheduledPost: (postId: string) => void;
  onEditPost: (post: ScheduledPost) => void;
}

const formatDateRange = (post: ScheduledPost) => {
  const date = new Date(post.scheduledDate);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  return date.toLocaleDateString("pt-BR", options);
};

export const PostDetailDialog: React.FC<PostDetailDialogProps> = ({
  post,
  onClose,
  onPublishToInstagram,
  onRetryScheduledPost,
  onDeleteScheduledPost,
  onEditPost,
}) => {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-white">
                {formatDateRange(post)}
              </h3>
              <p className="text-sm text-white/40 mt-1">{post.scheduledTime}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/30 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Image Preview */}
          {post.imageUrl && (
            <div className="px-6 py-4">
              <img
                src={post.imageUrl}
                alt=""
                className="w-full h-auto rounded-xl border border-white/[0.06]"
              />
            </div>
          )}

          {/* Content Details */}
          <div className="px-6 py-4 space-y-4">
            {/* Caption */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-2">
                Legenda
              </p>
              <p className="text-sm text-white/70 leading-relaxed">
                {post.caption || (
                  <span className="italic text-white/30">Sem legenda</span>
                )}
              </p>
            </div>

            {/* Hashtags */}
            {post.hashtags && post.hashtags.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-2">
                  Hashtags
                </p>
                <p className="text-sm text-white/40">{post.hashtags.join(" ")}</p>
              </div>
            )}

            {/* Status & Platform */}
            <div className="flex items-center gap-2 pt-2">
              <span
                className={`text-[9px] font-medium px-2.5 py-1 rounded-lg border ${
                  post.status === "published"
                    ? "text-emerald-400/80 bg-emerald-500/[0.08] border-emerald-500/[0.15]"
                    : post.status === "failed"
                      ? "text-red-400/80 bg-red-500/[0.08] border-red-500/[0.15]"
                      : "text-white/50 bg-white/[0.04] border-white/[0.08]"
                }`}
              >
                {post.status === "scheduled"
                  ? "Agendado"
                  : post.status === "published"
                    ? "Publicado"
                    : "Falhou"}
              </span>
              {post.instagramContentType && (
                <span className="text-[9px] font-medium text-white/40 px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                  {post.instagramContentType === "story"
                    ? "Story"
                    : post.instagramContentType === "carousel"
                      ? "Carousel"
                      : post.instagramContentType === "reel"
                        ? "Reel"
                        : "Photo"}
                </span>
              )}
              <span className="text-[9px] font-medium text-white/40 px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded-lg uppercase">
                {post.platforms}
              </span>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex gap-2 flex-shrink-0">
          {post.status === "scheduled" && (
            <>
              {isRubeConfigured() && (
                <button
                  onClick={() => {
                    onPublishToInstagram(post);
                    onClose();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-medium text-white/80 hover:bg-white/[0.1] transition-all"
                >
                  <Icon name="send" className="w-4 h-4" />
                  Publicar Agora
                </button>
              )}
              <button
                onClick={() => onEditPost(post)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-medium text-white/80 hover:bg-white/[0.1] transition-all"
              >
                <Icon name="edit" className="w-4 h-4" />
                Editar
              </button>
            </>
          )}
          {post.status === "failed" && onRetryScheduledPost && (
            <button
              onClick={() => {
                onRetryScheduledPost(post.id);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-medium text-white/80 hover:bg-white/[0.1] transition-all"
            >
              <Icon name="refresh-cw" className="w-4 h-4" />
              Tentar Novamente
            </button>
          )}
          <button
            onClick={() => {
              onDeleteScheduledPost(post.id);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm font-medium text-white/40 hover:text-white/70 transition-all"
          >
            <Icon name="trash" className="w-4 h-4" />
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
};
