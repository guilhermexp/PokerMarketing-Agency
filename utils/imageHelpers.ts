const parseDataUrl = (
  dataUrl: string,
): { base64: string; mimeType: string } | null => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { base64: match[2], mimeType: match[1] };
  }
  return null;
};

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const urlToBase64 = async (
  src: string,
): Promise<{ base64: string; mimeType: string } | null> => {
  if (!src) return null;

  if (src.startsWith("data:")) {
    return parseDataUrl(src);
  }

  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const dataUrl = await readBlobAsDataUrl(blob);
    const parsed = parseDataUrl(dataUrl);
    if (parsed) return parsed;
    return { base64: dataUrl.split(",")[1] || "", mimeType: blob.type || "" };
  } catch (error) {
    console.error("[urlToBase64] Failed to convert URL:", src, error);
    return null;
  }
};
