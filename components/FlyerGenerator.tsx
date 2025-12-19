
import React, { useState, useEffect, useCallback } from 'react';
import type { BrandProfile, TournamentEvent, GalleryImage, ImageModel, ImageSize, ImageFile, Post, WeekScheduleInfo, StyleReference } from '../types';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';
import { generateFlyer, generateQuickPostText } from '../services/geminiService';
import { ImagePreviewModal } from './common/ImagePreviewModal';

export type TimePeriod = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'HIGHLIGHTS';
export type Currency = 'USD' | 'BRL';

interface FlyerGeneratorProps {
  brandProfile: BrandProfile;
  events: TournamentEvent[];
  weekScheduleInfo: WeekScheduleInfo | null;
  onFileUpload: (file: File) => Promise<void>;
  onAddEvent: (event: TournamentEvent) => void;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  flyerState: Record<string, (GalleryImage | 'loading')[]>;
  setFlyerState: React.Dispatch<React.SetStateAction<Record<string, (GalleryImage | 'loading')[]>>>;
  dailyFlyerState: Record<TimePeriod, (GalleryImage | 'loading')[]>;
  setDailyFlyerState: React.Dispatch<React.SetStateAction<Record<TimePeriod, (GalleryImage | 'loading')[]>>>;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
  selectedStyleReference?: StyleReference | null;
  onClearSelectedStyleReference?: () => void;
}

const formatCurrencyValue = (val: string, currency: Currency): string => {
    if (!val || val === "0" || val === "") return '---';
    const num = parseFloat(String(val).replace(/[^0-9.-]+/g, "")) || 0;
    if (num === 0) return '---';
    if (currency === 'USD') return `$${num.toLocaleString('en-US')}`;
    return `R$ ${(num * 5).toLocaleString('pt-BR', { minimumFractionDigits: num % 1 !== 0 ? 2 : 0 })}`;
};

const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string, dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType: file.type, dataUrl });
    };
    reader.onerror = error => reject(error);
  });

const handleDownloadFlyer = (src: string, filename: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const QuickPostModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    flyer: GalleryImage;
    brandProfile: BrandProfile;
    context: string;
}> = ({ isOpen, onClose, flyer, brandProfile, context }) => {
    const [post, setPost] = useState<Post | null>(null);
    const [editedContent, setEditedContent] = useState('');
    const [editedHashtags, setEditedHashtags] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (isOpen && !post) handleGenerate();
    }, [isOpen]);

    useEffect(() => {
        if (post) {
            setEditedContent(post.content);
            setEditedHashtags(post.hashtags.map(h => `#${h}`).join(' '));
        }
    }, [post]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const result = await generateQuickPostText(brandProfile, context, flyer.src);
            setPost(result);
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleShare = async () => {
        if (!post) return;
        const text = `${editedContent}\n\n${editedHashtags}`;

        // Tenta usar Web Share API (funciona bem em mobile)
        if (navigator.share && navigator.canShare) {
            try {
                // Converte a imagem base64 para File
                const response = await fetch(flyer.src);
                const blob = await response.blob();
                const file = new File([blob], 'flyer.png', { type: 'image/png' });

                const shareData = {
                    files: [file],
                    title: brandProfile.name,
                    text: text,
                };

                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    return;
                }
            } catch (err) {
                // Se usuário cancelou ou erro, continua para fallback
                if ((err as Error).name === 'AbortError') return;
            }
        }

        // Fallback: copia texto e abre Instagram
        navigator.clipboard.writeText(text).then(() => {
            setIsCopied(true);
            setTimeout(() => {
                window.open('https://www.instagram.com/', '_blank');
                setIsCopied(false);
            }, 1000);
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
            <Card className="w-full max-w-lg border-white/10 bg-[#080808] overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-[#0d0d0d]">
                    <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                            <Icon name="image" className="w-3 h-3 text-primary" />
                        </div>
                        <h3 className="text-[10px] font-black text-white uppercase tracking-wide">QuickPost Forge</h3>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><Icon name="x" className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="w-full max-w-xs mx-auto rounded-xl overflow-hidden border border-white/10 shadow-xl">
                        <img src={flyer.src} className="w-full h-auto object-contain" />
                    </div>
                    {isGenerating ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-3">
                            <Loader className="w-8 h-8" />
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest animate-pulse">Forjando Copy...</p>
                        </div>
                    ) : post ? (
                        <div className="space-y-3 animate-fade-in-up">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Legenda</label>
                                <textarea
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs leading-relaxed text-white/90 resize-none outline-none focus:border-primary/50 transition-colors min-h-[120px]"
                                    placeholder="Escreva sua legenda..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Hashtags</label>
                                <textarea
                                    value={editedHashtags}
                                    onChange={(e) => setEditedHashtags(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs leading-relaxed text-primary resize-none outline-none focus:border-primary/50 transition-colors min-h-[50px]"
                                    placeholder="#hashtag1 #hashtag2..."
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="p-5 border-t border-white/5 bg-[#0d0d0d] flex gap-3">
                    <Button onClick={handleGenerate} variant="secondary" size="small" className="flex-1" icon="zap" disabled={isGenerating}>Refazer</Button>
                    <Button onClick={handleShare} variant="primary" size="small" className="flex-1" icon="share-alt" disabled={isGenerating || !post}>
                        {isCopied ? 'Copiado!' : 'Compartilhar'}
                    </Button>
                </div>
            </Card>
        </div>
    );
};

const ImageCarousel: React.FC<{
    images: (GalleryImage | 'loading')[];
    onEdit: (image: GalleryImage) => void;
    onQuickPost: (image: GalleryImage) => void;
    onPublish: (image: GalleryImage) => void;
    onDownload: (image: GalleryImage) => void;
    onCloneStyle?: (image: GalleryImage) => void;
}> = ({ images, onEdit, onQuickPost, onPublish, onDownload, onCloneStyle }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        // Auto-switch para a imagem mais recente quando ela termina de carregar
        if (images.length > 0 && images[0] !== 'loading' && activeIndex !== 0) {
            setActiveIndex(0);
        }
    }, [images.length, images[0]]);

    const next = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIndex(prev => (prev + 1) % images.length);
    };
    const prev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIndex(prev => (prev - 1 + images.length) % images.length);
    };

    if (images.length === 0) return <div className="text-center opacity-10 flex flex-col items-center"><Icon name="image" className="w-10 h-10 mb-2 text-white" /><p className="text-[9px] font-black uppercase tracking-widest">Awaiting Data</p></div>;

    const currentItem = images[activeIndex];

    return (
        <div className="relative w-full h-full group/carousel">
            {currentItem === 'loading' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10">
                    <Loader className="w-8 h-8 mb-3 text-primary" />
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest animate-pulse">Neural Forge...</p>
                </div>
            ) : (
                <>
                    <img src={currentItem.src} className="w-full h-full object-contain transition-transform duration-700 hover:scale-105 cursor-pointer" onClick={() => onEdit(currentItem)} />
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-1.5 backdrop-blur-sm z-20">
                        <Button size="small" variant="primary" onClick={() => onQuickPost(currentItem)} icon="zap">QuickPost</Button>
                        <Button size="small" onClick={() => onEdit(currentItem)} icon="edit">Editar</Button>
                        <Button size="small" onClick={() => onPublish(currentItem)} icon="users">Campanha</Button>
                        {onCloneStyle && <Button size="small" variant="secondary" onClick={() => onCloneStyle(currentItem)} icon="copy">Modelo</Button>}
                        <Button size="small" variant="secondary" onClick={() => onDownload(currentItem)} icon="download">Download</Button>
                    </div>
                </>
            )}

            {images.length > 1 && (
                <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none z-30 opacity-0 group-hover/carousel:opacity-100 transition-opacity">
                    <button onClick={prev} className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white pointer-events-auto hover:bg-primary hover:text-black transition-all">
                        <Icon name="chevron-up" className="w-4 h-4 -rotate-90" />
                    </button>
                    <button onClick={next} className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white pointer-events-auto hover:bg-primary hover:text-black transition-all">
                        <Icon name="chevron-up" className="w-4 h-4 rotate-90" />
                    </button>
                </div>
            )}

            {images.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10 text-[7px] font-black text-white/60 uppercase tracking-widest z-30">
                    {activeIndex + 1} / {images.length}
                </div>
            )}
        </div>
    );
};

const TournamentEventCard: React.FC<{
    event: TournamentEvent;
    brandProfile: BrandProfile;
    aspectRatio: string;
    currency: Currency;
    language: 'pt' | 'en';
    model: ImageModel;
    imageSize: ImageSize;
    compositionAssets: ImageFile[];
    onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
    onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
    onSetChatReference: (image: GalleryImage | null) => void;
    generatedFlyers: (GalleryImage | 'loading')[];
    setGeneratedFlyers: (updater: (prev: (GalleryImage | 'loading')[]) => (GalleryImage | 'loading')[]) => void;
    collabLogo: string | null;
    onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
}> = ({ event, brandProfile, aspectRatio, currency, language, model, imageSize, compositionAssets, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, generatedFlyers, setGeneratedFlyers, collabLogo, onPublishToCampaign }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
    const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setGeneratedFlyers(prev => ['loading', ...prev]);
        const biVal = formatCurrencyValue(event.buyIn, currency);
        const gtdVal = formatCurrencyValue(event.gtd, currency);
        
        const prompt = `
        TIPO: Flyer de Torneio Individual (single event highlight)

        DADOS DO EVENTO:
        • Torneio: ${event.name}
        • Garantido (GTD): ${gtdVal} ← DESTAQUE MÁXIMO
        • Buy-in: ${biVal}
        • Horário: ${event.times?.['-3']} (GMT-3)

        ESTRUTURA DO LAYOUT:
        1. TOPO: Logo da marca centralizado ou canto superior
        2. CENTRO: Nome do torneio + Valor GTD em GRANDE DESTAQUE
        3. INFERIOR: Horário e buy-in com boa legibilidade

        REGRAS VISUAIS:
        - O GTD (${gtdVal}) deve ocupar pelo menos 30% da área visual
        - Use a cor ${brandProfile.secondaryColor} no valor GTD
        - Fundo escuro/elegante baseado em ${brandProfile.primaryColor}
        - Atmosfera: mesa de poker premium, cassino de luxo
        - Tipografia impactante e moderna para o valor monetário
        `;

        try {
            let logoToUse = brandProfile.logo ? { base64: brandProfile.logo.split(',')[1], mimeType: 'image/png' } : null;
            let collabLogoToUse = collabLogo ? { base64: collabLogo.split(',')[1], mimeType: 'image/png' } : null;
            const assetsToUse = compositionAssets.map(a => ({ base64: a.base64, mimeType: a.mimeType }));
            const imageUrl = await generateFlyer(prompt, brandProfile, logoToUse, null, aspectRatio, model, collabLogoToUse, imageSize, assetsToUse);
            const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer', model, aspectRatio, imageSize });
            setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
        } catch (err) {
            setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden transition-all hover:border-white/10 mb-3">
            <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-left">
                    <div className="md:col-span-2">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-wide">{event.name}</h3>
                        <p className="text-[8px] font-bold text-white/30 uppercase">{event.game} • {event.structure}</p>
                    </div>
                    <div><span className="text-[8px] font-black text-white/20 uppercase block">Time</span><span className="text-[10px] font-black text-white">{event.times?.['-3']}</span></div>
                    <div><span className="text-[8px] font-black text-primary/40 uppercase block">Value</span><span className="text-[10px] font-black text-primary">GTD: {formatCurrencyValue(event.gtd, currency)}</span></div>
                </div>
                <div className="flex items-center space-x-4">
                    <Button size="small" variant="primary" onClick={(e) => { e.stopPropagation(); handleGenerate(); }} isLoading={isGenerating}>Gerar</Button>
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-white/10" />
                </div>
            </div>
            {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t border-white/5 animate-fade-in-up flex justify-center">
                    <div className="w-full max-w-[200px] aspect-[9/16] bg-black/80 rounded-xl overflow-hidden border border-white/5 relative">
                        <ImageCarousel 
                            images={generatedFlyers} 
                            onEdit={setEditingFlyer} 
                            onQuickPost={setQuickPostFlyer} 
                            onPublish={(f) => onPublishToCampaign(`Divulgue o torneio ${event.name}`, f)} 
                            onDownload={(f) => handleDownloadFlyer(f.src, `flyer-${event.id}.png`)} 
                        />
                    </div>
                </div>
            )}
            {editingFlyer && (
                <ImagePreviewModal image={editingFlyer} onClose={() => setEditingFlyer(null)} onImageUpdate={(src) => { onUpdateGalleryImage(editingFlyer.id, src); setGeneratedFlyers(prev => prev.map(f => (f !== 'loading' && f.id === editingFlyer.id ? { ...f, src } : f))); }} onSetChatReference={onSetChatReference} />
            )}
            {quickPostFlyer && (
                <QuickPostModal isOpen={!!quickPostFlyer} onClose={() => setQuickPostFlyer(null)} flyer={quickPostFlyer} brandProfile={brandProfile} context={`Torneio: ${event.name}, ${event.times?.['-3']}, GTD: ${formatCurrencyValue(event.gtd, currency)}`} />
            )}
        </div>
    );
};

const PeriodCard: React.FC<{
    period: TimePeriod;
    label: string;
    events: TournamentEvent[];
    brandProfile: BrandProfile;
    aspectRatio: string;
    currency: Currency;
    model: ImageModel;
    imageSize: ImageSize;
    compositionAssets: ImageFile[];
    language: 'pt' | 'en';
    onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
    onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
    onSetChatReference: (image: GalleryImage | null) => void;
    generatedFlyers: (GalleryImage | 'loading')[];
    setGeneratedFlyers: (updater: (prev: (GalleryImage | 'loading')[]) => (GalleryImage | 'loading')[]) => void;
    triggerBatch: boolean;
    styleReference: GalleryImage | null;
    onCloneStyle: (image: GalleryImage) => void;
    collabLogo: string | null;
    onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
}> = ({ period, label, events, brandProfile, aspectRatio, currency, model, imageSize, compositionAssets, language, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, generatedFlyers, setGeneratedFlyers, triggerBatch, styleReference, onCloneStyle, collabLogo, onPublishToCampaign }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
    const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(null);

    const handleGenerate = useCallback(async (forced: boolean = false) => {
        if (isGenerating || events.length === 0) return;
        if (triggerBatch && !forced && generatedFlyers.length > 0) return;
        setIsGenerating(true);
        setGeneratedFlyers(prev => ['loading', ...prev]);
        
        const eventsList = events.map(e => `- ${e.times?.['-3']} | ${e.name} (GTD: ${formatCurrencyValue(e.gtd, currency)})`).join('\n');
        
        const prompt = `
        TIPO: Grade de Programação / Schedule Board
        TÍTULO: ${label.toUpperCase()}
        QUANTIDADE: ${events.length} torneios

        LISTA DE TORNEIOS (exibir TODOS):
        ${eventsList}

        ESTRUTURA OBRIGATÓRIA DO LAYOUT:
        1. CABEÇALHO:
           - Logo no topo
           - Título "${label}" em destaque abaixo do logo

        2. CORPO - TABELA/GRADE:
           - Cada torneio em uma linha clara e legível
           - Colunas: HORÁRIO | NOME | GTD
           - Os valores GTD devem estar na cor ${brandProfile.secondaryColor}
           - Linhas alternadas ou separadores sutis para facilitar leitura
           - Alinhamento consistente em todas as linhas

        3. HIERARQUIA DE INFORMAÇÃO:
           - Horário: fonte média, fácil identificação
           - Nome do torneio: fonte regular, descrição clara
           - GTD: DESTAQUE MÁXIMO, cor ${brandProfile.secondaryColor}, fonte bold

        REGRAS DE DESIGN:
        - Layout tipo tabela/grade profissional estilo sportsbook
        - Fundo baseado em ${brandProfile.primaryColor}
        - Máxima legibilidade - jogador precisa ler rápido
        - Visual limpo, organizado, sem poluição
        - Espaçamento uniforme entre linhas
        - NÃO use título genérico - use exatamente "${label}"
        `;

        try {
            let logoToUse = brandProfile.logo ? { base64: brandProfile.logo.split(',')[1], mimeType: 'image/png' } : null;
            let collabLogoToUse = collabLogo ? { base64: collabLogo.split(',')[1], mimeType: 'image/png' } : null;
            let refData = styleReference ? { base64: styleReference.src.split(',')[1], mimeType: 'image/png' } : null;
            const assetsToUse = compositionAssets.map(a => ({ base64: a.base64, mimeType: a.mimeType }));
            const imageUrl = await generateFlyer(prompt, brandProfile, logoToUse, refData, aspectRatio, model, collabLogoToUse, imageSize, assetsToUse);
            const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer Diário', model, aspectRatio, imageSize });
            setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
        } catch (err) {
            setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
        } finally {
            setIsGenerating(false);
        }
    }, [isGenerating, events, triggerBatch, generatedFlyers.length, model, brandProfile, aspectRatio, currency, language, styleReference, onAddImageToGallery, setGeneratedFlyers, label, collabLogo, imageSize, compositionAssets]);

    useEffect(() => { if (triggerBatch && events.length > 0) handleGenerate(); }, [triggerBatch, events.length, handleGenerate]);

    return (
        <div className={`bg-[#111111] border rounded-2xl overflow-hidden flex flex-col h-full transition-all hover:border-white/10 ${styleReference ? 'border-primary/30' : 'border-white/5'}`}>
            <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-[#0d0d0d]">
                <div className="text-left flex items-center gap-2">
                    {styleReference && (
                        <div className="w-8 h-8 rounded-md overflow-hidden border border-primary/30 flex-shrink-0">
                            <img src={styleReference.src} className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div>
                        <h4 className="text-[10px] font-black text-white uppercase tracking-wide">{label}</h4>
                        <p className={`text-[8px] uppercase font-bold ${events.length > 0 ? 'text-primary' : 'text-white/20'}`}>{events.length} Torneios</p>
                    </div>
                </div>
                <Button size="small" variant={events.length > 0 ? "primary" : "secondary"} onClick={() => handleGenerate(true)} isLoading={isGenerating} disabled={events.length === 0} icon="zap">Gerar</Button>
            </div>
            <div className="flex-1 p-4 relative min-h-[300px] bg-black/40">
                <ImageCarousel 
                    images={generatedFlyers} 
                    onEdit={setEditingFlyer} 
                    onQuickPost={setQuickPostFlyer} 
                    onPublish={(f) => onPublishToCampaign(`Campanha para grade ${label}`, f)} 
                    onDownload={(f) => handleDownloadFlyer(f.src, `period-${period}.png`)}
                    onCloneStyle={onCloneStyle}
                />
            </div>
            {editingFlyer && <ImagePreviewModal image={editingFlyer} onClose={() => setEditingFlyer(null)} onImageUpdate={(src) => { onUpdateGalleryImage(editingFlyer.id, src); setGeneratedFlyers(prev => prev.map(f => (f !== 'loading' && f.id === editingFlyer.id ? { ...f, src } : f))); }} onSetChatReference={onSetChatReference} />}
            {quickPostFlyer && (
                <QuickPostModal isOpen={!!quickPostFlyer} onClose={() => setQuickPostFlyer(null)} flyer={quickPostFlyer} brandProfile={brandProfile} context={`Sessão: ${label}. Grade:\n${events.map(e => e.name).join(', ')}`} />
            )}
        </div>
    );
};

const ManualEventModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (event: TournamentEvent) => void;
    day: string;
}> = ({ isOpen, onClose, onSave, day }) => {
    const [formData, setFormData] = useState<Partial<TournamentEvent>>({
        day, name: '', game: "Hold'em", gtd: '0', buyIn: '0', times: { '-3': '12:00' }
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
            <Card className="w-full max-w-lg border-white/10 bg-[#080808] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-[#0d0d0d]">
                    <h3 className="text-[10px] font-black text-white uppercase tracking-wide">Manual Entry</h3>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><Icon name="x" className="w-4 h-4" /></button>
                </div>
                <div className="p-5 grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1.5">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Nome do Torneio</label>
                        <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50" placeholder="Ex: BIG BANG PKO" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Horário</label>
                        <input type="time" value={formData.times?.['-3']} onChange={e => setFormData({...formData, times: { '-3': e.target.value }})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Garantido (GTD)</label>
                        <input value={formData.gtd} onChange={e => setFormData({...formData, gtd: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50" placeholder="Ex: 50000" />
                    </div>
                </div>
                <div className="p-5 border-t border-white/5 flex gap-3">
                    <Button onClick={onClose} variant="secondary" size="small" className="flex-1">Cancelar</Button>
                    <Button onClick={() => { onSave({...formData, id: `manual-${Date.now()}`} as any); onClose(); }} variant="primary" size="small" className="flex-1">Salvar</Button>
                </div>
            </Card>
        </div>
    );
};

export const FlyerGenerator: React.FC<FlyerGeneratorProps> = ({
    brandProfile, events, weekScheduleInfo, onFileUpload, onAddEvent, onAddImageToGallery,
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState, onUpdateGalleryImage, onSetChatReference, onPublishToCampaign,
    selectedStyleReference, onClearSelectedStyleReference
}) => {
  const daysMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const currentDayName = daysMap[new Date().getDay()];
  const [selectedDay, setSelectedDay] = useState(currentDayName);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('9:16');
  const [selectedImageSize, setSelectedImageSize] = useState<ImageSize>('1K');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('BRL');
  const [selectedLanguage, setSelectedLanguage] = useState<'pt' | 'en'>('pt');
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');
  const [batchTrigger, setBatchTrigger] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [globalStyleReference, setGlobalStyleReference] = useState<GalleryImage | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [collabLogo, setCollabLogo] = useState<string | null>(null);
  const [manualStyleRef, setManualStyleRef] = useState<string | null>(null);
  const [showIndividualTournaments, setShowIndividualTournaments] = useState(false);

  // Aplicar referência selecionada da galeria
  useEffect(() => {
    if (selectedStyleReference) {
      setGlobalStyleReference({
        id: selectedStyleReference.id,
        src: selectedStyleReference.src,
        prompt: selectedStyleReference.name,
        source: 'Edição',
        model: selectedImageModel
      });
      setManualStyleRef(selectedStyleReference.src);
    }
  }, [selectedStyleReference]);

  // Handler para quando uma imagem é selecionada como modelo (sincroniza UI e estado de geração)
  const handleSetStyleReference = (image: GalleryImage) => {
    setGlobalStyleReference(image);
    setManualStyleRef(image.src);
  };
  const [compositionAssets, setCompositionAssets] = useState<ImageFile[]>([]);

  const dayTranslations: any = { 'MONDAY': 'Segunda-feira', 'TUESDAY': 'Terça-feira', 'WEDNESDAY': 'Quarta-feira', 'THURSDAY': 'Quinta-feira', 'FRIDAY': 'Sexta-feira', 'SATURDAY': 'Sábado', 'SUNDAY': 'Domingo' };
  const dayOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const periodLabels: any = { pt: { ALL: 'Resumo do Dia', MORNING: 'Sessão da Manhã', AFTERNOON: 'Tarde de Grind', NIGHT: 'Sessão da Noite', HIGHLIGHTS: 'Destaques do Dia' }, en: { ALL: 'Full Day Summary', MORNING: 'Morning Session', AFTERNOON: 'Afternoon Grind', NIGHT: 'Night Prime Time', HIGHLIGHTS: 'Daily Highlights' } };

  const getSortValue = (timeStr: string) => {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    const virtualHour = h < 6 ? h + 24 : h;
    return virtualHour * 60 + (m || 0);
  };

  const parseGtd = (gtd: string): number => {
    if (!gtd || gtd === '---') return 0;
    return parseFloat(String(gtd).replace(/[^0-9.-]+/g, '')) || 0;
  };

  const currentEvents = events.filter(e => e.day === selectedDay).sort((a, b) => getSortValue(a.times?.['-3']) - getSortValue(b.times?.['-3']));

  // Estatísticas do dia selecionado
  const dayStats = {
    count: currentEvents.length,
    withGtd: currentEvents.filter(e => parseGtd(e.gtd) > 0).length,
    totalGtd: currentEvents.reduce((sum, e) => sum + parseGtd(e.gtd), 0),
    top3: [...currentEvents].sort((a, b) => parseGtd(b.gtd) - parseGtd(a.gtd)).slice(0, 3)
  };

  // Estatísticas da semana
  const weekStats = {
    totalTournaments: events.length,
    totalGtd: events.reduce((sum, e) => sum + parseGtd(e.gtd), 0),
    byDay: dayOrder.reduce((acc, day) => {
      const dayEvents = events.filter(e => e.day === day);
      acc[day] = {
        count: dayEvents.length,
        gtd: dayEvents.reduce((sum, e) => sum + parseGtd(e.gtd), 0)
      };
      return acc;
    }, {} as Record<string, { count: number; gtd: number }>)
  };

  // Calcular data numérica baseado no período da semana
  const getDayDate = (day: string): string => {
    if (!weekScheduleInfo) return '';
    const [startDay, startMonth] = weekScheduleInfo.startDate.split('/').map(Number);
    const dayIndex = dayOrder.indexOf(day);
    const startDayIndex = dayOrder.indexOf('MONDAY');
    const diff = dayIndex - startDayIndex;
    const date = startDay + diff;
    return `${String(date).padStart(2, '0')}/${String(startMonth).padStart(2, '0')}`;
  };

  const getEventsByPeriod = (period: TimePeriod): TournamentEvent[] => {
    if (period === 'ALL') return currentEvents;
    const morning = currentEvents.filter(e => { const h = (e.times?.['-3'] || '').split(':'); const hour = parseInt(h[0]); return !isNaN(hour) && hour >= 6 && hour < 12; });
    const afternoon = currentEvents.filter(e => { const h = (e.times?.['-3'] || '').split(':'); const hour = parseInt(h[0]); return !isNaN(hour) && hour >= 12 && hour < 18; });
    const night = currentEvents.filter(e => { const h = (e.times?.['-3'] || '').split(':'); const hour = parseInt(h[0]); return !isNaN(hour) && ((hour >= 18 && hour <= 23) || (hour >= 0 && hour < 6)); });
    if (period === 'MORNING') return morning;
    if (period === 'AFTERNOON') return afternoon;
    if (period === 'NIGHT') return night;
    // HIGHLIGHTS: top 3 torneios com maior GTD (não os primeiros por horário)
    if (period === 'HIGHLIGHTS') return [...currentEvents].sort((a, b) => parseGtd(b.gtd) - parseGtd(a.gtd)).slice(0, 3);
    return [];
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-left"><h2 className="text-2xl font-black text-white uppercase tracking-tight">Daily Protocol</h2><p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Agrupamento Inteligente • Ciclo Diário</p></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => setShowIndividualTournaments(!showIndividualTournaments)} variant={showIndividualTournaments ? "primary" : "secondary"} icon={showIndividualTournaments ? "zap" : "calendar"} size="small">{showIndividualTournaments ? 'Grades de Período' : `Torneios Individuais ${currentEvents.length > 0 ? `(${currentEvents.length})` : ''}`}</Button><Button onClick={() => setIsManualModalOpen(true)} variant="secondary" icon="edit" size="small">Add Manual</Button><label className="cursor-pointer group"><div className="bg-white text-black font-black px-4 py-2.5 rounded-xl flex items-center space-x-2 transition-all active:scale-95 text-[10px] tracking-wide uppercase hover:bg-white/90"><Icon name="upload" className="w-3.5 h-3.5" /><span>Upload Spreadsheet</span></div><input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])} /></label></div>
        </div>

        {/* Indicador de referência selecionada */}
        {selectedStyleReference && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/10 border border-primary/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-primary/30 flex-shrink-0">
                <img src={selectedStyleReference.src} className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-wide">Referência Ativa</p>
                <p className="text-[9px] text-white/50">{selectedStyleReference.name}</p>
              </div>
            </div>
            <Button size="small" variant="secondary" onClick={onClearSelectedStyleReference} icon="x">Remover</Button>
          </div>
        )}

        {/* Legenda fixa da semana - só aparece quando tem planilha carregada */}
        {events.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#111111] border border-white/5 rounded-xl">
            <div className="flex items-center gap-4">
              {weekScheduleInfo && (
                <div className="flex items-center gap-1.5">
                  <Icon name="calendar" className="w-3 h-3 text-white/20" />
                  <span className="text-[8px] font-bold text-white/40 uppercase">Semana {weekScheduleInfo.startDate} a {weekScheduleInfo.endDate}</span>
                </div>
              )}
              <div className="h-3 w-px bg-white/10" />
              <span className="text-[8px] font-black text-white/30 uppercase">{weekStats.totalTournaments} torneios</span>
              <div className="h-3 w-px bg-white/10" />
              <span className="text-[8px] font-black text-primary/60 uppercase">GTD Total: {formatCurrencyValue(String(weekStats.totalGtd), selectedCurrency)}</span>
            </div>
          </div>
        )}

        <Card className="p-5 border-white/5 bg-[#111111] space-y-4">
            {/* Linha de controles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="space-y-1.5"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Dia Ativo</label><select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50 appearance-none cursor-pointer">{Object.keys(dayTranslations).map(d => <option key={d} value={d}>{dayTranslations[d]} {weekScheduleInfo ? `(${getDayDate(d)})` : ''}</option>)}</select></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Aspect Ratio</label><select value={selectedAspectRatio} onChange={(e) => setSelectedAspectRatio(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none appearance-none cursor-pointer"><option value="9:16">Vertical (9:16)</option><option value="1:1">Quadrado (1:1)</option><option value="16:9">Widescreen (16:9)</option></select></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Moeda</label><select value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value as Currency)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none appearance-none cursor-pointer"><option value="BRL">Real (R$)</option><option value="USD">Dólar ($)</option></select></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Idioma</label><select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value as 'pt' | 'en')} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none appearance-none cursor-pointer"><option value="pt">Português (BR)</option><option value="en">English (US)</option></select></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Engine IA</label><select value={selectedImageModel} onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none appearance-none cursor-pointer"><option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option><option value="imagen-4.0-generate-001">Imagen 4.0</option></select></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Resolução</label><select value={selectedImageSize} onChange={(e) => setSelectedImageSize(e.target.value as ImageSize)} disabled={selectedImageModel === 'imagen-4.0-generate-001'} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none appearance-none cursor-pointer disabled:opacity-20"><option value="1K">HD (1K)</option><option value="2K">QuadHD (2K)</option><option value="4K">UltraHD (4K)</option></select></div>
              <div className="flex items-end"><Button variant="primary" size="small" className="w-full" onClick={() => { setIsBatchGenerating(true); setDailyFlyerState({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [], HIGHLIGHTS: [] }); setBatchTrigger(true); setTimeout(() => { setBatchTrigger(false); setIsBatchGenerating(false); }, 1500); }} isLoading={isBatchGenerating} icon="zap">Gerar Grade</Button></div>
            </div>

            {/* Estatísticas do dia - integrado */}
            {events.length > 0 && (
              <div className="pt-4 border-t border-white/5 grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Info do dia */}
                <div className="lg:col-span-1 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon name="calendar" className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-wide">{dayTranslations[selectedDay]}</p>
                    {weekScheduleInfo && <p className="text-[9px] font-bold text-white/40">{getDayDate(selectedDay)}</p>}
                  </div>
                </div>

                {/* Stats inline */}
                <div className="lg:col-span-1 flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-sm font-black text-white">{dayStats.count}</p>
                    <p className="text-[8px] text-white/30 uppercase">Torneios</p>
                  </div>
                  <div className="h-6 w-px bg-white/10" />
                  <div className="text-center">
                    <p className="text-sm font-black text-primary">{formatCurrencyValue(String(dayStats.totalGtd), selectedCurrency)}</p>
                    <p className="text-[8px] text-primary/50 uppercase">GTD Total</p>
                  </div>
                </div>

                {/* Top 3 inline */}
                <div className="lg:col-span-3 flex items-center gap-2">
                  <p className="text-[8px] font-black text-white/20 uppercase whitespace-nowrap">Top 3:</p>
                  {dayStats.top3.length > 0 ? dayStats.top3.map((event, idx) => (
                    <div key={event.id} className="flex items-center gap-1.5 px-2 py-1.5 bg-black/40 rounded-lg border border-white/5 flex-1 min-w-0">
                      <span className={`text-[9px] font-black ${idx === 0 ? 'text-primary' : 'text-white/30'}`}>{idx + 1}º</span>
                      <span className="text-[8px] font-bold text-white truncate flex-1">{event.name}</span>
                      <span className={`text-[8px] font-black whitespace-nowrap ${idx === 0 ? 'text-primary' : 'text-white/50'}`}>{formatCurrencyValue(event.gtd, selectedCurrency)}</span>
                    </div>
                  )) : <p className="text-[9px] text-white/20">Sem dados</p>}
                </div>
              </div>
            )}
        </Card>

        {!showIndividualTournaments ? (
            <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 -mt-2">
                    <div className="p-4 bg-[#111111] border border-white/5 rounded-2xl flex items-center space-x-4 text-left"><div className="w-12 h-12 rounded-xl bg-black/50 border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">{collabLogo ? <><img src={collabLogo} className="w-full h-full object-contain p-1" /><button onClick={() => setCollabLogo(null)} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[8px] font-black uppercase">X</button></> : <label className="cursor-pointer w-full h-full flex items-center justify-center"><Icon name="upload" className="w-4 h-4 text-white/10" /><input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { dataUrl } = await fileToBase64(f); setCollabLogo(dataUrl); } }} /></label>}</div><div><h4 className="text-[9px] font-black text-white uppercase tracking-wide">Logo Colab</h4><p className="text-[8px] text-white/20 mt-0.5">Incluso em todos os flyers</p></div></div>
                    <div className="p-4 bg-[#111111] border border-white/5 rounded-2xl flex items-center space-x-4 text-left"><div className="w-12 h-12 rounded-xl bg-black/50 border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">{manualStyleRef ? <><img src={manualStyleRef} className="w-full h-full object-cover" /><button onClick={() => setManualStyleRef(null)} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[8px] font-black uppercase">X</button></> : <label className="cursor-pointer w-full h-full flex items-center justify-center"><Icon name="image" className="w-4 h-4 text-white/10" /><input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { dataUrl } = await fileToBase64(f); setManualStyleRef(dataUrl); setGlobalStyleReference({ id: 'manual-ref', src: dataUrl, prompt: 'Estilo Manual', source: 'Edição', model: selectedImageModel }); } }} /></label>}</div><div><h4 className="text-[9px] font-black text-white uppercase tracking-wide">Referência de Estilo</h4><p className="text-[8px] text-white/20 mt-0.5">Layout Global</p></div></div>
                    <div className="p-4 bg-[#111111] border border-white/5 rounded-2xl flex items-center text-left gap-4"><div className="w-12 h-12 rounded-xl bg-black/50 border border-dashed border-white/10 flex items-center justify-center flex-shrink-0"><label className="cursor-pointer w-full h-full flex items-center justify-center"><Icon name="upload" className="w-4 h-4 text-white/10" /><input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { base64, mimeType, dataUrl } = await fileToBase64(f); setCompositionAssets(prev => [...prev, { base64, mimeType, preview: dataUrl } as any]); } }} /></label></div><div className="flex-1 min-w-0"><h4 className="text-[9px] font-black text-white uppercase tracking-wide">Ativos Adicionais</h4><div className="flex gap-1.5 mt-1.5 overflow-x-auto">{compositionAssets.length > 0 ? compositionAssets.map((asset, idx) => (<div key={idx} className="w-8 h-8 flex-shrink-0 rounded-md bg-black border border-white/10 relative group overflow-hidden"><img src={(asset as any).preview} className="w-full h-full object-cover" /><button onClick={() => setCompositionAssets(prev => prev.filter((_, i) => i !== idx))} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[7px] font-black">X</button></div>)) : <p className="text-[8px] text-white/20">Mockups e pessoas</p>}</div></div></div>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory scrollbar-none">
                    {(['ALL', 'MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'] as TimePeriod[]).map(p => (
                        <div key={p} className="flex-shrink-0 w-[320px] snap-start">
                            <PeriodCard
                                period={p} label={periodLabels[selectedLanguage][p]} events={getEventsByPeriod(p)} brandProfile={brandProfile} aspectRatio={selectedAspectRatio} currency={selectedCurrency} model={selectedImageModel} imageSize={selectedImageSize} language={selectedLanguage}
                                onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} generatedFlyers={dailyFlyerState[p]} setGeneratedFlyers={(u) => setDailyFlyerState(prev => ({...prev, [p]: u(prev[p])}))} triggerBatch={batchTrigger} styleReference={globalStyleReference} onCloneStyle={handleSetStyleReference} collabLogo={collabLogo} compositionAssets={compositionAssets} onPublishToCampaign={onPublishToCampaign}
                            />
                        </div>
                    ))}
                </div>
            </>
        ) : (
            <div className="space-y-2">
                {currentEvents.length > 0 ? currentEvents.map(e => (
                    <TournamentEventCard
                        key={e.id} event={e} brandProfile={brandProfile} aspectRatio={selectedAspectRatio} currency={selectedCurrency} language={selectedLanguage} model={selectedImageModel} imageSize={selectedImageSize}
                        onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference}
                        generatedFlyers={flyerState[e.id] || []} setGeneratedFlyers={(u) => setFlyerState(prev => ({...prev, [e.id]: u(prev[e.id] || [])}))}
                        collabLogo={collabLogo} compositionAssets={compositionAssets} onPublishToCampaign={onPublishToCampaign}
                    />
                )) : <p className="text-white/20 text-xs font-bold uppercase tracking-wide text-center py-12">Nenhum torneio detectado para este dia.</p>}
            </div>
        )}
        <ManualEventModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={(ev) => onAddEvent(ev)} day={selectedDay} />
    </div>
  );
};
