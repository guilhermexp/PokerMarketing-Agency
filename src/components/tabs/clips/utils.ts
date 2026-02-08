import type { IconName } from "../../common/Icon";
import type { TransitionType, EditableClip, AudioTrack } from "./types";
import { getVideoDisplayUrl } from "../../../services/apiClient";
import type { GalleryImage } from "../../../types";

// --- Constants ---

export const TIMELINE_PX_PER_SEC = 40;
export const MIN_CLIP_WIDTH = 20;
export const MIN_CLIP_DURATION = 0.5;

export const TRANSITION_OPTIONS: {
    type: TransitionType;
    label: string;
    icon: IconName;
}[] = [
        { type: "none", label: "Corte", icon: "scissors" },
        { type: "fade", label: "Fade", icon: "moon" },
        { type: "dissolve", label: "Dissolve", icon: "star" },
        { type: "wiperight", label: "Wipe", icon: "chevron-right" },
        { type: "wipeleft", label: "Wipe", icon: "chevron-left" },
        { type: "slideright", label: "Slide", icon: "arrowRight" },
        { type: "slideleft", label: "Slide", icon: "arrow-left" },
        { type: "circleopen", label: "Circle", icon: "sun" },
        { type: "circleclose", label: "Circle", icon: "eye" },
        { type: "zoom", label: "Zoom", icon: "search" },
    ];

export const DURATION_OPTIONS = [0.3, 0.5, 1, 1.5, 2] as const;

// --- Audio Helper Functions ---

export const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

export const getWavHeader = (
    dataLength: number,
    sampleRate: number,
    numChannels: number,
    bitsPerSample: number,
): Uint8Array => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const RIFF = new Uint8Array([82, 73, 70, 70]);
    const WAVE = new Uint8Array([87, 65, 86, 69]);
    const fmt = new Uint8Array([102, 109, 116, 32]);
    const data = new Uint8Array([100, 97, 116, 97]);
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;

    view.setUint8(0, RIFF[0]);
    view.setUint8(1, RIFF[1]);
    view.setUint8(2, RIFF[2]);
    view.setUint8(3, RIFF[3]);
    view.setUint32(4, 36 + dataLength, true);
    view.setUint8(8, WAVE[0]);
    view.setUint8(9, WAVE[1]);
    view.setUint8(10, WAVE[2]);
    view.setUint8(11, WAVE[3]);
    view.setUint8(12, fmt[0]);
    view.setUint8(13, fmt[1]);
    view.setUint8(14, fmt[2]);
    view.setUint8(15, fmt[3]);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    view.setUint8(36, data[0]);
    view.setUint8(37, data[1]);
    view.setUint8(38, data[2]);
    view.setUint8(39, data[3]);
    view.setUint32(40, dataLength, true);

    return new Uint8Array(header);
};

export const pcmToWavBlob = (pcmData: Uint8Array): Blob => {
    const header = getWavHeader(pcmData.length, 24000, 1, 16);
    return new Blob([header as BlobPart, pcmData as BlobPart], {
        type: "audio/wav",
    });
};

export const pcmToWavDataUrl = (pcmData: Uint8Array): string => {
    const wavBlob = pcmToWavBlob(pcmData);
    return URL.createObjectURL(wavBlob);
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// --- Video Helper Functions ---

export const getModelShortName = (model: string): string => {
    if (model.includes("sora")) return "Sora";
    if (model.includes("veo")) return "Veo";
    if (model.includes("gemini")) return "Gemini";
    return model.split("/").pop()?.slice(0, 10) || model.slice(0, 10);
};

export const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            resolve(video.duration);
            video.remove();
        };
        video.onerror = () => {
            resolve(8);
            video.remove();
        };
        video.src = getVideoDisplayUrl(url);
    });
};

export const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
};

export const getClipDuration = (clip: EditableClip): number => {
    return Math.max(0, clip.trimEnd - clip.trimStart);
};

export const getTransitionDuration = (clip: EditableClip): number => {
    if (!clip.transitionOut || clip.transitionOut.type === "none") return 0;
    return clip.transitionOut.duration;
};

export const calculateTotalMediaDuration = (
    clips: EditableClip[],
    audioTracks: AudioTrack[],
): number => {
    let videoDuration = clips.reduce((acc, c) => acc + getClipDuration(c), 0);

    for (let i = 0; i < clips.length - 1; i++) {
        videoDuration -= getTransitionDuration(clips[i]);
    }

    const audioDuration = audioTracks.reduce((maxEnd, track) => {
        const trackDuration = Math.max(0, track.trimEnd - track.trimStart);
        const trackEnd = track.offsetSeconds + trackDuration;
        return Math.max(maxEnd, trackEnd);
    }, 0);

    return Math.max(videoDuration, audioDuration);
};

export const getClipWidth = (duration: number): number => {
    return Math.max(MIN_CLIP_WIDTH, duration * TIMELINE_PX_PER_SEC);
};

export const getTimelineOffset = (
    clips: EditableClip[],
    clipIndex: number,
): number => {
    let offset = 0;
    for (let i = 0; i < clipIndex; i++) {
        const c = clips[i];
        offset += getClipDuration(c);
        if (i < clipIndex - 1) {
            offset -= getTransitionDuration(c);
        }
    }
    return offset;
};

export const getTransitionStyles = (
    type: TransitionType,
    progress: number,
): {
    outgoing: React.CSSProperties;
    incoming: React.CSSProperties;
} => {
    const base = {
        outgoing: {} as React.CSSProperties,
        incoming: {} as React.CSSProperties,
    };

    switch (type) {
        case "fade":
        case "dissolve":
            return {
                outgoing: { opacity: 1 - progress },
                incoming: { opacity: progress },
            };
        case "wiperight":
            return {
                outgoing: {},
                incoming: { clipPath: `inset(0 ${100 - progress * 100}% 0 0)` },
            };
        case "wipeleft":
            return {
                outgoing: {},
                incoming: { clipPath: `inset(0 0 0 ${100 - progress * 100}%)` },
            };
        case "slideright":
            return {
                outgoing: {},
                incoming: { transform: `translateX(${(1 - progress) * 100}%)` },
            };
        case "slideleft":
            return {
                outgoing: {},
                incoming: { transform: `translateX(${(1 - progress) * -100}%)` },
            };
        case "circleopen":
            return {
                outgoing: {},
                incoming: { clipPath: `circle(${progress * 75}% at center)` },
            };
        case "circleclose":
            return {
                outgoing: {},
                incoming: { clipPath: `circle(${(1 - progress) * 75}% at center)` },
            };
        case "zoom":
            return {
                outgoing: {},
                incoming: {
                    transform: `scale(${1 + (1 - progress) * 0.5})`,
                    transformOrigin: "center",
                },
            };
        default:
            return base;
    }
};

export const findGalleryImage = (
    galleryImages: GalleryImage[] | undefined,
    clipId: string | undefined,
    source: string,
    additionalFilter?: (img: GalleryImage) => boolean,
): GalleryImage | undefined => {
    if (!galleryImages || galleryImages.length === 0) return undefined;

    if (clipId) {
        const exactMatch = galleryImages.find(
            (img) =>
                img.source === source &&
                img.video_script_id === clipId &&
                (!additionalFilter || additionalFilter(img)),
        );
        if (exactMatch) return exactMatch;
    }

    return galleryImages.find(
        (img) =>
            img.source === source &&
            !img.video_script_id &&
            (!additionalFilter || additionalFilter(img)),
    );
};

export const filterGalleryImages = (
    galleryImages: GalleryImage[] | undefined,
    clipId: string | undefined,
    sourceFilter: (source: string) => boolean,
    additionalFilter?: (img: GalleryImage) => boolean,
): GalleryImage[] => {
    if (!galleryImages || galleryImages.length === 0) return [];

    if (clipId) {
        const exactMatches = galleryImages.filter(
            (img) =>
                sourceFilter(img.source) &&
                img.video_script_id === clipId &&
                (!additionalFilter || additionalFilter(img)),
        );
        if (exactMatches.length > 0) return exactMatches;
    }

    return galleryImages.filter(
        (img) =>
            sourceFilter(img.source) &&
            !img.video_script_id &&
            (!additionalFilter || additionalFilter(img)),
    );
};
