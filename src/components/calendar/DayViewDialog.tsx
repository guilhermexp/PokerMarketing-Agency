import React from "react";
import type { ScheduledPost } from "../../types";
import { Icon } from "../common/Icon";

interface DayViewDialogProps {
  date: string;
  scheduledPosts: ScheduledPost[];
  onClose: () => void;
  onPostClick: (post: ScheduledPost) => void;
  onPublishToInstagram: (post: ScheduledPost) => void;
  onRetryScheduledPost?: (postId: string) => void;
  onDeleteScheduledPost: (postId: string) => void;
  onUpdateScheduledPost: (postId: string, updates: Partial<ScheduledPost>) => void;
  onEditPost: (post: ScheduledPost) => void;
  onNewSchedule: (date: string) => void;
}

export const DayViewDialog: React.FC<DayViewDialogProps> = ({
  date,
  scheduledPosts,
  onClose,
  onPostClick,
  onPublishToInstagram,
  onRetryScheduledPost,
  onDeleteScheduledPost,
  onUpdateScheduledPost,
  onEditPost,
  onNewSchedule,
}) => {
  const dayPosts = scheduledPosts
    .filter((post) => post.scheduledDate === date)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const publishedCount = dayPosts.filter((p) => p.status === "published").length;
  const scheduledCount = dayPosts.filter((p) => p.status === "scheduled").length;

  const summaryParts: string[] = [];
  if (scheduledCount > 0)
    summaryParts.push(`${scheduledCount} agendado${scheduledCount !== 1 ? "s" : ""}`);
  if (publishedCount > 0)
    summaryParts.push(`${publishedCount} publicado${publishedCount !== 1 ? "s" : ""}`);
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : "Nenhum post";

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium text-white capitalize">
                {new Date(date).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <p className="text-[11px] text-white/30 mt-1">{summary}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-white/20 hover:text-white/50 rounded-lg hover:bg-white/[0.04] transition-colors"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="px-5 py-4 overflow-y-auto max-h-[65vh]">
          <div className="space-y-2">
            {dayPosts.map((post) => {
              const contentType = post.instagramContentType;
              const typeLabel =
                contentType === "story"
                  ? "Story"
                  : contentType === "carousel"
                    ? "Carousel"
                    : contentType === "reel"
                      ? "Reel"
                      : null;

              return (
                <div
                  key={post.id}
                  className="group flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => {
                      onClose();
                      onPostClick(post);
                    }}
                    className="cursor-pointer"
                  >
                    {post.imageUrl ? (
                      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.03] border border-white/[0.06] transition-colors">
                        <img
                          src={post.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0 border border-white/[0.06] transition-colors">
                        <Icon name="image" className="w-6 h-6 text-white/20" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-white">
                        {post.scheduledTime}
                      </span>
                      {typeLabel && (
                        <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">
                          {typeLabel}
                        </span>
                      )}
                      {post.status === "published" && (
                        <span className="text-[9px] font-medium text-emerald-400/80 px-2 py-0.5 bg-emerald-500/[0.08] border border-emerald-500/[0.15] rounded-md">
                          Publicado
                        </span>
                      )}
                      {post.status === "failed" && (
                        <span className="text-[9px] font-medium text-red-400/80 px-2 py-0.5 bg-red-500/[0.08] border border-red-500/[0.15] rounded-md">
                          Falhou
                        </span>
                      )}
                      {post.status === "scheduled" && (
                        <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">
                          Agendado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 line-clamp-2">
                      {post.caption || "Sem legenda"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {post.status === "scheduled" && (
                      <>
                        {onPublishToInstagram && (
                          <button
                            onClick={() => {
                              onPublishToInstagram(post);
                              onClose();
                            }}
                            className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                            title="Publicar agora"
                          >
                            <Icon name="send" className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onClose();
                            onEditPost(post);
                          }}
                          className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            onUpdateScheduledPost(post.id, {
                              status: "published",
                              publishedAt: Date.now(),
                            });
                          }}
                          className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                          title="Marcar como publicado"
                        >
                          <Icon name="check" className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {post.status === "failed" && onRetryScheduledPost && (
                      <button
                        onClick={() => {
                          onRetryScheduledPost(post.id);
                          onClose();
                        }}
                        className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                        title="Tentar novamente"
                      >
                        <Icon name="refresh-cw" className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteScheduledPost(post.id)}
                      className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 pb-4 pt-3 border-t border-white/[0.06]">
          <button
            onClick={() => {
              onClose();
              onNewSchedule(date);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white/70 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] rounded-xl transition-all"
          >
            <Icon name="plus" className="w-4 h-4" />
            Novo Agendamento
          </button>
        </div>
      </div>
    </div>
  );
};
