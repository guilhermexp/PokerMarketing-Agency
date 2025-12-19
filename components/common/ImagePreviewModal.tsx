
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
        <div className="mt-4">
            <label className="block text-xs font-bold text-subtle uppercase tracking-wider mb-2">{title}</label>
            <div
                {...getRootProps()}
                className={`relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-200 h-28 flex flex-col justify-center items-center ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted/40 hover:border-primary/50 hover:bg-surface/30'}`}
            >
                <input {...getInputProps()} />
                {image ? (
                    <>
                        <img src={image.preview} alt="Preview" className="max-h-24 max-w-full rounded-lg object-contain shadow-sm" onDragStart={(e) => e.preventDefault()} />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onImageChange(null);
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                            aria-label="Remove image"
                        >
                            <Icon name="x" className="w-3 h-3" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-text-muted transition-colors group">
                        <Icon name="upload" className="w-6 h-6 mb-2 opacity-50 group-hover:opacity-100" />
                        <p className="text-xs font-medium">Arraste ou clique para adicionar referência</p>
                    </div>
                )}
            </div>
        </div>
    );
};


export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ image, onClose, onImageUpdate, onSetChatReference, downloadFilename }) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<ImageFile | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPayedKey] = useState(true); // Chaves já configuradas no .env

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

  const handleSelectKey = async () => {
      if (window.aistudio?.openSelectKey) {
          await window.aistudio.openSelectKey();
          setHasPayedKey(true);
      }
  };

  const handleEdit = async () => {
    if (!editPrompt.trim()) return;
    
    if (!hasPayedKey) {
        await handleSelectKey();
        return;
    }

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
        if (err.message?.includes("chave de API paga")) {
            setHasPayedKey(false);
        }
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
                    
                    {/* Brush UI indicator (Optional) */}
                    {!isDrawing && !isActionRunning && (
                         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-muted/30 flex items-center gap-3 text-xs text-white/80 pointer-events-none">
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
            <div className="w-full md:w-[320px] flex-shrink-0 bg-[#111111] p-5 flex flex-col border-t md:border-t-0 md:border-l border-white/5 overflow-y-auto">
                <div className="flex-grow">
                    <section className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-xs font-bold text-subtle uppercase tracking-wider">O que deseja alterar?</label>
                            {editPrompt && (
                                <button onClick={() => setEditPrompt('')} className="text-[10px] text-primary hover:underline">Limpar</button>
                            )}
                        </div>
                        <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            rows={5}
                            className="w-full bg-background/50 border border-muted/30 rounded-xl p-4 text-sm text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none shadow-inner placeholder:text-text-muted/40"
                            placeholder="Descreva as mudanças... Ex: 'Substitua o fundo por uma mesa de poker luxuosa' ou 'Mude a cor do letreiro para dourado'."
                        />
                        <div className="mt-2 flex items-start gap-2 text-[11px] text-text-muted leading-tight">
                            <Icon name="zap" className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                            <p>Dica: Pintar a área específica no canvas ajuda a IA a ser mais precisa.</p>
                        </div>
                    </section>
                    
                    <div className="h-px bg-muted/20 my-6"></div>

                    <ImageUploader image={referenceImage} onImageChange={setReferenceImage} title="Referência Visual" />

                    {error && (
                        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 animate-fade-in-up">
                            <Icon name="x" className="w-4 h-4 text-red-400 mt-0.5" />
                            <p className="text-xs text-red-400 font-medium leading-normal">{error}</p>
                        </div>
                    )}
                    
                    {!hasPayedKey && (
                        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon name="zap" className="w-4 h-4 text-yellow-400" />
                                <p className="text-xs font-bold text-yellow-200 uppercase">Upgrade Necessário</p>
                            </div>
                            <p className="text-[11px] text-yellow-100/70 leading-relaxed mb-3">
                                A edição de alta fidelidade utiliza o modelo Gemini 3 Pro e requer uma chave de API de um projeto com faturamento ativo.
                            </p>
                            <button 
                                onClick={handleSelectKey} 
                                className="w-full py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 text-xs font-bold rounded-lg transition-colors border border-yellow-500/40"
                            >
                                Selecionar Chave Paga
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-8 space-y-3 pt-6 border-t border-muted/20">
                    <div className="grid grid-cols-2 gap-3">
                        <Button onClick={clearMask} variant="secondary" className="w-full h-11" size="small" disabled={isActionRunning}>
                            Limpar Pintura
                        </Button>
                        <Button onClick={handleRemoveBackground} variant="secondary" className="w-full h-11" icon="scissors" isLoading={isRemovingBackground} disabled={isActionRunning} size="small">
                            Remover Fundo
                        </Button>
                    </div>
                    
                    <Button 
                        onClick={handleEdit} 
                        disabled={!editPrompt.trim() || isActionRunning} 
                        isLoading={isEditing} 
                        icon="zap" 
                        className="w-full h-12 text-sm" 
                        variant="primary"
                    >
                        {!hasPayedKey ? 'Configurar Chave para Editar' : 'Processar Edição Mágica'}
                    </Button>
                    
                    <button 
                        onClick={onClose} 
                        className="w-full py-2 text-[11px] font-bold text-text-muted hover:text-text-main transition-colors uppercase tracking-widest"
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
