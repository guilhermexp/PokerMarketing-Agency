import React from "react";
import { Button } from "../../common/Button";
import { Icon } from "../../common/Icon";

export interface PromptPreviewState {
  sceneNumber: number;
  prompt: string;
  extraInstructions: string;
  type: "scene" | "thumbnail";
}

interface ClipCardPromptModalProps {
  preview: PromptPreviewState | null;
  onChangeExtraInstructions: (value: string) => void;
  onClose: () => void;
  onRegenerate: () => void;
}

export function ClipCardPromptModal({
  preview,
  onChangeExtraInstructions,
  onClose,
  onRegenerate,
}: ClipCardPromptModalProps) {
  if (!preview) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20">
              <Icon name="eye" className="h-3 w-3 text-primary" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-wide text-white">
              Prompt da Cena {preview.sceneNumber}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-3 w-3" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <div>
            <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              Prompt Original
            </label>
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-black/30 p-4 font-mono text-[11px] text-white/70">
              {preview.prompt}
            </pre>
          </div>

          <div>
            <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              Instruções Extras (opcional)
            </label>
            <textarea
              value={preview.extraInstructions}
              onChange={(event) => onChangeExtraInstructions(event.target.value)}
              placeholder="Adicione detalhes extras para a regeneração... Ex: 'mais vibrante', 'adicionar texto X', 'mudar cor para azul'"
              className="h-24 w-full resize-none rounded-xl border border-border bg-black/30 p-4 text-[11px] text-white/80 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <p className="mt-1 text-[9px] text-muted-foreground">
              As instruções extras serão anexadas ao prompt original na regeneração.
            </p>
          </div>
        </div>

        <div className="flex justify-between border-border border-t px-4 py-3">
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(preview.prompt);
            }}
            icon="copy"
          >
            Copiar
          </Button>
          <div className="flex gap-2">
            <Button size="small" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button
              size="small"
              onClick={onRegenerate}
              icon="refresh"
              disabled={!preview.extraInstructions.trim()}
              title={
                !preview.extraInstructions.trim()
                  ? "Adicione instruções extras para regenerar"
                  : "Regenerar com instruções extras"
              }
            >
              Regenerar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
