/**
 * PlaygroundResultGrid Component
 * Grid displaying generated video results with animation.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { VideoCard } from './VideoCard';
import type { FeedPost } from './types';

// =============================================================================
// Types
// =============================================================================

interface PlaygroundResultGridProps {
  feed: FeedPost[];
  isLoading: boolean;
}

// =============================================================================
// PlaygroundResultGrid Component
// =============================================================================

export const PlaygroundResultGrid: React.FC<PlaygroundResultGridProps> = ({
  feed,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 grid grid-cols-[repeat(auto-fill,minmax(260px,340px))] gap-5 justify-center xl:justify-start">
      <AnimatePresence initial={false}>
        {feed.map((post) => (
          <motion.div
            key={post.id}
            className="w-full max-w-[340px]"
            layout
          >
            <VideoCard post={post} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
