import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { editImage } from '../../services/geminiService';
import { Button } from './Button';
import { Icon } from './Icon';
import { Loader } from './Loader';

interface ImagePreviewModalProps {
  imageUrl: string;
  onClose: () => void;
  onImageUpdate: (newImageUrl: string) => void;
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
            <label className="block text-sm font-medium text-subtle mb-1">{title}</label>
            <div
                {...getRootProps()}
                className={`relative border-2 border-dashed rounded-lg p-2 text-center cursor-pointer transition-colors h-24 flex flex-col justify-center items-center ${isDragActive ? 'border-primary bg-primary/10' : 'border-muted/50 hover:border-subtle'}`}
            >
                <input {...getInputProps()} />
                {image ? (
                    <>
                        <img src={image.preview} alt="Preview" className="max-h-20 max-w-full mx-auto rounded-md object-contain" onDragStart={(e) => e.preventDefault()} />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onImageChange(null);
                            }}
                            className="absolute top-1 right-1 bg-surface/80 rounded-full p-0.5 text-text-muted hover:text-text-main transition-colors"
                            aria-label="Remove image"
                        >
                            <Icon name="x" className="w-4 h-4" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-text-muted text-xs">
                        <Icon name="upload" className="w-5 h-5 mb-1" />
                        <p>Arraste ou clique</p>
                    </div>
                )}
            </div>
        </div>
    );
};


export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, onClose, onImageUpdate, downloadFilename }) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<ImageFile | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawCanvases = useCallback(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = imageUrl;
    image.onload = () => {
        const imageCanvas = imageCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        const container = containerRef.current;
        if (!imageCanvas || !maskCanvas || !container) return;
        
        const { naturalWidth, naturalHeight } = image;
        
        // Set canvas resolution to the original image size
        imageCanvas.width = naturalWidth;
        imageCanvas.height = naturalHeight;
        maskCanvas.width = naturalWidth;
        maskCanvas.height = naturalHeight;

        // Draw the original image onto the image canvas
        const ctx = imageCanvas.getContext('2d');
        ctx?.drawImage(image, 0, 0, naturalWidth, naturalHeight);
    };
  }, [imageUrl]);

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
  
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number, y: number } => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.7)'; // secondary color with alpha
    ctx.lineWidth = 40; // Increased line width for better visibility on scaled images
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
        const [imgHeader, imgBase64] = imageUrl.split(',');
        const imgMimeType = imgHeader.match(/:(.*?);/)?.[1] || 'image/png';

        const maskCanvas = maskCanvasRef.current;
        let maskData: { base64: string, mimeType: string } | undefined = undefined;

        if (maskCanvas) {
            const maskDataUrl = maskCanvas.toDataURL('image/png');
            const [maskHeader, maskBase64] = maskDataUrl.split(',');
            // Check if mask is not empty
            const isMaskEmpty = !maskCanvas.getContext('2d')?.getImageData(0,0,maskCanvas.width, maskCanvas.height).data.some(channel => channel !== 0);
            if (!isMaskEmpty) {
               maskData = { base64: maskBase64, mimeType: 'image/png' };
            }
        }
        
        const refImageData = referenceImage 
            ? { base64: referenceImage.base64, mimeType: referenceImage.mimeType }
            : undefined;

        const newImageUrl = await editImage(imgBase64, imgMimeType, editPrompt, maskData, refImageData);
        
        onImageUpdate(newImageUrl);
        setEditPrompt('');
        onClose();
    } catch (err: any) {
        setError(err.message || 'Falha ao editar a imagem.');
    } finally {
        setIsEditing(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = downloadFilename || 'edited-image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image Display & Masking Canvas */}
        <div ref={containerRef} className="relative flex-1 bg-background flex items-center justify-center p-4 overflow-hidden">
            <div className="relative w-full h-full flex items-center justify-center">
                <canvas ref={imageCanvasRef} className="absolute max-w-full max-h-full object-contain" />
                <canvas
                    ref={maskCanvasRef}
                    className="absolute max-w-full max-h-full object-contain cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                />
            </div>
        </div>
        
        {/* Editing Panel */}
        <div className="md:w-96 flex-shrink-0 bg-surface/80 p-6 flex flex-col border-t md:border-t-0 md:border-l border-muted/50 overflow-y-auto">
           <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-bold text-text-main">Editar Imagem</h3>
             <button onClick={onClose} className="text-subtle hover:text-text-main transition-colors">
                <Icon name="x" className="w-6 h-6" />
             </button>
           </div>
           
           <div className="flex-grow flex flex-col">
                <p className="text-sm text-text-muted mb-3">Pinte na imagem para criar uma máscara e, em seguida, descreva suas alterações.</p>
                <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={4}
                    className="w-full bg-background/80 border border-muted/50 rounded-lg p-3 text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition"
                    placeholder="Ex: 'Adicione um chapéu de sol na área mascarada' ou 'Mude o fundo para azul'."
                />
                
                <ImageUploader image={referenceImage} onImageChange={setReferenceImage} title="Imagem de Referência (Opcional)" />

                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
           </div>

           <div className="mt-6 space-y-2">
                <Button onClick={clearMask} variant="secondary" className="w-full" size="small">
                    Limpar Máscara
                </Button>
                <Button onClick={handleDownload} variant="secondary" className="w-full">
                    <Icon name="download" className="w-5 h-5" />
                    <span>Download</span>
                </Button>
                <Button onClick={handleEdit} disabled={isEditing || !editPrompt.trim()} className="w-full">
                    {isEditing ? <Loader /> : <Icon name="zap" className="w-5 h-5" />}
                    <span>{isEditing ? 'Aplicando Edição...' : 'Gerar Edição'}</span>
                </Button>
           </div>
        </div>
      </div>
    </div>
  );
};