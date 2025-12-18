
import React, { useState, useEffect, useCallback } from 'react';
import type { BrandProfile, TournamentEvent, GalleryImage, ImageModel, ImageSize, ImageFile, Post } from '../types';
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
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (isOpen && !post) handleGenerate();
    }, [isOpen]);

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

    const handleCopyAndOpen = () => {
        if (!post) return;
        const text = `${post.content}\n\n${post.hashtags.map(h => `#${h}`).join(' ')}`;
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
            <Card className="w-full max-w-lg border-white/10 bg-[#080808] overflow-hidden flex flex-col h-[80vh]">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Icon name="image" className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">QuickPost Forge</h3>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><Icon name="x" className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    <div className="aspect-square w-48 mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                        <img src={flyer.src} className="w-full h-full object-contain" />
                    </div>
                    {isGenerating ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader className="w-10 h-10" />
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] animate-pulse">Forjando Copy...</p>
                        </div>
                    ) : post ? (
                        <div className="space-y-6 animate-fade-in-up">
                            <div className="bg-black/40 border border-white/5 rounded-2xl p-6 font-medium text-xs leading-relaxed text-white/80 whitespace-pre-wrap selection:bg-primary selection:text-black">
                                {post.content}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {post.hashtags.map(h => <span key={h} className="text-primary font-bold">#{h}</span>)}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="p-8 border-t border-white/5 bg-white/[0.02] flex gap-4">
                    <Button onClick={handleGenerate} variant="secondary" className="flex-1" icon="zap" disabled={isGenerating}>Refazer</Button>
                    <Button onClick={handleCopyAndOpen} variant="primary" className="flex-1 shadow-2xl" icon="share-alt" disabled={isGenerating || !post}>
                        {isCopied ? 'Copiado!' : 'Copiar & Instagram'}
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

    if (images.length === 0) return <div className="text-center opacity-10 flex flex-col items-center"><Icon name="image" className="w-14 h-14 mb-4 text-white" /><p className="text-[10px] font-black uppercase tracking-[0.6em]">Awaiting Data</p></div>;

    const currentItem = images[activeIndex];

    return (
        <div className="relative w-full h-full group/carousel">
            {currentItem === 'loading' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10">
                    <Loader className="w-10 h-10 mb-4 text-primary" />
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em] animate-pulse">Neural Forge...</p>
                </div>
            ) : (
                <>
                    <img src={currentItem.src} className="w-full h-full object-contain transition-transform duration-700 hover:scale-105 cursor-pointer" onClick={() => onEdit(currentItem)} />
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2 backdrop-blur-sm z-20">
                        <Button size="small" variant="primary" onClick={() => onQuickPost(currentItem)} icon="zap">QuickPost</Button>
                        <Button size="small" onClick={() => onEdit(currentItem)} icon="edit">Editar</Button>
                        <Button size="small" onClick={() => onPublish(currentItem)} icon="users">Campanha</Button>
                        {onCloneStyle && <Button size="small" variant="secondary" onClick={() => onCloneStyle(currentItem)} icon="copy">Modelo</Button>}
                        <Button size="small" variant="secondary" onClick={() => onDownload(currentItem)} icon="download">Download</Button>
                    </div>
                </>
            )}

            {images.length > 1 && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none z-30 opacity-0 group-hover/carousel:opacity-100 transition-opacity">
                    <button onClick={prev} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white pointer-events-auto hover:bg-primary hover:text-black transition-all">
                        <Icon name="chevron-up" className="w-5 h-5 -rotate-90" />
                    </button>
                    <button onClick={next} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white pointer-events-auto hover:bg-primary hover:text-black transition-all">
                        <Icon name="chevron-up" className="w-5 h-5 rotate-90" />
                    </button>
                </div>
            )}
            
            {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[8px] font-black text-white/60 uppercase tracking-widest z-30">
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
        FLYER DE TORNEIO INDIVIDUAL.
        NOME DO EVENTO: ${event.name}.
        DADOS OBRIGATÓRIOS (EXIBIR EM DESTAQUE): 
        - GARANTIDO (GTD): ${gtdVal} (ESTE VALOR DEVE SER O ELEMENTO VISUAL CENTRAL)
        - BUY-IN: ${biVal}
        - HORÁRIO: ${event.times?.['-3']} GMT-3
        
        ESTILO: ${brandProfile.toneOfVoice}, Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}.
        `;

        try {
            let logoToUse = brandProfile.logo ? { base64: brandProfile.logo.split(',')[1], mimeType: 'image/png' } : null;
            let collabLogoToUse = collabLogo ? { base64: collabLogo.split(',')[1], mimeType: 'image/png' } : null;
            const assetsToUse = compositionAssets.map(a => ({ base64: a.base64, mimeType: a.mimeType }));
            const imageUrl = await generateFlyer(prompt, brandProfile, logoToUse, null, aspectRatio, model, collabLogoToUse, imageSize, assetsToUse);
            const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer', model });
            setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
        } catch (err) {
            setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-[#0A0A0A] border border-white/5 rounded-3xl overflow-hidden transition-all hover:border-white/10 shadow-lg mb-4">
            <div className="p-6 flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 items-center text-left">
                    <div className="md:col-span-2">
                        <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">{event.name}</h3>
                        <p className="text-[9px] font-bold text-white/30 uppercase mt-1">{event.game} • {event.structure}</p>
                    </div>
                    <div><span className="text-[8px] font-black text-white/20 uppercase block">Time</span><span className="text-[12px] font-black text-white">{event.times?.['-3']}</span></div>
                    <div><span className="text-[8px] font-black text-primary/40 uppercase block">Value</span><span className="text-[12px] font-black text-primary">GTD: {formatCurrencyValue(event.gtd, currency)}</span></div>
                </div>
                <div className="flex items-center space-x-6">
                    <Button size="small" variant="primary" onClick={(e) => { e.stopPropagation(); handleGenerate(); }} isLoading={isGenerating}>Gerar</Button>
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-white/10" />
                </div>
            </div>
            {isExpanded && (
                <div className="px-6 pb-8 pt-4 border-t border-white/5 animate-fade-in-up flex justify-center">
                    <div className="w-full max-w-lg aspect-[9/16] bg-black/80 rounded-2xl overflow-hidden border border-white/5 shadow-2xl relative">
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
        RESUMO DE SESSÃO: ${label}.
        DADOS OBRIGATÓRIOS (EXIBIR TODOS OS TORNEIOS ABAIXO):
        ${eventsList}
        
        MISSÃO DE DESIGN: 
        1. Crie uma grade ou tabela limpa.
        2. OS VALORES DE GARANTIDO (GTD) DEVEM ESTAR MUITO VISÍVEIS EM CADA LINHA.
        3. Identidade: ${brandProfile.toneOfVoice}, Cores: ${brandProfile.primaryColor}.
        `;

        try {
            let logoToUse = brandProfile.logo ? { base64: brandProfile.logo.split(',')[1], mimeType: 'image/png' } : null;
            let collabLogoToUse = collabLogo ? { base64: collabLogo.split(',')[1], mimeType: 'image/png' } : null;
            let refData = styleReference ? { base64: styleReference.src.split(',')[1], mimeType: 'image/png' } : null;
            const assetsToUse = compositionAssets.map(a => ({ base64: a.base64, mimeType: a.mimeType }));
            const imageUrl = await generateFlyer(prompt, brandProfile, logoToUse, refData, aspectRatio, model, collabLogoToUse, imageSize, assetsToUse);
            const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer Diário', model });
            setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
        } catch (err) {
            setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
        } finally {
            setIsGenerating(false);
        }
    }, [isGenerating, events, triggerBatch, generatedFlyers.length, model, brandProfile, aspectRatio, currency, language, styleReference, onAddImageToGallery, setGeneratedFlyers, label, collabLogo, imageSize, compositionAssets]);

    useEffect(() => { if (triggerBatch && events.length > 0) handleGenerate(); }, [triggerBatch, events.length, handleGenerate]);

    return (
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col h-full transition-all hover:border-white/10 shadow-lg">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div className="text-left">
                    <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">{label}</h4>
                    <p className={`text-[9px] uppercase mt-1 font-bold ${events.length > 0 ? 'text-primary' : 'text-white/20'}`}>{events.length} Torneios</p>
                </div>
                <Button size="small" variant={events.length > 0 ? "primary" : "secondary"} onClick={() => handleGenerate(true)} isLoading={isGenerating} disabled={events.length === 0} icon="zap">Gerar</Button>
            </div>
            <div className="flex-1 p-6 relative min-h-[400px] bg-black/40">
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
            <Card className="w-full max-w-2xl border-white/10 bg-[#080808] overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Manual Entry</h3>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><Icon name="x" className="w-5 h-5" /></button>
                </div>
                <div className="p-8 grid grid-cols-2 gap-6">
                    <div className="col-span-2 space-y-2">
                        <label className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em]">Nome do Torneio</label>
                        <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black border border-white/5 rounded-2xl p-4 text-white font-bold outline-none" placeholder="Ex: BIG BANG PKO" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em]">Horário</label>
                        <input type="time" value={formData.times?.['-3']} onChange={e => setFormData({...formData, times: { '-3': e.target.value }})} className="w-full bg-black border border-white/5 rounded-2xl p-4 text-white font-bold outline-none" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[8px] font-black text-white/30 uppercase tracking-[0.4em]">Garantido (GTD)</label>
                        <input value={formData.gtd} onChange={e => setFormData({...formData, gtd: e.target.value})} className="w-full bg-black border border-white/5 rounded-2xl p-4 text-white font-bold outline-none" placeholder="Ex: 50000" />
                    </div>
                </div>
                <div className="p-8 border-t border-white/5 flex gap-4">
                    <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
                    <Button onClick={() => { onSave({...formData, id: `manual-${Date.now()}`} as any); onClose(); }} variant="primary" className="flex-1">Salvar</Button>
                </div>
            </Card>
        </div>
    );
};

export const FlyerGenerator: React.FC<FlyerGeneratorProps> = ({ 
    brandProfile, events, onFileUpload, onAddEvent, onAddImageToGallery, 
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState, onUpdateGalleryImage, onSetChatReference, onPublishToCampaign
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
  const [compositionAssets, setCompositionAssets] = useState<ImageFile[]>([]);

  const dayTranslations: any = { 'MONDAY': 'Segunda-feira', 'TUESDAY': 'Terça-feira', 'WEDNESDAY': 'Quarta-feira', 'THURSDAY': 'Quinta-feira', 'FRIDAY': 'Sexta-feira', 'SATURDAY': 'Sábado', 'SUNDAY': 'Domingo' };
  const periodLabels: any = { pt: { ALL: 'Resumo do Dia', MORNING: 'Sessão da Manhã', AFTERNOON: 'Tarde de Grind', NIGHT: 'Sessão da Noite', HIGHLIGHTS: 'Destaques do Dia' }, en: { ALL: 'Full Day Summary', MORNING: 'Morning Session', AFTERNOON: 'Afternoon Grind', NIGHT: 'Night Prime Time', HIGHLIGHTS: 'Daily Highlights' } };
  
  const getSortValue = (timeStr: string) => {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    const virtualHour = h < 6 ? h + 24 : h;
    return virtualHour * 60 + (m || 0);
  };

  const currentEvents = events.filter(e => e.day === selectedDay).sort((a, b) => getSortValue(a.times?.['-3']) - getSortValue(b.times?.['-3']));

  const getEventsByPeriod = (period: TimePeriod): TournamentEvent[] => {
    if (period === 'ALL') return currentEvents;
    const morning = currentEvents.filter(e => { const h = (e.times?.['-3'] || '').split(':'); const hour = parseInt(h[0]); return !isNaN(hour) && hour >= 6 && hour < 12; });
    const afternoon = currentEvents.filter(e => { const h = (e.times?.['-3'] || '').split(':'); const hour = parseInt(h[0]); return !isNaN(hour) && hour >= 12 && hour < 18; });
    const night = currentEvents.filter(e => { const h = (e.times?.['-3'] || '').split(':'); const hour = parseInt(h[0]); return !isNaN(hour) && ((hour >= 18 && hour <= 23) || (hour >= 0 && hour < 6)); });
    if (period === 'MORNING') return morning; 
    if (period === 'AFTERNOON') return afternoon; 
    if (period === 'NIGHT') return night;
    if (period === 'HIGHLIGHTS') return currentEvents.slice(0, 3);
    return [];
  };

  return (
    <div className="space-y-12 animate-fade-in-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-12">
            <div className="text-left"><h2 className="text-6xl font-black text-white uppercase tracking-tighter leading-none">Daily Protocol</h2><p className="text-[10px] font-black text-white/30 uppercase tracking-[0.6em] mt-4">Agrupamento Inteligente • Ciclo Diário</p></div>
            <div className="flex flex-wrap gap-4"><Button onClick={() => setIsManualModalOpen(true)} variant="secondary" icon="edit" size="large">Add Manual</Button><label className="cursor-pointer group"><div className="bg-white text-black font-black px-10 py-5 rounded-[1.5rem] flex items-center space-x-3 transition-all active:scale-95 text-[10px] tracking-[0.3em] uppercase shadow-xl hover:bg-white/90"><Icon name="upload" className="w-4 h-4" /><span>Upload Spreadsheet</span></div><input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])} /></label></div>
        </div>
        <Card className="p-8 border-white/10 bg-[#0A0A0A]/60 backdrop-blur-3xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-6 shadow-2xl">
            <div className="space-y-3"><label className="text-[8px] font-black text-white/20 uppercase block ml-1">Dia Ativo</label><select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white uppercase outline-none focus:border-primary/50 appearance-none cursor-pointer">{Object.keys(dayTranslations).map(d => <option key={d} value={d}>{dayTranslations[d]}</option>)}</select></div>
            <div className="space-y-3"><label className="text-[8px] font-black text-white/20 uppercase block ml-1">Aspect Ratio</label><select value={selectedAspectRatio} onChange={(e) => setSelectedAspectRatio(e.target.value)} className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white uppercase outline-none appearance-none cursor-pointer"><option value="9:16">Vertical (9:16)</option><option value="1:1">Quadrado (1:1)</option><option value="16:9">Widescreen (16:9)</option></select></div>
            <div className="space-y-3"><label className="text-[8px] font-black text-white/20 uppercase block ml-1">Moeda</label><select value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value as Currency)} className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white uppercase outline-none appearance-none cursor-pointer"><option value="BRL">Real (R$)</option><option value="USD">Dólar ($)</option></select></div>
            <div className="space-y-3"><label className="text-[8px] font-black text-white/20 uppercase block ml-1">Idioma</label><select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value as 'pt' | 'en')} className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white uppercase outline-none appearance-none cursor-pointer"><option value="pt">Português (BR)</option><option value="en">English (US)</option></select></div>
            <div className="space-y-3"><label className="text-[8px] font-black text-white/20 uppercase block ml-1">Engine IA</label><select value={selectedImageModel} onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)} className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white uppercase outline-none appearance-none cursor-pointer"><option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option><option value="imagen-4.0-generate-001">Imagen 4.0</option></select></div>
            <div className="space-y-3"><label className="text-[8px] font-black text-white/20 uppercase block ml-1">Resolução</label><select value={selectedImageSize} onChange={(e) => setSelectedImageSize(e.target.value as ImageSize)} disabled={selectedImageModel === 'imagen-4.0-generate-001'} className="w-full bg-black border border-white/5 rounded-2xl px-5 py-4 text-[10px] font-black text-white uppercase outline-none appearance-none cursor-pointer disabled:opacity-20"><option value="1K">HD (1K)</option><option value="2K">QuadHD (2K)</option><option value="4K">UltraHD (4K)</option></select></div>
            <div className="flex items-end"><Button variant="primary" className="w-full h-[58px] text-[10px] font-black tracking-[0.5em] shadow-lg active:scale-95" onClick={() => { setIsBatchGenerating(true); setDailyFlyerState({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [], HIGHLIGHTS: [] }); setBatchTrigger(true); setTimeout(() => { setBatchTrigger(false); setIsBatchGenerating(false); }, 1500); }} isLoading={isBatchGenerating} icon="zap">INIT_BATCH</Button></div>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="p-6 bg-[#0A0A0A]/40 border-white/5 flex items-center space-x-6 text-left"><div className="w-20 h-20 rounded-2xl bg-black border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">{collabLogo ? <><img src={collabLogo} className="w-full h-full object-contain p-2" /><button onClick={() => setCollabLogo(null)} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover/opacity-100 flex items-center justify-center text-white text-[10px] font-black uppercase">Remove</button></> : <label className="cursor-pointer w-full h-full flex items-center justify-center"><Icon name="upload" className="w-5 h-5 text-white/10" /><input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { dataUrl } = await fileToBase64(f); setCollabLogo(dataUrl); } }} /></label>}</div><div><h4 className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Logo Colab</h4><p className="text-[8px] text-white/20 uppercase mt-1">Incluso em todos os flyers</p></div></Card>
            <Card className="p-6 bg-[#0A0A0A]/40 border-white/5 flex items-center space-x-6 text-left"><div className="w-20 h-20 rounded-2xl bg-black border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">{manualStyleRef ? <><img src={manualStyleRef} className="w-full h-full object-cover" /><button onClick={() => setManualStyleRef(null)} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover/opacity-100 flex items-center justify-center text-white text-[10px] font-black uppercase">Remove</button></> : <label className="cursor-pointer w-full h-full flex items-center justify-center"><Icon name="image" className="w-5 h-5 text-white/10" /><input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { dataUrl } = await fileToBase64(f); setManualStyleRef(dataUrl); setGlobalStyleReference({ id: 'manual-ref', src: dataUrl, prompt: 'Estilo Manual', source: 'Edição', model: selectedImageModel }); } }} /></label>}</div><div><h4 className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Referência de Estilo</h4><p className="text-[8px] text-white/20 uppercase mt-1">Layout Global</p></div></Card>
            <Card className="p-6 bg-[#0A0A0A]/40 border-white/5 flex flex-col justify-center text-left"><div className="flex items-center justify-between mb-4"><div><h4 className="text-[9px] font-black text-white uppercase tracking-[0.3em]">Ativos Adicionais</h4><p className="text-[8px] text-white/20 uppercase mt-1">Mockups e Pessoas</p></div><label className="cursor-pointer w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"><Icon name="upload" className="w-3.5 h-3.5 text-white/40" /><input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { base64, mimeType, dataUrl } = await fileToBase64(f); setCompositionAssets(prev => [...prev, { base64, mimeType, preview: dataUrl } as any]); } }} /></label></div><div className="flex gap-2.5 overflow-x-auto pb-2">{compositionAssets.map((asset, idx) => (<div key={idx} className="w-12 h-12 flex-shrink-0 rounded-lg bg-black border border-white/10 relative group overflow-hidden"><img src={(asset as any).preview} className="w-full h-full object-cover" /><button onClick={() => setCompositionAssets(prev => prev.filter((_, i) => i !== idx))} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover/opacity-100 flex items-center justify-center text-white text-[8px] font-black">X</button></div>))}</div></Card>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {(['ALL', 'MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'] as TimePeriod[]).map(p => (
                <PeriodCard 
                    key={p} period={p} label={periodLabels[selectedLanguage][p]} events={getEventsByPeriod(p)} brandProfile={brandProfile} aspectRatio={selectedAspectRatio} currency={selectedCurrency} model={selectedImageModel} imageSize={selectedImageSize} language={selectedLanguage}
                    onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} generatedFlyers={dailyFlyerState[p]} setGeneratedFlyers={(u) => setDailyFlyerState(prev => ({...prev, [p]: u(prev[p])}))} triggerBatch={batchTrigger} styleReference={globalStyleReference} onCloneStyle={setGlobalStyleReference} collabLogo={collabLogo} compositionAssets={compositionAssets} onPublishToCampaign={onPublishToCampaign}
                />
            ))}
        </div>
        <div className="mt-24 text-left">
            <h3 className="text-4xl font-black text-white uppercase tracking-widest leading-none mb-12">Ativos Individuais</h3>
            <div className="space-y-6">
                {currentEvents.length > 0 ? currentEvents.map(e => (
                    <TournamentEventCard 
                        key={e.id} event={e} brandProfile={brandProfile} aspectRatio={selectedAspectRatio} currency={selectedCurrency} language={selectedLanguage} model={selectedImageModel} imageSize={selectedImageSize}
                        onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference}
                        generatedFlyers={flyerState[e.id] || []} setGeneratedFlyers={(u) => setFlyerState(prev => ({...prev, [e.id]: u(prev[e.id] || [])}))}
                        collabLogo={collabLogo} compositionAssets={compositionAssets} onPublishToCampaign={onPublishToCampaign}
                    />
                )) : <p className="text-white/20 font-black uppercase tracking-widest text-center py-20">Nenhum torneio detectado para este dia.</p>}
            </div>
        </div>
        <ManualEventModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={(ev) => onAddEvent(ev)} day={selectedDay} />
    </div>
  );
};
