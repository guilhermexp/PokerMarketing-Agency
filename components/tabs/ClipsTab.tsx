import React, { useState } from 'react';
import type { VideoClipScript } from '../../types';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { generateImage } from '../../services/geminiService';

interface ClipCardProps {
  clip: VideoClipScript;
}

const ClipCard: React.FC<ClipCardProps> = ({ clip }) => {
  const [generatedThumbnail, setGeneratedThumbnail] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateThumbnail = async () => {
    if (!clip.thumbnail?.image_prompt) return;
    
    setIsGenerating(true);
    setError(null);
    try {
      const fullPrompt = `${clip.thumbnail.image_prompt}. Estilo de thumbnail do YouTube, vibrante, com alto contraste, chamativo. Incluir espaço para texto.`;
      const imageUrl = await generateImage(fullPrompt, '16:9');
      setGeneratedThumbnail(imageUrl);
    } catch (err: any) {
      setError(err.message || 'A geração da thumbnail falhou.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="md:flex md:space-x-6">
        {/* Left side: Script details */}
        <div className="md:w-2/3">
          <h3 className="text-xl font-bold text-text-main mb-2">{clip.title}</h3>
          <div className="flex items-center space-x-4 text-subtle mb-4">
            <div className="flex items-center space-x-1.5">
              <Icon name="clock" className="w-4 h-4" />
              <span>{clip.duration} segundos</span>
            </div>
          </div>
          <div className="prose prose-sm max-w-none text-text-muted whitespace-pre-line">
            <p>{clip.script}</p>
          </div>
        </div>

        {/* Right side: Thumbnail generator */}
        <div className="md:w-1/3 mt-6 md:mt-0 border-t md:border-t-0 md:border-l border-muted/50 pt-6 md:pt-0 md:pl-6">
          <h4 className="font-bold text-text-main mb-3">Gerador de Thumbnail</h4>
          {clip.thumbnail ? (
            <div className="space-y-4">
              {generatedThumbnail ? (
                 <div className="relative aspect-video rounded-lg overflow-hidden group">
                    <img src={generatedThumbnail} alt="Thumbnail gerada" className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-2">
                        <p className="text-white text-lg font-extrabold text-center drop-shadow-lg">{clip.thumbnail.title}</p>
                    </div>
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Button onClick={handleGenerateThumbnail} disabled={isGenerating} size="small" variant="secondary">
                            {isGenerating ? <Loader /> : <Icon name="zap" className="w-4 h-4" />}
                            <span>Regenerar</span>
                        </Button>
                    </div>
                 </div>
              ) : (
                <div className="aspect-video bg-surface/40 rounded-lg flex flex-col items-center justify-center p-4 text-center">
                    <Icon name="image" className="w-10 h-10 text-muted mb-2"/>
                    <p className="text-xs text-text-muted mb-3 italic">"{clip.thumbnail.image_prompt}"</p>
                    <Button onClick={handleGenerateThumbnail} disabled={isGenerating} size="small">
                        {isGenerating ? <Loader /> : <Icon name="zap" className="w-4 h-4" />}
                        <span>Gerar Thumbnail</span>
                    </Button>
                </div>
              )}
               {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
              <div>
                <p className="text-xs text-subtle">Título Sugerido:</p>
                <p className="text-sm font-semibold text-text-main">{clip.thumbnail.title}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Nenhuma sugestão de thumbnail para este clipe.</p>
          )}
        </div>
      </div>
    </Card>
  );
};


export const ClipsTab: React.FC<{ videoClipScripts: VideoClipScript[] }> = ({ videoClipScripts }) => {
  return (
    <div>
      {videoClipScripts.length > 0 ? (
        <div className="space-y-6">
          {videoClipScripts.map((clip, index) => (
            <ClipCard key={index} clip={clip} />
          ))}
        </div>
      ) : (
        <Card className="text-center p-8">
          <p className="text-text-muted">Nenhum roteiro de clipe de vídeo foi gerado ainda.</p>
        </Card>
      )}
    </div>
  );
};