/**
 * BatchItem
 * Displays a single generation batch with its generations
 * Professional design matching Video Studio
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
import { getImageModelDisplayLabel } from './imageModelLabels';

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

    if (successGenerations.length === 1) {
      const url = successGenerations[0].asset!.url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `generation_${successGenerations[0].id}.png`;
      link.click();
      setShowMenu(false);
      return;
    }

    for (const gen of successGenerations) {
      const link = document.createElement('a');
      link.href = gen.asset!.url;
      link.download = `generation_${gen.id}.png`;
      link.click();
      await new Promise((r) => setTimeout(r, 500));
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
  const requestedModelLabel = getImageModelDisplayLabel(batch.model) || (batch.model.split('/').pop() || batch.model);
  const usedModelLabels = Array.from(
    new Set(
      batch.generations
        .map((g) => getImageModelDisplayLabel(g.asset?.model))
        .filter((label): label is string => !!label)
    )
  );

  const totalTokens = batch.generations.reduce(
    (acc, g) => {
      if (g.asset?.inputTokens) acc.input += g.asset.inputTokens;
      if (g.asset?.outputTokens) acc.output += g.asset.outputTokens;
      return acc;
    },
    { input: 0, output: 0 },
  );
  const hasTokens = totalTokens.input > 0 || totalTokens.output > 0;

  const createdDate = batch.createdAt ? new Date(batch.createdAt) : null;
  const formattedDate = createdDate
    ? createdDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;
  const formattedTime = createdDate
    ? createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-start gap-3 relative">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-0.5 p-1 -ml-1 rounded-lg hover:bg-white/[0.08] transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/30" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 line-clamp-2 leading-relaxed">{displayPrompt}</p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-white/30 flex-wrap">
            {(usedModelLabels.length > 0 ? usedModelLabels : [requestedModelLabel]).map((label) => (
              <span
                key={label}
                className="px-1.5 py-0.5 bg-white/[0.06] rounded-md"
                title={usedModelLabels.length > 0 ? 'Modelo usado nas geracoes concluidas' : batch.model}
              >
                {label}
              </span>
            ))}
            {useInstagramMode && (
              <span className="px-1.5 py-0.5 bg-pink-500/15 text-pink-300/80 rounded-md">
                Instagram
              </span>
            )}
            {useBrandProfile && (
              <span className="px-1.5 py-0.5 bg-white/[0.06] text-white/50 rounded-md">
                Perfil da marca
              </span>
            )}
            {toneOverride && (
              <span className="px-1.5 py-0.5 bg-white/[0.06] text-white/50 rounded-md">
                Tom: {toneOverride}
              </span>
            )}
            {fontStyleOverride && (
              <span className="px-1.5 py-0.5 bg-white/[0.06] text-white/50 rounded-md">
                Fonte: {fontStyleOverride}
              </span>
            )}
            {imageSize && (
              <span className="px-1.5 py-0.5 bg-white/[0.06] text-white/50 rounded-md">
                {imageSize}
              </span>
            )}
            {aspectRatio && (
              <span className="px-1.5 py-0.5 bg-white/[0.06] text-white/50 rounded-md">
                {aspectRatio}
              </span>
            )}
            <span className="text-white/25">
              {batch.width}x{batch.height}
            </span>
            <span className="text-white/25">
              {successCount}/{totalCount} imagens
            </span>
            {hasTokens && (
              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300/70 rounded-md" title={`Input: ${totalTokens.input.toLocaleString()} · Output: ${totalTokens.output.toLocaleString()}`}>
                {(totalTokens.input + totalTokens.output).toLocaleString()} tokens
              </span>
            )}
            {formattedDate && (
              <span className="text-white/20" title={createdDate?.toLocaleString('pt-BR')}>
                {formattedDate} {formattedTime}
              </span>
            )}
            {batch.userEmail && (
              <span className="truncate max-w-[140px] text-white/20" title={batch.userEmail}>
                {batch.userEmail}
              </span>
            )}
          </div>
        </div>

        {/* Menu */}
        <div className="relative z-50">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-white/30" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900/95 border border-white/[0.1] rounded-xl shadow-2xl backdrop-blur-xl z-50 py-1">
                <button
                  onClick={handleReuseSettings}
                  className="w-full px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
                >
                  <Settings2 className="w-4 h-4 text-white/40" />
                  Reusar configuracoes
                </button>
                {successCount > 0 && (
                  <button
                    onClick={handleDownloadAll}
                    className="w-full px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
                  >
                    <Download className="w-4 h-4 text-white/40" />
                    Baixar {successCount > 1 ? 'todas' : 'imagem'}
                  </button>
                )}
                <div className="h-px bg-white/[0.06] my-1" />
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2.5 text-left text-sm text-red-400/80 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
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
        <div className="p-4 pt-0">
          <div
            className={`grid gap-3 ${
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
                fallbackModel={batch.model}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchItem;
