const IMAGE_MODEL_LABELS: Record<string, string> = {
  'gemini-3-pro-image-preview': 'Gemini Pro',
  'gemini-3.1-flash-image-preview': 'Nano Banana 2',
  'nano-banana-2': 'Nano Banana 2',
  'nano-banana-pro': 'Nano Banana Pro',
  'nano-banana': 'Nano Banana 2',
};

export function getImageModelDisplayLabel(model: string | null | undefined): string | null {
  if (typeof model !== 'string') return null;
  const raw = model.trim();
  if (!raw) return null;

  const withoutPrefix = raw.replace(/^replicate\//i, '').replace(/^fal-ai\//i, '');
  const isEditVariant = /\/edit$/i.test(withoutPrefix);
  const normalizedBase = withoutPrefix.replace(/\/edit$/i, '').toLowerCase();
  const fallbackBase = withoutPrefix.replace(/\/edit$/i, '').split('/').pop() || raw;

  const label = IMAGE_MODEL_LABELS[normalizedBase] || fallbackBase;
  return isEditVariant ? `${label} Edit` : label;
}

