import React, { useState, useEffect, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { editImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
import {
  resizeImageContentAware,
  loadImageData,
  imageDataToBase64,
  createProtectionMaskFromCanvas,
} from "../../services/seamCarvingService";
import {
  detectTextRegions,
  drawTextRegionsOnCanvas,
  mergeNearbyRegions,
} from "../../services/ocrService";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Loader } from "./Loader";
import type { GalleryImage } from "../../types";
import { urlToBase64 } from "../../utils/imageHelpers";

interface ImagePreviewModalProps {
  image: GalleryImage;
  onClose: () => void;
  onImageUpdate: (newImageUrl: string) => void;
  onSetChatReference: (image: GalleryImage) => void;
  downloadFilename?: string;
  // Action props
  onQuickPost?: (image: GalleryImage) => void;
  onPublish?: (image: GalleryImage) => void;
  onCloneStyle?: (image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
}

interface ImageFile {
  base64: string;
  mimeType: string;
  preview: string;
}

const fileToImageFile = (file: File): Promise<ImageFile> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({
        base64,
        mimeType: file.type,
        preview: URL.createObjectURL(file),
      });
    };
    reader.onerror = (error) => reject(error);
  });

// urlToBase64 imported from utils/imageHelpers

const ImageUploader: React.FC<{
  image: ImageFile | null;
  onImageChange: (image: ImageFile | null) => void;
  title: string;
}> = ({ image, onImageChange, title }) => {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        try {
          const file = acceptedFiles[0];
          const imageData = await fileToImageFile(file);
          onImageChange(imageData);
        } catch (e) {
          console.error("Error processing file:", e);
          alert("Falha ao processar a imagem.");
        }
      }
    },
    [onImageChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
  } as any);

  return (
    <div>
      <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3">
        {title}
      </label>
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-300 min-h-[100px] flex flex-col justify-center items-center group ${
          isDragActive
            ? "border-primary/60 bg-primary/10 scale-[1.02]"
            : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]"
        }`}
      >
        <input {...getInputProps()} />
        {image ? (
          <>
            <img
              src={image.preview}
              alt="Preview"
              className="max-h-24 max-w-full rounded-xl object-contain shadow-lg"
              onDragStart={(e) => e.preventDefault()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onImageChange(null);
              }}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-400 transition-all shadow-lg hover:scale-110"
              aria-label="Remove image"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-white/25 group-hover:text-white/50 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3 group-hover:bg-white/10 transition-colors">
              <Icon name="upload" className="w-5 h-5" />
            </div>
            <p className="text-[11px] font-semibold">
              Arraste uma imagem de referência
            </p>
            <p className="text-[10px] text-white/20 mt-1">
              ou clique para selecionar
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Minimal version of ImageUploader for AI Studio - inline compact
const MinimalImageUploader: React.FC<{
  image: ImageFile | null;
  onImageChange: (image: ImageFile | null) => void;
}> = ({ image, onImageChange }) => {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        try {
          const imageData = await fileToImageFile(acceptedFiles[0]);
          onImageChange(imageData);
        } catch (e) {
          console.error("Error processing file:", e);
        }
      }
    },
    [onImageChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
  } as any);

  return (
    <div
      {...getRootProps()}
      className={`inline-flex items-center gap-1.5 px-2 py-1 border border-dashed rounded-md cursor-pointer transition-all ${
        isDragActive
          ? "border-white/20 bg-white/[0.02]"
          : "border-white/[0.08] hover:border-white/15"
      }`}
    >
      <input {...getInputProps()} />
      <Icon name="plus" className="w-3 h-3 text-white/25" />
      <span className="text-[9px] text-white/25">Adicionar</span>
    </div>
  );
};

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  image,
  onClose,
  onImageUpdate,
  onSetChatReference,
  downloadFilename,
  onQuickPost,
  onPublish,
  onCloneStyle,
  onSchedulePost,
}) => {
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<ImageFile | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPayedKey] = useState(true);

  // Resize state
  const [originalDimensions, setOriginalDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [widthPercent, setWidthPercent] = useState(100);
  const [heightPercent, setHeightPercent] = useState(100);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeProgress, setResizeProgress] = useState(0);
  const [resizedPreview, setResizedPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [useProtectionMask, setUseProtectionMask] = useState(false);
  const [isDrawingProtection, setIsDrawingProtection] = useState(false);
  const protectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDetectingText, setIsDetectingText] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [drawMode, setDrawMode] = useState<"brush" | "rectangle">("rectangle");
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [tempCanvas, setTempCanvas] = useState<HTMLCanvasElement | null>(null);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if the current item is a video
  const isVideo =
    image.src?.endsWith(".mp4") ||
    image.src?.includes("video") ||
    image.source?.startsWith("Video-");

  // Video dimensions state for dynamic aspect ratio
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine if video is vertical (like Reels - 9:16)
  const isVerticalVideo = videoDimensions
    ? videoDimensions.height > videoDimensions.width
    : false;

  // Reset video dimensions when image changes
  useEffect(() => {
    setVideoDimensions(null);
  }, [image.src]);

  const drawCanvases = useCallback(() => {
    let isActive = true;

    const loadImage = async () => {
      let imageSrc = image.src;
      let revokeUrl = false;

      if (!imageSrc.startsWith("data:")) {
        const response = await fetch(imageSrc);
        if (!response.ok) {
          throw new Error(`Falha ao carregar imagem (${response.status})`);
        }
        const blob = await response.blob();
        imageSrc = URL.createObjectURL(blob);
        revokeUrl = true;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!isActive) {
          if (revokeUrl) URL.revokeObjectURL(imageSrc);
          return;
        }
        const imageCanvas = imageCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        const protectionCanvas = protectionCanvasRef.current;
        const container = containerRef.current;
        if (!imageCanvas || !maskCanvas || !container) {
          if (revokeUrl) URL.revokeObjectURL(imageSrc);
          return;
        }

        const { naturalWidth, naturalHeight } = img;

        // Store original dimensions
        setOriginalDimensions({ width: naturalWidth, height: naturalHeight });

        imageCanvas.width = naturalWidth;
        imageCanvas.height = naturalHeight;
        maskCanvas.width = naturalWidth;
        maskCanvas.height = naturalHeight;

        // Initialize protection canvas
        if (protectionCanvas) {
          protectionCanvas.width = naturalWidth;
          protectionCanvas.height = naturalHeight;
        }

        const ctx = imageCanvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, naturalWidth, naturalHeight);
        if (revokeUrl) URL.revokeObjectURL(imageSrc);
      };
      img.onerror = () => {
        if (revokeUrl) URL.revokeObjectURL(imageSrc);
      };
      img.src = imageSrc;
    };

    loadImage().catch(() => {});

    return () => {
      isActive = false;
    };
  }, [image.src]);

  useEffect(() => {
    const cleanup = drawCanvases();
    return () => cleanup?.();
  }, [drawCanvases]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const getCoords = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 60;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const stopDrawing = () => {
    const ctx = maskCanvasRef.current?.getContext("2d");
    ctx?.closePath();
    setIsDrawing(false);
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Protection mask drawing functions
  const getProtectionCoords = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = protectionCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startProtectionDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    setIsDrawingProtection(true);
    const { x, y } = getProtectionCoords(e);

    if (drawMode === "rectangle") {
      // Store starting point for rectangle
      setRectStart({ x, y });
      // Save current canvas state
      const canvas = protectionCanvasRef.current;
      if (canvas) {
        const temp = document.createElement("canvas");
        temp.width = canvas.width;
        temp.height = canvas.height;
        const tempCtx = temp.getContext("2d");
        tempCtx?.drawImage(canvas, 0, 0);
        setTempCanvas(temp);
      }
    } else {
      // Brush mode
      const ctx = protectionCanvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const drawProtection = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawingProtection) return;
    const { x, y } = getProtectionCoords(e);
    const canvas = protectionCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    if (drawMode === "rectangle" && rectStart && tempCanvas) {
      // Clear and restore previous state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);

      // Draw preview rectangle
      ctx.fillStyle = "rgba(0, 255, 100, 0.6)";
      const width = x - rectStart.x;
      const height = y - rectStart.y;
      ctx.fillRect(rectStart.x, rectStart.y, width, height);
    } else {
      // Brush mode
      ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(0, 255, 100, 0.6)";
      ctx.lineWidth = 80;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  };

  const stopProtectionDrawing = () => {
    if (drawMode === "rectangle") {
      // Rectangle is already drawn, just clean up
      setRectStart(null);
      setTempCanvas(null);
    } else {
      const ctx = protectionCanvasRef.current?.getContext("2d");
      ctx?.closePath();
    }
    setIsDrawingProtection(false);
  };

  const clearProtectionMask = () => {
    const canvas = protectionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const hasProtectionDrawing = useCallback(() => {
    const canvas = protectionCanvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((channel) => channel !== 0);
  }, []);

  // Auto-detect text using OCR
  const handleAutoDetectText = useCallback(async () => {
    setIsDetectingText(true);
    setDetectProgress(0);
    setUseProtectionMask(true);
    setError(null);

    try {
      // Detect text regions using OCR
      const regions = await detectTextRegions(image.src, (progress) => {
        setDetectProgress(progress);
      });

      console.log(`[OCR] Detected ${regions.length} text regions`);

      // Merge only very close regions (same line of text)
      const mergedRegions = mergeNearbyRegions(regions, 15);
      console.log(`[OCR] Merged into ${mergedRegions.length} regions`);

      // Draw regions on protection canvas with moderate padding
      const canvas = protectionCanvasRef.current;
      if (canvas && mergedRegions.length > 0) {
        drawTextRegionsOnCanvas(canvas, mergedRegions, 20);
        console.log("[OCR] Protection mask created from text regions");
      } else if (mergedRegions.length === 0) {
        setError(
          "Nenhum texto detectado na imagem. Use o modo Manual para pintar.",
        );
      }
    } catch (err: any) {
      console.error("[OCR] Error:", err);
      setError(err.message || "Falha ao detectar texto na imagem");
    } finally {
      setIsDetectingText(false);
      setDetectProgress(0);
    }
  }, [image.src]);

  const handleEdit = async () => {
    console.log(
      "[ImagePreviewModal] handleEdit called with prompt:",
      editPrompt,
    );
    if (!editPrompt.trim()) {
      console.log("[ImagePreviewModal] Empty prompt, returning");
      return;
    }

    setIsEditing(true);
    setError(null);
    try {
      console.log("[ImagePreviewModal] Starting image edit...");
      // Convert image URL (data: or http:) to base64
      console.log("[ImagePreviewModal] Converting image to base64...");
      const imageData = await urlToBase64(image.src);
      if (!imageData) {
        throw new Error("Falha ao converter imagem para base64.");
      }
      const { base64: imgBase64, mimeType: imgMimeType } = imageData;
      console.log(
        "[ImagePreviewModal] Image converted, mimeType:",
        imgMimeType,
      );

      const maskCanvas = maskCanvasRef.current;
      let maskData: { base64: string; mimeType: string } | undefined =
        undefined;

      if (maskCanvas) {
        const ctx = maskCanvas.getContext("2d");
        const data = ctx?.getImageData(
          0,
          0,
          maskCanvas.width,
          maskCanvas.height,
        ).data;
        const hasDrawing = data?.some((channel) => channel !== 0);

        if (hasDrawing) {
          const maskDataUrl = maskCanvas.toDataURL("image/png");
          const [, maskBase64] = maskDataUrl.split(",");
          maskData = { base64: maskBase64, mimeType: "image/png" };
        }
      }

      const refImageData = referenceImage
        ? { base64: referenceImage.base64, mimeType: referenceImage.mimeType }
        : undefined;

      console.log("[ImagePreviewModal] Calling editImage API...", {
        hasMask: !!maskData,
        hasRef: !!refImageData,
      });
      const editedImageDataUrl = await editImage(
        imgBase64,
        imgMimeType,
        editPrompt,
        maskData,
        refImageData,
      );
      console.log(
        "[ImagePreviewModal] editImage returned:",
        editedImageDataUrl?.substring(0, 50),
      );

      // Upload edited image to blob storage for persistence
      let finalImageUrl = editedImageDataUrl;
      if (editedImageDataUrl.startsWith("data:")) {
        const [header, base64Data] = editedImageDataUrl.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
        try {
          finalImageUrl = await uploadImageToBlob(base64Data, mimeType);
          console.log(
            "[ImagePreviewModal] Edited image uploaded to blob:",
            finalImageUrl,
          );
        } catch (uploadErr) {
          console.error(
            "[ImagePreviewModal] Failed to upload edited image:",
            uploadErr,
          );
          // Continue with data URL if upload fails
        }
      }

      onImageUpdate(finalImageUrl);
      setEditPrompt("");
      clearMask();

      // Redraw canvas with the new image
      setTimeout(() => drawCanvases(), 100);
    } catch (err: any) {
      setError(err.message || "Falha ao editar a imagem.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleRemoveBackground = async () => {
    setIsRemovingBackground(true);
    setError(null);
    try {
      // Convert image URL (data: or http:) to base64
      const imageData = await urlToBase64(image.src);
      if (!imageData) {
        throw new Error("Falha ao converter imagem para base64.");
      }
      const { base64: imgBase64, mimeType: imgMimeType } = imageData;
      const removeBgPrompt =
        "Remova o fundo desta imagem, deixando-o transparente. Mantenha apenas o objeto principal em primeiro plano.";
      const editedImageDataUrl = await editImage(
        imgBase64,
        imgMimeType,
        removeBgPrompt,
      );

      // Upload edited image to blob storage for persistence
      let finalImageUrl = editedImageDataUrl;
      if (editedImageDataUrl.startsWith("data:")) {
        const [header, base64Data] = editedImageDataUrl.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
        try {
          finalImageUrl = await uploadImageToBlob(base64Data, mimeType);
          console.log(
            "[ImagePreviewModal] Background removed image uploaded to blob:",
            finalImageUrl,
          );
        } catch (uploadErr) {
          console.error(
            "[ImagePreviewModal] Failed to upload edited image:",
            uploadErr,
          );
        }
      }

      onImageUpdate(finalImageUrl);

      // Redraw canvas with the new image
      setTimeout(() => drawCanvases(), 100);
    } catch (err: any) {
      setError(err.message || "Falha ao remover o fundo.");
    } finally {
      setIsRemovingBackground(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = image.src;
    link.download = downloadFilename || "edited-image.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle seam carving resize - creates preview only, doesn't save
  const handleResize = useCallback(
    async (newWidthPercent: number, newHeightPercent: number) => {
      // Clear any pending resize
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Update state immediately
      setWidthPercent(newWidthPercent);
      setHeightPercent(newHeightPercent);

      // Clear preview if both are 100%
      if (newWidthPercent === 100 && newHeightPercent === 100) {
        setResizedPreview(null);
        return;
      }

      // Validate percentages
      if (
        newWidthPercent < 10 ||
        newWidthPercent > 100 ||
        newHeightPercent < 10 ||
        newHeightPercent > 100
      ) {
        return;
      }

      // Debounce resize operation
      resizeTimeoutRef.current = setTimeout(async () => {
        setIsResizing(true);
        setResizeProgress(0);
        setError(null);

        try {
          // Load image data
          const imageData = await loadImageData(image.src);

          // Calculate target dimensions
          const targetWidth = Math.round(
            (imageData.width * newWidthPercent) / 100,
          );
          const targetHeight = Math.round(
            (imageData.height * newHeightPercent) / 100,
          );

          console.log(
            `[Seam Carving] Resizing from ${imageData.width}x${imageData.height} to ${targetWidth}x${targetHeight}`,
          );

          // Get protection mask if enabled and canvas has drawing
          let protectionMask = undefined;
          if (useProtectionMask && protectionCanvasRef.current) {
            protectionMask = createProtectionMaskFromCanvas(
              protectionCanvasRef.current,
            );
            if (protectionMask) {
              console.log("[Seam Carving] Using protection mask");
            }
          }

          // Perform seam carving with optional protection mask
          const resizedImageData = await resizeImageContentAware(
            imageData,
            targetWidth,
            targetHeight,
            (progress) => setResizeProgress(progress),
            protectionMask || undefined,
          );

          // Convert to data URL for preview (don't upload yet)
          const canvas = document.createElement("canvas");
          canvas.width = resizedImageData.width;
          canvas.height = resizedImageData.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.putImageData(resizedImageData, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");
            setResizedPreview({
              dataUrl,
              width: resizedImageData.width,
              height: resizedImageData.height,
            });
          }

          console.log(
            `[Seam Carving] Preview ready: ${resizedImageData.width}x${resizedImageData.height}`,
          );
        } catch (err: any) {
          console.error("[Seam Carving] Error:", err);
          setError(err.message || "Falha ao redimensionar a imagem.");
        } finally {
          setIsResizing(false);
          setResizeProgress(0);
        }
      }, 500); // 500ms debounce
    },
    [image.src, useProtectionMask],
  );

  // Save the resized image
  const handleSaveResize = useCallback(async () => {
    if (!resizedPreview) return;

    setIsResizing(true);
    setError(null);

    try {
      // Extract base64 from data URL
      const base64 = resizedPreview.dataUrl.split(",")[1];
      const newImageUrl = await uploadImageToBlob(base64, "image/png");

      console.log("[Seam Carving] Resized image saved:", newImageUrl);

      // Update image
      onImageUpdate(newImageUrl);

      // Reset state
      setWidthPercent(100);
      setHeightPercent(100);
      setResizedPreview(null);

      // Redraw canvas with new image
      setTimeout(() => drawCanvases(), 100);
    } catch (err: any) {
      console.error("[Seam Carving] Save error:", err);
      setError(err.message || "Falha ao salvar a imagem.");
    } finally {
      setIsResizing(false);
    }
  }, [resizedPreview, onImageUpdate, drawCanvases]);

  // Discard the resized preview
  const handleDiscardResize = useCallback(() => {
    setResizedPreview(null);
    setWidthPercent(100);
    setHeightPercent(100);
  }, []);

  const handleUseInChat = () => {
    onSetChatReference(image);
    onClose();
  };

  const isActionRunning = isEditing || isRemovingBackground || isResizing;

  return (
    <div
      className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-3 md:p-6"
      onClick={onClose}
    >
      {/* Main Container */}
      <div
        className="bg-[#0a0a0a] rounded-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden border border-white/[0.06] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          {/* Left - Title */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon name="zap" className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-bold text-white/70">AI Studio</span>
          </div>

          {/* Center - Quick Actions */}
          <div className="hidden lg:flex items-center gap-1">
            {onQuickPost && (
              <button
                onClick={() => {
                  onQuickPost(image);
                  onClose();
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 rounded-lg text-primary font-semibold text-[10px] transition-all"
              >
                <Icon name="zap" className="w-3 h-3" />
                QuickPost
              </button>
            )}
            {onSchedulePost && (
              <button
                onClick={() => {
                  onSchedulePost(image);
                  onClose();
                }}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-lg text-white/50 hover:text-white/70 font-medium text-[10px] transition-all"
              >
                <Icon name="calendar" className="w-3 h-3" />
                Agendar
              </button>
            )}
            {onPublish && (
              <button
                onClick={() => {
                  onPublish(image);
                  onClose();
                }}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-lg text-white/50 hover:text-white/70 font-medium text-[10px] transition-all"
              >
                <Icon name="users" className="w-3 h-3" />
                Campanha
              </button>
            )}
          </div>

          {/* Right - Utility */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUseInChat}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white/60 text-[10px] transition-all"
            >
              <Icon name="paperclip" className="w-3 h-3" />
              Chat
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white/60 text-[10px] transition-all"
            >
              <Icon name="download" className="w-3 h-3" />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center hover:bg-white/5 rounded-lg text-white/30 hover:text-white/60 transition-all ml-1"
              aria-label="Fechar"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
          {/* Canvas Area */}
          <div
            ref={containerRef}
            className="relative flex-1 flex flex-col items-center justify-center p-6 lg:p-10 overflow-hidden bg-[#080808]"
          >
            {/* Canvas/Video Container */}
            <div className={`relative flex-1 w-full flex items-center justify-center ${isVerticalVideo ? 'max-w-[400px] mx-auto' : ''}`}>
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={image.src}
                  controls
                  autoPlay
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    setVideoDimensions({
                      width: video.videoWidth,
                      height: video.videoHeight,
                    });
                  }}
                  className={`rounded-lg ${
                    isVerticalVideo
                      ? 'h-full max-h-[calc(95vh-200px)] w-auto'
                      : 'max-w-full max-h-full object-contain'
                  }`}
                />
              ) : resizedPreview ? (
                /* Side-by-side comparison view */
                <div className="flex gap-4 items-center justify-center w-full h-full">
                  {/* Original Image */}
                  <div className="flex flex-col items-center flex-1 max-w-[45%]">
                    <span className="text-[10px] text-white/40 mb-2 uppercase tracking-wider">
                      Original
                    </span>
                    <img
                      src={image.src}
                      alt="Original"
                      className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl border border-white/10"
                    />
                    <span className="text-[9px] text-white/30 mt-2">
                      {originalDimensions.width} × {originalDimensions.height}
                    </span>
                  </div>

                  {/* Arrow */}
                  <div className="flex-shrink-0 text-white/20">
                    <Icon name="arrow-right" className="w-6 h-6" />
                  </div>

                  {/* Resized Image */}
                  <div className="flex flex-col items-center flex-1 max-w-[45%]">
                    <span className="text-[10px] text-primary mb-2 uppercase tracking-wider font-semibold">
                      Redimensionada
                    </span>
                    <img
                      src={resizedPreview.dataUrl}
                      alt="Redimensionada"
                      className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl border border-primary/30"
                    />
                    <span className="text-[9px] text-primary/70 mt-2">
                      {resizedPreview.width} × {resizedPreview.height}
                    </span>
                  </div>
                </div>
              ) : (
                /* Normal canvas view */
                <>
                  <canvas
                    ref={imageCanvasRef}
                    className="absolute max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  />
                  {/* AI Edit Mask Canvas - visible when NOT in protection mode */}
                  <canvas
                    ref={maskCanvasRef}
                    className={`absolute max-w-full max-h-full object-contain cursor-crosshair opacity-60 mix-blend-screen rounded-lg ${
                      useProtectionMask ? "hidden" : ""
                    }`}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {/* Protection Mask Canvas - visible when in protection mode */}
                  <canvas
                    ref={protectionCanvasRef}
                    className={`absolute max-w-full max-h-full object-contain cursor-crosshair opacity-60 rounded-lg ${
                      useProtectionMask ? "" : "hidden"
                    }`}
                    style={{ mixBlendMode: "screen" }}
                    onMouseDown={startProtectionDrawing}
                    onMouseMove={drawProtection}
                    onMouseUp={stopProtectionDrawing}
                    onMouseOut={stopProtectionDrawing}
                    onTouchStart={startProtectionDrawing}
                    onTouchMove={drawProtection}
                    onTouchEnd={stopProtectionDrawing}
                  />

                  {/* Processing Overlay */}
                  {isActionRunning && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 rounded-lg">
                      <Loader className="w-10 h-10 mb-4" />
                      <p className="text-sm font-medium text-white/80">
                        {isResizing
                          ? `Redimensionando... ${resizeProgress}%`
                          : "Processando..."}
                      </p>
                      {isResizing && (
                        <div className="w-48 h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-150"
                            style={{ width: `${resizeProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Hint - Below image */}
            {!isVideo && !isActionRunning && (
              <div className="mt-4 flex items-center gap-2 text-white/30">
                <Icon
                  name={useProtectionMask ? "shield" : "edit"}
                  className="w-3.5 h-3.5 flex-shrink-0"
                />
                <span className="text-[10px]">
                  {useProtectionMask
                    ? drawMode === "rectangle"
                      ? "Clique e arraste para desenhar retângulos sobre textos/logotipos a proteger"
                      : "Pinte livremente sobre textos/logotipos que devem ser protegidos"
                    : "Desenhe para marcar a área desejada, escreva sua alteração e clique em Editar com IA"}
                </span>
              </div>
            )}
          </div>

          {/* Sidebar - Minimal */}
          <div className="w-full lg:w-[280px] flex-shrink-0 bg-[#0a0a0a] flex flex-col border-t lg:border-t-0 lg:border-l border-white/[0.06]">
            <div className="flex-grow overflow-y-auto p-4 space-y-3">
              {isVideo ? (
                <div className="space-y-2 text-[11px] text-white/50">
                  <div className="flex justify-between">
                    <span className="text-white/30">Fonte</span>
                    <span>{image.source}</span>
                  </div>
                  {image.model && (
                    <div className="flex justify-between">
                      <span className="text-white/30">Modelo</span>
                      <span>{image.model}</span>
                    </div>
                  )}
                  {videoDimensions && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-white/30">Dimensões</span>
                        <span>{videoDimensions.width} × {videoDimensions.height}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/30">Proporção</span>
                        <span>{isVerticalVideo ? "9:16" : "16:9"}</span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {/* Resize Section - Compact */}
                  <section className="space-y-3">
                    {/* Header with dimensions */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Redimensionar</span>
                      <span className="text-[10px] text-white/25 tabular-nums">
                        {originalDimensions.width}×{originalDimensions.height}
                      </span>
                    </div>

                    {/* Compact Inputs Row */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.06]">
                        <span className="text-[9px] text-white/30 uppercase">L</span>
                        <input
                          type="number"
                          min={10}
                          max={100}
                          value={widthPercent}
                          onChange={(e) => handleResize(Number(e.target.value), heightPercent)}
                          disabled={isResizing}
                          className="w-full bg-transparent text-[11px] text-white/80 focus:outline-none tabular-nums disabled:opacity-50"
                        />
                        <span className="text-[9px] text-white/20">%</span>
                      </div>
                      <Icon name="x" className="w-2.5 h-2.5 text-white/15 flex-shrink-0" />
                      <div className="flex-1 flex items-center gap-1.5 bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.06]">
                        <span className="text-[9px] text-white/30 uppercase">A</span>
                        <input
                          type="number"
                          min={10}
                          max={100}
                          value={heightPercent}
                          onChange={(e) => handleResize(widthPercent, Number(e.target.value))}
                          disabled={isResizing}
                          className="w-full bg-transparent text-[11px] text-white/80 focus:outline-none tabular-nums disabled:opacity-50"
                        />
                        <span className="text-[9px] text-white/20">%</span>
                      </div>
                    </div>

                    {/* Quick Presets - Horizontal Pills */}
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { label: "4:5", w: 100, h: 80 },
                        { label: "1:1", w: 80, h: 80 },
                        { label: "16:9", w: 100, h: 56 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => handleResize(preset.w, preset.h)}
                          disabled={isResizing}
                          className="px-2.5 py-1 text-[9px] font-medium rounded-md bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60 border border-white/[0.04] transition-all disabled:opacity-40"
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        onClick={() => handleResize(100, 100)}
                        disabled={isResizing || (widthPercent === 100 && heightPercent === 100)}
                        className="px-2.5 py-1 text-[9px] font-medium rounded-md bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60 border border-white/[0.04] transition-all disabled:opacity-40"
                      >
                        Reset
                      </button>
                    </div>

                    {/* Progress Bar */}
                    {isResizing && (
                      <div className="space-y-1">
                        <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/40 transition-all duration-150"
                            style={{ width: `${resizeProgress}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-white/30 tabular-nums">{resizeProgress}%</span>
                      </div>
                    )}

                    {/* Save/Discard Buttons */}
                    {resizedPreview && !isResizing && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleDiscardResize}
                          className="flex-1 h-7 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-md text-[9px] font-medium text-white/40 hover:text-white/60 transition-all"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveResize}
                          className="flex-1 h-7 bg-white hover:bg-white/90 rounded-md text-[9px] font-semibold text-black transition-all"
                        >
                          Aplicar
                        </button>
                      </div>
                    )}
                  </section>

                  {/* Divider */}
                  <div className="h-px bg-white/[0.04]" />

                  {/* Protection Mask - Compact */}
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Proteger áreas</span>
                      {useProtectionMask && hasProtectionDrawing() && (
                        <button
                          onClick={clearProtectionMask}
                          className="text-[9px] text-white/25 hover:text-white/40 transition-colors"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    {/* Tool Buttons - Icon Only */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setUseProtectionMask(true);
                          setDrawMode("rectangle");
                          setResizedPreview(null);
                          setWidthPercent(100);
                          setHeightPercent(100);
                        }}
                        title="Retângulo"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          useProtectionMask && drawMode === "rectangle"
                            ? "bg-white/10 text-white"
                            : "bg-white/[0.03] text-white/30 hover:text-white/50 hover:bg-white/[0.05]"
                        }`}
                      >
                        <Icon name="square" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setUseProtectionMask(true);
                          setDrawMode("brush");
                          setResizedPreview(null);
                          setWidthPercent(100);
                          setHeightPercent(100);
                        }}
                        title="Pincel"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          useProtectionMask && drawMode === "brush"
                            ? "bg-white/10 text-white"
                            : "bg-white/[0.03] text-white/30 hover:text-white/50 hover:bg-white/[0.05]"
                        }`}
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleAutoDetectText}
                        disabled={isDetectingText}
                        title="Detectar texto automaticamente"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          isDetectingText
                            ? "bg-white/10 text-white"
                            : "bg-white/[0.03] text-white/30 hover:text-white/50 hover:bg-white/[0.05]"
                        }`}
                      >
                        {isDetectingText ? (
                          <Loader className="w-3.5 h-3.5" />
                        ) : (
                          <Icon name="eye" className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* OCR Progress */}
                    {isDetectingText && (
                      <div className="space-y-1">
                        <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/40 transition-all duration-150"
                            style={{ width: `${detectProgress}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-white/30">Detectando texto...</span>
                      </div>
                    )}

                    {useProtectionMask && !isDetectingText && (
                      <p className="text-[9px] text-white/25 leading-relaxed">
                        Marque textos e logos para preservá-los durante o redimensionamento.
                      </p>
                    )}
                  </section>

                  {/* Divider */}
                  <div className="h-px bg-white/[0.04]" />

                  {/* AI Edit Section - Compact */}
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Editar com IA</span>
                      {editPrompt && (
                        <button
                          onClick={() => setEditPrompt("")}
                          className="text-[9px] text-white/25 hover:text-white/40 transition-colors"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={2}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white/70 focus:border-white/15 focus:outline-none transition-all resize-none placeholder:text-white/20"
                      placeholder="Descreva a alteração..."
                    />

                    {/* Reference Image - Inline */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-white/30">Ref:</span>
                      {referenceImage ? (
                        <div className="relative">
                          <img
                            src={referenceImage.preview}
                            alt="Ref"
                            className="h-8 w-8 rounded object-cover border border-white/10"
                          />
                          <button
                            onClick={() => setReferenceImage(null)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-black/80 hover:bg-black rounded-full flex items-center justify-center"
                          >
                            <Icon name="x" className="w-2 h-2 text-white/60" />
                          </button>
                        </div>
                      ) : (
                        <MinimalImageUploader
                          image={referenceImage}
                          onImageChange={setReferenceImage}
                        />
                      )}
                    </div>
                  </section>
                </>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-[11px] text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Bottom Actions - Compact */}
            {!isVideo && (
              <div className="p-4 border-t border-white/[0.06] space-y-2">
                <div className="flex gap-1.5">
                  <button
                    onClick={clearMask}
                    disabled={isActionRunning}
                    title="Limpar máscara"
                    className="w-8 h-8 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-white/30 hover:text-white/50 transition-all disabled:opacity-30 flex items-center justify-center"
                  >
                    <Icon name="eraser" className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleRemoveBackground}
                    disabled={isActionRunning}
                    className="flex-1 h-8 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-[10px] font-medium text-white/40 hover:text-white/60 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
                  >
                    {isRemovingBackground ? (
                      <Loader className="w-3 h-3" />
                    ) : (
                      <Icon name="scissors" className="w-3 h-3" />
                    )}
                    Remove BG
                  </button>
                </div>

                <button
                  onClick={handleEdit}
                  disabled={!editPrompt.trim() || isActionRunning}
                  className="w-full h-9 bg-primary hover:bg-primary/90 disabled:bg-white/[0.03] disabled:text-white/20 rounded-lg text-[11px] font-bold text-black disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
                >
                  {isEditing ? (
                    <>
                      <Loader className="w-3.5 h-3.5" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Icon name="wand-2" className="w-3.5 h-3.5" />
                      Aplicar edição
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Mobile Quick Actions */}
            <div className="lg:hidden flex gap-1.5 p-4 pt-0">
              {onQuickPost && (
                <button
                  onClick={() => {
                    onQuickPost(image);
                    onClose();
                  }}
                  className="flex-1 h-7 bg-primary/10 hover:bg-primary/20 rounded-md text-[9px] font-semibold text-primary transition-all flex items-center justify-center gap-1"
                >
                  <Icon name="zap" className="w-2.5 h-2.5" />
                  Post
                </button>
              )}
              {onSchedulePost && (
                <button
                  onClick={() => {
                    onSchedulePost(image);
                    onClose();
                  }}
                  className="flex-1 h-7 bg-white/[0.03] hover:bg-white/[0.06] rounded-md text-[9px] font-medium text-white/40 transition-all flex items-center justify-center gap-1"
                >
                  <Icon name="calendar" className="w-2.5 h-2.5" />
                  Agendar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
