/**
 * imageProcessor
 * Processamento local de imagens
 */

interface ProcessOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FilterOptions {
  brightness?: number; // -100 to 100
  contrast?: number; // -100 to 100
  saturation?: number; // -100 to 100
  hue?: number; // 0 to 360
  blur?: number; // 0 to 20
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;
}

export const imageProcessor = {
  /**
   * Load image from URL
   */
  loadImage: (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  },

  /**
   * Resize image
   */
  resize: async (
    imageData: ImageData | HTMLImageElement,
    width: number,
    height: number
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    canvas.width = width;
    canvas.height = height;

    if (imageData instanceof HTMLImageElement) {
      ctx.drawImage(imageData, 0, 0, width, height);
    } else {
      ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL('image/png');
  },

  /**
   * Crop image
   */
  crop: async (
    imageData: ImageData | HTMLImageElement,
    options: CropOptions
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    canvas.width = options.width;
    canvas.height = options.height;

    if (imageData instanceof HTMLImageElement) {
      ctx.drawImage(
        imageData,
        options.x,
        options.y,
        options.width,
        options.height,
        0,
        0,
        options.width,
        options.height
      );
    } else {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get temp canvas context');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(
        tempCanvas,
        options.x,
        options.y,
        options.width,
        options.height,
        0,
        0,
        options.width,
        options.height
      );
    }

    return canvas.toDataURL('image/png');
  },

  /**
   * Apply filters to image
   */
  applyFilters: async (
    imageData: ImageData | HTMLImageElement,
    filters: FilterOptions
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    let source: HTMLImageElement | HTMLCanvasElement;

    if (imageData instanceof HTMLImageElement) {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.drawImage(imageData, 0, 0);
      source = canvas;
    } else {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);
      source = canvas;
    }

    // Reset canvas for filter application
    canvas.width = source.width;
    canvas.height = source.height;
    ctx.filter = getCssFilterString(filters);
    ctx.drawImage(source, 0, 0);

    return canvas.toDataURL('image/png');
  },

  /**
   * Convert image format
   */
  convertFormat: async (
    imageData: ImageData | HTMLImageElement,
    format: ProcessOptions['format'] = 'png',
    quality: number = 0.92
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    if (imageData instanceof HTMLImageElement) {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.drawImage(imageData, 0, 0);
    } else {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL(`image/${format}`, quality);
  },

  /**
   * Get image data as blob
   */
  getBlob: async (
    imageData: ImageData | HTMLImageElement
  ): Promise<Blob> => {
    const dataUrl = await imageProcessor.convertFormat(imageData, 'png');
    const response = await fetch(dataUrl);
    return response.blob();
  },

  /**
   * Download image
   */
  download: async (
    imageData: ImageData | HTMLImageElement,
    filename: string = 'image.png'
  ): Promise<void> => {
    const blob = await imageProcessor.getBlob(imageData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// Helper function to convert filter options to CSS filter string
function getCssFilterString(filters: FilterOptions): string {
  const parts: string[] = [];

  if (filters.brightness !== undefined) {
    parts.push(`brightness(${100 + filters.brightness}%)`);
  }
  if (filters.contrast !== undefined) {
    parts.push(`contrast(${100 + filters.contrast}%)`);
  }
  if (filters.saturation !== undefined) {
    parts.push(`saturate(${100 + filters.saturation}%)`);
  }
  if (filters.hue !== undefined) {
    parts.push(`hue-rotate(${filters.hue}deg)`);
  }
  if (filters.blur !== undefined) {
    parts.push(`blur(${filters.blur}px)`);
  }
  if (filters.grayscale) parts.push('grayscale(100%)');
  if (filters.sepia) parts.push('sepia(100%)');
  if (filters.invert) parts.push('invert(100%)');

  return parts.length > 0 ? parts.join(' ') : 'none';
}
