import { Button } from '@/components/ui/button';
import { Send, Calendar, Megaphone } from 'lucide-react';

interface ImagePreviewActionsBarProps {
  onQuickPost?: () => void;
  onSchedulePost?: () => void;
  onPublish?: () => void;
}

export const ImagePreviewActionsBar = ({
  onQuickPost,
  onSchedulePost,
  onPublish,
}: ImagePreviewActionsBarProps) => {
  // Não renderiza se não houver nenhuma ação
  if (!onQuickPost && !onSchedulePost && !onPublish) {
    return null;
  }

  return (
    <div className="preview-actions-bar">
      <div className="actions-toolbar">
        {onQuickPost && (
          <Button
            aria-label="Quick Post"
            className="h-8 w-8 rounded-md"
            onClick={onQuickPost}
            size="icon-sm"
            title="Quick Post"
            type="button"
            variant="ghost"
          >
            <Send />
          </Button>
        )}

        {onSchedulePost && (
          <Button
            aria-label="Agendar"
            className="h-8 w-8 rounded-md"
            onClick={onSchedulePost}
            size="icon-sm"
            title="Agendar"
            type="button"
            variant="ghost"
          >
            <Calendar />
          </Button>
        )}

        {onPublish && (
          <Button
            aria-label="Campanha"
            className="h-8 w-8 rounded-md"
            onClick={onPublish}
            size="icon-sm"
            title="Campanha"
            type="button"
            variant="ghost"
          >
            <Megaphone />
          </Button>
        )}
      </div>
    </div>
  );
};
