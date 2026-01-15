/**
 * Stats Card - Card de estatística minimalista
 */

import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  change?: {
    value: number;
    label: string;
  };
  color?: 'default' | 'amber' | 'green' | 'red';
}

export function StatsCard({ title, value, icon, subtitle, change, color = 'default' }: StatsCardProps) {
  const iconColors = {
    default: 'text-white/40',
    amber: 'text-amber-500',
    green: 'text-emerald-500',
    red: 'text-red-400',
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-1">{title}</p>
          <p className="text-2xl font-semibold text-white/90 tabular-nums">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>
          )}
          {change && (
            <div className="flex items-center gap-1.5 mt-2">
              {change.value >= 0 ? (
                <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              )}
              <span className={`text-[11px] font-medium ${change.value >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                {change.value >= 0 ? '+' : ''}{change.value}%
              </span>
              <span className="text-[11px] text-white/30">{change.label}</span>
            </div>
          )}
        </div>
        <div className={`w-9 h-9 rounded-md bg-white/[0.04] flex items-center justify-center ${iconColors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default StatsCard;
