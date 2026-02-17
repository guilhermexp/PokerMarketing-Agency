/**
 * ImagePlaygroundPage
 * Main page component for the Image Generation Playground
 * 3-panel layout: ConfigPanel (left) + Workspace (center) + TopicsSidebar (right)
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
      {/* Left Panel: Config */}
      <div className="w-72 shrink-0 border-r border-white/[0.06] overflow-y-auto no-scrollbar">
        <ConfigPanel defaultBrandTone={brandProfile?.tone_of_voice || null} />
      </div>

      {/* Center Panel: Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Workspace />
      </div>

      {/* Right Panel: Topics Sidebar */}
      <div className="w-[72px] shrink-0 border-l border-white/[0.06] overflow-y-auto no-scrollbar">
        <TopicsSidebar />
      </div>
    </div>
  );
};

export default ImagePlaygroundPage;
