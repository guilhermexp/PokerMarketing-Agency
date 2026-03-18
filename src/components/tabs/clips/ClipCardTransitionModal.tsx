import React from "react";
import { Button } from "../../common/Button";
import { Icon } from "../../common/Icon";
import type { EditorState } from "./types";
import { calculateTotalMediaDuration, DURATION_OPTIONS, TRANSITION_OPTIONS } from "./utils";

interface ClipCardTransitionModalProps {
  editingTransitionIndex: number | null;
  editorState: EditorState | null;
  onClose: () => void;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState | null>>;
}

export function ClipCardTransitionModal({
  editingTransitionIndex,
  editorState,
  onClose,
  setEditorState,
}: ClipCardTransitionModalProps) {
  if (editingTransitionIndex === null || !editorState) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-500/20">
              <span className="text-xs">↔</span>
            </div>
            <h3 className="text-xs font-black uppercase tracking-wide text-white">
              Transição
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-3 w-3" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-4 text-xs text-muted-foreground">
            Entre cena {editorState.clips[editingTransitionIndex]?.sceneNumber} e cena{" "}
            {editorState.clips[editingTransitionIndex + 1]?.sceneNumber}
          </p>

          <div className="mb-4 grid grid-cols-5 gap-2">
            {TRANSITION_OPTIONS.map((option) => {
              const currentTransition =
                editorState.clips[editingTransitionIndex]?.transitionOut;
              const isSelected =
                currentTransition?.type === option.type ||
                (!currentTransition && option.type === "none");

              return (
                <button
                  key={option.type}
                  onClick={() => {
                    setEditorState((previous) => {
                      if (!previous) return previous;
                      const clips = [...previous.clips];
                      if (option.type === "none") {
                        clips[editingTransitionIndex] = {
                          ...clips[editingTransitionIndex],
                          transitionOut: undefined,
                        };
                      } else {
                        clips[editingTransitionIndex] = {
                          ...clips[editingTransitionIndex],
                          transitionOut: {
                            type: option.type,
                            duration:
                              clips[editingTransitionIndex].transitionOut?.duration || 0.5,
                          },
                        };
                      }

                      return {
                        ...previous,
                        clips,
                        totalDuration: calculateTotalMediaDuration(
                          clips,
                          previous.audioTracks,
                        ),
                      };
                    });
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all ${
                    isSelected
                      ? "bg-green-500 text-black"
                      : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  title={option.label}
                >
                  <Icon name={option.icon} className="h-5 w-5" />
                  <span className="w-full truncate text-center text-[8px] font-medium">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>

          {editorState.clips[editingTransitionIndex]?.transitionOut?.type &&
          editorState.clips[editingTransitionIndex]?.transitionOut?.type !== "none" ? (
            <div className="mb-4">
              <p className="mb-2 text-xs text-muted-foreground">Duração</p>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((duration) => {
                  const isSelected =
                    editorState.clips[editingTransitionIndex]?.transitionOut?.duration ===
                    duration;

                  return (
                    <button
                      key={duration}
                      onClick={() => {
                        setEditorState((previous) => {
                          if (!previous) return previous;
                          const clips = [...previous.clips];
                          if (clips[editingTransitionIndex].transitionOut) {
                            clips[editingTransitionIndex] = {
                              ...clips[editingTransitionIndex],
                              transitionOut: {
                                ...clips[editingTransitionIndex].transitionOut!,
                                duration,
                              },
                            };
                          }
                          return {
                            ...previous,
                            clips,
                            totalDuration: calculateTotalMediaDuration(
                              clips,
                              previous.audioTracks,
                            ),
                          };
                        });
                      }}
                      className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-green-500 text-black"
                          : "bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {duration}s
                    </button>
                  );
                })}
              </div>
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
