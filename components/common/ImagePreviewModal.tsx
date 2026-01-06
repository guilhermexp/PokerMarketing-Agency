import React, { useState, useEffect, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { editImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
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
  });

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

// Minimal version of ImageUploader for AI Studio
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
  });

  return (
    <div
      {...getRootProps()}
      className={`relative border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
        isDragActive
          ? "border-white/20 bg-white/[0.02]"
          : "border-white/[0.08] hover:border-white/15"
      }`}
    >
      <input {...getInputProps()} />
      {image ? (
        <div className="relative">
          <img
            src={image.preview}
            alt="Ref"
            className="max-h-20 mx-auto rounded-lg"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onImageChange(null);
            }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
          >
            <Icon name="x" className="w-2.5 h-2.5 text-white/60" />
          </button>
        </div>
      ) : (
        <div className="text-white/20">
          <Icon name="upload" className="w-5 h-5 mx-auto mb-1.5" />
          <p className="text-[10px]">Arraste ou clique</p>
        </div>
      )}
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

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if the current item is a video
  const isVideo =
    image.src?.endsWith(".mp4") ||
    image.src?.includes("video") ||
    image.source?.startsWith("Video-");

  const drawCanvases = useCallback(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image.src;
    img.onload = () => {
      const imageCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const container = containerRef.current;
      if (!imageCanvas || !maskCanvas || !container) return;

      const { naturalWidth, naturalHeight } = img;

      imageCanvas.width = naturalWidth;
      imageCanvas.height = naturalHeight;
      maskCanvas.width = naturalWidth;
      maskCanvas.height = naturalHeight;

      const ctx = imageCanvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, naturalWidth, naturalHeight);
    };
  }, [image.src]);

  useEffect(() => {
    drawCanvases();
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

  const handleUseInChat = () => {
    onSetChatReference(image);
    onClose();
  };

  const isActionRunning = isEditing || isRemovingBackground;

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
            <div className="relative flex-1 w-full flex items-center justify-center">
              {isVideo ? (
                <video
                  src={image.src}
                  controls
                  autoPlay
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              ) : (
                <>
                  <canvas
                    ref={imageCanvasRef}
                    className="absolute max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  />
                  <canvas
                    ref={maskCanvasRef}
                    className="absolute max-w-full max-h-full object-contain cursor-crosshair opacity-60 mix-blend-screen rounded-lg"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />

                  {/* Processing Overlay */}
                  {isActionRunning && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 rounded-lg">
                      <Loader className="w-10 h-10 mb-4" />
                      <p className="text-sm font-medium text-white/80">
                        Processando...
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Hint - Below image */}
            {!isVideo && !isActionRunning && (
              <div className="mt-4 flex items-center gap-2 text-white/30">
                <Icon name="edit" className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[10px]">
                  Desenhe para marcar a área desejada, escreva sua alteração e
                  clique em Editar com IA
                </span>
              </div>
            )}
          </div>

          {/* Sidebar - Minimal */}
          <div className="w-full lg:w-[320px] flex-shrink-0 bg-[#0a0a0a] flex flex-col border-t lg:border-t-0 lg:border-l border-white/[0.06]">
            <div className="flex-grow overflow-y-auto p-5 space-y-5">
              {isVideo ? (
                <section className="space-y-3">
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                    Informações
                  </label>
                  <div className="space-y-2 text-xs text-white/60">
                    <p>
                      <span className="text-white/30">Fonte:</span>{" "}
                      {image.source}
                    </p>
                    {image.model && (
                      <p>
                        <span className="text-white/30">Modelo:</span>{" "}
                        {image.model}
                      </p>
                    )}
                  </div>
                </section>
              ) : (
                <>
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                        Edição
                      </label>
                      {editPrompt && (
                        <button
                          onClick={() => setEditPrompt("")}
                          className="text-[9px] text-white/30 hover:text-white/50 transition-colors"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={4}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-sm text-white/80 focus:border-white/10 focus:outline-none transition-all resize-none placeholder:text-white/20"
                      placeholder="Descreva a edição desejada..."
                    />
                  </section>

                  <section className="space-y-3">
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                      Referência
                    </label>
                    <MinimalImageUploader
                      image={referenceImage}
                      onImageChange={setReferenceImage}
                    />
                  </section>
                </>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-[11px] text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Bottom Actions - Minimal */}
            {!isVideo && (
              <div className="p-5 border-t border-white/[0.06] space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={clearMask}
                    disabled={isActionRunning}
                    className="flex-1 h-9 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-[10px] font-medium text-white/40 hover:text-white/60 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
                  >
                    <Icon name="x" className="w-3 h-3" />
                    Limpar
                  </button>
                  <button
                    onClick={handleRemoveBackground}
                    disabled={isActionRunning}
                    className="flex-1 h-9 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-[10px] font-medium text-white/40 hover:text-white/60 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
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
                  className="w-full h-11 bg-primary hover:bg-primary/90 disabled:bg-white/[0.03] disabled:text-white/20 rounded-xl text-xs font-bold text-black disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isEditing ? (
                    <>
                      <Loader className="w-4 h-4" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Icon name="zap" className="w-4 h-4" />
                      Editar com IA
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Mobile Quick Actions */}
            <div className="lg:hidden flex gap-2 p-5 pt-0">
              {onQuickPost && (
                <button
                  onClick={() => {
                    onQuickPost(image);
                    onClose();
                  }}
                  className="flex-1 h-9 bg-primary/10 hover:bg-primary/20 rounded-lg text-[9px] font-semibold text-primary transition-all flex items-center justify-center gap-1"
                >
                  <Icon name="zap" className="w-3 h-3" />
                  Post
                </button>
              )}
              {onSchedulePost && (
                <button
                  onClick={() => {
                    onSchedulePost(image);
                    onClose();
                  }}
                  className="flex-1 h-9 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg text-[9px] font-medium text-white/50 transition-all flex items-center justify-center gap-1"
                >
                  <Icon name="calendar" className="w-3 h-3" />
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
