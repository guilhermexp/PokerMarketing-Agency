import React from "react";
import type { ScheduledPost } from "../../types";
import { Icon } from "../common/Icon";

interface TodayViewProps {
  scheduledPosts: ScheduledPost[];
  onBack: () => void;
  onPostClick: (post: ScheduledPost) => void;
  onPublishToInstagram: (post: ScheduledPost) => void;
  onRetryScheduledPost?: (postId: string) => void;
  onDeleteScheduledPost: (postId: string) => void;
  onEditPost: (post: ScheduledPost) => void;
  onScheduleNew: () => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  scheduledPosts,
  onBack,
  onPostClick,
  onPublishToInstagram,
  onRetryScheduledPost,
  onDeleteScheduledPost,
  onEditPost,
  onScheduleNew,
}) => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayPosts = scheduledPosts
    .filter((post) => post.scheduledDate === todayStr)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const publishedCount = todayPosts.filter((p) => p.status === "published").length;
  const scheduledCount = todayPosts.filter((p) => p.status === "scheduled").length;

  return (
    <main className="flex-1 px-3 md:px-8 py-4 md:py-6 flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors"
        >
          <Icon name="chevron-left" className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg font-medium text-white capitalize">
            {today.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <p className="text-[11px] text-white/30 mt-0.5">
            {todayPosts.length === 0 ? (
              "Nenhum post"
            ) : (
              <>
                {scheduledCount > 0 ? (
                  <span>
                    {scheduledCount} agendado{scheduledCount !== 1 ? "s" : ""}
                  </span>
                ) : null}
                {scheduledCount > 0 && publishedCount > 0 ? (
                  <span> · </span>
                ) : null}
                {publishedCount > 0 ? (
                  <span className="text-emerald-400/50">
                    {publishedCount} publicado{publishedCount !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {todayPosts.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-24">
            <Icon name="calendar" className="w-6 h-6 text-white/10 mb-3" />
            <p className="text-sm font-medium text-white/30">
              Nenhum post para hoje
            </p>
            <p className="text-[11px] text-white/15 mt-1">
              Clique em "Agendar" para criar o primeiro
            </p>
            <button
              onClick={onScheduleNew}
              className="mt-4 flex items-center gap-1.5 px-3.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-[11px] font-medium text-white/60 hover:bg-white/[0.1] hover:text-white transition-all"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              Agendar
            </button>
          </div>
        ) : (
          todayPosts.map((post) => {
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
                className="group bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden transition-all flex flex-col hover:bg-white/[0.03] hover:border-white/[0.08]"
              >
                {/* Post Image */}
                <div
                  onClick={() => onPostClick(post)}
                  className="aspect-square bg-black/40 overflow-hidden cursor-pointer relative"
                >
                  {post.imageUrl ? (
                    <img
                      src={post.imageUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon name="image" className="w-8 h-8 text-white/15" />
                    </div>
                  )}
                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    {post.status === "published" && (
                      <span className="text-[9px] font-medium text-emerald-400/80 px-2.5 py-1 bg-emerald-500/[0.15] backdrop-blur-sm border border-emerald-500/[0.2] rounded-lg">
                        Publicado
                      </span>
                    )}
                    {post.status === "failed" && (
                      <span className="text-[9px] font-medium text-red-400/80 px-2.5 py-1 bg-red-500/[0.15] backdrop-blur-sm border border-red-500/[0.2] rounded-lg">
                        Falhou
                      </span>
                    )}
                    {post.status === "scheduled" && (
                      <span className="text-[9px] font-medium text-white/50 px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/[0.1] rounded-lg">
                        Agendado
                      </span>
                    )}
                  </div>
                </div>

                {/* Post Info */}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-white">
                      {post.scheduledTime}
                    </span>
                    {typeLabel && (
                      <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">
                        {typeLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 line-clamp-2 flex-1 mb-3">
                    {post.caption || "Sem legenda"}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {post.status === "scheduled" && onPublishToInstagram && (
                      <button
                        onClick={() => onPublishToInstagram(post)}
                        className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                        title="Publicar agora"
                      >
                        <Icon name="send" className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {post.status === "scheduled" && (
                      <button
                        onClick={() => onEditPost(post)}
                        className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                        title="Editar"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {post.status === "failed" && onRetryScheduledPost && (
                      <button
                        onClick={() => onRetryScheduledPost(post.id)}
                        className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                        title="Tentar novamente"
                      >
                        <Icon name="refresh-cw" className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteScheduledPost(post.id)}
                      className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                      title="Excluir"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
};
