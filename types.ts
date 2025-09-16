import type { IconName as CommonIconName } from './components/common/Icon';

export type ToneOfVoice = 'Profissional' | 'Espirituoso' | 'Casual' | 'Inspirador' | 'Técnico';
export type IconName = CommonIconName;
export type Theme = 'light' | 'dark';

export interface BrandProfile {
  name: string;
  description: string;
  logo: string | null; // Base64 string
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: ToneOfVoice;
}

export interface ContentInput {
  transcript: string;
  image: {
    base64: string;
    mimeType: string;
  } | null;
}

export interface VideoClipScript {
  title: string;
  duration: number; // in seconds
  script: string; // Detailed script with scenes and voiceover
  thumbnail: {
    title: string;
    image_prompt: string;
  } | null;
}

export interface Post {
  platform: string;
  content: string;
  hashtags: string[];
  image_prompt: string | null; // Prompt for generating an accompanying image
}

export interface AdCreative {
  platform: string;
  headline: string;
  body: string;
  cta: string;
  image_prompt: string; // Prompt for generating the ad visual
}

export interface MarketingCampaign {
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
}

export type GenerationMode = 'full' | 'clips' | 'posts' | 'ads';


// --- Assistant Types ---

export type ChatRole = "user" | "model" | "tool";

export interface ChatMessage {
    role: ChatRole;
    parts: ChatPart[];
}

export interface ChatPart {
    text?: string;
    functionCall?: any;
    functionResponse?: any;
}


// --- Flyer Generator Types ---

export interface TournamentEvent {
  id: string;
  day: string;
  name: string;
  game: string;
  gtd: string;
  buyIn: string;
  rebuy: string;
  addOn: string;
  stack: string;
  players: string;
  lateReg: string;
  minutes: string;
  structure: string;
  times: Record<string, string>;
  [key: string]: any; // Allow other properties
}

export interface ImageFile {
    base64: string;
    mimeType: string;
    preview: string;
}