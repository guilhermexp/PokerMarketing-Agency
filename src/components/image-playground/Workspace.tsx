/**
 * Workspace
 * Center panel with prompt input and generation feed
 * Professional design matching Video Studio
 */

import React, { useEffect, useState } from 'react';
import { PromptInput } from './PromptInput';
import { GenerationFeed } from './GenerationFeed';
import { useImagePlaygroundStore, imagePlaygroundSelectors } from '../../stores/imagePlaygroundStore';
import { StudioAgentToggle } from '../studio-agent/StudioAgentToggle';
import { StudioAgentPanel } from '../studio-agent/StudioAgentPanel';
import { useImagePlaygroundTopics } from '../../hooks/useImagePlayground';
import { Image } from 'lucide-react';

export const Workspace: React.FC = () => {
  const [mode, setMode] = useState<'direct' | 'agent'>('direct');
  const activeTopicId = useImagePlaygroundStore(imagePlaygroundSelectors.activeTopicId);
  const activeTopic = useImagePlaygroundStore(imagePlaygroundSelectors.activeTopic);
  const batches = useImagePlaygroundStore(imagePlaygroundSelectors.currentBatches);
  const { createTopic } = useImagePlaygroundTopics();

  // Check if we should show the empty state (large centered view)
  const showEmptyState = !activeTopicId || batches.length === 0;

  useEffect(() => {
    let cancelled = false;

    async function ensureTopicForAgent() {
      if (mode !== 'agent' || activeTopicId) return;
      try {
        await createTopic();
      } catch {
        if (!cancelled) {
          // noop: painel já mostra estado de indisponível sem quebrar UI
        }
      }
    }

    ensureTopicForAgent();
    return () => {
      cancelled = true;
    };
  }, [activeTopicId, createTopic, mode]);

  return (
    <div className="flex-1 min-h-0 flex bg-background">
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header - only show when there are generations */}
        {!showEmptyState && (
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-white tracking-tight">
                  {activeTopic?.title || 'Novo projeto'}
                </h1>
                <p className="text-[11px] text-white/35 mt-0.5">
                  {batches.length} {batches.length === 1 ? 'batch' : 'batches'} gerados
                </p>
              </div>
              <StudioAgentToggle mode={mode} onChange={setMode} />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {showEmptyState ? (
          // Empty State - Centered layout matching Video Studio
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            {/* Hero empty state */}
            <div className="flex flex-col items-center mb-10">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-5">
                  <Image className="w-9 h-9 text-white/40" />
              </div>
              <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">Image Studio</h1>
              <p className="text-sm text-white/35 max-w-sm text-center">
                Gere imagens com IA a partir de prompts de texto ou imagens de referencia
              </p>
            </div>

            {/* Prompt Input - Centered */}
            <div className="w-full max-w-xl">
              <div className="mb-4 flex justify-center">
                <StudioAgentToggle mode={mode} onChange={setMode} />
              </div>
              {mode === 'direct' ? (
                <PromptInput />
              ) : (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-6 text-sm text-white/35 text-center">
                  Use o painel lateral do agente para conversar e disparar as geracoes.
                </div>
              )}
            </div>
          </div>
        ) : (
          // Generation Feed with Prompt at bottom
          <>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <GenerationFeed topicId={activeTopicId} />
            </div>

            {/* Prompt Input - Fixed at bottom */}
            {mode === 'direct' && (
              <div className="border-t border-white/[0.06] p-4 bg-black/30 backdrop-blur-2xl">
                <div className="max-w-3xl mx-auto">
                  <PromptInput />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {mode === 'agent' && (
        <StudioAgentPanel studioType="image" topicId={activeTopicId} layout="sidebar" />
      )}
    </div>
  );
};

export default Workspace;
