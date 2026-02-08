/**
 * useImageFilters Hook
 *
 * Provides simple filter presets for preview and applying to image.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { uploadImageToBlob } from '../../../services/blobService';
import type { UseImageFiltersReturn } from '../types';

type FilterPreset = 'none' | 'bw' | 'warm' | 'cool' | 'vivid';

interface UseImageFiltersProps {
  imageSrc: string;
  onImageUpdate: (newImageUrl: string) => void;
  redrawCanvas: () => void;
  setError: (message: string | null) => void;
}

const filterPresetStyles: Record<FilterPreset, string> = {
  none: 'none',
  bw: 'grayscale(1)',
  warm: 'sepia(0.35) saturate(1.1) contrast(1.05)',
  cool: 'saturate(1.1) hue-rotate(170deg)',
  vivid: 'saturate(1.35) contrast(1.1)',
};

export function useImageFilters({
  imageSrc,
  onImageUpdate,
  redrawCanvas,
  setError,
}: UseImageFiltersProps): UseImageFiltersReturn {
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('none');
  const [isApplyingFilter, setIsApplyingFilter] = useState(false);

  useEffect(() => {
    setFilterPreset('none');
  }, [imageSrc]);

  const filterStyle = useMemo(() => filterPresetStyles[filterPreset], [filterPreset]);

  const handleApplyFilter = useCallback(async () => {
    if (filterPreset === 'none') return;

    setIsApplyingFilter(true);
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

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao preparar canvas.');

      ctx.filter = filterStyle;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const newImageUrl = await uploadImageToBlob(base64, 'image/png');

      onImageUpdate(newImageUrl);
      setTimeout(() => redrawCanvas(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar filtro.');
    } finally {
      if (revokeUrl) URL.revokeObjectURL(source);
      setIsApplyingFilter(false);
    }
  }, [filterPreset, filterStyle, imageSrc, onImageUpdate, redrawCanvas, setError]);

  const handleResetFilter = useCallback(() => {
    setFilterPreset('none');
  }, []);

  return {
    filterPreset,
    setFilterPreset,
    isApplyingFilter,
    filterStyle,
    handleApplyFilter,
    handleResetFilter,
  };
}
