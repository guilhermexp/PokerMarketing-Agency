
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
            <label className="block text-[10px] font-black text-white/50 uppercase tracking-[0.15em] mb-2.5">{title}</label>
            <div
                {...getRootProps()}
                className={`relative border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 h-24 flex flex-col justify-center items-center group ${isDragActive ? 'border-primary/60 bg-primary/5' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'}`}
            >
                <input {...getInputProps()} />
                {image ? (
                    <>
                        <img src={image.preview} alt="Preview" className="max-h-20 max-w-full rounded-lg object-contain" onDragStart={(e) => e.preventDefault()} />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onImageChange(null);
                            }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500/90 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                            aria-label="Remove image"
                        >
                            <Icon name="x" className="w-2.5 h-2.5" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-white/30 group-hover:text-white/50 transition-colors">
                        <Icon name="upload" className="w-5 h-5 mb-1.5" />
                        <p className="text-[10px] font-medium">Arraste ou clique para adicionar referência</p>
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
      className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header/Toolbar */}
        <div className="h-14 flex-shrink-0 bg-[#111111] border-b border-white/5 px-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <Icon name="edit" className="w-4 h-4" />
                </div>
                <div>
                    <h2 className="text-xs font-black text-white uppercase tracking-wide">Editor</h2>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Action buttons */}
                {onQuickPost && (
                    <Button onClick={() => { onQuickPost(image); onClose(); }} variant="primary" size="small" icon="zap">
                        QuickPost
                    </Button>
                )}
                {onSchedulePost && (
                    <Button onClick={() => { onSchedulePost(image); onClose(); }} variant="secondary" size="small" icon="calendar">
                        Agendar
                    </Button>
                )}
                {onPublish && (
                    <Button onClick={() => { onPublish(image); onClose(); }} variant="secondary" size="small" icon="users">
                        Campanha
                    </Button>
                )}
                {onCloneStyle && (
                    <Button onClick={() => { onCloneStyle(image); onClose(); }} variant="secondary" size="small" icon="copy">
                        Modelo
                    </Button>
                )}
                <div className="w-px h-6 bg-white/10 mx-1" />
                <Button onClick={handleUseInChat} variant="secondary" size="small" icon="paperclip" className="hidden md:flex">
                    Assistente
                </Button>
                <Button onClick={handleDownload} variant="secondary" size="small" icon="download">
                    Download
                </Button>
                <button
                    onClick={onClose}
                    className="ml-2 p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                    aria-label="Fechar"
                >
                    <Icon name="x" className="w-4 h-4" />
                </button>
            </div>
        </div>

        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
            {/* Main Canvas Area */}
            <div ref={containerRef} className="relative flex-1 bg-black/40 flex items-center justify-center p-4 sm:p-8 overflow-hidden">
                <div className="relative w-full h-full flex items-center justify-center">
                    <canvas ref={imageCanvasRef} className="absolute max-w-full max-h-full object-contain shadow-2xl rounded-sm" />
                    <canvas
                        ref={maskCanvasRef}
                        className="absolute max-w-full max-h-full object-contain cursor-crosshair opacity-50 mix-blend-screen"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseOut={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />

                    {/* Brush UI indicator */}
                    {!isDrawing && !isActionRunning && (
                         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 flex items-center gap-3 text-xs text-white/80 pointer-events-none">
                            <Icon name="edit" className="w-4 h-4" />
                            <span>Pinte na imagem para marcar a área de edição</span>
                        </div>
                    )}

                    {isActionRunning && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-20">
                            <Loader className="w-12 h-12 mb-4" />
                            <p className="text-white font-bold animate-pulse">Processando design...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Control Sidebar */}
            <div className="w-full md:w-[320px] flex-shrink-0 bg-gradient-to-b from-[#111111] to-[#0d0d0d] p-5 flex flex-col border-t md:border-t-0 md:border-l border-white/5 overflow-y-auto">
                <div className="flex-grow space-y-5">
                    {/* Prompt Section */}
                    <section>
                        <div className="flex items-center justify-between mb-2.5">
                            <label className="text-[10px] font-black text-white/50 uppercase tracking-[0.15em]">O que deseja alterar?</label>
                            {editPrompt && (
                                <button onClick={() => setEditPrompt('')} className="text-[9px] font-bold text-primary/70 hover:text-primary transition-colors uppercase tracking-wider">Limpar</button>
                            )}
                        </div>
                        <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            rows={4}
                            className="w-full bg-black/60 border border-white/10 rounded-xl p-3.5 text-sm text-white focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all resize-none placeholder:text-white/25 leading-relaxed"
                            placeholder="Descreva as mudanças... Ex: 'Substitua o fundo por uma mesa de poker luxuosa' ou 'Mude a cor do letreiro para dourado'."
                        />
                        <div className="mt-2.5 flex items-start gap-2 px-1">
                            <Icon name="zap" className="w-3 h-3 text-primary/70 mt-0.5 flex-shrink-0" />
                            <p className="text-[10px] text-white/35 leading-relaxed">Dica: Pintar a área específica no canvas ajuda a IA a ser mais precisa.</p>
                        </div>
                    </section>

                    {/* Reference Section */}
                    <section>
                        <ImageUploader image={referenceImage} onImageChange={setReferenceImage} title="Referência Visual" />
                    </section>

                    {error && (
                        <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-2.5">
                            <Icon name="x" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-400/90 font-medium leading-relaxed">{error}</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="mt-6 space-y-2.5 pt-5 border-t border-white/5">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={clearMask}
                            disabled={isActionRunning}
                            className="h-10 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-white/50 hover:text-white/80 uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Limpar Pintura
                        </button>
                        <button
                            onClick={handleRemoveBackground}
                            disabled={isActionRunning}
                            className="h-10 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-white/50 hover:text-white/80 uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                            {isRemovingBackground ? <Loader className="w-3.5 h-3.5" /> : <Icon name="scissors" className="w-3.5 h-3.5" />}
                            <span>Remover Fundo</span>
                        </button>
                    </div>

                    <button
                        onClick={handleEdit}
                        disabled={!editPrompt.trim() || isActionRunning}
                        className="w-full h-11 bg-primary hover:bg-primary/90 disabled:bg-white/5 disabled:text-white/20 rounded-xl text-xs font-black text-black disabled:cursor-not-allowed uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                    >
                        {isEditing ? (
                            <Loader className="w-4 h-4" />
                        ) : (
                            <>
                                <Icon name="zap" className="w-4 h-4" />
                                <span>Processar Edição Mágica</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full py-2.5 text-[10px] font-bold text-white/25 hover:text-white/50 transition-colors uppercase tracking-[0.2em]"
                    >
                        Cancelar e Voltar
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
