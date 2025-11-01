import React, { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import type { ContentInput, GenerationOptions } from '../types';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { Card } from './common/Card';
import { GenerationOptionsModal } from './GenerationOptionsModal';

interface ImageFile {
  base64: string;
  mimeType: string;
  preview: string;
}

const toBase64 = (file: File): Promise<{ base64: string, mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = error => reject(error);
  });

interface ImageDropzoneProps {
  images: ImageFile[];
  onImagesChange: (images: ImageFile[]) => void;
  title: string;
  description: string;
  maxFiles?: number;
}

const ImageDropzone: React.FC<ImageDropzoneProps> = ({ images, onImagesChange, title, description, maxFiles = 0 }) => {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setError(null);
    if (fileRejections.length > 0) {
        setError(`Limite de ${maxFiles} arquivo(s) excedido.`);
        return;
    }

    try {
        const newImages = await Promise.all(acceptedFiles.map(async (file) => {
            const { base64, mimeType } = await toBase64(file);
            return { base64, mimeType, preview: URL.createObjectURL(file) };
        }));
        onImagesChange([...images, ...newImages]);
    } catch (e) {
        setError('Falha ao processar uma ou mais imagens.');
    }
  }, [images, onImagesChange, maxFiles]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    maxFiles: maxFiles
  });

  const handleRemoveImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };
  
  return (
    <Card className="p-6 h-full flex flex-col">
        <h3 className="text-xl font-bold text-text-main">{title}</h3>
        <p className="text-text-muted mb-4 text-sm">{description}</p>
        <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors flex flex-col justify-center items-center flex-grow min-h-[150px] ${isDragActive ? 'border-primary bg-primary/10' : 'border-muted/50 hover:border-subtle'}`}
        >
            <input {...getInputProps()} />
            {images.length > 0 ? (
                <div className="w-full">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {images.map((img, index) => (
                            <div key={index} className="relative aspect-square">
                                <img src={img.preview} alt={`Preview ${index + 1}`} className="w-full h-full rounded-md object-cover" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(index); }}
                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 leading-none focus:outline-none focus:ring-2 focus:ring-red-400 hover:bg-red-600 transition-colors"
                                    aria-label={`Remover imagem ${index + 1}`}
                                >
                                    <Icon name="x" className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                     {(!maxFiles || images.length < maxFiles) && (
                        <p className="text-xs text-text-muted mt-3">Arraste mais imagens ou clique para adicionar</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center text-text-muted">
                    <Icon name="image" className="w-8 h-8 mb-2" />
                    <p>Arraste imagens ou clique para enviar</p>
                </div>
            )}
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </Card>
  )
}


interface UploadFormProps {
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
}

export const UploadForm: React.FC<UploadFormProps> = ({ onGenerate, isGenerating }) => {
  const [transcript, setTranscript] = useState<string>('');
  const [productImages, setProductImages] = useState<ImageFile[]>([]);
  const [inspirationImages, setInspirationImages] = useState<ImageFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [generationOptions, setGenerationOptions] = useState<GenerationOptions>({
    videoClipScripts: { generate: true, count: 2 },
    posts: {
      linkedin: { generate: true, count: 1 },
      twitter: { generate: true, count: 2 },
      instagram: { generate: true, count: 1 },
      facebook: { generate: true, count: 1 },
    },
    adCreatives: {
      facebook: { generate: true, count: 1 },
      google: { generate: true, count: 1 },
    },
  });
  const [pendingContentInput, setPendingContentInput] = useState<ContentInput | null>(null);

  const handleGenerateClick = () => {
    if (!transcript.trim()) {
      setError('Uma transcrição é necessária para gerar uma campanha.');
      return;
    }
    setError(null);
    const contentInput = {
      transcript,
      productImages: productImages.length > 0 ? productImages.map(img => ({ base64: img.base64, mimeType: img.mimeType })) : null,
      inspirationImages: inspirationImages.length > 0 ? inspirationImages.map(img => ({ base64: img.base64, mimeType: img.mimeType })) : null,
    };
    setPendingContentInput(contentInput);
    setIsOptionsModalOpen(true);
  };
  
  const handleConfirmGeneration = () => {
    if (pendingContentInput) {
      onGenerate(pendingContentInput, generationOptions);
      setIsOptionsModalOpen(false);
      setPendingContentInput(null);
    }
  };
  
  const canGenerate = transcript.trim().length > 0 && !isGenerating;

  return (
    <>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-text-main">Gerar uma Nova Campanha</h2>
          <p className="text-lg text-text-muted mt-2 max-w-3xl mx-auto">Comece com seu conteúdo principal e adicione contexto visual para que a IA crie uma campanha de marketing completa.</p>
        </div>

        <div className="space-y-8">
          {/* Step 1: Provide Content */}
          <Card className="p-8">
              <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center font-bold">1</div>
                  <h3 className="text-xl font-bold text-text-main">Cole Seu Conteúdo Principal</h3>
              </div>
              <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="w-full bg-background/80 border border-muted/50 rounded-lg p-3 text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition min-h-[200px]"
                  placeholder="Cole a transcrição do seu vídeo, post de blog ou qualquer outro texto aqui..."
              />
          </Card>

          {/* Step 2: Visual Context */}
          <div>
              <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center font-bold">2</div>
                  <h3 className="text-xl font-bold text-text-main">Adicionar Contexto Visual</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <ImageDropzone 
                      images={productImages}
                      onImagesChange={setProductImages}
                      title="Seu Produto e Logo"
                      description="Faça o upload de imagens do seu produto (ex: capa do livro) e seu logo. Estes são os elementos principais."
                  />
                  <ImageDropzone 
                      images={inspirationImages}
                      onImagesChange={setInspirationImages}
                      title="Referências Visuais (Opcional)"
                      description="Adicione imagens de inspiração, mood boards ou anúncios que você gosta para guiar o estilo visual."
                  />
              </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          {error && <p className="text-red-400 mb-4">{error}</p>}
          <Button 
            onClick={handleGenerateClick} 
            disabled={!canGenerate} 
            size="large" 
            isLoading={isGenerating} 
            icon="zap"
          >
            {isGenerating ? 'Gerando Sua Campanha...' : 'Gerar com a IA DirectorAi'}
          </Button>
        </div>
      </div>
      <GenerationOptionsModal 
        isOpen={isOptionsModalOpen}
        onClose={() => setIsOptionsModalOpen(false)}
        options={generationOptions}
        setOptions={setGenerationOptions}
        onConfirm={handleConfirmGeneration}
        isGenerating={isGenerating}
      />
    </>
  );
};