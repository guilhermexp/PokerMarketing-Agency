export interface Scene {
    sceneNumber: number;
    visual: string;
    narration: string;
    duration: number;
    image_url?: string;
}

export interface VideoState {
    url?: string;
    isLoading: boolean;
    error?: string | null;
    model?: string;
    duration?: number;
}

export interface SceneReferenceImage {
    dataUrl: string;
    httpUrl?: string;
    isUploading: boolean;
    error?: string | null;
}

export type TransitionType =
    | "none"
    | "fade"
    | "dissolve"
    | "wiperight"
    | "wipeleft"
    | "slideright"
    | "slideleft"
    | "circleopen"
    | "circleclose"
    | "zoom";

export interface ClipTransition {
    type: TransitionType;
    duration: number;
}

export interface EditableClip {
    id: string;
    sceneNumber: number;
    videoUrl: string;
    originalDuration: number;
    trimStart: number;
    trimEnd: number;
    model?: string;
    muted?: boolean;
    transitionOut?: ClipTransition;
}

export interface AudioTrack {
    id: string;
    name: string;
    url: string;
    originalDuration: number;
    trimStart: number;
    trimEnd: number;
    offsetSeconds: number;
    volume: number;
}

export type PlayMode = "all" | "video" | "audio" | null;

export interface EditorState {
    clips: EditableClip[];
    audioTracks: AudioTrack[];
    currentTime: number;
    isPlaying: boolean;
    playMode: PlayMode;
    selectedClipId: string | null;
    selectedAudioId: string | null;
    totalDuration: number;
}
