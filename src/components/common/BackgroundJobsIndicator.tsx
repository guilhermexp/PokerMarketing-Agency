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
        return <Icon name="clock" className="w-3 h-3 text-white/40" />;
      case "processing":
        return (
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
        );
      case "completed":
        return <Icon name="check" className="w-3 h-3 text-white/60" />;
      case "failed":
        return <Icon name="x" className="w-3 h-3 text-white/40" />;
      default:
        return null;
    }
  };

  return (
    <div className={`fixed bottom-4 sm:bottom-6 z-40 transition-all duration-300 ${isAssistantOpen ? "right-[400px] sm:right-[420px]" : "right-16 sm:right-20"}`}>
      {/* Notification Toast */}
      {showNotification && (
        <div className="absolute bottom-full right-0 mb-2 px-4 py-2 bg-black/90 backdrop-blur-md rounded-lg border border-white/10 shadow-xl animate-fade-in-up">
          <p className="text-xs font-bold text-white whitespace-nowrap">
            {notificationMessage}
          </p>
        </div>
      )}

      {/* Main Indicator */}
      <div className="relative">
        {/* Expanded Panel */}
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-2 w-72 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
              <h4 className="text-xs font-bold text-white">
                Jobs em Background
              </h4>
              <div className="flex items-center gap-2">
                {pendingJobs.length > 0 && (
                  <button
                    onClick={handleCancelAll}
                    disabled={cancellingAll}
                    className="px-2 py-1 text-[9px] font-medium text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-30"
                  >
                    {cancellingAll ? "Cancelando..." : "Cancelar Todos"}
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 text-white/40 hover:text-white transition-colors"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {/* Pending Jobs */}
              {pendingJobs.length > 0 && (
                <div className="p-2">
                  <p className="text-[9px] font-medium text-white/40 px-2 mb-1.5">
                    Em Andamento ({pendingJobs.length})
                  </p>
                  {pendingJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg bg-white/[0.03] border border-white/[0.08] mb-1.5 group overflow-hidden hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="px-2.5 py-2 flex items-center gap-2">
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
                          <span className="text-[9px] text-white/50 font-medium">
                            {job.progress || 0}%
                          </span>
                        )}
                        {job.status === "queued" && (
                          <span className="text-[9px] text-white/30">
                            Aguardando
                          </span>
                        )}
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          disabled={cancellingJob === job.id}
                          className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-white hover:bg-white/10 rounded transition-all disabled:opacity-30"
                          title="Cancelar"
                        >
                          {cancellingJob === job.id ? (
                            <div className="w-3 h-3 border border-white/40 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Icon name="x" className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {/* Progress bar */}
                      {job.status === "processing" && (
                        <div className="h-0.5 bg-white/5">
                          <div
                            className="h-full bg-white/30 transition-all duration-500"
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
                <div className="p-2 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between px-2 mb-1.5">
                    <p className="text-[9px] font-medium text-white/40">
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
                      className="text-[9px] font-medium text-white/30 hover:text-white/60 transition-colors"
                    >
                      Limpar
                    </button>
                  </div>
                  {recentlyCompleted.map((job) => (
                    <div
                      key={job.id}
                      className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center gap-2 mb-1.5 hover:bg-white/[0.05] transition-colors"
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
                          className="text-[9px] text-white/60 hover:text-white transition-colors"
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
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/90 backdrop-blur-sm border border-white/20 shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 hover:bg-white active:scale-95"
        >
          {pendingJobs.length > 0 ? (
            <div className="relative">
              <div className="w-2 h-2 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-black text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingJobs.length}
              </span>
            </div>
          ) : (
            <Icon name="check" className="w-5 h-5 text-black" />
          )}
        </button>
      </div>
    </div>
  );
};
