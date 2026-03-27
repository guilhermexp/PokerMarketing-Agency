/**
 * Card for a connected Composio profile.
 */

import React, { useState } from "react";
import { Trash2, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import type { ComposioProfile } from "@/services/api/types/composioTypes";

interface AppCardProps {
  profile: ComposioProfile;
  onDisconnect: (id: string) => Promise<void>;
}

const STATUS_CONFIG = {
  active: { icon: CheckCircle2, label: "Conectado", color: "text-emerald-400" },
  initiated: { icon: Clock, label: "Pendente", color: "text-amber-400" },
  failed: { icon: AlertCircle, label: "Falhou", color: "text-red-400" },
  unknown: { icon: Clock, label: "Verificando...", color: "text-zinc-400" },
} as const;

export function AppCard({ profile, onDisconnect }: AppCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const statusKey = profile.is_active ? "active" : "unknown";
  const config = STATUS_CONFIG[statusKey];
  const StatusIcon = config.icon;

  const handleDisconnect = async () => {
    setIsDeleting(true);
    try {
      await onDisconnect(profile.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.07]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg font-semibold text-white">
            {profile.toolkit_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">
              {profile.toolkit_name}
            </h3>
            <p className="text-xs text-zinc-400">{profile.profile_name}</p>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={isDeleting}
          className="rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
          title="Desconectar"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <StatusIcon className={`h-3.5 w-3.5 ${config.color}`} />
        <span className={`text-xs ${config.color}`}>{config.label}</span>
      </div>
    </div>
  );
}
