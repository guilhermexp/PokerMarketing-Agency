import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { ContentInput } from '../types';
import { Icon } from './common/Icon';
import { Loader } from './common/Loader';
import { Button } from './common/Button';
import { Card } from './common/Card';

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


interface UploadFormProps {
  onGenerate: (input: ContentInput) => void;
  isGenerating: boolean;
}

export const UploadForm: React.FC<UploadFormProps> = ({ onGenerate, isGenerating }) => {
  const [transcript, setTranscript] = useState<string>('');
  const [image, setImage] = useState<{ base64: string, mimeType: string, preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dropzone for the optional image
  const onDropImageFile = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      try {
        const { base64, mimeType } = await toBase64(file);
        setImage({ base64, mimeType, preview: URL.createObjectURL(file) });
      } catch(e) {
        setError('Falha ao processar a imagem.');
      }
    }
  }, []);

  const { getRootProps: getImageRootProps, getInputProps: getImageInputProps, isDragActive: isImageDragActive } = useDropzone({
    onDrop: onDropImageFile,
    accept: { 'image/*': [] },
    multiple: false,
  });

  const handleGenerateClick = () => {
    if (!transcript.trim()) {
      setError('Uma transcrição é necessária para gerar uma campanha.');
      return;
    }
    setError(null);
    onGenerate({
      transcript,
      image: image ? { base64: image.base64, mimeType: image.mimeType } : null,
    });
  };
  
  const canGenerate = transcript.trim().length > 0 && !isGenerating;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-extrabold text-text-main">Gerar uma Nova Campanha</h2>
        <p className="text-lg text-text-muted mt-2 max-w-2xl mx-auto">Comece colando seu conteúdo. O DirectorAi irá transformá-lo em uma campanha de marketing completa com roteiros de vídeo, posts para redes sociais e criativos de anúncio.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Step 1: Provide Content */}
        <Card className="p-8 h-full flex flex-col">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center font-bold">1</div>
            <h3 className="text-xl font-bold text-text-main">Cole Seu Conteúdo</h3>
          </div>
          <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full bg-background/80 border border-muted/50 rounded-lg p-3 text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition flex-grow min-h-[250px]"
              placeholder="Cole a transcrição do seu vídeo, post de blog ou qualquer outro texto aqui..."
          />
        </Card>

        {/* Step 2: Visual Context */}
        <Card className="p-8 h-full flex flex-col">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-primary/20 text-primary w-8 h-8 rounded-full flex items-center justify-center font-bold">2</div>
            <h3 className="text-xl font-bold text-text-main">Adicionar Contexto Visual (Opcional)</h3>
          </div>
          <p className="text-text-muted mb-4 text-sm">Faça o upload de um logo, captura de tela ou imagem de referência para inspirar os visuais.</p>
          <div
            {...getImageRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex flex-col justify-center items-center flex-grow ${isImageDragActive ? 'border-primary bg-primary/10' : 'border-muted/50 hover:border-subtle'}`}
          >
            <input {...getImageInputProps()} />
            {image ? (
              <img src={image.preview} alt="Preview" className="w-24 h-24 mx-auto rounded-md object-cover" onDragStart={(e) => e.preventDefault()} />
            ) : (
              <div className="flex flex-col items-center justify-center text-text-muted">
                <Icon name="image" className="w-8 h-8 mb-2" />
                <p>Arraste a imagem ou clique para enviar</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-8 text-center">
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <Button onClick={handleGenerateClick} disabled={!canGenerate} size="large">
          {isGenerating ? <Loader /> : <Icon name="zap" className="w-5 h-5" />}
          <span>{isGenerating ? 'Gerando Sua Campanha...' : 'Gerar com a IA DirectorAi'}</span>
        </Button>
      </div>
    </div>
  );
};