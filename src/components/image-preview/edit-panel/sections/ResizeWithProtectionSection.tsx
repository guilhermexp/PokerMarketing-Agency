/**
 * ResizeWithProtectionSection
 * Componente unificado de redimensionamento com proteção de áreas
 * A proteção é usada para preservar textos/logos durante o redimensionamento inteligente
 */

import React from 'react';
import { Icon } from '../../../common/Icon';
import { Loader } from '../../../common/Loader';
import type { ResizeWithProtectionProps } from '../../uiTypes';

export const ResizeWithProtectionSection: React.FC<ResizeWithProtectionProps> = ({
  originalDimensions: _originalDimensions,
  widthPercent,
  heightPercent,
  isResizing,
  resizeProgress,
  resizedPreview,
  handleResize,
  handleSaveResize,
  handleDiscardResize,
  useProtectionMask,
  drawMode,
  setUseProtectionMask,
  setDrawMode,
  handleAutoDetectText,
  isDetectingText,
  detectProgress,
  hasProtectionDrawing,
  clearProtectionMask,
}) => {
  // Presets de redimensionamento
  const presets = [
    { label: '4:5', w: 100, h: 80 },
    { label: '1:1', w: 80, h: 80 },
    { label: '16:9', w: 100, h: 56 },
  ];

  return (
    <section className="space-y-3">
      {/* Controles de redimensionamento */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 flex items-center gap-1 bg-white/[0.03] rounded px-2 py-1 border border-white/[0.06]">
          <span className="text-[8px] text-white/30 uppercase">L</span>
          <input
            type="number"
            min={10}
            max={100}
            value={widthPercent}
            onChange={(e) => handleResize(Number(e.target.value), heightPercent)}
            disabled={isResizing}
            className="w-full bg-transparent text-[10px] text-white/80 focus:outline-none tabular-nums disabled:opacity-50"
          />
          <span className="text-[8px] text-white/20">%</span>
        </div>
        <Icon name="x" className="w-2 h-2 text-white/15 flex-shrink-0" />
        <div className="flex-1 flex items-center gap-1 bg-white/[0.03] rounded px-2 py-1 border border-white/[0.06]">
          <span className="text-[8px] text-white/30 uppercase">A</span>
          <input
            type="number"
            min={10}
            max={100}
            value={heightPercent}
            onChange={(e) => handleResize(widthPercent, Number(e.target.value))}
            disabled={isResizing}
            className="w-full bg-transparent text-[10px] text-white/80 focus:outline-none tabular-nums disabled:opacity-50"
          />
          <span className="text-[8px] text-white/20">%</span>
        </div>
      </div>

      {/* Presets */}
      <div className="flex gap-1 flex-wrap">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handleResize(preset.w, preset.h)}
            disabled={isResizing}
            className="px-2 py-0.5 text-[8px] font-medium rounded bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60 border border-white/[0.04] transition-all disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => handleResize(100, 100)}
          disabled={isResizing || (widthPercent === 100 && heightPercent === 100)}
          className="px-2 py-0.5 text-[8px] font-medium rounded bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60 border border-white/[0.04] transition-all disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      {/* Progresso de redimensionamento */}
      {isResizing && (
        <div className="space-y-0.5">
          <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-white/40 transition-all duration-150"
              style={{ width: `${resizeProgress}%` }}
            />
          </div>
          <span className="text-[8px] text-white/30 tabular-nums">
            {resizeProgress}%
          </span>
        </div>
      )}

      {/* Área de proteção */}
      <div className="pt-2 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] font-medium text-white/40 uppercase tracking-wider">
            Proteger
          </span>
          {useProtectionMask && hasProtectionDrawing() && (
            <button
              onClick={clearProtectionMask}
              className="text-[8px] text-white/25 hover:text-white/40 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Ferramentas de proteção */}
        <div className="flex gap-1">
          <button
            onClick={() => {
              setUseProtectionMask(true);
              setDrawMode('rectangle');
              handleDiscardResize();
            }}
            title="Retângulo"
            className={`w-6 h-6 rounded flex items-center justify-center transition-all ${useProtectionMask && drawMode === 'rectangle'
              ? 'bg-white/10 text-white'
              : 'bg-white/[0.03] text-white/30 hover:text-white/50 hover:bg-white/[0.05]'
              }`}
          >
            <Icon name="square" className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              setUseProtectionMask(true);
              setDrawMode('brush');
              handleDiscardResize();
            }}
            title="Pincel"
            className={`w-6 h-6 rounded flex items-center justify-center transition-all ${useProtectionMask && drawMode === 'brush'
              ? 'bg-white/10 text-white'
              : 'bg-white/[0.03] text-white/30 hover:text-white/50 hover:bg-white/[0.05]'
              }`}
          >
            <Icon name="edit" className="w-3 h-3" />
          </button>
          <button
            onClick={handleAutoDetectText}
            disabled={isDetectingText}
            title="Detectar texto automaticamente"
            className={`w-6 h-6 rounded flex items-center justify-center transition-all ${isDetectingText
              ? 'bg-white/10 text-white'
              : 'bg-white/[0.03] text-white/30 hover:text-white/50 hover:bg-white/[0.05]'
              }`}
          >
            {isDetectingText ? (
              <Loader className="w-3 h-3" />
            ) : (
              <Icon name="eye" className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Progresso de detecção */}
        {isDetectingText && (
          <div className="space-y-0.5 mt-1">
            <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-white/40 transition-all duration-150"
                style={{ width: `${detectProgress}%` }}
              />
            </div>
            <span className="text-[8px] text-white/30">Detectando...</span>
          </div>
        )}
      </div>

      {/* Botões de ação */}
      {resizedPreview && !isResizing && (
        <div className="flex gap-1 pt-1">
          <button
            onClick={handleDiscardResize}
            className="flex-1 h-6 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded text-[8px] font-medium text-white/40 hover:text-white/60 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveResize}
            className="flex-1 h-6 bg-white hover:bg-white/90 rounded text-[8px] font-semibold text-black transition-all"
          >
            Aplicar
          </button>
        </div>
      )}
    </section>
  );
};
