/**
 * ErrorBanner
 */

import React from 'react';
import type { ErrorBannerProps } from './uiTypes';

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
      <p className="text-[11px] text-red-400">{message}</p>
    </div>
  );
};
