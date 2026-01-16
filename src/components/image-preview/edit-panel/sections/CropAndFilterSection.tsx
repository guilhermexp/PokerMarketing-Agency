/**
 * FilterSection
 * Componente de filtros de imagem
 */

import React from 'react';
import { Icon } from '../../../common/Icon';
import type { ImageFiltersProps } from '../../uiTypes';

type FilterPreset = ImageFiltersProps['filterPreset'];

const filterOptions: { label: string; value: FilterPreset }[] = [
  { label: 'None', value: 'none' },
  { label: 'PB', value: 'bw' },
  { label: 'Warm', value: 'warm' },
  { label: 'Cool', value: 'cool' },
  { label: 'Vivid', value: 'vivid' },
];

interface FilterSectionProps {
  filterPreset: FilterPreset;
  setFilterPreset: (preset: FilterPreset) => void;
  isApplyingFilter: boolean;
  handleApplyFilter: () => Promise<void>;
  handleResetFilter: () => void;
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  filterPreset,
  setFilterPreset,
  isApplyingFilter,
  handleApplyFilter,
  handleResetFilter,
}) => {
  const isFilterActive = filterPreset !== 'none';

  return (
    <section className="edit-section-card">
      <div className="space-y-3">
        {/* Filter options */}
        <div className="flex items-center justify-between mb-3">
          <h4 className="section-title mb-0">Filtro</h4>
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

        {/* Action button */}
        <button
          onClick={handleApplyFilter}
          disabled={isApplyingFilter || !isFilterActive}
          className="w-full h-7 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded text-[9px] font-medium text-white/50 hover:text-white/70 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {isApplyingFilter ? (
            '...'
          ) : (
            <>
              <Icon name="check" className="w-3 h-3" />
              Aplicar Filtro
            </>
          )}
        </button>
      </div>
    </section>
  );
};
