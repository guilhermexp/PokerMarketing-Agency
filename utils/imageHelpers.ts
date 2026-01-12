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

export const urlToDataUrl = async (src: string): Promise<string | null> => {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await readBlobAsDataUrl(blob);
  } catch (error) {
    console.error("[urlToDataUrl] Failed to convert URL:", src, error);
    return null;
  }
};

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

/**
 * Download an image from a URL (works with cross-origin URLs)
 * Fetches the image as a blob and creates a local blob URL for download
 */
export const downloadImage = async (
  src: string,
  filename: string = "image.png",
): Promise<void> => {
  try {
    // For data URLs, we can download directly
    if (src.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = src;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // For external URLs, fetch as blob first to bypass cross-origin restrictions
    const response = await fetch(src);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the blob URL
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("[downloadImage] Failed to download:", src, error);
    // Fallback: open in new tab if fetch fails
    window.open(src, "_blank");
  }
};
