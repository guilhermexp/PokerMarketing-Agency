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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <button
                className="absolute inset-0 bg-black/70"
                onClick={onClose}
                aria-label="Fechar configurações"
            />
            <div className="relative w-full max-w-md bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            <Icon name="settings" className="w-4 h-4 text-white/60" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            Configurações do Clip
                        </h4>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-white/40 hover:text-white transition-colors"
                    >
                        <Icon name="x" className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-4 py-4 space-y-4">
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Modelos
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="text-[10px] text-white/40">
                                Imagem
                                <select
                                    value={selectedImageModel}
                                    onChange={(e) =>
                                        onChangeImageModel(e.target.value as ImageModel)
                                    }
                                    className="mt-1 w-full bg-[#080808] border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white/70 focus:border-primary/50 outline-none transition-all"
                                >
                                    <option value="gemini-3-pro-image-preview">Gemini 3</option>
                                </select>
                            </label>
                            <label className="text-[10px] text-white/40">
                                Vídeo
                                <select
                                    value={selectedVideoModel}
                                    onChange={(e) =>
                                        onChangeVideoModel(e.target.value as VideoModel)
                                    }
                                    className="mt-1 w-full bg-[#080808] border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white/70 focus:border-primary/50 outline-none transition-all"
                                >
                                    <option value="fal-ai/sora-2/text-to-video">Sora 2</option>
                                    <option value="veo-3.1-fast-generate-preview">Veo 3.1</option>
                                </select>
                            </label>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Narração e Áudio
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={onToggleNarration}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[9px] font-black uppercase tracking-wider ${includeNarration
                                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                                        : "bg-[#0a0a0a] border-white/10 text-white/40 hover:text-white/60"
                                    }`}
                            >
                                <Icon
                                    name={includeNarration ? "mic" : "mic-off"}
                                    className="w-3 h-3"
                                />
                                <span>
                                    {includeNarration ? "Com Narração" : "Sem Narração"}
                                </span>
                            </button>
                            <button
                                onClick={onToggleRemoveSilence}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[9px] font-black uppercase tracking-wider ${removeSilence
                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                        : "bg-[#0a0a0a] border-white/10 text-white/40 hover:text-white/60"
                                    }`}
                            >
                                <Icon name="audio" className="w-3 h-3" />
                                <span>{removeSilence ? "Sem Silencio" : "Com Silencio"}</span>
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Experimental
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={onToggleFrameInterpolation}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[9px] font-black uppercase tracking-wider ${useFrameInterpolation
                                        ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                                        : "bg-[#0a0a0a] border-white/10 text-white/40 hover:text-white/60"
                                    }`}
                                title="Interpola entre a capa da cena atual e a próxima (Veo 3.1 only, 8s)"
                            >
                                <Icon name="layers" className="w-3 h-3" />
                                <span>
                                    {useFrameInterpolation ? "First & Last Frame" : "Modo Padrão"}
                                </span>
                            </button>
                        </div>
                        {useFrameInterpolation && (
                            <p className="text-[9px] text-purple-400/60 mt-1">
                                Cada vídeo interpola entre a capa atual e a próxima (8s, Veo
                                3.1)
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg bg-white/5 text-[10px] font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
