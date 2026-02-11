/**
 * ImagePlaygroundPage
 * Main page component for the Image Generation Playground
 * 3-panel layout: ConfigPanel (left) + Workspace (center) + TopicsSidebar (right)
 * Design based on LobeChat reference
 */

import React from 'react';
import { ConfigPanel } from './ConfigPanel';
import { Workspace } from './Workspace';
import { TopicsSidebar } from './TopicsSidebar';
import { useImagePlayground } from '../../hooks/useImagePlayground';
import { useBrandProfile } from '../../hooks/useAppData';

interface ImagePlaygroundPageProps {
  userId?: string;
  organizationId?: string | null;
}

export const ImagePlaygroundPage: React.FC<ImagePlaygroundPageProps> = ({
  userId,
  organizationId,
}) => {
  useImagePlayground(); // Initialize the store
  const { brandProfile } = useBrandProfile(userId || null, organizationId);

  return (
    <div className="h-full w-full bg-background text-white flex overflow-hidden">
      {/* Left Panel: Config - wider like reference */}
      <div className="w-80 shrink-0 border-r border-border overflow-y-auto no-scrollbar">
        <ConfigPanel defaultBrandTone={brandProfile?.tone_of_voice || null} />
      </div>

      {/* Center Panel: Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Workspace />
      </div>

      {/* Right Panel: Topics Sidebar - narrower for thumbnails */}
      <div className="w-20 shrink-0 border-l border-border overflow-y-auto no-scrollbar">
        <TopicsSidebar />
      </div>
    </div>
  );
};

export default ImagePlaygroundPage;
