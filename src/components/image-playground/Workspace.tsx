/**
 * Workspace
 * Center panel with prompt input and generation feed
 * Design based on LobeChat reference
 */

import React from 'react';
import { PromptInput } from './PromptInput';
import { GenerationFeed } from './GenerationFeed';
import { useImagePlaygroundStore, imagePlaygroundSelectors } from '../../stores/imagePlaygroundStore';

export const Workspace: React.FC = () => {
  const activeTopicId = useImagePlaygroundStore(imagePlaygroundSelectors.activeTopicId);
  const activeTopic = useImagePlaygroundStore(imagePlaygroundSelectors.activeTopic);
  const batches = useImagePlaygroundStore(imagePlaygroundSelectors.currentBatches);

  // Check if we should show the empty state (large centered view)
  const showEmptyState = !activeTopicId || batches.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a]">
      {/* Header - only show when there are generations */}
      {!showEmptyState && (
        <div className="px-6 py-4 border-b border-white/10">
          <h1 className="text-xl font-semibold text-white">
            {activeTopic?.title || 'Novo projeto'}
          </h1>
        </div>
      )}

      {/* Main Content Area */}
      {showEmptyState ? (
        // Empty State - Centered layout like LobeChat
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Centered Icon & Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <svg
                className="w-9 h-9 text-white/80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
              </svg>
            </div>
            <h1 className="text-4xl font-semibold text-white">Pintura</h1>
          </div>

          {/* Prompt Input - Centered */}
          <div className="w-full max-w-2xl">
            <PromptInput />
          </div>
        </div>
      ) : (
        // Generation Feed with Prompt at bottom
        <>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <GenerationFeed topicId={activeTopicId} />
          </div>

          {/* Prompt Input - Fixed at bottom */}
          <div className="border-t border-white/10 p-4 bg-black/40 backdrop-blur-xl">
            <PromptInput />
          </div>
        </>
      )}
    </div>
  );
};

export default Workspace;
