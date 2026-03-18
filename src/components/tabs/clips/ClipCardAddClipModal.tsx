import React from "react";
import { Button } from "../../common/Button";
import { Icon } from "../../common/Icon";
import { getVideoDisplayUrl } from "../../../services/apiClient";
import type { VideoState } from "./types";
import { getModelShortName } from "./utils";

export interface AvailableVideoItem {
  sceneNumber: number;
  video: VideoState;
  duration: number;
  videoIndex: number;
  isFinalVideo?: boolean;
  label?: string;
}

interface ClipCardAddClipModalProps {
  availableVideos: AvailableVideoItem[];
  isOpen: boolean;
  onAddClip: (item: AvailableVideoItem) => void;
  onClose: () => void;
}

export function ClipCardAddClipModal({
  availableVideos,
  isOpen,
  onAddClip,
  onClose,
}: ClipCardAddClipModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20">
              <Icon name="video" className="h-3 w-3 text-primary" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-wide text-white">
              Adicionar Vídeo à Timeline
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-3 w-3" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          <p className="mb-4 text-xs text-muted-foreground">
            Clique em um vídeo para adicioná-lo à timeline
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {availableVideos.map((item, index) => (
              <button
                key={`${item.sceneNumber}-${item.videoIndex}-${index}`}
                onClick={() => onAddClip(item)}
                className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-background transition-all hover:scale-105 hover:border-primary/50"
              >
                <video
                  src={item.video.url ? getVideoDisplayUrl(item.video.url) : undefined}
                  className="h-full w-full object-cover"
                  crossOrigin="anonymous"
                  muted
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[8px] font-bold text-white ${
                      item.isFinalVideo ? "bg-primary text-black" : "bg-black/60"
                    }`}
                  >
                    {item.label || `Cena ${item.sceneNumber}`}
                  </span>
                  <span className="text-[8px] text-white/70">
                    {Math.round(item.duration)}s
                  </span>
                </div>
                {item.isFinalVideo ? (
                  <div className="absolute right-1 top-1">
                    <span className="rounded bg-green-600/90 px-1 py-0.5 text-[6px] font-bold text-white">
                      EXPORTADO
                    </span>
                  </div>
                ) : item.video.model ? (
                  <div className="absolute right-1 top-1">
                    <span className="rounded bg-blue-600/90 px-1 py-0.5 text-[6px] font-bold text-white">
                      {getModelShortName(item.video.model)}
                    </span>
                  </div>
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-primary/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                    <Icon name="plus" className="h-4 w-4 text-black" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {availableVideos.length === 0 ? (
            <div className="py-8 text-center">
              <Icon name="video" className="mx-auto mb-3 h-12 w-12 text-white/10" />
              <p className="text-sm text-muted-foreground">Nenhum vídeo disponível</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Gere vídeos nas cenas primeiro
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-border border-t px-4 py-3">
          <Button size="small" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
