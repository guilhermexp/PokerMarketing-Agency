/**
 * Editor Store
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type EditorTool = 'select' | 'crop' | 'brush' | 'text' | 'filters' | null;

export interface EditorState {
  isEditing: boolean;
  activeTool: EditorTool;
  zoom: number;
  rotation: number;
  setEditing: (editing: boolean) => void;
  setTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setRotation: (rotation: number) => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      isEditing: false,
      activeTool: null,
      zoom: 1,
      rotation: 0,
      setEditing: (isEditing) => set({ isEditing }),
      setTool: (activeTool) => set({ activeTool }),
      setZoom: (zoom) => set({ zoom }),
      setRotation: (rotation) => set({ rotation }),
    }),
    { name: 'EditorStore' },
  ),
);
