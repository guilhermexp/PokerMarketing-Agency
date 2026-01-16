/**
 * Background Jobs Indicator
 * Shows a floating indicator when there are background jobs running (images, videos, flyers via BullMQ)
 * Click to expand and see details
 */

import React, { useState, useEffect, useRef } from "react";
import {
  useBackgroundJobs,
  type ActiveJob,
} from "../../hooks/useBackgroundJobs";
import {
  cancelGenerationJob,
  cancelAllGenerationJobs,
} from "../../services/apiClient";
import { Icon } from "./Icon";

interface BackgroundJobsIndicatorProps {
  isAssistantOpen?: boolean;
}

export const BackgroundJobsIndicator: React.FC<BackgroundJobsIndicatorProps> = ({ isAssistantOpen = false }) => {
  const {
    pendingJobs,
    completedJobs,
    failedJobs: _failedJobs,
    onJobComplete,
    onJobFailed: _onJobFailed,
    refreshJobs,
  } = useBackgroundJobs();
  const [isExpanded, setIsExpanded] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<ActiveJob[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<"success" | "error">("success");
  const [cancellingJob, setCancellingJob] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);
  const dismissedCompletedRef = useRef<Set<string>>(new Set());
  const dismissedStorageKey = "backgroundJobsDismissed";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(dismissedStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        dismissedCompletedRef.current = new Set(parsed);
      }
    } catch (error) {
      console.warn("[BackgroundJobs] Failed to read dismissed jobs:", error);
    }
  }, []);

  const handleCancelJob = async (jobId: string) => {
    setCancellingJob(jobId);
    try {
      await cancelGenerationJob(jobId);
      await refreshJobs();
    } catch (error) {
      console.error("Failed to cancel job:", error);
    } finally {
      setCancellingJob(null);
    }
  };

  const handleCancelAll = async () => {
    if (pendingJobs.length === 0) return;
    const userId = pendingJobs[0]?.user_id;
    if (!userId) return;

    setCancellingAll(true);
    try {
      await cancelAllGenerationJobs(userId);
      await refreshJobs();
    } catch (error) {
      console.error("Failed to cancel all jobs:", error);
    } finally {
      setCancellingAll(false);
    }
  };

  // Listen for completed jobs to show notification
  useEffect(() => {
    const unsubComplete = onJobComplete((job) => {
      if (dismissedCompletedRef.current.has(job.id)) return;
      setRecentlyCompleted((prev) => [job, ...prev].slice(0, 5));
      setNotificationMessage("✓ Geração concluída!");
      setNotificationType("success");
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    });

    return unsubComplete;
  }, [onJobComplete]);

  // Don't render if nothing to show
  const hasContent = pendingJobs.length > 0 || recentlyCompleted.length > 0;

  if (!hasContent) {
    return null;
  }

  const getJobTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      flyer: "Flyer",
      flyer_daily: "Grade Diária",
      post: "Post",
      ad: "Anúncio",
      clip: "Capa de Clipe",
      video: "Vídeo",
    };
    return labels[type] || type;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "queued":
        return <Icon name="clock" className="w-3 h-3 text-amber-400" />;
      case "processing":
        return (
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        );
      case "completed":
        return <Icon name="check" className="w-3 h-3 text-green-400" />;
      case "failed":
        return <Icon name="x" className="w-3 h-3 text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <div className={`fixed bottom-4 sm:bottom-6 z-40 transition-all duration-300 ${isAssistantOpen ? "right-[400px] sm:right-[420px]" : "right-16 sm:right-20"}`}>
      {/* Notification Toast */}
      {showNotification && (
        <div className={`absolute bottom-full right-0 mb-2 px-4 py-2 backdrop-blur-md rounded-lg shadow-xl animate-fade-in-up ${notificationType === "success" ? "bg-green-500/90" : "bg-red-500/90"
          }`}>
          <p className="text-xs font-bold text-white whitespace-nowrap">
            {notificationMessage}
          </p>
        </div>
      )}

      {/* Main Indicator */}
      <div className="relative">
        {/* Expanded Panel */}
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-2 w-72 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">
                Jobs em Background
              </h4>
              <div className="flex items-center gap-2">
                {pendingJobs.length > 0 && (
                  <button
                    onClick={handleCancelAll}
                    disabled={cancellingAll}
                    className="px-2 py-1 text-[9px] font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                  >
                    {cancellingAll ? "Cancelando..." : "Cancelar Todos"}
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 text-white/40 hover:text-white"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {/* Pending Jobs */}
              {pendingJobs.length > 0 && (
                <div className="p-2">
                  <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider px-2 mb-1">
                    Em Andamento ({pendingJobs.length})
                  </p>
                  {pendingJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg bg-amber-500/10 mb-1 group overflow-hidden"
                    >
                      <div className="px-2 py-1.5 flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <span className="text-[10px] text-white/70 flex-1 truncate">
                          {getJobTypeLabel(job.job_type)}
                          {job.context && (
                            <span className="text-white/30">
                              {" "}
                              • {job.context.split("-").slice(-1)[0]}
                            </span>
                          )}
                        </span>
                        {job.status === "processing" && (
                          <span className="text-[9px] text-amber-400 font-bold">
                            {job.progress || 0}%
                          </span>
                        )}
                        {job.status === "queued" && (
                          <span className="text-[9px] text-white/40">
                            Aguardando
                          </span>
                        )}
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          disabled={cancellingJob === job.id}
                          className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-all disabled:opacity-50"
                          title="Cancelar"
                        >
                          {cancellingJob === job.id ? (
                            <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Icon name="x" className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {/* Progress bar */}
                      {job.status === "processing" && (
                        <div className="h-0.5 bg-black/20">
                          <div
                            className="h-full bg-amber-400 transition-all duration-500"
                            style={{ width: `${job.progress || 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Recently Completed */}
              {recentlyCompleted.length > 0 && (
                <div className="p-2 border-t border-white/5">
                  <div className="flex items-center justify-between px-2 mb-1">
                    <p className="text-[9px] font-bold text-green-400 uppercase tracking-wider">
                      Concluídos Recentemente
                    </p>
                    <button
                      onClick={() => {
                        const ids = new Set(dismissedCompletedRef.current);
                        recentlyCompleted.forEach((job) => ids.add(job.id));
                        completedJobs.forEach((job) => ids.add(job.id));
                        dismissedCompletedRef.current = ids;
                        if (typeof window !== "undefined") {
                          try {
                            localStorage.setItem(
                              dismissedStorageKey,
                              JSON.stringify(Array.from(ids)),
                            );
                          } catch (error) {
                            console.warn(
                              "[BackgroundJobs] Failed to persist dismissed jobs:",
                              error,
                            );
                          }
                        }
                        setRecentlyCompleted([]);
                      }}
                      className="text-[9px] font-bold text-white/40 hover:text-white/70 transition-colors"
                    >
                      Limpar
                    </button>
                  </div>
                  {recentlyCompleted.map((job) => (
                    <div
                      key={job.id}
                      className="px-2 py-1.5 rounded-lg bg-green-500/10 flex items-center gap-2 mb-1"
                    >
                      {getStatusIcon("completed")}
                      <span className="text-[10px] text-white/70 flex-1 truncate">
                        {getJobTypeLabel(job.job_type)}
                      </span>
                      {job.result_url && (
                        <a
                          href={job.result_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-primary hover:underline"
                        >
                          Ver
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {pendingJobs.length === 0 && recentlyCompleted.length === 0 && (
                <p className="px-4 py-6 text-center text-[10px] text-white/30">
                  Nenhum job ativo
                </p>
              )}
            </div>
          </div>
        )}

        {/* Floating Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            w-9 h-9 sm:w-10 sm:h-10 rounded-full shadow-xl flex items-center justify-center
            transition-all duration-300 hover:scale-105
            ${pendingJobs.length > 0
              ? "bg-amber-500 text-black"
              : "bg-green-500 text-white"
            }
          `}
        >
          {pendingJobs.length > 0 ? (
            <div className="relative">
              <Icon
                name="zap"
                className="w-5 h-5 animate-pulse"
              />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black text-amber-500 text-[9px] font-black rounded-full flex items-center justify-center">
                {pendingJobs.length}
              </span>
            </div>
          ) : (
            <Icon name="check" className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
};
