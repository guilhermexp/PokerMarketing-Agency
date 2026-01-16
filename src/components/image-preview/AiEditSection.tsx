/**
 * AiEditSection
 */

import React from 'react';
import { Icon } from '../common/Icon';
import { MinimalImageUploader } from './MinimalImageUploader';
import type { AiEditSectionProps } from './uiTypes';

export const AiEditSection: React.FC<AiEditSectionProps> = React.memo(({
  editPrompt,
  setEditPrompt,
  referenceImage,
  setReferenceImage,
  brushSize,
  setBrushSize,
}) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
        Editar com IA
      </span>
      {editPrompt && (
        <button
          onClick={() => setEditPrompt('')}
          className="text-[9px] text-white/25 hover:text-white/40 transition-colors"
        >
          Limpar
        </button>
      )}
    </div>
    <textarea
      value={editPrompt}
      onChange={(e) => setEditPrompt(e.target.value)}
      rows={2}
      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/70 focus:border-white/15 focus:outline-none transition-all resize-none placeholder:text-white/20"
      placeholder="Descreva a alteração..."
    />

    {/* Brush Size Control */}
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/30">Tamanho do pincel</span>
        <span className="text-[9px] text-white/40 font-mono">{brushSize}px</span>
      </div>
      <div className="flex items-center gap-2">
        <Icon name="minus" className="w-3 h-3 text-white/20" />
        <input
          type="range"
          min="10"
          max="150"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="flex-1 h-1 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-red-500"
          style={{
            background: `linear-gradient(to right, rgba(239, 68, 68, 0.4) 0%, rgba(239, 68, 68, 0.4) ${((brushSize - 10) / 140) * 100}%, rgba(255, 255, 255, 0.06) ${((brushSize - 10) / 140) * 100}%, rgba(255, 255, 255, 0.06) 100%)`
          }}
        />
        <Icon name="plus" className="w-3 h-3 text-white/20" />
      </div>
    </div>

    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/30">Ref:</span>
      {referenceImage ? (
        <div className="relative">
          <img
            src={referenceImage.preview}
            alt="Ref"
            className="h-8 w-8 rounded object-cover border border-white/10"
          />
          <button
            onClick={() => setReferenceImage(null)}
            className="absolute -top-1 -right-1 w-4 h-4 bg-black/80 hover:bg-black rounded-full flex items-center justify-center"
          >
            <Icon name="x" className="w-2 h-2 text-white/60" />
          </button>
        </div>
      ) : (
        <MinimalImageUploader onImageChange={setReferenceImage} />
      )}
    </div>
  </section>
));
