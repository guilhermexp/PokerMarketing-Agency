/**
 * CropAndFilterSection
 * Componente unificado de recorte e filtros
 */

import React from 'react';
import { Icon } from '../common/Icon';
import type { ImageCropperProps, ImageFiltersProps } from './uiTypes';

type CropAspect = ImageCropperProps['cropAspect'];
type FilterPreset = ImageFiltersProps['filterPreset'];

const cropOptions: { label: string; value: CropAspect }[] = [
  { label: 'Orig', value: 'original' },
  { label: '1:1', value: '1:1' },
  { label: '4:5', value: '4:5' },
  { label: '16:9', value: '16:9' },
];

const filterOptions: { label: string; value: FilterPreset }[] = [
  { label: 'None', value: 'none' },
  { label: 'PB', value: 'bw' },
  { label: 'Warm', value: 'warm' },
  { label: 'Cool', value: 'cool' },
  { label: 'Vivid', value: 'vivid' },
];

interface CropAndFilterSectionProps {
  // Crop props
  cropAspect: CropAspect;
  setCropAspect: (aspect: CropAspect) => void;
  isCropping: boolean;
  handleApplyCrop: () => Promise<void>;
  handleResetCrop: () => void;
  // Filter props
  filterPreset: FilterPreset;
  setFilterPreset: (preset: FilterPreset) => void;
  isApplyingFilter: boolean;
  handleApplyFilter: () => Promise<void>;
  handleResetFilter: () => void;
}

export const CropAndFilterSection: React.FC<CropAndFilterSectionProps> = ({
  cropAspect,
  setCropAspect,
  isCropping,
  handleApplyCrop,
  handleResetCrop,
  filterPreset,
  setFilterPreset,
  isApplyingFilter,
  handleApplyFilter,
  handleResetFilter,
}) => {
  const isCroppingActive = cropAspect !== 'original';
  const isFilterActive = filterPreset !== 'none';

  return (
    <section className="space-y-3">
      {/* Crop options */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="crop" className="w-3 h-3 text-white/30" />
          <span className="text-[8px] font-medium text-white/40 uppercase tracking-wider">
            Recorte
          </span>
        </div>
        <button
          onClick={handleResetCrop}
          className="text-[8px] text-white/25 hover:text-white/40 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {cropOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setCropAspect(option.value)}
            className={`px-2 py-0.5 text-[8px] font-medium rounded border transition-all ${
              cropAspect === option.value
                ? 'bg-white/10 text-white border-white/10'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60 border-white/[0.04]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Filter options */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Icon name="sliders" className="w-3 h-3 text-white/30" />
          <span className="text-[8px] font-medium text-white/40 uppercase tracking-wider">
            Filtro
          </span>
        </div>
        <button
          onClick={handleResetFilter}
          className="text-[8px] text-white/25 hover:text-white/40 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilterPreset(option.value)}
            className={`px-2 py-0.5 text-[8px] font-medium rounded border transition-all ${
              filterPreset === option.value
                ? 'bg-white/10 text-white border-white/10'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60 border-white/[0.04]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 pt-1">
        <button
          onClick={handleApplyCrop}
          disabled={isCropping || !isCroppingActive}
          className="flex-1 h-6 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded text-[8px] font-medium text-white/50 hover:text-white/70 transition-all disabled:opacity-40 flex items-center justify-center gap-1"
        >
          {isCropping ? (
            '...'
          ) : (
            <>
              <Icon name="check" className="w-3 h-3" />
              Recorte
            </>
          )}
        </button>
        <button
          onClick={handleApplyFilter}
          disabled={isApplyingFilter || !isFilterActive}
          className="flex-1 h-6 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded text-[8px] font-medium text-white/50 hover:text-white/70 transition-all disabled:opacity-40 flex items-center justify-center gap-1"
        >
          {isApplyingFilter ? (
            '...'
          ) : (
            <>
              <Icon name="check" className="w-3 h-3" />
              Filtro
            </>
          )}
        </button>
      </div>
    </section>
  );
};
