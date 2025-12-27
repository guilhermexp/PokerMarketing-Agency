
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { editImage } from '../../services/geminiService';
import { Button } from './Button';
import { Icon } from './Icon';
import { Loader } from './Loader';
import type { GalleryImage } from '../../types';

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
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type, preview: URL.createObjectURL(file) });
    };
    reader.onerror = error => reject(error);
  });

const ImageUploader: React.FC<{
    image: ImageFile | null;
    onImageChange: (image: ImageFile | null) => void;
    title: string;
}> = ({ image, onImageChange, title }) => {
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            try {
                const file = acceptedFiles[0];
                const imageData = await fileToImageFile(file);
                onImageChange(imageData);
            } catch (e) {
                console.error("Error processing file:", e);
                alert('Falha ao processar a imagem.');
            }
        }
    }, [onImageChange]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false,
    });

    return (
        <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3">{title}</label>
            <div
                {...getRootProps()}
                className={`relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-300 min-h-[100px] flex flex-col justify-center items-center group ${
                    isDragActive
                        ? 'border-primary/60 bg-primary/10 scale-[1.02]'
                        : 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]'
                }`}
            >
                <input {...getInputProps()} />
                {image ? (
                    <>
                        <img src={image.preview} alt="Preview" className="max-h-24 max-w-full rounded-xl object-contain shadow-lg" onDragStart={(e) => e.preventDefault()} />
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
                        <p className="text-[11px] font-semibold">Arraste uma imagem de referência</p>
                        <p className="text-[10px] text-white/20 mt-1">ou clique para selecionar</p>
                    </div>
                )}
            </div>
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
  onSchedulePost
}) => {
  const [editPrompt, setEditPrompt] = useState('');
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
  const isVideo = image.src?.endsWith('.mp4') ||
                  image.src?.includes('video') ||
                  image.source?.startsWith('Video-');

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

        const ctx = imageCanvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, naturalWidth, naturalHeight);
    };
  }, [image.src]);

  useEffect(() => {
    drawCanvases();
  }, [drawCanvases]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number, y: number } => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 60;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    ctx?.closePath();
    setIsDrawing(false);
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleEdit = async () => {
    if (!editPrompt.trim()) return;

    setIsEditing(true);
    setError(null);
    try {
        const [imgHeader, imgBase64] = image.src.split(',');
        const imgMimeType = imgHeader.match(/:(.*?);/)?.[1] || 'image/png';

        const maskCanvas = maskCanvasRef.current;
        let maskData: { base64: string, mimeType: string } | undefined = undefined;

        if (maskCanvas) {
            const ctx = maskCanvas.getContext('2d');
            const data = ctx?.getImageData(0,0, maskCanvas.width, maskCanvas.height).data;
            const hasDrawing = data?.some(channel => channel !== 0);

            if (hasDrawing) {
               const maskDataUrl = maskCanvas.toDataURL('image/png');
               const [maskHeader, maskBase64] = maskDataUrl.split(',');
               maskData = { base64: maskBase64, mimeType: 'image/png' };
            }
        }

        const refImageData = referenceImage
            ? { base64: referenceImage.base64, mimeType: referenceImage.mimeType }
            : undefined;

        const newImageUrl = await editImage(imgBase64, imgMimeType, editPrompt, maskData, refImageData);

        onImageUpdate(newImageUrl);
        setEditPrompt('');
        clearMask();
    } catch (err: any) {
        setError(err.message || 'Falha ao editar a imagem.');
    } finally {
        setIsEditing(false);
    }
  };

  const handleRemoveBackground = async () => {
    setIsRemovingBackground(true);
    setError(null);
    try {
        const [imgHeader, imgBase64] = image.src.split(',');
        const imgMimeType = imgHeader.match(/:(.*?);/)?.[1] || 'image/png';
        const removeBgPrompt = "Remova o fundo desta imagem, deixando-o transparente. Mantenha apenas o objeto principal em primeiro plano.";
        const newImageUrl = await editImage(imgBase64, imgMimeType, removeBgPrompt);
        onImageUpdate(newImageUrl);
    } catch (err: any) {
        setError(err.message || 'Falha ao remover o fundo.');
    } finally {
        setIsRemovingBackground(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.src;
    link.download = downloadFilename || 'edited-image.png';
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
      className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[60] p-3 md:p-6"
      onClick={onClose}
    >
      {/* Main Container - Much larger */}
      <div
        className="bg-[#080808] rounded-3xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden border border-white/[0.08] relative"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 0 120px rgba(0,0,0,0.8), 0 0 60px rgba(251,146,60,0.05)'
        }}
      >
        {/* Floating Header Bar */}
        <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between">
          {/* Left - Logo/Title */}
          <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl rounded-2xl px-4 py-2.5 border border-white/10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg shadow-primary/30">
              <Icon name="zap" className="w-4 h-4 text-black" />
            </div>
            <div>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">AI Studio</h2>
              <p className="text-[9px] text-white/40 font-medium">Editor de Imagem</p>
            </div>
          </div>

          {/* Center - Quick Actions */}
          <div className="hidden lg:flex items-center gap-1.5 bg-black/60 backdrop-blur-xl rounded-2xl p-1.5 border border-white/10">
            {onQuickPost && (
              <button
                onClick={() => { onQuickPost(image); onClose(); }}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-black font-bold text-[10px] uppercase tracking-wide transition-all"
              >
                <Icon name="zap" className="w-3.5 h-3.5" />
                QuickPost
              </button>
            )}
            {onSchedulePost && (
              <button
                onClick={() => { onSchedulePost(image); onClose(); }}
                className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-xl text-white/70 hover:text-white font-bold text-[10px] uppercase tracking-wide transition-all"
              >
                <Icon name="calendar" className="w-3.5 h-3.5" />
                Agendar
              </button>
            )}
            {onPublish && (
              <button
                onClick={() => { onPublish(image); onClose(); }}
                className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-xl text-white/70 hover:text-white font-bold text-[10px] uppercase tracking-wide transition-all"
              >
                <Icon name="users" className="w-3.5 h-3.5" />
                Campanha
              </button>
            )}
          </div>

          {/* Right - Utility Actions */}
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-xl rounded-2xl p-1.5 border border-white/10">
            <button
              onClick={handleUseInChat}
              className="hidden md:flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white font-medium text-[10px] uppercase tracking-wide transition-all"
            >
              <Icon name="paperclip" className="w-3.5 h-3.5" />
              Assistente
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white font-medium text-[10px] uppercase tracking-wide transition-all"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all"
              aria-label="Fechar"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden pt-20">
          {/* Canvas Area - Hero Section */}
          <div ref={containerRef} className="relative flex-1 flex items-center justify-center p-6 lg:p-12 overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-gradient-radial from-white/[0.02] via-transparent to-transparent pointer-events-none" />

            {/* Grid Pattern Background */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '40px 40px'
              }}
            />

            {/* Canvas/Video Container */}
            <div className="relative w-full h-full flex items-center justify-center">
              {isVideo ? (
                /* Video Player */
                <video
                  src={image.src}
                  controls
                  autoPlay
                  className="max-w-full max-h-full object-contain rounded-lg"
                  style={{
                    boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1)'
                  }}
                />
              ) : (
                /* Image Canvas for editing */
                <>
                  <canvas
                    ref={imageCanvasRef}
                    className="absolute max-w-full max-h-full object-contain rounded-lg"
                    style={{
                      boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1)'
                    }}
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

                  {/* Brush Hint */}
                  {!isDrawing && !isActionRunning && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 flex items-center gap-3 pointer-events-none">
                      <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                        <Icon name="edit" className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-white/80">Modo de Pintura</p>
                        <p className="text-[10px] text-white/40">Desenhe para marcar a área de edição</p>
                      </div>
                    </div>
                  )}

                  {/* Processing Overlay */}
                  {isActionRunning && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center z-20 rounded-lg">
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
                        <Loader className="w-16 h-16 mb-6 relative z-10" />
                      </div>
                      <p className="text-lg font-bold text-white mb-2">Processando...</p>
                      <p className="text-sm text-white/50">A IA está trabalhando na sua edição</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Sidebar - Control Panel */}
          <div className="w-full lg:w-[380px] flex-shrink-0 bg-gradient-to-b from-[#0c0c0c] to-[#080808] flex flex-col border-t lg:border-t-0 lg:border-l border-white/[0.06] overflow-hidden">
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {isVideo ? (
                /* Video Info Section */
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Icon name="video" className="w-3 h-3 text-blue-400" />
                    </div>
                    <label className="text-[11px] font-black text-white/60 uppercase tracking-[0.15em]">Informações do Vídeo</label>
                  </div>
                  <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-4 space-y-3">
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Fonte</p>
                      <p className="text-sm text-white/80 font-medium">{image.source}</p>
                    </div>
                    {image.model && (
                      <div>
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Modelo</p>
                        <p className="text-sm text-white/80 font-medium">{image.model}</p>
                      </div>
                    )}
                    {image.prompt && (
                      <div>
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Prompt</p>
                        <p className="text-xs text-white/60 leading-relaxed">{image.prompt}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-3 px-1 py-2 bg-white/[0.02] rounded-xl">
                    <Icon name="info" className="w-4 h-4 text-blue-400/60 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-white/40 leading-relaxed">
                      <span className="text-white/60 font-semibold">Dica:</span> Use os controles do player para navegar pelo vídeo.
                    </p>
                  </div>
                </section>
              ) : (
                /* Image Editing Section */
                <>
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                          <Icon name="zap" className="w-3 h-3 text-primary" />
                        </div>
                        <label className="text-[11px] font-black text-white/60 uppercase tracking-[0.15em]">Prompt de Edição</label>
                      </div>
                      {editPrompt && (
                        <button
                          onClick={() => setEditPrompt('')}
                          className="text-[10px] font-bold text-primary/70 hover:text-primary transition-colors uppercase tracking-wider"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={5}
                      className="w-full bg-black/40 border border-white/[0.08] rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all resize-none placeholder:text-white/20 leading-relaxed"
                      placeholder="Descreva o que deseja alterar na imagem...

Ex: 'Substitua o fundo por uma mesa de poker luxuosa' ou 'Adicione efeitos de luz neon'"
                    />
                    <div className="flex items-start gap-3 px-1 py-2 bg-white/[0.02] rounded-xl">
                      <Icon name="zap" className="w-4 h-4 text-primary/60 mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-white/40 leading-relaxed">
                        <span className="text-white/60 font-semibold">Dica:</span> Pinte na imagem para indicar áreas específicas. A IA focará nessas regiões.
                      </p>
                    </div>
                  </section>

                  <section>
                    <ImageUploader image={referenceImage} onImageChange={setReferenceImage} title="Referência Visual" />
                  </section>
                </>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 animate-shake">
                  <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon name="alert-circle" className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-red-400 mb-1">Erro na Edição</p>
                    <p className="text-[11px] text-red-400/70 leading-relaxed">{error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="p-6 border-t border-white/[0.06] bg-black/40 space-y-3">
              {!isVideo && (
                <>
                  {/* Secondary Actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={clearMask}
                      disabled={isActionRunning}
                      className="h-11 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[10px] font-bold text-white/50 hover:text-white/80 uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                      Limpar Pintura
                    </button>
                    <button
                      onClick={handleRemoveBackground}
                      disabled={isActionRunning}
                      className="h-11 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[10px] font-bold text-white/50 hover:text-white/80 uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isRemovingBackground ? (
                        <Loader className="w-3.5 h-3.5" />
                      ) : (
                        <Icon name="scissors" className="w-3.5 h-3.5" />
                      )}
                      <span>Remover BG</span>
                    </button>
                  </div>

                  {/* Primary Action */}
                  <button
                    onClick={handleEdit}
                    disabled={!editPrompt.trim() || isActionRunning}
                    className="w-full h-14 bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 disabled:from-white/5 disabled:to-white/5 disabled:text-white/20 rounded-2xl text-sm font-black text-black disabled:cursor-not-allowed uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-lg shadow-primary/20 disabled:shadow-none"
                  >
                    {isEditing ? (
                      <>
                        <Loader className="w-5 h-5" />
                        <span>Processando...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="zap" className="w-5 h-5" />
                        <span>Aplicar Edição Mágica</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {/* Mobile Quick Actions */}
              <div className="lg:hidden grid grid-cols-3 gap-2 pt-2">
                {onQuickPost && (
                  <button
                    onClick={() => { onQuickPost(image); onClose(); }}
                    className="h-10 bg-primary/20 hover:bg-primary/30 rounded-xl text-[9px] font-bold text-primary uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                  >
                    <Icon name="zap" className="w-3 h-3" />
                    Post
                  </button>
                )}
                {onSchedulePost && (
                  <button
                    onClick={() => { onSchedulePost(image); onClose(); }}
                    className="h-10 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-bold text-white/60 uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                  >
                    <Icon name="calendar" className="w-3 h-3" />
                    Agendar
                  </button>
                )}
                {onPublish && (
                  <button
                    onClick={() => { onPublish(image); onClose(); }}
                    className="h-10 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] font-bold text-white/60 uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                  >
                    <Icon name="users" className="w-3 h-3" />
                    Camp.
                  </button>
                )}
              </div>

              {/* Close Link */}
              <button
                onClick={onClose}
                className="w-full py-3 text-[10px] font-bold text-white/20 hover:text-white/40 transition-colors uppercase tracking-[0.2em]"
              >
                Pressione ESC para fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
