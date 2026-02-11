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

function getStringConfig(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getBooleanConfig(config: Record<string, unknown>, key: string): boolean {
  return config[key] === true;
}

function extractUserPrompt(batchPrompt: string, config: Record<string, unknown>): string {
  const configPrompt = getStringConfig(config, 'userPrompt');
  if (configPrompt) return configPrompt;

  if (batchPrompt.includes('PROMPT DO USUÁRIO:')) {
    return batchPrompt.split('PROMPT DO USUÁRIO:').pop()?.trim() || batchPrompt;
  }

  const technicalPromptMatch = batchPrompt.match(/^PROMPT TÉCNICO:\s*(.+?)\s*ESTILO VISUAL:/s);
  if (technicalPromptMatch?.[1]) {
    return technicalPromptMatch[1].trim();
  }

  const campaignGradePromptMatch = batchPrompt.match(/- Prompt base:\s*(.+)/);
  if (campaignGradePromptMatch?.[1]) {
    return campaignGradePromptMatch[1].trim();
  }

  return batchPrompt;
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
  const config = batch.config || {};
  const displayPrompt = extractUserPrompt(batch.prompt, config);
  const imageSize = getStringConfig(config, 'imageSize');
  const aspectRatio = getStringConfig(config, 'aspectRatio');
  const toneOverride = getStringConfig(config, 'toneOfVoiceOverride');
  const fontStyleOverride = getStringConfig(config, 'fontStyleOverride');
  const useBrandProfile = getBooleanConfig(config, 'useBrandProfile');
  const useInstagramMode = getBooleanConfig(config, 'useInstagramMode');

  // Aggregate token usage across all generations in this batch
  const totalTokens = batch.generations.reduce(
    (acc, g) => {
      if (g.asset?.inputTokens) acc.input += g.asset.inputTokens;
      if (g.asset?.outputTokens) acc.output += g.asset.outputTokens;
      return acc;
    },
    { input: 0, output: 0 },
  );
  const hasTokens = totalTokens.input > 0 || totalTokens.output > 0;

  // Format date/time
  const createdDate = batch.createdAt ? new Date(batch.createdAt) : null;
  const formattedDate = createdDate
    ? createdDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;
  const formattedTime = createdDate
    ? createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-zinc-900/80 backdrop-blur-xl border border-border rounded-xl">
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3 relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-0.5 p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 line-clamp-2">{displayPrompt}</p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
            <span className="px-1.5 py-0.5 bg-white/5 rounded">
              {batch.model.split('/').pop() || batch.model}
            </span>
            {useInstagramMode && (
              <span className="px-1.5 py-0.5 bg-pink-500/20 text-pink-200 rounded">
                Instagram
              </span>
            )}
            {useBrandProfile && (
              <span className="px-1.5 py-0.5 bg-white/10 text-white/80 rounded">
                Perfil da marca
              </span>
            )}
            {toneOverride && (
              <span className="px-1.5 py-0.5 bg-white/10 text-white/80 rounded">
                Tom: {toneOverride}
              </span>
            )}
            {fontStyleOverride && (
              <span className="px-1.5 py-0.5 bg-white/10 text-white/80 rounded">
                Fonte: {fontStyleOverride}
              </span>
            )}
            {imageSize && (
              <span className="px-1.5 py-0.5 bg-white/10 text-white/80 rounded">
                Resolução {imageSize}
              </span>
            )}
            {aspectRatio && (
              <span className="px-1.5 py-0.5 bg-white/10 text-white/80 rounded">
                {aspectRatio}
              </span>
            )}
            <span>
              {batch.width}×{batch.height}
            </span>
            <span>
              {successCount}/{totalCount} imagens
            </span>
            {hasTokens && (
              <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded" title={`Input: ${totalTokens.input.toLocaleString()} · Output: ${totalTokens.output.toLocaleString()}`}>
                {(totalTokens.input + totalTokens.output).toLocaleString()} tokens
              </span>
            )}
            {formattedDate && (
              <span title={createdDate?.toLocaleString('pt-BR')}>
                {formattedDate} {formattedTime}
              </span>
            )}
            {batch.userEmail && (
              <span className="truncate max-w-[140px]" title={batch.userEmail}>
                {batch.userEmail}
              </span>
            )}
          </div>
        </div>

        {/* Menu */}
        <div className="relative z-50">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-border rounded-xl shadow-2xl z-50 py-1">
                <button
                  onClick={handleReuseSettings}
                  className="w-full px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2.5"
                >
                  <Settings2 className="w-4 h-4 text-white/70" />
                  Reusar configurações
                </button>
                {successCount > 0 && (
                  <button
                    onClick={handleDownloadAll}
                    className="w-full px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2.5"
                  >
                    <Download className="w-4 h-4 text-white/70" />
                    Baixar {successCount > 1 ? 'todas' : 'imagem'}
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5"
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
        <div className="p-4">
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
