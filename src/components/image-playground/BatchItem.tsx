/**
 * BatchItem
 * Displays a single generation batch with its generations
 */

import React, { useCallback, useState } from 'react';
import {
  MoreHorizontal,
  Trash2,
  Download,
  Settings2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GenerationItem } from './GenerationItem';
import { useImagePlaygroundBatches } from '../../hooks/useImagePlayground';
import { useImagePlaygroundStore } from '../../stores/imagePlaygroundStore';
import type { GenerationBatch } from '../../stores/imagePlaygroundStore';

interface BatchItemProps {
  batch: GenerationBatch;
  topicId: string;
}

export const BatchItem: React.FC<BatchItemProps> = ({ batch, topicId }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const { deleteBatch } = useImagePlaygroundBatches(topicId);
  const { reuseSettings } = useImagePlaygroundStore();

  const handleReuseSettings = useCallback(() => {
    reuseSettings(batch.model, batch.provider, batch.config);
    setShowMenu(false);
  }, [batch, reuseSettings]);

  const handleDelete = useCallback(async () => {
    if (confirm('Excluir este batch e todas as suas imagens?')) {
      await deleteBatch(batch.id);
    }
    setShowMenu(false);
  }, [batch.id, deleteBatch]);

  const handleDownloadAll = useCallback(async () => {
    const successGenerations = batch.generations.filter((g) => g.asset?.url);
    if (successGenerations.length === 0) return;

    // Simple download for single image
    if (successGenerations.length === 1) {
      const url = successGenerations[0].asset!.url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `generation_${successGenerations[0].id}.png`;
      link.click();
      return;
    }

    // For multiple images, download individually
    for (const gen of successGenerations) {
      const link = document.createElement('a');
      link.href = gen.asset!.url;
      link.download = `generation_${gen.id}.png`;
      link.click();
      await new Promise((r) => setTimeout(r, 500)); // Small delay between downloads
    }

    setShowMenu(false);
  }, [batch.generations]);

  const successCount = batch.generations.filter((g) => g.asset?.url).length;
  const totalCount = batch.generations.length;

  return (
    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 flex items-start gap-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-0.5 p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 line-clamp-2">{batch.prompt}</p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/40">
            <span className="px-1.5 py-0.5 bg-white/5 rounded">
              {batch.model.split('/').pop() || batch.model}
            </span>
            <span>
              {batch.width}×{batch.height}
            </span>
            <span>
              {successCount}/{totalCount} imagens
            </span>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-white/40" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-black/95 border border-white/10 rounded-xl shadow-2xl z-20 py-1 overflow-hidden">
                <button
                  onClick={handleReuseSettings}
                  className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                >
                  <Settings2 className="w-4 h-4" />
                  Reusar configurações
                </button>
                {successCount > 0 && (
                  <button
                    onClick={handleDownloadAll}
                    className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Baixar {successCount > 1 ? 'todas' : 'imagem'}
                  </button>
                )}
                <div className="border-t border-white/10 my-1" />
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir batch
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Generations Grid */}
      {isExpanded && (
        <div className="p-4 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10">
          <div
            className={`grid gap-4 ${
              batch.generations.length === 1
                ? 'grid-cols-1 max-w-md'
                : batch.generations.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {batch.generations.map((generation) => (
              <GenerationItem
                key={generation.id}
                generation={generation}
                topicId={topicId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchItem;
