import { Drawer } from 'antd';
import { useResponsive } from 'antd-style';
import { X } from 'lucide-react';
import type { GalleryImage } from '../types';

interface ChatPanelSlideInProps {
  open: boolean;
  image: GalleryImage;
  onClose: () => void;
  chatComponent: React.ReactNode;
}

export const ChatPanelSlideIn = ({
  open,
  image,
  onClose,
  chatComponent,
}: ChatPanelSlideInProps) => {
  const { mobile } = useResponsive();

  if (mobile) {
    // Mobile: Bottom Sheet
    return (
      <Drawer
        placement="bottom"
        open={open}
        onClose={onClose}
        height="80%"
        styles={{
          body: { padding: 0, height: '100%' },
        }}
        closeIcon={<X size={20} />}
        title="Chat Assistant"
      >
        <div className="h-full overflow-hidden">
          {chatComponent}
        </div>
      </Drawer>
    );
  }

  // Desktop: Slide-in lateral
  return (
    <div className={`edit-panel-slide ${open ? 'open' : 'closed'}`}>
      {/* Header */}
      <div className="panel-header">
        <h3>Chat Assistant</h3>
        <button className="close-button" onClick={onClose} aria-label="Fechar painel">
          <X size={20} />
        </button>
      </div>

      {/* Content (scrollable) */}
      <div className="panel-scroll-content" style={{ padding: 0 }}>
        <div className="h-full overflow-hidden">
          {chatComponent}
        </div>
      </div>
    </div>
  );
};
