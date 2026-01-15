/**
 * CarouselToast
 * Componente de notificação toast para o CarouselTab
 */

import React from 'react';
import { Icon } from '../../common/Icon';

interface CarouselToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export const CarouselToast: React.FC<CarouselToastProps> = ({ message, type, onClose }) => {
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-bottom-4 ${
        type === 'success'
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-red-500/10 border-red-500/30 text-red-400'
      }`}
    >
      <Icon
        name={type === 'success' ? 'check-circle' : 'alert-circle'}
        className="w-5 h-5"
      />
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  );
};
