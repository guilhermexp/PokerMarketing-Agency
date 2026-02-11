import React from 'react';
import { Icon } from '../../common/Icon';
import type { ImageModel, VideoModel } from '../../../types';

interface ClipSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedImageModel: ImageModel;
    onChangeImageModel: (model: ImageModel) => void;
    selectedVideoModel: VideoModel;
    onChangeVideoModel: (model: VideoModel) => void;
    includeNarration: boolean;
    onToggleNarration: () => void;
    removeSilence: boolean;
    onToggleRemoveSilence: () => void;
    useFrameInterpolation: boolean;
    onToggleFrameInterpolation: () => void;
}

export const ClipSettingsModal: React.FC<ClipSettingsModalProps> = ({
    isOpen,
    onClose,
    selectedImageModel,
    onChangeImageModel,
    selectedVideoModel,
    onChangeVideoModel,
    includeNarration,
    onToggleNarration,
    removeSilence,
    onToggleRemoveSilence,
    useFrameInterpolation,
    onToggleFrameInterpolation,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={onClose}
                aria-label="Fechar configurações"
            />

            {/* Modal */}
            <div className="relative w-full max-w-md">
                <div className="rounded-2xl p-6 shadow-2xl border border-border bg-[#0a0a0a]/95 backdrop-blur-xl relative overflow-hidden">
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <Icon name="x" className="w-5 h-5 text-muted-foreground hover:text-white" />
                    </button>

                    {/* Header */}
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-white">
                            Configurações do Clip
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ajuste modelos e opções de geração
                        </p>
                    </div>

                    {/* Content */}
                    <div className="space-y-6">
                        {/* Modelos */}
                        <div className="space-y-3">
                            <label className="block text-xs font-medium text-muted-foreground">
                                Modelo de Imagem
                            </label>
                            <select
                                value={selectedImageModel}
                                onChange={(e) =>
                                    onChangeImageModel(e.target.value as ImageModel)
                                }
                                className="w-full bg-[#0a0a0a]/60 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 transition-all backdrop-blur-xl"
                            >
                                <option value="gemini-3-pro-image-preview">Gemini 3</option>
                            </select>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-xs font-medium text-muted-foreground">
                                Modelo de Vídeo
                            </label>
                            <select
                                value={selectedVideoModel}
                                onChange={(e) =>
                                    onChangeVideoModel(e.target.value as VideoModel)
                                }
                                className="w-full bg-[#0a0a0a]/60 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 transition-all backdrop-blur-xl"
                            >
                                <option value="fal-ai/sora-2/text-to-video">Sora 2</option>
                                <option value="veo-3.1-fast-generate-preview">Veo 3.1</option>
                            </select>
                        </div>

                        {/* Narração e Áudio */}
                        <div className="space-y-3 pt-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Narração e Áudio
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={onToggleNarration}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-medium backdrop-blur-xl ${
                                        includeNarration
                                            ? "bg-green-500/10 border-green-500/30 text-green-400"
                                            : "bg-[#0a0a0a]/60 border-border text-muted-foreground hover:bg-white/5 hover:text-white"
                                    }`}
                                >
                                    <Icon
                                        name={includeNarration ? "mic" : "mic-off"}
                                        className="w-3.5 h-3.5"
                                    />
                                    <span>
                                        {includeNarration ? "Com Narração" : "Sem Narração"}
                                    </span>
                                </button>
                                <button
                                    onClick={onToggleRemoveSilence}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-medium backdrop-blur-xl ${
                                        removeSilence
                                            ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                            : "bg-[#0a0a0a]/60 border-border text-muted-foreground hover:bg-white/5 hover:text-white"
                                    }`}
                                >
                                    <Icon name="audio" className="w-3.5 h-3.5" />
                                    <span>{removeSilence ? "Sem Silêncio" : "Com Silêncio"}</span>
                                </button>
                            </div>
                        </div>

                        {/* Experimental */}
                        <div className="space-y-3 pt-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Experimental
                            </p>
                            <button
                                onClick={onToggleFrameInterpolation}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-medium backdrop-blur-xl ${
                                    useFrameInterpolation
                                        ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                                        : "bg-[#0a0a0a]/60 border-border text-muted-foreground hover:bg-white/5 hover:text-white"
                                }`}
                                title="Interpola entre a capa da cena atual e a próxima (Veo 3.1 only, 8s)"
                            >
                                <Icon name="layers" className="w-3.5 h-3.5" />
                                <span>
                                    {useFrameInterpolation ? "First & Last Frame" : "Modo Padrão"}
                                </span>
                            </button>
                            {useFrameInterpolation && (
                                <p className="text-xs text-purple-400/60 leading-relaxed">
                                    Cada vídeo interpola entre a capa atual e a próxima (8s, Veo 3.1)
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
