/**
 * GenerationFeed
 * Scrollable list of generation batches for the active topic
 */

import React from 'react';
import { BatchItem } from './BatchItem';
import { useImagePlaygroundBatches } from '../../hooks/useImagePlayground';
import { Loader } from '../common/Loader';

interface GenerationFeedProps {
  topicId: string | null;
}

export const GenerationFeed: React.FC<GenerationFeedProps> = ({ topicId }) => {
  const { batches, isLoading } = useImagePlaygroundBatches(topicId);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-white/40">
          <Loader size={24} />
          <span className="text-sm">Carregando gerações...</span>
        </div>
      </div>
    );
  }

  // Empty state is now handled by Workspace
  if (!topicId || batches.length === 0) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {batches.map((batch) => (
        <BatchItem key={batch.id} batch={batch} topicId={topicId} />
      ))}
    </div>
  );
};

export default GenerationFeed;
