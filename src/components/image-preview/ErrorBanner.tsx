/**
 * ErrorBanner
 */

import React from 'react';
import type { ErrorBannerProps } from './uiTypes';

function formatErrorMessage(message: string): string {
  // If it looks like raw JSON or API dump, show a friendly fallback
  if (message.startsWith('{') || message.startsWith('[') || message.length > 200) {
    return 'Erro ao processar a requisição. Tente novamente.';
  }
  return message;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message }) => {
  if (!message) return null;

  const displayMessage = formatErrorMessage(message);

  return (
    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
      <p className="text-[11px] text-red-400">{displayMessage}</p>
    </div>
  );
};
