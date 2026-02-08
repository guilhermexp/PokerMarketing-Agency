/**
 * GenerationFeed
 * Scrollable list of generation batches for the active topic
 * Chat-like layout: newest items at bottom, auto-scroll on new content
 */

import React, { useRef, useEffect } from 'react';
import { BatchItem } from './BatchItem';
import { useImagePlaygroundBatches } from '../../hooks/useImagePlayground';
import { Loader } from '../common/Loader';

interface GenerationFeedProps {
  topicId: string | null;
}

export const GenerationFeed: React.FC<GenerationFeedProps> = ({ topicId }) => {
  const { batches, isLoading } = useImagePlaygroundBatches(topicId);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const prevBatchCountRef = useRef(0);

  // Auto-scroll to bottom when new batches are added or on initial load
  useEffect(() => {
    if (batches.length > 0) {
      if (!hasInitializedRef.current) {
        // Initial load - instant scroll to bottom
        feedEndRef.current?.scrollIntoView({ behavior: 'auto' });
        hasInitializedRef.current = true;
        prevBatchCountRef.current = batches.length;
      } else if (batches.length > prevBatchCountRef.current) {
        // New batch added - smooth scroll to bottom
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        prevBatchCountRef.current = batches.length;
      }
    }
  }, [batches.length]);

  // Reset when topic changes
  useEffect(() => {
    hasInitializedRef.current = false;
    prevBatchCountRef.current = 0;
  }, [topicId]);

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

  // Reverse the array to show oldest first (top) and newest last (bottom)
  // This creates a chat-like experience
  const reversedBatches = [...batches].reverse();

  return (
    <div className="p-6 space-y-6">
      {reversedBatches.map((batch) => (
        <BatchItem key={batch.id} batch={batch} topicId={topicId} />
      ))}
      {/* Scroll anchor at the bottom */}
      <div ref={feedEndRef} />
    </div>
  );
};

export default GenerationFeed;
