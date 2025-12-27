
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { BrandProfile, TournamentEvent, GalleryImage, ImageModel, ImageSize, ImageFile, WeekScheduleInfo, StyleReference } from '../types';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';
import { EmptyState } from './common/EmptyState';
import { generateFlyer } from '../services/geminiService';
import { ImagePreviewModal } from './common/ImagePreviewModal';
import { QuickPostModal } from './common/QuickPostModal';
import { useBackgroundJobs, type ActiveJob } from '../hooks/useBackgroundJobs';
import type { GenerationJobConfig, WeekScheduleWithCount } from '../services/apiClient';

// Check if we're in development mode (QStash won't work locally)
const isDevMode = typeof window !== 'undefined' && window.location.hostname === 'localhost';

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
  userId?: string | null;
  styleReferences?: StyleReference[];
  onSelectStyleReference?: (ref: StyleReference) => void;
  isWeekExpired?: boolean;
  onClearExpiredSchedule?: () => void;
  // All schedules list
  allSchedules?: WeekScheduleWithCount[];
  currentScheduleId?: string | null;
  onSelectSchedule?: (schedule: WeekScheduleWithCount) => void;
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

const ImageCarousel: React.FC<{
    images: (GalleryImage | 'loading')[];
    onEdit: (image: GalleryImage) => void;
    onQuickPost: (image: GalleryImage) => void;
    onPublish: (image: GalleryImage) => void;
    onDownload: (image: GalleryImage) => void;
    onCloneStyle?: (image: GalleryImage) => void;
}> = ({ images, onEdit, onQuickPost, onPublish, onDownload, onCloneStyle }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

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
        <div
            className="relative w-full h-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {currentItem === 'loading' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10">
                    <Loader className="w-8 h-8 mb-3 text-primary" />
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest animate-pulse">Neural Forge...</p>
                </div>
            ) : (
                <>
                    <img src={currentItem.src} className="w-full h-full object-contain transition-transform duration-700 hover:scale-105 cursor-pointer" onClick={() => onEdit(currentItem)} />
                    <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/40 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px] z-20 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="grid grid-cols-2 gap-2 p-4 max-w-[280px]">
                            {/* QuickPost - Primary Action */}
                            <button
                                onClick={() => onQuickPost(currentItem)}
                                className="col-span-2 flex items-center justify-center gap-2.5 px-5 py-3 bg-primary hover:bg-primary/90 rounded-xl text-black font-black text-[11px] uppercase tracking-wide transition-all hover:scale-[1.02] shadow-lg shadow-primary/30"
                            >
                                <Icon name="zap" className="w-4 h-4" />
                                QuickPost
                            </button>

                            {/* View */}
                            <button
                                onClick={() => onEdit(currentItem)}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white font-bold text-[10px] uppercase tracking-wide transition-all"
                            >
                                <Icon name="eye" className="w-3.5 h-3.5" />
                                View
                            </button>

                            {/* Campanha */}
                            <button
                                onClick={() => onPublish(currentItem)}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white font-bold text-[10px] uppercase tracking-wide transition-all"
                            >
                                <Icon name="users" className="w-3.5 h-3.5" />
                                Campanha
                            </button>

                            {/* Download */}
                            <button
                                onClick={() => onDownload(currentItem)}
                                className={`flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white/70 hover:text-white font-bold text-[10px] uppercase tracking-wide transition-all ${onCloneStyle ? '' : 'col-span-2'}`}
                            >
                                <Icon name="download" className="w-3.5 h-3.5" />
                                Download
                            </button>

                            {/* Modelo (opcional) */}
                            {onCloneStyle && (
                                <button
                                    onClick={() => onCloneStyle(currentItem)}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white/70 hover:text-white font-bold text-[10px] uppercase tracking-wide transition-all"
                                >
                                    <Icon name="copy" className="w-3.5 h-3.5" />
                                    Modelo
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {images.length > 1 && (
                <div className={`absolute inset-x-3 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none z-30 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
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
    styleReference: GalleryImage | null;
    onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
    userId?: string | null;
}> = ({ event, brandProfile, aspectRatio, currency, language, model, imageSize, compositionAssets, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, generatedFlyers, setGeneratedFlyers, collabLogo, styleReference, onPublishToCampaign, userId }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
    const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(null);

    const { queueJob, onJobComplete, onJobFailed, getJobByContext } = useBackgroundJobs();
    const jobContext = `flyer-event-${event.id}`;
    const pendingJob = getJobByContext(jobContext);

    // Listen for job completion to add image to gallery
    useEffect(() => {
        const unsubComplete = onJobComplete((job: ActiveJob) => {
            if (job.context === jobContext && job.result_url) {
                const newImage = onAddImageToGallery({
                    src: job.result_url,
                    prompt: '',
                    source: 'Flyer',
                    model,
                    aspectRatio,
                    imageSize
                });
                setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
                setIsGenerating(false);
                setIsExpanded(true); // Auto-expand when generation completes
            }
        });

        const unsubFailed = onJobFailed((job: ActiveJob) => {
            if (job.context === jobContext) {
                setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
                setIsGenerating(false);
                console.error('[TournamentEventCard] Job failed:', job.error_message);
            }
        });

        return () => { unsubComplete(); unsubFailed(); };
    }, [jobContext, onJobComplete, onJobFailed, onAddImageToGallery, model, aspectRatio, imageSize, setGeneratedFlyers]);

    // Restore loading state from pending job
    useEffect(() => {
        if (pendingJob && (pendingJob.status === 'queued' || pendingJob.status === 'processing') && !isGenerating) {
            setIsGenerating(true);
            if (!generatedFlyers.includes('loading')) {
                setGeneratedFlyers(prev => ['loading', ...prev]);
            }
        }
    }, [pendingJob, isGenerating, generatedFlyers, setGeneratedFlyers]);

    const handleGenerate = async () => {
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

        // Use background job if userId is available AND we're not in dev mode
        // In dev mode, QStash can't callback (no public URL), so use local generation
        if (userId && !isDevMode) {
            setIsGenerating(true);
            setGeneratedFlyers(prev => ['loading', ...prev]);

            try {
                const config: GenerationJobConfig = {
                    brandName: brandProfile.name,
                    brandDescription: brandProfile.description,
                    brandToneOfVoice: brandProfile.toneOfVoice,
                    brandPrimaryColor: brandProfile.primaryColor,
                    brandSecondaryColor: brandProfile.secondaryColor,
                    aspectRatio,
                    model,
                    imageSize,
                    logo: brandProfile.logo || undefined,
                    collabLogo: collabLogo || undefined,
                    styleReference: styleReference?.src || undefined,
                    compositionAssets: compositionAssets.map(a => `data:${a.mimeType};base64,${a.base64}`),
                    source: 'Flyer'
                };

                await queueJob(userId, 'flyer', prompt, config, jobContext);
                // Job will complete via onJobComplete callback
            } catch (err) {
                console.error('[TournamentEventCard] Failed to queue job:', err);
                setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
                setIsGenerating(false);
            }
            return;
        }

        // Local generation (dev mode or no userId)
        setIsGenerating(true);
        setGeneratedFlyers(prev => ['loading', ...prev]);

        try {
            let logoToUse = brandProfile.logo ? { base64: brandProfile.logo.split(',')[1], mimeType: 'image/png' } : null;
            let collabLogoToUse = collabLogo ? { base64: collabLogo.split(',')[1], mimeType: 'image/png' } : null;
            let refData = styleReference ? { base64: styleReference.src.split(',')[1], mimeType: 'image/png' } : null;
            const assetsToUse = compositionAssets.map(a => ({ base64: a.base64, mimeType: a.mimeType }));
            const imageUrl = await generateFlyer(prompt, brandProfile, logoToUse, refData, aspectRatio, model, collabLogoToUse, imageSize, assetsToUse);
            const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer', model, aspectRatio, imageSize });
            setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
            setIsExpanded(true); // Auto-expand when generation completes
        } catch (err) {
            setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
        } finally {
            setIsGenerating(false);
        }
    };

    const gtdValue = event.gtd ? formatCurrencyValue(event.gtd, currency) : '---';
    const buyInValue = event.buyIn ? formatCurrencyValue(event.buyIn, currency) : '---';

    return (
        <div className={`bg-[#0d0d0d] border rounded-xl overflow-hidden transition-all mb-2 ${isGenerating ? 'border-primary/50 animate-pulse' : 'border-white/[0.06] hover:border-white/10'}`}>
            <div className="px-5 py-4 flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-6 items-center text-left">
                    <div className="flex items-center gap-3">
                        {isGenerating && <Loader className="w-4 h-4 flex-shrink-0" />}
                        <div>
                            <h3 className="text-xs font-bold text-white tracking-wide">{event.name}</h3>
                            <p className="text-[10px] text-white/30 mt-0.5">
                                {isGenerating ? 'Gerando flyer...' : `${event.game} • ${event.structure}`}
                            </p>
                        </div>
                    </div>
                    <div>
                        <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider block mb-1">Time</span>
                        <span className="text-sm font-semibold text-white">{event.times?.['-3']} <span className="text-white/40 text-xs">(GMT-3)</span></span>
                    </div>
                    <div>
                        <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider block mb-1">Value</span>
                        <span className="text-sm font-bold text-primary">GTD: {gtdValue}</span>
                        <span className="text-[10px] text-white/40 block mt-0.5">BI: {buyInValue}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                    <Button size="small" variant="primary" onClick={(e) => { e.stopPropagation(); handleGenerate(); }} isLoading={isGenerating}>Gerar</Button>
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-white/20" />
                </div>
            </div>
            {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t border-white/5 animate-fade-in-up">
                    {generatedFlyers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Icon name="image" className="w-10 h-10 text-white/10 mb-3" />
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wide">Nenhum flyer gerado</p>
                            <p className="text-[9px] text-white/20 mt-1">Clique em "Gerar" para criar um flyer</p>
                        </div>
                    ) : (
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {generatedFlyers.map((flyer, index) => (
                                <div
                                    key={flyer === 'loading' ? `loading-${index}` : flyer.id}
                                    className="flex-shrink-0 w-[140px] group"
                                >
                                    <div className="aspect-[9/16] bg-black/80 rounded-xl overflow-hidden border border-white/5 relative">
                                        {flyer === 'loading' ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                                                <Loader className="w-6 h-6 mb-2 text-primary" />
                                                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest animate-pulse">Gerando...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <img
                                                    src={flyer.src}
                                                    className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                                                    onClick={() => setEditingFlyer(flyer)}
                                                />
                                                {/* Hover overlay with actions */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-end p-2 gap-1.5">
                                                    <button
                                                        onClick={() => setQuickPostFlyer(flyer)}
                                                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-black font-bold text-[9px] uppercase tracking-wide transition-all"
                                                    >
                                                        <Icon name="zap" className="w-3 h-3" />
                                                        QuickPost
                                                    </button>
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            onClick={() => setEditingFlyer(flyer)}
                                                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-[8px] uppercase tracking-wide transition-all"
                                                        >
                                                            <Icon name="eye" className="w-2.5 h-2.5" />
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => handleDownloadFlyer(flyer.src, `flyer-${event.id}-${index}.png`)}
                                                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold text-[8px] uppercase tracking-wide transition-all"
                                                        >
                                                            <Icon name="download" className="w-2.5 h-2.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {editingFlyer && (
                <ImagePreviewModal
                    image={editingFlyer}
                    onClose={() => setEditingFlyer(null)}
                    onImageUpdate={(src) => { onUpdateGalleryImage(editingFlyer.id, src); setGeneratedFlyers(prev => prev.map(f => (f !== 'loading' && f.id === editingFlyer.id ? { ...f, src } : f))); }}
                    onSetChatReference={onSetChatReference}
                    onQuickPost={setQuickPostFlyer}
                    onPublish={(f) => onPublishToCampaign(`Divulgue o torneio ${event.name}`, f)}
                    downloadFilename={`flyer-${event.id}.png`}
                />
            )}
            {quickPostFlyer && (
                <QuickPostModal isOpen={!!quickPostFlyer} onClose={() => setQuickPostFlyer(null)} image={quickPostFlyer} brandProfile={brandProfile} context={`Torneio: ${event.name}, ${event.times?.['-3']}, GTD: ${formatCurrencyValue(event.gtd, currency)}`} />
            )}
        </div>
    );
};

const PeriodCardRow: React.FC<{
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
    userId?: string | null;
}> = ({ period, label, events, brandProfile, aspectRatio, currency, model, imageSize, compositionAssets, language, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, generatedFlyers, setGeneratedFlyers, triggerBatch, styleReference, onCloneStyle, collabLogo, onPublishToCampaign, userId }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
    const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(null);

    const { queueJob, onJobComplete, onJobFailed, getJobByContext } = useBackgroundJobs();
    const jobContext = `flyer-period-${period}`;
    const pendingJob = getJobByContext(jobContext);

    // Listen for job completion
    useEffect(() => {
        const unsubComplete = onJobComplete((job: ActiveJob) => {
            if (job.context === jobContext && job.result_url) {
                const newImage = onAddImageToGallery({
                    src: job.result_url,
                    prompt: '',
                    source: 'Flyer Diário',
                    model,
                    aspectRatio,
                    imageSize
                });
                setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
                setIsGenerating(false);
                setIsExpanded(true); // Auto-expand when generation completes
            }
        });

        const unsubFailed = onJobFailed((job: ActiveJob) => {
            if (job.context === jobContext) {
                setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
                setIsGenerating(false);
            }
        });

        return () => { unsubComplete(); unsubFailed(); };
    }, [jobContext, onJobComplete, onJobFailed, onAddImageToGallery, model, aspectRatio, imageSize, setGeneratedFlyers]);

    // Restore loading state from pending job
    useEffect(() => {
        if (pendingJob && (pendingJob.status === 'queued' || pendingJob.status === 'processing') && !isGenerating) {
            setIsGenerating(true);
            if (!generatedFlyers.includes('loading')) {
                setGeneratedFlyers(prev => ['loading', ...prev]);
            }
        }
    }, [pendingJob, isGenerating, generatedFlyers, setGeneratedFlyers]);

    const parseGtd = (gtd: string): number => {
        if (!gtd || gtd === '---') return 0;
        return parseFloat(String(gtd).replace(/[^0-9.-]+/g, '')) || 0;
    };

    const getSortValue = (timeStr: string) => {
        const [h, m] = (timeStr || '00:00').split(':').map(Number);
        const virtualHour = h < 6 ? h + 24 : h;
        return virtualHour * 60 + (m || 0);
    };

    const handleGenerate = useCallback(async (forced: boolean = false) => {
        if (isGenerating || events.length === 0) return;
        if (triggerBatch && !forced && generatedFlyers.length > 0) return;

        const sortedByGtd = [...events].sort((a, b) => parseGtd(b.gtd) - parseGtd(a.gtd));
        const topEvent = sortedByGtd[0];
        const otherEvents = sortedByGtd.slice(1).sort((a, b) => getSortValue(a.times?.['-3'] || '') - getSortValue(b.times?.['-3'] || ''));

        const topEventText = topEvent ? `${topEvent.name} - GTD: ${formatCurrencyValue(topEvent.gtd, currency)} - Horário: ${topEvent.times?.['-3']} - Buy-in: ${formatCurrencyValue(topEvent.buyIn, currency)}` : '';
        const otherEventsList = otherEvents.map(e => `${e.times?.['-3']} | ${e.name} | Buy-in: ${formatCurrencyValue(e.buyIn, currency)} | GTD: ${formatCurrencyValue(e.gtd, currency)}`).join('\n');

        const isHighlights = period === 'HIGHLIGHTS';

        const prompt = isHighlights ? `
        TIPO: Flyer de Destaques do Dia - TOP 3 TORNEIOS
        TÍTULO: ${label.toUpperCase()}

        ⚠️ REGRA CRÍTICA: Este flyer mostra EXATAMENTE 3 torneios.

        OS 3 TORNEIOS DESTAQUES:
        🥇 1º DESTAQUE: ${topEventText}
        🥈 2º DESTAQUE: ${otherEvents[0] ? `${otherEvents[0].times?.['-3']} | ${otherEvents[0].name} | GTD: ${formatCurrencyValue(otherEvents[0].gtd, currency)}` : ''}
        🥉 3º DESTAQUE: ${otherEvents[1] ? `${otherEvents[1].times?.['-3']} | ${otherEvents[1].name} | GTD: ${formatCurrencyValue(otherEvents[1].gtd, currency)}` : ''}

        DESIGN: Logo no topo, GTD em cor ${brandProfile.secondaryColor}, fundo ${brandProfile.primaryColor}
        ` : `
        TIPO: Grade de Programação com Destaque Principal
        TÍTULO: ${label.toUpperCase()} - ${events.length} torneios

        DESTAQUE PRINCIPAL (maior GTD): ${topEventText}

        LISTA DOS DEMAIS TORNEIOS:
        ${otherEventsList}

        DESIGN: Logo no topo, título "${label}", GTD em ${brandProfile.secondaryColor}, fundo ${brandProfile.primaryColor}
        `;

        // Use background job if userId is available AND we're not in dev mode
        if (userId && !isDevMode) {
            setIsGenerating(true);
            setGeneratedFlyers(prev => ['loading', ...prev]);

            try {
                const config: GenerationJobConfig = {
                    brandName: brandProfile.name,
                    brandDescription: brandProfile.description,
                    brandToneOfVoice: brandProfile.toneOfVoice,
                    brandPrimaryColor: brandProfile.primaryColor,
                    brandSecondaryColor: brandProfile.secondaryColor,
                    aspectRatio,
                    model,
                    imageSize,
                    logo: brandProfile.logo || undefined,
                    collabLogo: collabLogo || undefined,
                    styleReference: styleReference?.src || undefined,
                    compositionAssets: compositionAssets.map(a => `data:${a.mimeType};base64,${a.base64}`),
                    source: 'Flyer Diário'
                };

                await queueJob(userId, 'flyer_daily', prompt, config, jobContext);
            } catch (err) {
                console.error('[PeriodCardRow] Failed to queue job:', err);
                setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
                setIsGenerating(false);
            }
            return;
        }

        // Local generation (dev mode or no userId)
        setIsGenerating(true);
        setGeneratedFlyers(prev => ['loading', ...prev]);

        try {
            let logoToUse = brandProfile.logo ? { base64: brandProfile.logo.split(',')[1], mimeType: 'image/png' } : null;
            let collabLogoToUse = collabLogo ? { base64: collabLogo.split(',')[1], mimeType: 'image/png' } : null;
            let refData = styleReference ? { base64: styleReference.src.split(',')[1], mimeType: 'image/png' } : null;
            const assetsToUse = compositionAssets.map(a => ({ base64: a.base64, mimeType: a.mimeType }));
            const imageUrl = await generateFlyer(prompt, brandProfile, logoToUse, refData, aspectRatio, model, collabLogoToUse, imageSize, assetsToUse);
            const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer Diário', model, aspectRatio, imageSize });
            setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
            setIsExpanded(true); // Auto-expand when generation completes
        } catch (err) {
            setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
        } finally {
            setIsGenerating(false);
        }
    }, [isGenerating, events, triggerBatch, generatedFlyers.length, model, brandProfile, aspectRatio, currency, language, styleReference, onAddImageToGallery, setGeneratedFlyers, label, collabLogo, imageSize, compositionAssets, userId, queueJob, jobContext]);

    useEffect(() => { if (triggerBatch && events.length > 0) handleGenerate(); }, [triggerBatch, events.length, handleGenerate]);

    const totalGtd = events.reduce((sum, e) => sum + parseGtd(e.gtd), 0);

    return (
        <div className={`bg-[#0d0d0d] border rounded-xl overflow-hidden transition-all mb-2 ${isGenerating ? 'border-primary/50 animate-pulse' : 'border-white/[0.06] hover:border-white/10'}`}>
            <div className="px-5 py-4 flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-6 items-center text-left">
                    <div className="flex items-center gap-3">
                        {isGenerating && <Loader className="w-4 h-4 flex-shrink-0" />}
                        <div>
                            <h3 className="text-xs font-bold text-white tracking-wide">{label}</h3>
                            <p className="text-[10px] text-white/30 mt-0.5">
                                {isGenerating ? 'Gerando flyer...' : `${events.length} torneios neste período`}
                            </p>
                        </div>
                    </div>
                    <div>
                        <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider block mb-1">Período</span>
                        <span className="text-sm font-semibold text-white">{period === 'ALL' ? 'Dia Completo' : period === 'MORNING' ? '06h - 12h' : period === 'AFTERNOON' ? '12h - 18h' : period === 'NIGHT' ? '18h - 06h' : 'Top 3'}</span>
                    </div>
                    <div>
                        <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider block mb-1">GTD Total</span>
                        <span className="text-sm font-bold text-primary">{formatCurrencyValue(String(totalGtd), currency)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                    <Button size="small" variant={events.length > 0 ? "primary" : "secondary"} onClick={(e) => { e.stopPropagation(); handleGenerate(true); }} isLoading={isGenerating} disabled={events.length === 0}>Gerar</Button>
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-white/20" />
                </div>
            </div>
            {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t border-white/5 animate-fade-in-up flex justify-center">
                    <div className="w-full max-w-[200px] aspect-[9/16] bg-black/80 rounded-xl overflow-hidden border border-white/5 relative">
                        <ImageCarousel
                            images={generatedFlyers}
                            onEdit={setEditingFlyer}
                            onQuickPost={setQuickPostFlyer}
                            onPublish={(f) => onPublishToCampaign(`Campanha para grade ${label}`, f)}
                            onDownload={(f) => handleDownloadFlyer(f.src, `period-${period}.png`)}
                            onCloneStyle={onCloneStyle}
                        />
                    </div>
                </div>
            )}
            {editingFlyer && (
                <ImagePreviewModal
                    image={editingFlyer}
                    onClose={() => setEditingFlyer(null)}
                    onImageUpdate={(src) => { onUpdateGalleryImage(editingFlyer.id, src); setGeneratedFlyers(prev => prev.map(f => (f !== 'loading' && f.id === editingFlyer.id ? { ...f, src } : f))); }}
                    onSetChatReference={onSetChatReference}
                    onQuickPost={setQuickPostFlyer}
                    onPublish={(f) => onPublishToCampaign(`Campanha para grade ${label}`, f)}
                    onCloneStyle={onCloneStyle}
                    downloadFilename={`period-${period}.png`}
                />
            )}
            {quickPostFlyer && (
                <QuickPostModal isOpen={!!quickPostFlyer} onClose={() => setQuickPostFlyer(null)} image={quickPostFlyer} brandProfile={brandProfile} context={`Sessão: ${label}. Grade:\n${events.map(e => e.name).join(', ')}`} />
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
    userId?: string | null;
}> = ({ period, label, events, brandProfile, aspectRatio, currency, model, imageSize, compositionAssets, language, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, generatedFlyers, setGeneratedFlyers, triggerBatch, styleReference, onCloneStyle, collabLogo, onPublishToCampaign, userId }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
    const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(null);

    const { queueJob, onJobComplete, onJobFailed, getJobByContext } = useBackgroundJobs();
    const jobContext = `flyer-card-${period}`;
    const pendingJob = getJobByContext(jobContext);

    // Listen for job completion (PeriodCard doesn't have isExpanded, no need to auto-expand)
    useEffect(() => {
        const unsubComplete = onJobComplete((job: ActiveJob) => {
            if (job.context === jobContext && job.result_url) {
                const newImage = onAddImageToGallery({
                    src: job.result_url,
                    prompt: '',
                    source: 'Flyer Diário',
                    model,
                    aspectRatio,
                    imageSize
                });
                setGeneratedFlyers(prev => prev.map(f => f === 'loading' ? newImage : f));
                setIsGenerating(false);
            }
        });

        const unsubFailed = onJobFailed((job: ActiveJob) => {
            if (job.context === jobContext) {
                setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
                setIsGenerating(false);
            }
        });

        return () => { unsubComplete(); unsubFailed(); };
    }, [jobContext, onJobComplete, onJobFailed, onAddImageToGallery, model, aspectRatio, imageSize, setGeneratedFlyers]);

    // Restore loading state from pending job
    useEffect(() => {
        if (pendingJob && (pendingJob.status === 'queued' || pendingJob.status === 'processing') && !isGenerating) {
            setIsGenerating(true);
            if (!generatedFlyers.includes('loading')) {
                setGeneratedFlyers(prev => ['loading', ...prev]);
            }
        }
    }, [pendingJob, isGenerating, generatedFlyers, setGeneratedFlyers]);

    const parseGtd = (gtd: string): number => {
        if (!gtd || gtd === '---') return 0;
        return parseFloat(String(gtd).replace(/[^0-9.-]+/g, '')) || 0;
    };

    const getSortValue = (timeStr: string) => {
        const [h, m] = (timeStr || '00:00').split(':').map(Number);
        const virtualHour = h < 6 ? h + 24 : h;
        return virtualHour * 60 + (m || 0);
    };

    const handleGenerate = useCallback(async (forced: boolean = false) => {
        if (isGenerating || events.length === 0) return;
        if (triggerBatch && !forced && generatedFlyers.length > 0) return;

        // Ordenar eventos por GTD e separar o maior
        const sortedByGtd = [...events].sort((a, b) => parseGtd(b.gtd) - parseGtd(a.gtd));
        const topEvent = sortedByGtd[0];
        // Outros eventos ordenados por horário
        const otherEvents = sortedByGtd.slice(1).sort((a, b) => getSortValue(a.times?.['-3'] || '') - getSortValue(b.times?.['-3'] || ''));

        const topEventText = topEvent ? `${topEvent.name} - GTD: ${formatCurrencyValue(topEvent.gtd, currency)} - Horário: ${topEvent.times?.['-3']} - Buy-in: ${formatCurrencyValue(topEvent.buyIn, currency)}` : '';
        const otherEventsList = otherEvents.map(e => `${e.times?.['-3']} | ${e.name} | Buy-in: ${formatCurrencyValue(e.buyIn, currency)} | GTD: ${formatCurrencyValue(e.gtd, currency)}`).join('\n');

        // Prompt específico para HIGHLIGHTS (apenas 3 torneios)
        const isHighlights = period === 'HIGHLIGHTS';

        const prompt = isHighlights ? `
        TIPO: Flyer de Destaques do Dia - TOP 3 TORNEIOS
        TÍTULO: ${label.toUpperCase()}

        ⚠️ REGRA CRÍTICA: Este flyer mostra EXATAMENTE 3 torneios. NÃO ADICIONE, NÃO DUPLIQUE, NÃO REPITA nenhum torneio.

        ═══════════════════════════════════════════
        OS 3 TORNEIOS DESTAQUES (cada um aparece UMA ÚNICA VEZ):
        ═══════════════════════════════════════════

        🥇 1º DESTAQUE (MAIOR GTD - área principal):
        ${topEventText}

        🥈 2º DESTAQUE:
        ${otherEvents[0] ? `${otherEvents[0].times?.['-3']} | ${otherEvents[0].name} | Buy-in: ${formatCurrencyValue(otherEvents[0].buyIn, currency)} | GTD: ${formatCurrencyValue(otherEvents[0].gtd, currency)}` : ''}

        🥉 3º DESTAQUE:
        ${otherEvents[1] ? `${otherEvents[1].times?.['-3']} | ${otherEvents[1].name} | Buy-in: ${formatCurrencyValue(otherEvents[1].buyIn, currency)} | GTD: ${formatCurrencyValue(otherEvents[1].gtd, currency)}` : ''}

        ═══════════════════════════════════════════
        LAYOUT OBRIGATÓRIO:
        ═══════════════════════════════════════════
        - O 1º destaque (${topEvent?.name}) ocupa a METADE SUPERIOR com visual impactante
        - Os outros 2 torneios ficam na METADE INFERIOR em formato de cards ou lista
        - TOTAL DE ITENS NA IMAGEM: EXATAMENTE 3 torneios
        - NÃO crie linhas extras, NÃO repita nenhum nome

        ═══════════════════════════════════════════
        DESIGN:
        ═══════════════════════════════════════════
        - Logo da marca no topo
        - GTD em destaque com cor ${brandProfile.secondaryColor}
        - Fundo baseado em ${brandProfile.primaryColor}
        - Visual premium de poker/cassino
        - Efeitos visuais: partículas, brilhos, fichas decorativas
        ` : `
        TIPO: Grade de Programação com Destaque Principal
        TÍTULO DA SESSÃO: ${label.toUpperCase()}
        TOTAL: ${events.length} torneios

        ESTRUTURA OBRIGATÓRIA - 2 SEÇÕES DISTINTAS:

        ═══════════════════════════════════════════
        SEÇÃO 1 - DESTAQUE PRINCIPAL (TOPO - 40% do espaço):
        ═══════════════════════════════════════════

        TORNEIO EM EVIDÊNCIA (maior GTD):
        ${topEventText}

        REGRAS DO DESTAQUE:
        - Esta seção deve ocupar aproximadamente 40% da área do flyer
        - Nome do torneio em FONTE GIGANTE E BOLD
        - GTD (${topEvent ? formatCurrencyValue(topEvent.gtd, currency) : ''}) deve ser o MAIOR elemento visual - cor ${brandProfile.secondaryColor}
        - Efeitos visuais: partículas, brilhos, explosão de elementos (fichas/cartas voando são opcionais)
        - Background desta área pode ter gradiente ou elementos visuais dinâmicos
        - Horário e Buy-in em tamanho médio, bem legíveis

        ═══════════════════════════════════════════
        SEÇÃO 2 - GRADE DE OUTROS TORNEIOS (60% do espaço):
        ═══════════════════════════════════════════

        LISTA DOS DEMAIS TORNEIOS (cada torneio aparece UMA ÚNICA VEZ, não repita):
        ${otherEventsList}

        FORMATO DA GRADE:
        - Layout tipo tabela/lista profissional
        - Cada linha: [HORÁRIO] | [NOME] | [BUY-IN] | [GTD]
        - IMPORTANTE: Cada torneio deve aparecer EXATAMENTE 1 vez na grade
        - GTD em cor ${brandProfile.secondaryColor} (menor que o destaque, mas visível)
        - Linhas alternadas ou separadores para facilitar leitura
        - Fonte menor que o destaque, mas perfeitamente legível
        - Espaçamento uniforme entre linhas

        ═══════════════════════════════════════════
        DESIGN GERAL:
        ═══════════════════════════════════════════
        - Logo da marca no topo
        - Título "${label}" logo após o logo
        - Fundo baseado em ${brandProfile.primaryColor}
        - Contraste forte entre o DESTAQUE (topo) e a GRADE (inferior)
        - Visual profissional de sportsbook/cassino premium
        `;

        // Use background job if userId is available AND we're not in dev mode
        if (userId && !isDevMode) {
            setIsGenerating(true);
            setGeneratedFlyers(prev => ['loading', ...prev]);

            try {
                const config: GenerationJobConfig = {
                    brandName: brandProfile.name,
                    brandDescription: brandProfile.description,
                    brandToneOfVoice: brandProfile.toneOfVoice,
                    brandPrimaryColor: brandProfile.primaryColor,
                    brandSecondaryColor: brandProfile.secondaryColor,
                    aspectRatio,
                    model,
                    imageSize,
                    logo: brandProfile.logo || undefined,
                    collabLogo: collabLogo || undefined,
                    styleReference: styleReference?.src || undefined,
                    compositionAssets: compositionAssets.map(a => `data:${a.mimeType};base64,${a.base64}`),
                    source: 'Flyer Diário'
                };

                await queueJob(userId, 'flyer_daily', prompt, config, jobContext);
            } catch (err) {
                console.error('[PeriodCard] Failed to queue job:', err);
                setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
                setIsGenerating(false);
            }
            return;
        }

        // Local generation (dev mode or no userId)
        setIsGenerating(true);
        setGeneratedFlyers(prev => ['loading', ...prev]);

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
    }, [isGenerating, events, triggerBatch, generatedFlyers.length, model, brandProfile, aspectRatio, currency, language, styleReference, onAddImageToGallery, setGeneratedFlyers, label, collabLogo, imageSize, compositionAssets, userId, queueJob, jobContext]);

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
            {editingFlyer && (
                <ImagePreviewModal
                    image={editingFlyer}
                    onClose={() => setEditingFlyer(null)}
                    onImageUpdate={(src) => { onUpdateGalleryImage(editingFlyer.id, src); setGeneratedFlyers(prev => prev.map(f => (f !== 'loading' && f.id === editingFlyer.id ? { ...f, src } : f))); }}
                    onSetChatReference={onSetChatReference}
                    onQuickPost={setQuickPostFlyer}
                    onPublish={(f) => onPublishToCampaign(`Campanha para grade ${label}`, f)}
                    onCloneStyle={onCloneStyle}
                    downloadFilename={`period-${period}.png`}
                />
            )}
            {quickPostFlyer && (
                <QuickPostModal isOpen={!!quickPostFlyer} onClose={() => setQuickPostFlyer(null)} image={quickPostFlyer} brandProfile={brandProfile} context={`Sessão: ${label}. Grade:\n${events.map(e => e.name).join(', ')}`} />
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
        day, name: '', game: "Hold'em", gtd: '0', buyIn: '0', rebuy: '', addOn: '', stack: '', players: '', lateReg: '', minutes: '', structure: 'Regular', times: { '-3': '12:00' }
    });

    const resetForm = () => {
        setFormData({
            day, name: '', game: "Hold'em", gtd: '0', buyIn: '0', rebuy: '', addOn: '', stack: '', players: '', lateReg: '', minutes: '', structure: 'Regular', times: { '-3': '12:00' }
        });
    };

    if (!isOpen) return null;

    const inputClass = "w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-primary/50 placeholder:text-white/20";
    const labelClass = "text-[9px] font-black text-white/30 uppercase tracking-wide";

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl border-white/10 bg-[#080808] overflow-hidden max-h-[90vh] flex flex-col">
                <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-[#0d0d0d]">
                    <h3 className="text-[10px] font-black text-white uppercase tracking-wide">Adicionar Torneio Manual</h3>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><Icon name="x" className="w-4 h-4" /></button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {/* Nome e Jogo */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-1.5">
                            <label className={labelClass}>Nome do Torneio *</label>
                            <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} placeholder="Ex: BIG BANG PKO" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Modalidade</label>
                            <select value={formData.game} onChange={e => setFormData({...formData, game: e.target.value})} className={inputClass + " appearance-none cursor-pointer"}>
                                <option value="Hold'em">Hold'em</option>
                                <option value="PLO">PLO</option>
                                <option value="PLO5">PLO 5</option>
                                <option value="PLO6">PLO 6</option>
                                <option value="Mixed">Mixed</option>
                                <option value="Stud">Stud</option>
                                <option value="Razz">Razz</option>
                                <option value="2-7 Triple Draw">2-7 Triple Draw</option>
                                <option value="8-Game">8-Game</option>
                            </select>
                        </div>
                    </div>

                    {/* Horário e GTD */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelClass}>Horário (BRT) *</label>
                            <input type="time" value={formData.times?.['-3']} onChange={e => setFormData({...formData, times: { '-3': e.target.value }})} className={inputClass} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Garantido (GTD)</label>
                            <input value={formData.gtd} onChange={e => setFormData({...formData, gtd: e.target.value})} className={inputClass} placeholder="50000" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Estrutura</label>
                            <select value={formData.structure} onChange={e => setFormData({...formData, structure: e.target.value})} className={inputClass + " appearance-none cursor-pointer"}>
                                <option value="Regular">Regular</option>
                                <option value="Turbo">Turbo</option>
                                <option value="Hyper">Hyper</option>
                                <option value="Super Turbo">Super Turbo</option>
                                <option value="Deep Stack">Deep Stack</option>
                            </select>
                        </div>
                    </div>

                    {/* Buy-in, Rebuy, Add-on */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelClass}>Buy-in ($)</label>
                            <input value={formData.buyIn} onChange={e => setFormData({...formData, buyIn: e.target.value})} className={inputClass} placeholder="55" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Rebuy ($)</label>
                            <input value={formData.rebuy} onChange={e => setFormData({...formData, rebuy: e.target.value})} className={inputClass} placeholder="55" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Add-on ($)</label>
                            <input value={formData.addOn} onChange={e => setFormData({...formData, addOn: e.target.value})} className={inputClass} placeholder="55" />
                        </div>
                    </div>

                    {/* Stack, Players, Late Reg, Minutes */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelClass}>Stack Inicial</label>
                            <input value={formData.stack} onChange={e => setFormData({...formData, stack: e.target.value})} className={inputClass} placeholder="50000" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Max Players</label>
                            <input value={formData.players} onChange={e => setFormData({...formData, players: e.target.value})} className={inputClass} placeholder="Unlimited" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Late Reg (min)</label>
                            <input value={formData.lateReg} onChange={e => setFormData({...formData, lateReg: e.target.value})} className={inputClass} placeholder="120" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Blind Time</label>
                            <input value={formData.minutes} onChange={e => setFormData({...formData, minutes: e.target.value})} className={inputClass} placeholder="15" />
                        </div>
                    </div>
                </div>
                <div className="p-5 border-t border-white/5 flex gap-3 bg-[#0a0a0a]">
                    <Button onClick={() => { resetForm(); onClose(); }} variant="secondary" size="small" className="flex-1">Cancelar</Button>
                    <Button
                        onClick={() => {
                            if (!formData.name?.trim()) return;
                            onSave({...formData, id: `manual-${Date.now()}`} as TournamentEvent);
                            resetForm();
                            onClose();
                        }}
                        variant="primary"
                        size="small"
                        className="flex-1"
                        disabled={!formData.name?.trim()}
                    >
                        Salvar Torneio
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export const FlyerGenerator: React.FC<FlyerGeneratorProps> = ({
    brandProfile, events, weekScheduleInfo, onFileUpload, onAddEvent, onAddImageToGallery,
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState, onUpdateGalleryImage, onSetChatReference, onPublishToCampaign,
    selectedStyleReference, onClearSelectedStyleReference, styleReferences = [], onSelectStyleReference,
    isWeekExpired, onClearExpiredSchedule, userId,
    allSchedules = [], currentScheduleId, onSelectSchedule
}) => {
  const daysMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const currentDayName = daysMap[new Date().getDay()];

  // Estados com persistência em localStorage
  const [selectedDay, setSelectedDay] = useState(() => {
    return localStorage.getItem('flyer_selectedDay') || currentDayName;
  });
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(() => {
    return localStorage.getItem('flyer_aspectRatio') || '9:16';
  });
  const [selectedImageSize, setSelectedImageSize] = useState<ImageSize>(() => {
    return (localStorage.getItem('flyer_imageSize') as ImageSize) || '1K';
  });
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => {
    return (localStorage.getItem('flyer_currency') as Currency) || 'BRL';
  });
  const [selectedLanguage, setSelectedLanguage] = useState<'pt' | 'en'>(() => {
    return (localStorage.getItem('flyer_language') as 'pt' | 'en') || 'pt';
  });
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>(() => {
    return (localStorage.getItem('flyer_imageModel') as ImageModel) || 'gemini-3-pro-image-preview';
  });
  const [showIndividualTournaments, setShowIndividualTournaments] = useState(() => {
    return localStorage.getItem('flyer_showIndividual') === 'true';
  });
  const [showOnlyWithGtd, setShowOnlyWithGtd] = useState(() => {
    return localStorage.getItem('flyer_showOnlyWithGtd') === 'true';
  });
  const [sortBy, setSortBy] = useState<'time' | 'gtd'>(() => {
    return (localStorage.getItem('flyer_sortBy') as 'time' | 'gtd') || 'time';
  });
  const [collabLogo, setCollabLogo] = useState<string | null>(() => {
    return localStorage.getItem('flyer_collabLogo') || null;
  });
  const [manualStyleRef, setManualStyleRef] = useState<string | null>(() => {
    return localStorage.getItem('flyer_manualStyleRef') || null;
  });
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(() => {
    return localStorage.getItem('stylePanel_isOpen') === 'true';
  });

  const [batchTrigger, setBatchTrigger] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [globalStyleReference, setGlobalStyleReference] = useState<GalleryImage | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSchedulesPanelOpen, setIsSchedulesPanelOpen] = useState(false);

  // Persistir todos os estados em localStorage
  useEffect(() => {
    localStorage.setItem('flyer_selectedDay', selectedDay);
  }, [selectedDay]);
  useEffect(() => {
    localStorage.setItem('flyer_aspectRatio', selectedAspectRatio);
  }, [selectedAspectRatio]);
  useEffect(() => {
    localStorage.setItem('flyer_imageSize', selectedImageSize);
  }, [selectedImageSize]);
  useEffect(() => {
    localStorage.setItem('flyer_currency', selectedCurrency);
  }, [selectedCurrency]);
  useEffect(() => {
    localStorage.setItem('flyer_language', selectedLanguage);
  }, [selectedLanguage]);
  useEffect(() => {
    localStorage.setItem('flyer_imageModel', selectedImageModel);
  }, [selectedImageModel]);
  useEffect(() => {
    localStorage.setItem('flyer_showIndividual', String(showIndividualTournaments));
  }, [showIndividualTournaments]);
  useEffect(() => {
    localStorage.setItem('flyer_showOnlyWithGtd', String(showOnlyWithGtd));
  }, [showOnlyWithGtd]);
  useEffect(() => {
    localStorage.setItem('flyer_sortBy', sortBy);
  }, [sortBy]);
  useEffect(() => {
    try {
      if (collabLogo) {
        localStorage.setItem('flyer_collabLogo', collabLogo);
      } else {
        localStorage.removeItem('flyer_collabLogo');
      }
    } catch (e) {
      console.warn('[FlyerGenerator] Failed to save collabLogo to localStorage:', e);
      // Clear old flyer data to make space
      try {
        localStorage.removeItem('flyer_manualStyleRef');
        localStorage.removeItem('flyer_collabLogo');
      } catch {}
    }
  }, [collabLogo]);
  useEffect(() => {
    try {
      if (manualStyleRef) {
        localStorage.setItem('flyer_manualStyleRef', manualStyleRef);
      } else {
        localStorage.removeItem('flyer_manualStyleRef');
      }
    } catch (e) {
      console.warn('[FlyerGenerator] Failed to save manualStyleRef to localStorage:', e);
      // Clear old flyer data to make space
      try {
        localStorage.removeItem('flyer_manualStyleRef');
        localStorage.removeItem('flyer_collabLogo');
      } catch {}
    }
  }, [manualStyleRef]);
  useEffect(() => {
    localStorage.setItem('stylePanel_isOpen', String(isStylePanelOpen));
  }, [isStylePanelOpen]);

  // Restaurar globalStyleReference do manualStyleRef salvo no localStorage
  useEffect(() => {
    if (manualStyleRef && !globalStyleReference) {
      setGlobalStyleReference({
        id: 'restored-style',
        src: manualStyleRef,
        prompt: 'Referência restaurada',
        source: 'Edição',
        model: selectedImageModel
      });
    }
  }, []); // Executar apenas na montagem

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

  const currentEvents = events
    .filter(e => e.day === selectedDay)
    .filter(e => !showOnlyWithGtd || parseGtd(e.gtd) > 0)
    .sort((a, b) => {
      if (sortBy === 'gtd') {
        return parseGtd(b.gtd) - parseGtd(a.gtd); // Maior GTD primeiro
      }
      return getSortValue(a.times?.['-3']) - getSortValue(b.times?.['-3']); // Por horário
    });

  // Estatísticas do dia selecionado (baseado em TODOS os eventos do dia, não filtrados)
  const allDayEvents = events.filter(e => e.day === selectedDay);
  const dayStats = {
    count: allDayEvents.length,
    withGtd: allDayEvents.filter(e => parseGtd(e.gtd) > 0).length,
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

  // Empty state: No schedule data OR week expired
  const hasNoData = events.length === 0 && !weekScheduleInfo;
  const showEmptyState = hasNoData || isWeekExpired;

  if (showEmptyState) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {isWeekExpired ? (
            <EmptyState
              icon="calendar"
              title="Semana Expirada"
              description={`A planilha de torneios da semana anterior venceu. Insira uma nova planilha para continuar gerando flyers.${weekScheduleInfo ? ` Última planilha: ${weekScheduleInfo.startDate} a ${weekScheduleInfo.endDate}` : ''}`}
              size="large"
            >
              <label className="cursor-pointer group inline-block">
                <div className="bg-primary text-black font-black px-6 py-3 rounded-xl flex items-center justify-center space-x-3 transition-all hover:bg-primary/90 active:scale-95">
                  <Icon name="upload" className="w-4 h-4" />
                  <span className="text-sm uppercase tracking-wide">Carregar Nova Planilha</span>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
                />
              </label>
              {onClearExpiredSchedule && (
                <Button variant="secondary" onClick={onClearExpiredSchedule}>
                  Limpar dados antigos
                </Button>
              )}
            </EmptyState>
          ) : (
            <EmptyState
              icon="calendar"
              title="Nenhuma Planilha"
              description="Carregue a planilha de torneios da semana para começar a gerar flyers automaticamente."
              subtitle="Formatos suportados: .xlsx, .xls"
              size="large"
            >
              <label className="cursor-pointer group inline-block">
                <div className="bg-primary text-black font-black px-6 py-3 rounded-xl flex items-center justify-center space-x-3 transition-all hover:bg-primary/90 active:scale-95">
                  <Icon name="upload" className="w-4 h-4" />
                  <span className="text-sm uppercase tracking-wide">Carregar Planilha Excel</span>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
                />
              </label>
              <Button variant="secondary" onClick={() => setIsManualModalOpen(true)} icon="edit">
                Adicionar Torneio Manual
              </Button>
            </EmptyState>
          )}
        </div>

        {/* Manual modal still needs to be available */}
        <ManualEventModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={(ev) => onAddEvent(ev)} day={currentDayName} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
    <div className="flex-1 overflow-y-auto">
    <div className="space-y-6 animate-fade-in-up px-6 py-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-left"><h2 className="text-2xl font-black text-white uppercase tracking-tight">Daily Protocol</h2><p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Agrupamento Inteligente • Ciclo Diário</p></div>
            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setShowIndividualTournaments(!showIndividualTournaments)} variant={showIndividualTournaments ? "primary" : "secondary"} icon={showIndividualTournaments ? "zap" : "calendar"} size="small">
                    {showIndividualTournaments ? 'Grades de Período' : 'Torneios Individuais'}
                </Button>
                {showIndividualTournaments && (
                    <>
                        <button
                            onClick={() => setShowOnlyWithGtd(!showOnlyWithGtd)}
                            className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                                showOnlyWithGtd
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'bg-[#0a0a0a] text-white/40 border border-white/10 hover:text-white/60'
                            }`}
                        >
                            {showOnlyWithGtd ? `Com GTD (${dayStats.withGtd})` : 'Só c/ GTD'}
                        </button>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'time' | 'gtd')}
                            className="px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#0a0a0a] text-white/60 border border-white/10 outline-none cursor-pointer"
                        >
                            <option value="time">Por Horário</option>
                            <option value="gtd">Por GTD ↓</option>
                        </select>
                    </>
                )}
                {currentEvents.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] border border-white/10 rounded-lg">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-wider">{showOnlyWithGtd ? currentEvents.length : dayStats.count} torneios</span>
                        <div className="h-3 w-px bg-white/20" />
                        <span className="text-[9px] font-black text-primary/70 uppercase tracking-wider">{formatCurrencyValue(String(dayStats.totalGtd), selectedCurrency)}</span>
                    </div>
                )}
                <Button onClick={() => setIsManualModalOpen(true)} variant="secondary" icon="edit" size="small">Add Manual</Button>
                <label className="cursor-pointer group"><div className="bg-white text-black font-black px-4 py-2.5 rounded-xl flex items-center space-x-2 transition-all active:scale-95 text-[10px] tracking-wide uppercase hover:bg-white/90"><Icon name="upload" className="w-3.5 h-3.5" /><span>Upload Spreadsheet</span></div><input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])} /></label>
            </div>
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
                <button
                  onClick={() => setIsSchedulesPanelOpen(!isSchedulesPanelOpen)}
                  className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                >
                  <Icon name="calendar" className="w-3 h-3 text-white/20" />
                  <span className="text-[8px] font-bold text-white/40 uppercase">Semana {weekScheduleInfo.startDate} a {weekScheduleInfo.endDate}</span>
                  <Icon name={isSchedulesPanelOpen ? 'chevron-up' : 'chevron-down'} className="w-3 h-3 text-white/20" />
                </button>
              )}
              <div className="h-3 w-px bg-white/10" />
              <span className="text-[8px] font-black text-white/30 uppercase">{weekStats.totalTournaments} torneios</span>
              <div className="h-3 w-px bg-white/10" />
              <span className="text-[8px] font-black text-primary/60 uppercase">GTD Total: {formatCurrencyValue(String(weekStats.totalGtd), selectedCurrency)}</span>
            </div>
            {allSchedules.length > 1 && (
              <span className="text-[8px] text-white/20">{allSchedules.length} planilhas salvas</span>
            )}
          </div>
        )}

        {/* Lista de planilhas salvas */}
        {isSchedulesPanelOpen && allSchedules.length > 0 && (
          <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 space-y-2 animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-black text-white/50 uppercase tracking-wider">Planilhas Salvas</h4>
              <button onClick={() => setIsSchedulesPanelOpen(false)} className="text-white/30 hover:text-white/50">
                <Icon name="x" className="w-3 h-3" />
              </button>
            </div>
            <div className="grid gap-2 max-h-48 overflow-y-auto">
              {allSchedules.map((schedule) => {
                const startDate = new Date(schedule.start_date);
                const endDate = new Date(schedule.end_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isCurrentWeek = today >= startDate && today <= endDate;
                const isExpired = today > endDate;
                const isSelected = currentScheduleId === schedule.id;

                const formatDate = (date: Date) => {
                  const day = String(date.getDate()).padStart(2, '0');
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  return `${day}/${month}`;
                };

                return (
                  <button
                    key={schedule.id}
                    onClick={() => onSelectSchedule?.(schedule)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30'
                        : isCurrentWeek
                          ? 'bg-green-500/10 border-green-500/20 hover:border-green-500/40'
                          : isExpired
                            ? 'bg-white/[0.02] border-white/5 hover:border-white/10 opacity-60'
                            : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isCurrentWeek ? 'bg-green-500/20' : isExpired ? 'bg-white/5' : 'bg-white/5'
                      }`}>
                        <Icon name="calendar" className={`w-4 h-4 ${
                          isCurrentWeek ? 'text-green-500' : 'text-white/30'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] font-bold truncate ${
                          isSelected ? 'text-primary' : isCurrentWeek ? 'text-green-400' : 'text-white/70'
                        }`}>
                          {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        <p className="text-[8px] text-white/30 truncate">
                          {schedule.filename || 'Planilha'} • {schedule.event_count} torneios
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isCurrentWeek && (
                        <span className="text-[7px] font-black text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded uppercase">
                          Atual
                        </span>
                      )}
                      {isExpired && !isCurrentWeek && (
                        <span className="text-[7px] font-black text-white/30 bg-white/5 px-1.5 py-0.5 rounded uppercase">
                          Expirada
                        </span>
                      )}
                      {isSelected && (
                        <Icon name="check" className="w-3 h-3 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-4">
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
        </div>

        {/* Opções de assets - linha simples igual aos selects */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 -mt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Logo Colab</label>
              <label className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white/20 transition-colors group">
                {collabLogo ? (
                  <>
                    <img src={collabLogo} className="w-5 h-5 object-contain rounded" />
                    <span className="flex-1 truncate text-white/60">Logo adicionado</span>
                    <button onClick={(e) => { e.preventDefault(); setCollabLogo(null); }} className="text-white/30 hover:text-red-400 transition-colors"><Icon name="x" className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="w-4 h-4 text-white/20" />
                    <span className="text-white/30">Adicionar logo</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { dataUrl } = await fileToBase64(f); setCollabLogo(dataUrl); } }} />
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Referência</label>
              <label className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white/20 transition-colors group">
                {manualStyleRef ? (
                  <>
                    <img src={manualStyleRef} className="w-5 h-5 object-cover rounded" />
                    <span className="flex-1 truncate text-white/60">Referência ativa</span>
                    <button onClick={(e) => { e.preventDefault(); setManualStyleRef(null); setGlobalStyleReference(null); }} className="text-white/30 hover:text-red-400 transition-colors"><Icon name="x" className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <Icon name="image" className="w-4 h-4 text-white/20" />
                    <span className="text-white/30">Adicionar estilo</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { dataUrl } = await fileToBase64(f); setManualStyleRef(dataUrl); setGlobalStyleReference({ id: 'manual-ref', src: dataUrl, prompt: 'Estilo Manual', source: 'Edição', model: selectedImageModel }); } }} />
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Ativos</label>
              <label className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white/20 transition-colors">
                {compositionAssets.length > 0 ? (
                  <>
                    <div className="flex -space-x-1">
                      {compositionAssets.slice(0, 3).map((asset, idx) => (
                        <img key={idx} src={(asset as any).preview} className="w-5 h-5 object-cover rounded border border-black" />
                      ))}
                    </div>
                    <span className="flex-1 text-white/60">{compositionAssets.length} ativo{compositionAssets.length > 1 ? 's' : ''}</span>
                    <button onClick={(e) => { e.preventDefault(); setCompositionAssets([]); }} className="text-white/30 hover:text-red-400 transition-colors"><Icon name="x" className="w-3.5 h-3.5" /></button>
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="w-4 h-4 text-white/20" />
                    <span className="text-white/30">Mockups, pessoas</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const { base64, mimeType, dataUrl } = await fileToBase64(f); setCompositionAssets(prev => [...prev, { base64, mimeType, preview: dataUrl } as any]); } }} />
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">Favoritos</label>
              <button onClick={() => setIsStylePanelOpen(!isStylePanelOpen)} className={`w-full bg-[#0a0a0a] border rounded-xl px-3 py-2.5 text-xs flex items-center gap-2 transition-colors ${isStylePanelOpen ? 'border-primary/50 text-primary' : 'border-white/10 text-white/30 hover:border-white/20'}`}>
                <Icon name="layout" className="w-4 h-4" />
                <span>{styleReferences.length} estilos salvos</span>
              </button>
            </div>
        </div>

        {!showIndividualTournaments ? (
            <div className="space-y-2">
                {(['ALL', 'MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'] as TimePeriod[]).map(p => (
                    <PeriodCardRow
                        key={p}
                        period={p} label={periodLabels[selectedLanguage][p]} events={getEventsByPeriod(p)} brandProfile={brandProfile} aspectRatio={selectedAspectRatio} currency={selectedCurrency} model={selectedImageModel} imageSize={selectedImageSize} language={selectedLanguage}
                        onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} generatedFlyers={dailyFlyerState[p]} setGeneratedFlyers={(u) => setDailyFlyerState(prev => ({...prev, [p]: u(prev[p])}))} triggerBatch={batchTrigger} styleReference={globalStyleReference} onCloneStyle={handleSetStyleReference} collabLogo={collabLogo} compositionAssets={compositionAssets} onPublishToCampaign={onPublishToCampaign} userId={userId}
                    />
                ))}
            </div>
        ) : (
            <div className="space-y-2">
                {currentEvents.length > 0 ? currentEvents.map(e => (
                    <TournamentEventCard
                        key={e.id} event={e} brandProfile={brandProfile} aspectRatio={selectedAspectRatio} currency={selectedCurrency} language={selectedLanguage} model={selectedImageModel} imageSize={selectedImageSize}
                        onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference}
                        generatedFlyers={flyerState[e.id] || []} setGeneratedFlyers={(u) => setFlyerState(prev => ({...prev, [e.id]: u(prev[e.id] || [])}))}
                        collabLogo={collabLogo} styleReference={globalStyleReference} compositionAssets={compositionAssets} onPublishToCampaign={onPublishToCampaign} userId={userId}
                    />
                )) : <p className="text-white/20 text-xs font-bold uppercase tracking-wide text-center py-12">Nenhum torneio detectado para este dia.</p>}
            </div>
        )}
        <ManualEventModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={(ev) => onAddEvent(ev)} day={selectedDay} />
    </div>
    </div>

    {/* Painel Lateral Integrado de Favoritos */}
    <div
      className={`bg-[#070707] border-l border-white/5 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out ${
        isStylePanelOpen ? 'w-80' : 'w-0 opacity-0 pointer-events-none'
      }`}
    >
      {isStylePanelOpen && (
        <>
          {/* Header */}
          <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-b from-[#0d0d0d] to-[#070707]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                <Icon name="layout" className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-white uppercase tracking-wider">Favoritos</h3>
                <p className="text-[8px] text-white/30 font-bold uppercase tracking-wide mt-0.5">{styleReferences.length} Estilos</p>
              </div>
            </div>
            <button
              onClick={() => setIsStylePanelOpen(false)}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all group"
            >
              <Icon name="chevron-up" className="w-4 h-4 rotate-90 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Info Banner */}
          {selectedStyleReference && (
            <div className="px-6 py-3 bg-primary/10 border-b border-primary/20 flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Icon name="check" className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black text-primary uppercase tracking-wide">Estilo Ativo</p>
                <p className="text-[9px] text-white/70 truncate font-bold">{selectedStyleReference.name}</p>
              </div>
              <button
                onClick={() => {
                  if (onClearSelectedStyleReference) onClearSelectedStyleReference();
                }}
                className="text-primary/50 hover:text-primary transition-colors"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {styleReferences.length > 0 ? (
              <div className="space-y-3">
                {styleReferences.map((ref) => {
                  const isSelected = selectedStyleReference?.id === ref.id;
                  return (
                    <button
                      key={ref.id}
                      onClick={() => {
                        if (onSelectStyleReference) {
                          onSelectStyleReference(ref);
                        }
                      }}
                      className={`group relative w-full aspect-[4/3] rounded-xl overflow-hidden transition-all cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-[#070707] scale-[1.02]'
                          : 'border border-white/10 hover:border-primary/30 hover:scale-[1.01]'
                      }`}
                    >
                      <img src={ref.src} className="w-full h-full object-cover" alt={ref.name} />

                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                      {/* Info */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-[9px] font-black text-white uppercase tracking-wide truncate">
                          {ref.name}
                        </p>
                        <p className="text-[7px] text-white/50 uppercase tracking-wider mt-0.5 font-bold">
                          {new Date(ref.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>

                      {/* Selected Badge */}
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-primary shadow-lg shadow-primary/50 flex items-center justify-center">
                          <Icon name="check" className="w-4 h-4 text-black" />
                        </div>
                      )}

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon="heart"
                title="Nenhum Favorito"
                description="Salve estilos de imagens na galeria para usar aqui como referência visual."
                size="small"
              />
            )}
          </div>
        </>
      )}
    </div>
    </div>
  );
};
