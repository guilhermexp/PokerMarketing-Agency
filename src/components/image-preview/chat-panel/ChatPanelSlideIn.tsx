import { useIsMobile } from '@/hooks/useIsMobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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
  const isMobile = useIsMobile();

  if (isMobile) {
    // Mobile: Bottom Sheet
    return (
      <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[90vh] rounded-t-2xl bg-black p-0 border-0"
        >
          {chatComponent}
        </SheetContent>
      </Sheet>
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
