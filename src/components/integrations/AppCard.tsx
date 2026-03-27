/**
 * Card for a connected Composio profile.
 * Uses the app's Card + Badge + Button components.
 */

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/common/Button";
import { Loader } from "@/components/common/Loader";
import type { ComposioProfile } from "@/services/api/types/composioTypes";

interface AppCardProps {
  profile: ComposioProfile;
  onDisconnect: (id: string) => Promise<void>;
}

export function AppCard({ profile, onDisconnect }: AppCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDisconnect = async () => {
    setIsDeleting(true);
    try {
      await onDisconnect(profile.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="group bg-card/50 hover:bg-card/80 transition-colors">
      <CardContent className="flex items-center gap-3 py-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white">
          {profile.toolkit_name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {profile.toolkit_name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {profile.profile_name}
          </p>
        </div>

        {/* Status */}
        <Badge
          variant={profile.is_active ? "default" : "secondary"}
          className="shrink-0"
        >
          {profile.is_active ? "Ativo" : "Pendente"}
        </Badge>

        {/* Disconnect */}
        <Button
          variant="ghost"
          size="sm"
          icon="trash-2"
          onClick={handleDisconnect}
          disabled={isDeleting}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isDeleting ? <Loader size={12} /> : null}
        </Button>
      </CardContent>
    </Card>
  );
}
