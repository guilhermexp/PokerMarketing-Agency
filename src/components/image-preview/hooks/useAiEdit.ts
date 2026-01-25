/**
 * useAiEdit Hook
 *
 * Handles AI image editing, background removal, and preview management.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { editImage } from '../../../services/geminiService';
import { uploadImageToBlob } from '../../../services/blobService';
import { resizeBase64Image, urlToBase64 } from '../../../utils/imageHelpers';
import type { EditPreview, MaskRegion, UseAiEditReturn } from '../types';
import type { ImageFile } from '../types.ts';
import type { PendingToolEdit } from '../../../types';

interface UseAiEditProps {
  imageSrc: string;
  getMaskData: () => { base64: string; mimeType: string } | undefined;
  getMaskRegion: () => MaskRegion | undefined;
  clearMask: () => void;
  onImageUpdate: (newImageUrl: string) => void;
  redrawCanvas: () => void;
  setError: (message: string | null) => void;
  // Props for state management (instead of store)
  editPrompt: string;
  setEditPrompt: (prompt: string) => void;
  referenceImage: ImageFile | null;
  setReferenceImage: (image: ImageFile | null) => void;
  resetEditorState: () => void;
  // Tool approval mode props
  pendingToolEdit?: PendingToolEdit | null;
  onToolEditComplete?: (imageUrl: string) => void;
  initialEditPreview?: EditPreview | null;
}

export function useAiEdit({
  imageSrc,
  getMaskData,
  getMaskRegion,
  clearMask,
  onImageUpdate,
  redrawCanvas,
  setError,
  editPrompt,
  setEditPrompt,
  referenceImage,
  setReferenceImage,
  resetEditorState,
  pendingToolEdit,
  onToolEditComplete,
  initialEditPreview,
}: UseAiEditProps): UseAiEditReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [editPreview, setEditPreview] = useState<EditPreview | null>(null);
  const initialPreviewAppliedRef = useRef(false);

  const handleEdit = useCallback(async () => {
    if (!editPrompt.trim()) {
      return;
    }

    setIsEditing(true);
    setError(null);

    try {
      const imageData = await urlToBase64(imageSrc);
      if (!imageData) {
        throw new Error('Falha ao converter imagem para base64.');
      }

      const { base64: imgBase64, mimeType: imgMimeType } = await resizeBase64Image(
        imageData.base64,
        imageData.mimeType,
        1024,
      );

      const maskRegion = getMaskRegion();
      const maskData = getMaskData();

      const refImageData = referenceImage
        ? await resizeBase64Image(referenceImage.base64, referenceImage.mimeType, 1024)
        : undefined;

      const editedImageDataUrl = await editImage(
        imgBase64,
        imgMimeType,
        editPrompt,
        maskData,
        refImageData,
        maskRegion,
      );

      setEditPreview({
        dataUrl: editedImageDataUrl,
        type: 'edit',
        prompt: editPrompt,
      });
      clearMask();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao editar a imagem.');
    } finally {
      setIsEditing(false);
    }
  }, [editPrompt, imageSrc, getMaskRegion, getMaskData, referenceImage, clearMask, setError]);

  const handleRemoveBackground = useCallback(async () => {
    setIsRemovingBackground(true);
    setError(null);

    try {
      const imageData = await urlToBase64(imageSrc);
      if (!imageData) {
        throw new Error('Falha ao converter imagem para base64.');
      }

      const { base64: imgBase64, mimeType: imgMimeType } = await resizeBase64Image(
        imageData.base64,
        imageData.mimeType,
        1024,
      );
      const removeBgPrompt =
        'Remova o fundo desta imagem, deixando-o transparente. Mantenha apenas o objeto principal em primeiro plano.';

      const editedImageDataUrl = await editImage(
        imgBase64,
        imgMimeType,
        removeBgPrompt,
      );

      setEditPreview({
        dataUrl: editedImageDataUrl,
        type: 'removeBg',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao remover o fundo.');
    } finally {
      setIsRemovingBackground(false);
    }
  }, [imageSrc, setError]);

  const handleSaveEdit = useCallback(async () => {
    if (!editPreview) return;

    setIsEditing(true);
    setError(null);

    try {
      let finalImageUrl = editPreview.dataUrl;
      if (editPreview.dataUrl.startsWith('data:')) {
        const [header, base64Data] = editPreview.dataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        try {
          finalImageUrl = await uploadImageToBlob(base64Data, mimeType);
        } catch {
          // Keep data URL if upload fails.
        }
      }

      console.log('💾 [useAiEdit] handleSaveEdit - finalImageUrl:', {
        finalImageUrl,
        urlType: typeof finalImageUrl,
        urlLength: finalImageUrl?.length,
        isHttps: finalImageUrl?.startsWith('https://'),
      });

      console.log('💾 [useAiEdit] Updating image with finalImageUrl:', finalImageUrl);

      // Update the image - this will trigger imageSrc to change
      onImageUpdate(finalImageUrl);

      // Reset editor state immediately
      resetEditorState();

      // Notify tool edit completion
      if (onToolEditComplete) {
        console.log('💾 [useAiEdit] Calling onToolEditComplete with:', finalImageUrl);
        onToolEditComplete(finalImageUrl);
      } else {
        console.warn('💾 [useAiEdit] onToolEditComplete is not defined!');
      }

      // NOTE: editPreview will be cleared automatically by the useEffect below
      // when imageSrc prop changes (which happens when image.src updates in parent)
      console.log('💾 [useAiEdit] Waiting for imageSrc to update and trigger editPreview clear...');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a edição.');
    } finally {
      setIsEditing(false);
    }
  }, [editPreview, onImageUpdate, redrawCanvas, resetEditorState, setError, onToolEditComplete]);

  const handleDiscardEdit = useCallback(() => {
    setEditPreview(null);
    resetEditorState();
  }, [resetEditorState]);

  // Clear edit preview when image source changes (after save)
  const prevImageSrcRef = useRef(imageSrc);
  useEffect(() => {
    if (prevImageSrcRef.current !== imageSrc) {
      console.log('💾 [useAiEdit] imageSrc changed, clearing editPreview', {
        old: prevImageSrcRef.current?.substring(0, 50),
        new: imageSrc?.substring(0, 50),
      });
      setEditPreview(null);
      initialPreviewAppliedRef.current = false;
      prevImageSrcRef.current = imageSrc;

      // Redraw canvas with new image
      setTimeout(() => redrawCanvas(), 100);
    }
  }, [imageSrc, redrawCanvas]);

  useEffect(() => {
    initialPreviewAppliedRef.current = false;
  }, [initialEditPreview?.dataUrl]);

  useEffect(() => {
    if (initialEditPreview && !editPreview && !initialPreviewAppliedRef.current) {
      setEditPreview(initialEditPreview);
      initialPreviewAppliedRef.current = true;
    }
  }, [initialEditPreview, editPreview]);

  // Auto-execute edit for tool approval mode
  useEffect(() => {
    if (initialEditPreview) return;
    if (pendingToolEdit && !editPreview && !isEditing && pendingToolEdit.prompt) {
      console.debug('[useAiEdit] Auto-executing edit for tool approval:', pendingToolEdit);

      // Set prompt from tool call
      setEditPrompt(pendingToolEdit.prompt);

      // Execute edit automatically after prompt is set
      setTimeout(() => {
        handleEdit();
      }, 100);
    }
  }, [pendingToolEdit, editPreview, isEditing, handleEdit, setEditPrompt, initialEditPreview]);

  return {
    editPrompt,
    setEditPrompt,
    referenceImage,
    setReferenceImage,
    isEditing,
    isRemovingBackground,
    editPreview,
    handleEdit,
    handleRemoveBackground,
    handleSaveEdit,
    handleDiscardEdit,
  };
}
