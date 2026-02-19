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
import { OverlayPortal } from "./OverlayPortal";

interface BackgroundJobsIndicatorProps {
  isAssistantOpen?: boolean;
}

export const BackgroundJobsIndicator: React.FC<BackgroundJobsIndicatorProps> = ({ isAssistantOpen = false }) => {
  const {
    pendingJobs,
    completedJobs,
    failedJobs,
    onJobComplete,
    onJobFailed,
    refreshJobs,
  } = useBackgroundJobs();
  const [isExpanded, setIsExpanded] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<ActiveJob[]>([]);
  const [recentlyFailed, setRecentlyFailed] = useState<ActiveJob[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<"success" | "error">("success");
  const [cancellingJob, setCancellingJob] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);
  const dismissedCompletedRef = useRef<Set<string>>(new Set());
  const dismissedFailedRef = useRef<Set<string>>(new Set());
  const dismissedStorageKey = "backgroundJobsDismissed";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(dismissedStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.completed && Array.isArray(parsed.completed)) {
        dismissedCompletedRef.current = new Set(parsed.completed);
      }
      if (parsed.failed && Array.isArray(parsed.failed)) {
        dismissedFailedRef.current = new Set(parsed.failed);
      }
      // Legacy format (array only)
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

  // Listen for failed jobs to show error notification
  useEffect(() => {
    const unsubFailed = onJobFailed((job) => {
      if (dismissedFailedRef.current.has(job.id)) return;
      setRecentlyFailed((prev) => [job, ...prev].slice(0, 5));
      // Extract a user-friendly error message
      let errorMsg = "Erro na geração";
      if (job.error_message) {
        if (job.error_message.includes("quota") || job.error_message.includes("429")) {
          errorMsg = "Limite de API excedido. Tente mais tarde.";
        } else if (job.error_message.includes("not configured")) {
          errorMsg = "Serviço de geração indisponível.";
        } else if (job.error_message.length < 50) {
          errorMsg = job.error_message;
        }
      }
      setNotificationMessage(`✗ ${errorMsg}`);
      setNotificationType("error");
      setShowNotification(true);
      setIsExpanded(true); // Auto-expand to show error details
      setTimeout(() => setShowNotification(false), 5000);
    });

    return unsubFailed;
  }, [onJobFailed]);

  // Don't render if nothing to show
  const hasContent = pendingJobs.length > 0 || recentlyCompleted.length > 0 || recentlyFailed.length > 0;
  const hasErrors = recentlyFailed.length > 0;

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
        return <Icon name="clock" className="w-3 h-3 text-muted-foreground" />;
      case "processing":
        return (
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
        );
      case "completed":
        return <Icon name="check" className="w-3 h-3 text-muted-foreground" />;
      case "failed":
        return <Icon name="x" className="w-3 h-3 text-muted-foreground" />;
      default:
        return null;
    }
  };

  return (
    <OverlayPortal>
      <div className={`fixed bottom-4 sm:bottom-6 z-[2147483640] transition-all duration-300 ${isAssistantOpen ? "right-[400px] sm:right-[420px]" : "right-16 sm:right-20"}`}>
        {/* Notification Toast */}
        {showNotification && (
          <div className={`absolute bottom-full right-0 mb-2 px-4 py-2 backdrop-blur-md rounded-lg border shadow-xl animate-fade-in-up ${
            notificationType === "error"
              ? "bg-red-900/90 border-red-500/30"
              : "bg-black/90 border-white/10"
          }`}>
            <p className={`text-xs font-bold whitespace-nowrap ${
              notificationType === "error" ? "text-red-200" : "text-white"
            }`}>
              {notificationMessage}
            </p>
          </div>
        )}

      {/* Main Indicator */}
      <div className="relative">
        {/* Expanded Panel */}
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-2 w-72 bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h4 className="text-xs font-bold text-white">
                Jobs em Background
              </h4>
              <div className="flex items-center gap-2">
                {pendingJobs.length > 0 && (
                  <button
                    onClick={handleCancelAll}
                    disabled={cancellingAll}
                    className="px-2 py-1 text-[9px] font-medium text-muted-foreground hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-30"
                  >
                    {cancellingAll ? "Cancelando..." : "Cancelar Todos"}
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 text-muted-foreground hover:text-white transition-colors"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {/* Pending Jobs */}
              {pendingJobs.length > 0 && (
                <div className="p-2">
                  <p className="text-[9px] font-medium text-muted-foreground px-2 mb-1.5">
                    Em Andamento ({pendingJobs.length})
                  </p>
                  {pendingJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg bg-white/[0.03] border border-border mb-1.5 group overflow-hidden hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="px-2.5 py-2 flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <span className="text-[10px] text-white/70 flex-1 truncate">
                          {getJobTypeLabel(job.job_type)}
                          {job.context && (
                            <span className="text-muted-foreground">
                              {" "}
                              • {job.context.split("-").slice(-1)[0]}
                            </span>
                          )}
                        </span>
                        {job.status === "processing" && (
                          <span className="text-[9px] text-muted-foreground font-medium">
                            {job.progress || 0}%
                          </span>
                        )}
                        {job.status === "queued" && (
                          <span className="text-[9px] text-muted-foreground">
                            Aguardando
                          </span>
                        )}
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          disabled={cancellingJob === job.id}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-white hover:bg-white/10 rounded transition-all disabled:opacity-30"
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

              {/* Recently Failed */}
              {recentlyFailed.length > 0 && (
                <div className="p-2 border-t border-red-500/20 bg-red-950/20">
                  <div className="flex items-center justify-between px-2 mb-1.5">
                    <p className="text-[9px] font-medium text-red-400">
                      Falhas ({recentlyFailed.length})
                    </p>
                    <button
                      onClick={() => {
                        const ids = new Set(dismissedFailedRef.current);
                        recentlyFailed.forEach((job) => ids.add(job.id));
                        failedJobs.forEach((job) => ids.add(job.id));
                        dismissedFailedRef.current = ids;
                        if (typeof window !== "undefined") {
                          try {
                            localStorage.setItem(
                              dismissedStorageKey,
                              JSON.stringify({
                                completed: Array.from(dismissedCompletedRef.current),
                                failed: Array.from(ids),
                              }),
                            );
                          } catch (error) {
                            console.warn(
                              "[BackgroundJobs] Failed to persist dismissed jobs:",
                              error,
                            );
                          }
                        }
                        setRecentlyFailed([]);
                      }}
                      className="text-[9px] font-medium text-red-400/60 hover:text-red-300 transition-colors"
                    >
                      Limpar
                    </button>
                  </div>
                  {recentlyFailed.map((job) => (
                    <div
                      key={job.id}
                      className="px-2.5 py-2 rounded-lg bg-red-950/30 border border-red-500/20 mb-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <Icon name="alert-circle" className="w-3 h-3 text-red-400 flex-shrink-0" />
                        <span className="text-[10px] text-red-300 flex-1 truncate">
                          {getJobTypeLabel(job.job_type)}
                        </span>
                      </div>
                      {job.error_message && (
                        <p className="mt-1 text-[9px] text-red-400/80 line-clamp-2">
                          {job.error_message.includes("quota") || job.error_message.includes("429")
                            ? "Limite de API excedido. Tente novamente mais tarde."
                            : job.error_message.includes("not configured")
                            ? "Serviço de geração indisponível. Verifique as configurações."
                            : job.error_message.length > 80
                            ? job.error_message.substring(0, 80) + "..."
                            : job.error_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Recently Completed */}
              {recentlyCompleted.length > 0 && (
                <div className="p-2 border-t border-border">
                  <div className="flex items-center justify-between px-2 mb-1.5">
                    <p className="text-[9px] font-medium text-muted-foreground">
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
                              JSON.stringify({
                                completed: Array.from(ids),
                                failed: Array.from(dismissedFailedRef.current),
                              }),
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
                      className="text-[9px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Limpar
                    </button>
                  </div>
                  {recentlyCompleted.map((job) => (
                    <div
                      key={job.id}
                      className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-border flex items-center gap-2 mb-1.5 hover:bg-white/[0.05] transition-colors"
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
                          className="text-[9px] text-muted-foreground hover:text-white transition-colors"
                        >
                          Ver
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {pendingJobs.length === 0 && recentlyCompleted.length === 0 && recentlyFailed.length === 0 && (
                <p className="px-4 py-6 text-center text-[10px] text-muted-foreground">
                  Nenhum job ativo
                </p>
              )}
            </div>
          </div>
        )}

        {/* Floating Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-sm border shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
            hasErrors
              ? "bg-red-500/90 border-red-400/50 hover:bg-red-500"
              : "bg-white/90 border-white/20 hover:bg-white"
          }`}
        >
          {pendingJobs.length > 0 ? (
            <div className="relative">
              <div className={`w-2 h-2 border-2 border-t-transparent rounded-full animate-spin ${
                hasErrors ? "border-white" : "border-black"
              }`} />
              <span className={`absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 text-[9px] font-bold rounded-full flex items-center justify-center ${
                hasErrors ? "bg-white text-red-600" : "bg-black text-white"
              }`}>
                {pendingJobs.length}
              </span>
            </div>
          ) : hasErrors ? (
            <Icon name="alert-circle" className="w-5 h-5 text-white" />
          ) : (
            <Icon name="check" className="w-5 h-5 text-black" />
          )}
        </button>
      </div>
      </div>
    </OverlayPortal>
  );
};
