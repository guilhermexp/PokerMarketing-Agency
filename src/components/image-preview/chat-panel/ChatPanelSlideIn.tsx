import { Drawer } from 'antd';
import { useResponsive } from 'antd-style';
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

  // Debug: Log rendering state
  console.debug('[ChatPanel] Rendering:', {
    open,
    chatComponent: !!chatComponent,
    mobile,
    imageId: image?.id
  });

  if (mobile) {
    // Mobile: Bottom Sheet - Renderizar chat diretamente
    return (
      <Drawer
        placement="bottom"
        open={open}
        onClose={onClose}
        height="90%"
        styles={{
          body: { padding: 0, height: '100%', background: 'transparent' },
        }}
        closeIcon={null}
      >
        {chatComponent}
      </Drawer>
    );
  }

  // Desktop: Slide-in lateral (mesmo slot do painel de edição)
  return (
    <div className={`edit-panel-slide ${open ? 'open' : 'closed'}`}>
      {/* Wrapper flex para garantir expansão completa */}
      <div className="flex flex-col w-full h-full">
        {chatComponent}
      </div>
    </div>
  );
};
