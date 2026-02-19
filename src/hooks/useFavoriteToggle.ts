import { useCallback } from "react";
import type { GalleryImage, StyleReference } from "../types";

interface UseFavoriteToggleOptions {
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
}

export function useFavoriteToggle({
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
}: UseFavoriteToggleOptions) {
  const isFavorite = useCallback(
    (img: GalleryImage) =>
      styleReferences?.some((ref) => ref.src === img.src) || false,
    [styleReferences],
  );

  const toggleFavorite = useCallback(
    (img: GalleryImage) => {
      if (!onAddStyleReference || !onRemoveStyleReference) return;

      const existingRef = styleReferences?.find((ref) => ref.src === img.src);
      if (existingRef) {
        onRemoveStyleReference(existingRef.id);
      } else {
        onAddStyleReference({
          src: img.src,
          name:
            img.prompt.substring(0, 50) ||
            `Favorito ${new Date().toLocaleDateString("pt-BR")}`,
        });
      }
    },
    [styleReferences, onAddStyleReference, onRemoveStyleReference],
  );

  return { isFavorite, toggleFavorite };
}
