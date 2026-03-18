import React from 'react';
import type { SchedulingPlatform } from '../../types';
import { Icon } from '../common/Icon';

interface PlatformSelectorProps {
  platform: SchedulingPlatform;
  onPlatformChange: (platform: SchedulingPlatform) => void;
}

const PLATFORMS: Array<{ id: SchedulingPlatform; label: string }> = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'both', label: 'Ambos' },
];

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
  platform,
  onPlatformChange,
}) => {
  return (
    <div>
      <label className="text-xs font-semibold text-white/70 mb-1.5 block">
        Plataforma
      </label>
      <div className="flex gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPlatformChange(p.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              platform === p.id
                ? 'bg-white text-black shadow-lg'
                : 'text-muted-foreground bg-background/60 backdrop-blur-xl border border-border hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon name="globe" className="w-3.5 h-3.5" />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};
