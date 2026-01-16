import { ActionIcon } from '@lobehub/ui';
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
          <ActionIcon
            icon={Send}
            onClick={onQuickPost}
            title="Quick Post"
            size="small"
          />
        )}

        {onSchedulePost && (
          <ActionIcon
            icon={Calendar}
            onClick={onSchedulePost}
            title="Agendar"
            size="small"
          />
        )}

        {onPublish && (
          <ActionIcon
            icon={Megaphone}
            onClick={onPublish}
            title="Campanha"
            size="small"
          />
        )}
      </div>
    </div>
  );
};
