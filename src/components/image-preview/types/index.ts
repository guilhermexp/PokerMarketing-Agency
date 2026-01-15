/**
 * Image Editor Types
 * Tipos específicos para o módulo de edição de imagem
 */

import type { GalleryImage } from '../../../types';

// Tipos de ferramenta disponíveis
export type ToolType =
  | 'crop'
  | 'resize'
  | 'filters'
  | 'ai-enhance'
  | 'protection'
  | 'rotate'
  | 'text'
  | 'draw';

// Estado de edição de imagem
export interface ImageEditorState {
  // Imagem atual
  currentImage: GalleryImage | null;
  originalImage: GalleryImage | null; // Cópia da imagem original para reset

  // Ferramenta ativa
  activeTool: ToolType | null;

  // Estado de transformação
  transform: {
    rotation: number;
    scale: number;
    flipX: boolean;
    flipY: boolean;
  };

  // Estado de crop
  crop: {
    active: boolean;
    aspectRatio: number | null; // null = livre
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Estado de redimensionamento
  resize: {
    width: number;
    height: number;
    maintainAspectRatio: boolean;
  };

  // Filtros aplicados
  filters: {
    brightness: number;
    contrast: number;
    saturation: number;
    hue: number;
    blur: number;
    grayscale: boolean;
    sepia: boolean;
    invert: boolean;
  };

  // Zoom e pan
  zoom: number;
  panOffset: { x: number; y: number };

  // Estado de loading
  isLoading: boolean;
  loadingMessage: string;

  // Histórico de operações (para undo/redo)
  history: ImageOperation[];
  historyIndex: number;

  // Estado de comparação (before/after)
  compareMode: boolean;
}

export interface ImageOperation {
  type: ToolType;
  timestamp: number;
  data: Record<string, unknown>;
}

// Props para componentes
export interface ImageEditorProps {
  image: GalleryImage;
  onClose: () => void;
  onSave: (editedImage: GalleryImage) => void;
  onCancel?: () => void;
  allowedTools?: ToolType[];
  maxWidth?: number;
  maxHeight?: number;
}

export interface ToolButtonProps {
  tool: ToolType;
  icon: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export interface FilterPreset {
  name: string;
  params: Partial<ImageEditorState['filters']>;
}

// Constantes
export const FILTER_PRESETS: FilterPreset[] = [
  { name: 'Original', params: {} },
  { name: 'Vibrante', params: { saturation: 30, contrast: 10 } },
  { name: 'Suave', params: { contrast: -10, saturation: -20 } },
  { name: 'Vintage', params: { sepia: true, contrast: 10, saturation: -30 } },
  { name: 'PB', params: { grayscale: true } },
  { name: 'Dramático', params: { contrast: 30, saturation: -20 } },
  { name: 'Frio', params: { hue: -20, saturation: 10 } },
  { name: 'Quente', params: { hue: 20, saturation: 20 } },
];

export const ASPECT_RATIOS = [
  { label: 'Livre', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
];
