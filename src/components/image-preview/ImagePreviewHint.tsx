/**
 * ImagePreviewHint
 */

import React from 'react';
import { Icon } from '../common/Icon';
import type { ImagePreviewHintProps } from './uiTypes';

export const ImagePreviewHint: React.FC<ImagePreviewHintProps> = ({
  useProtectionMask,
  drawMode,
}) => (
  <div className="mt-4 flex items-center gap-2 text-muted-foreground">
    <Icon
      name={useProtectionMask ? 'shield' : 'edit'}
      className="w-3.5 h-3.5 flex-shrink-0"
    />
    <span className="text-[10px]">
      {useProtectionMask
        ? drawMode === 'rectangle'
          ? 'Clique e arraste para desenhar retângulos sobre textos/logotipos a proteger'
          : 'Pinte livremente sobre textos/logotipos que devem ser protegidos'
        : 'Desenhe para marcar a área desejada, escreva sua alteração e clique em Editar com IA'}
    </span>
  </div>
);
