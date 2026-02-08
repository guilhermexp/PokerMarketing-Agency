/**
 * useImageCrop Hook
 *
 * Provides center-crop by aspect ratio.
 */

import { useCallback, useEffect, useState } from 'react';
import { uploadImageToBlob } from '../../../services/blobService';
import type { UseImageCropReturn } from '../types';

type CropAspect = 'original' | '1:1' | '4:5' | '16:9';

interface UseImageCropProps {
  imageSrc: string;
  onImageUpdate: (newImageUrl: string) => void;
  redrawCanvas: () => void;
  setError: (message: string | null) => void;
}

const parseAspect = (aspect: CropAspect): { w: number; h: number } | null => {
  if (aspect === 'original') return null;
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return null;
  return { w, h };
};

export function useImageCrop({
  imageSrc,
  onImageUpdate,
  redrawCanvas,
  setError,
}: UseImageCropProps): UseImageCropReturn {
  const [cropAspect, setCropAspect] = useState<CropAspect>('original');
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    setCropAspect('original');
  }, [imageSrc]);

  const handleApplyCrop = useCallback(async () => {
    const aspect = parseAspect(cropAspect);
    if (!aspect) return;

    setIsCropping(true);
    setError(null);

    let source = imageSrc;
    let revokeUrl = false;

    try {
      if (!source.startsWith('data:')) {
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Falha ao carregar imagem (${response.status})`);
        }
        const blob = await response.blob();
        source = URL.createObjectURL(blob);
        revokeUrl = true;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      const imageLoaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
      });

      img.src = source;
      await imageLoaded;

      const { naturalWidth: width, naturalHeight: height } = img;
      const targetRatio = aspect.w / aspect.h;
      const imageRatio = width / height;

      let cropWidth = width;
      let cropHeight = height;
      let cropX = 0;
      let cropY = 0;

      if (imageRatio > targetRatio) {
        cropWidth = Math.round(height * targetRatio);
        cropX = Math.round((width - cropWidth) / 2);
      } else {
        cropHeight = Math.round(width / targetRatio);
        cropY = Math.round((height - cropHeight) / 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao preparar canvas.');

      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const newImageUrl = await uploadImageToBlob(base64, 'image/png');

      onImageUpdate(newImageUrl);
      setTimeout(() => redrawCanvas(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao recortar a imagem.');
    } finally {
      if (revokeUrl) URL.revokeObjectURL(source);
      setIsCropping(false);
    }
  }, [cropAspect, imageSrc, onImageUpdate, redrawCanvas, setError]);

  const handleResetCrop = useCallback(() => {
    setCropAspect('original');
  }, []);

  return {
    cropAspect,
    setCropAspect,
    isCropping,
    handleApplyCrop,
    handleResetCrop,
  };
}
