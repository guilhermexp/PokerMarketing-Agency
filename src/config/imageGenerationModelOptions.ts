import type { ImageModel } from '../types';

export interface ImageGenerationModelOption {
  provider: string;
  model: ImageModel;
  label: string;
  desc: string;
  color: string;
}

export const IMAGE_GENERATION_MODEL_OPTIONS: ImageGenerationModelOption[] = [
  {
    provider: 'replicate',
    model: 'nano-banana-2',
    label: 'Nano Banana 2',
    color: '#34A853',
    desc: 'Flash Image 3.1 (rapido)',
  },
  {
    provider: 'replicate',
    model: 'nano-banana-pro',
    label: 'Pro',
    color: '#4285F4',
    desc: 'Melhor qualidade',
  },
];

export const DEFAULT_IMAGE_STUDIO_MODEL = IMAGE_GENERATION_MODEL_OPTIONS[0].model;
export const DEFAULT_IMAGE_STUDIO_PROVIDER = IMAGE_GENERATION_MODEL_OPTIONS[0].provider;
export const DEFAULT_CAMPAIGN_IMAGE_MODEL = IMAGE_GENERATION_MODEL_OPTIONS[0].model;

export function getImageGenerationModelOption(model: string | null | undefined) {
  if (!model) return undefined;
  return IMAGE_GENERATION_MODEL_OPTIONS.find((option) => option.model === model);
}
