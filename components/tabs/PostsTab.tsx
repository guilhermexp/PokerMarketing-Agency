import React, { useState } from 'react';
import type { Post, BrandProfile, ContentInput } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { Icon } from '../common/Icon';
import { generateImage, editImage, createBrandedImageVariant } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

interface PostsTabProps {
  posts: Post[];
  brandProfile: BrandProfile;
  referenceImage: ContentInput['image'] | null;
}

const PostCard: React.FC<{ post: Post, brandProfile: BrandProfile, referenceImage: ContentInput['image'] | null }> = ({ post, brandProfile, referenceImage }) => {
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPrompt, setCurrentPrompt] = useState<string>(post.image_prompt || '');
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const handleImageAction = async () => {
        setIsGenerating(true);
        setError(null);
        try {
            let imageUrl;
            if (generatedImage) {
                // This is a regeneration, so we edit the existing image
                if (!currentPrompt) return;
                const [header, base64Data] = generatedImage.split(',');
                if (!base64Data) throw new Error("Invalid image data URL.");
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                imageUrl = await editImage(base64Data, mimeType, currentPrompt);
            } else if (referenceImage) {
                 // First generation with a reference image
                 imageUrl = await createBrandedImageVariant(referenceImage, brandProfile, post.content);
            } else {
                // This is the first generation from a text prompt
                if (!currentPrompt) return;
                imageUrl = await generateImage(currentPrompt);
            }
            setGeneratedImage(imageUrl);
        } catch (err: any) {
            setError(err.message || 'A geração da imagem falhou.');
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleImageUpdate = (newImageUrl: string) => {
        setGeneratedImage(newImageUrl);
    };

    const handleShare = () => {
        // The AI generates hashtags without '#', so we add it here for sharing and display.
        const fullContent = `${post.content}\n\n${post.hashtags.map(h => `#${h}`).join(' ')}`;
        
        const platform = post.platform.toLowerCase();

        if (platform.includes('twitter') || platform.includes('x')) {
            const encodedContent = encodeURIComponent(fullContent);
            const shareUrl = `https://twitter.com/intent/tweet?text=${encodedContent}`;
            window.open(shareUrl, '_blank', 'noopener,noreferrer');
        } else {
            // For LinkedIn, Instagram, etc., copy-to-clipboard is the most reliable web-based action.
            navigator.clipboard.writeText(fullContent).then(() => {
                let message = `Conteúdo para ${post.platform} copiado para a área de transferência!`;
                if (platform.includes('linkedin')) {
                    message = 'Conteúdo do post copiado! Abrindo o LinkedIn para você colar.';
                    window.open('https://www.linkedin.com/feed/', '_blank', 'noopener,noreferrer');
                }
                alert(message);
            }).catch(err => {
                console.error('Could not copy text: ', err);
                alert('Falha ao copiar conteúdo para a área de transferência.');
            });
        }
    };
    
    const canGenerateFirstImage = referenceImage || post.image_prompt;

    return (
        <>
            <Card className="flex flex-col overflow-hidden">
            {generatedImage ? (
                <img
                    src={generatedImage}
                    alt="Generated for post"
                    className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setIsPreviewOpen(true)}
                />
            ) : (
                canGenerateFirstImage && (
                    <div className="w-full h-48 bg-surface/40 flex flex-col items-center justify-center p-4 text-center">
                        <Icon name="image" className="w-10 h-10 text-muted mb-2"/>
                        <Button onClick={handleImageAction} disabled={isGenerating} size="small" variant="secondary">
                            {isGenerating ? <Loader /> : <Icon name="zap" className="w-4 h-4" />}
                            <span>Gerar Imagem</span>
                        </Button>
                        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                    </div>
                )
            )}
            <div className="p-5 flex-grow flex flex-col justify-between">
                <div>
                <h4 className="font-bold text-text-main mb-2">Post para {post.platform}</h4>
                <p className="text-text-muted text-sm mb-4 whitespace-pre-line">{post.content}</p>
                </div>

                {generatedImage && (
                <div className="mt-4">
                    <label htmlFor={`prompt-${post.platform}`} className="block text-xs font-medium text-subtle mb-1">
                    Instruções da Imagem (edite para regenerar)
                    </label>
                    <textarea
                    id={`prompt-${post.platform}`}
                    value={currentPrompt}
                    onChange={(e) => setCurrentPrompt(e.target.value)}
                    rows={3}
                    className="w-full bg-background/80 border border-muted/50 rounded-lg p-2 text-sm text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition"
                    placeholder="Descreva as mudanças que você quer na imagem..."
                    />
                    <Button onClick={handleImageAction} disabled={isGenerating || !currentPrompt} size="small" variant="secondary" className="mt-2 w-full">
                    {isGenerating ? <Loader /> : <Icon name="zap" className="w-4 h-4" />}
                    <span>Regenerar Imagem</span>
                    </Button>
                    {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                </div>
                )}
            </div>
            <div className="p-5 bg-surface/60 border-t border-muted/50 flex justify-between items-center gap-4">
                <p className="text-xs text-subtle break-words flex-1">
                    {post.hashtags.map(tag => `#${tag}`).join(' ')}
                </p>
                <Button onClick={handleShare} size="small" variant="secondary" icon="share" className="flex-shrink-0">
                    Compartilhar
                </Button>
            </div>
            </Card>
            {isPreviewOpen && generatedImage && (
                <ImagePreviewModal 
                    imageUrl={generatedImage} 
                    onClose={() => setIsPreviewOpen(false)}
                    onImageUpdate={handleImageUpdate}
                />
            )}
        </>
    )
}

export const PostsTab: React.FC<PostsTabProps> = ({ posts, brandProfile, referenceImage }) => {
  return (
    <div>
      {posts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, index) => (
            <PostCard key={index} post={post} brandProfile={brandProfile} referenceImage={referenceImage} />
          ))}
        </div>
      ) : (
         <Card className="text-center p-8">
            <p className="text-text-muted">Nenhum post para redes sociais foi gerado ainda.</p>
        </Card>
      )}
    </div>
  );
};