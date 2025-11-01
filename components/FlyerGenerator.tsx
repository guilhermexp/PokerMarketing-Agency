
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { BrandProfile, ToneOfVoice, TournamentEvent, ImageFile, GalleryImage, ImageModel } from '../types';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';
import { generateFlyer } from '../services/geminiService';
import { ImagePreviewModal } from './common/ImagePreviewModal';
import { useDropzone } from 'react-dropzone';

export type TimePeriod = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';

interface FlyerGeneratorProps {
  brandProfile: BrandProfile;
  events: TournamentEvent[];
  onFileUpload: (file: File) => Promise<void>;
  onAddEvent: (event: TournamentEvent) => void;
  // FIX: Update prop types to handle GalleryImage objects for robust state management.
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  flyerState: Record<string, (GalleryImage | 'loading')[]>;
  setFlyerState: React.Dispatch<React.SetStateAction<Record<string, (GalleryImage | 'loading')[]>>>;
  dailyFlyerState: Record<TimePeriod, (GalleryImage | 'loading')[]>;
  setDailyFlyerState: React.Dispatch<React.SetStateAction<Record<TimePeriod, (GalleryImage | 'loading')[]>>>;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage) => void;
}

// Sub-component for displaying a single tournament
const TournamentEventCard: React.FC<{
  event: TournamentEvent;
  timezone: string;
  brandProfile: BrandProfile;
  logo: ImageFile | null;
  referenceImage: ImageFile | null;
  aspectRatio: string;
  language: 'pt' | 'en';
  dayTranslations: Record<string, string>;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage) => void;
  generatedFlyers: (GalleryImage | 'loading')[];
  setGeneratedFlyers: (updater: (prev: (GalleryImage | 'loading')[]) => (GalleryImage | 'loading')[]) => void;
  model: ImageModel;
}> = ({ 
  event, timezone, brandProfile, logo, referenceImage, aspectRatio, language, dayTranslations, 
  onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, generatedFlyers, setGeneratedFlyers, model
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
  const [galleryScrollIndex, setGalleryScrollIndex] = useState(0);

  const MAX_VISIBLE_ITEMS = 4;
  const totalItems = generatedFlyers.length;
  const canScrollPrev = galleryScrollIndex > 0;
  const canScrollNext = galleryScrollIndex < totalItems - MAX_VISIBLE_ITEMS;

  const scrollPrev = () => {
    setGalleryScrollIndex(prev => Math.max(0, prev - 1));
  };
  const scrollNext = () => {
    setGalleryScrollIndex(prev => Math.min(totalItems - MAX_VISIBLE_ITEMS, prev + 1));
  };

  useEffect(() => {
    // When a new image is added, scroll to the beginning to show it
    if (generatedFlyers[0] === 'loading') {
      setGalleryScrollIndex(0);
    }
  }, [generatedFlyers]);


  const handleGenerateFlyer = async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedFlyers(prev => ['loading', ...prev]);

    const toneOfVoiceMap: Record<ToneOfVoice, string> = {
        'Profissional': 'Professional', 'Espirituoso': 'Witty', 'Casual': 'Casual',
        'Inspirador': 'Inspirational', 'Técnico': 'Technical'
    };
    const englishTone = toneOfVoiceMap[brandProfile.toneOfVoice] || brandProfile.toneOfVoice;

    const dayName = dayTranslations[event.day] || event.day;
    const englishDayName = event.day.charAt(0).toUpperCase() + event.day.slice(1).toLowerCase();

    const promptPt = `Crie um flyer promocional de poker para um torneio online.
- **Marca:** ${brandProfile.name}
- **Identidade Visual:** O estilo deve ser ${brandProfile.toneOfVoice}, usando as cores ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (secundária). O design deve ser moderno, impactante e adequado para redes sociais.

**INFORMAÇÕES OBRIGATÓRIAS (DEVEM ESTAR VISÍVEIS NO FLYER):**
- **Nome do Torneio:** ${event.name} (dar destaque)
- **Data:** ${dayName}
- **Horário:** ${event.times[timezone]} (GMT ${timezone})
- **Buy-in:** $${event.buyIn}
- **Garantido (GTD):** ${event.gtd ? `$${event.gtd}` : 'N/A'}

- **Importante:** O texto DEVE ser gerado DENTRO da imagem. Crie um design gráfico completo e coeso, garantindo que todas as informações obrigatórias sejam legíveis.
- **REQUISITO DE FORMATO OBRIGATÓRIO:** A imagem final DEVE ter uma proporção de ${aspectRatio}. Esta é a instrução mais importante e deve ser seguida estritamente.`;

    const promptEn = `Create a promotional poker flyer for an online tournament.
- **Brand:** ${brandProfile.name}
- **Visual Identity:** The style should be ${englishTone}, using the colors ${brandProfile.primaryColor} (primary) and ${brandProfile.secondaryColor} (secondary). The design must be modern, impactful, and suitable for social media.

**MANDATORY INFORMATION (MUST BE VISIBLE ON THE FLYER):**
- **Tournament Name:** ${event.name} (give prominence)
- **Date:** ${englishDayName}
- **Time:** ${event.times[timezone]} (GMT ${timezone})
- **Buy-in:** $${event.buyIn}
- **Guaranteed (GTD):** ${event.gtd ? `$${event.gtd}` : 'N/A'}

- **Important:** The text MUST be generated INSIDE the image. Create a complete and cohesive graphic design, ensuring all mandatory information is legible.
- **MANDATORY FORMAT REQUIREMENT:** The final image MUST have an aspect ratio of ${aspectRatio}. This is the most important instruction and must be followed strictly.`;
    
    const prompt = language === 'en' ? promptEn : promptPt;

    try {
      const logoData = logo ? { base64: logo.base64, mimeType: logo.mimeType } : null;
      const refImageData = referenceImage ? { base64: referenceImage.base64, mimeType: referenceImage.mimeType } : null;

      const imageUrl = await generateFlyer(prompt, brandProfile, logoData, refImageData, aspectRatio, model);
      const newImage = onAddImageToGallery({ src: imageUrl, prompt: prompt, source: 'Flyer', model: model });
      setGeneratedFlyers(prev => {
        const newFlyers = [...prev];
        const index = newFlyers.indexOf('loading');
        if (index > -1) {
            newFlyers[index] = newImage;
        }
        return newFlyers;
      });
    } catch (err: any)      {
      setError(err.message || 'A geração do flyer falhou.');
      setGeneratedFlyers(prev => prev.filter(f => f !== 'loading'));
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleImageUpdate = (newImageUrl: string) => {
    if (editingFlyer === null) return;
    onUpdateGalleryImage(editingFlyer.id, newImageUrl);
    const updatedFlyer = { ...editingFlyer, src: newImageUrl };
    setGeneratedFlyers(prev => {
        const newFlyers = [...prev];
        const index = prev.findIndex(f => f !== 'loading' && f.id === editingFlyer.id);
        if (index > -1) {
            newFlyers[index] = updatedFlyer;
        }
        return newFlyers;
    });
    setEditingFlyer(updatedFlyer);
  };

  const getStructureColor = (structure: string) => {
    switch (structure?.toLowerCase()) {
      case 'turbo': return 'bg-red-500/20 text-red-300';
      case 'deepstack': return 'bg-blue-500/20 text-blue-300';
      case 'regular': return 'bg-green-500/20 text-green-300';
      default: return 'bg-slate-500/20 text-slate-300';
    }
  };

  return (
    <>
      <div className="bg-surface/50 border border-muted/50 rounded-lg">
        {/* Event Details Section */}
        <div className="p-4">
            <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div>
                    <h3 className="font-bold text-lg text-text-main">{event.name}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-subtle flex-wrap">
                        <span className="flex items-center gap-1.5"><Icon name="clock" className="w-4 h-4" /> {event.times[timezone]}</span>
                        <span className="flex items-center gap-1.5"><Icon name="dollar-sign" className="w-4 h-4" /> Buy-in: ${event.buyIn}</span>
                        {event.gtd && <span className="flex items-center gap-1.5"><Icon name="trophy" className="w-4 h-4" /> GTD: ${event.gtd}</span>}
                        <span className="flex items-center gap-1.5"><Icon name="users" className="w-4 h-4" /> {event.players} max</span>
                    </div>
                </div>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
            </div>
            {event.structure && (
                <span className={`mt-3 inline-block px-2 py-1 rounded-full text-xs font-medium ${getStructureColor(event.structure)}`}>
                    {event.structure}
                </span>
            )}
        </div>

        {/* Expanded Details Section */}
        {expanded && (
          <div className="p-4 bg-background/30 border-t border-muted/50">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-subtle">Game:</span><span className="ml-2 font-medium">{event.game || 'N/A'}</span></div>
                <div><span className="text-subtle">Stack:</span><span className="ml-2 font-medium">{event.stack || 'N/A'}</span></div>
                <div><span className="text-subtle">Late Reg:</span><span className="ml-2 font-medium">{event.lateReg || 'N/A'}</span></div>
                <div><span className="text-subtle">Rebuy:</span><span className="ml-2 font-medium">${event.rebuy || 'N/A'}</span></div>
                <div><span className="text-subtle">Add-on:</span><span className="ml-2 font-medium">${event.addOn || 'N/A'}</span></div>
                <div><span className="text-subtle">Níveis:</span><span className="ml-2 font-medium">{event.minutes || 'N/A'}</span></div>
            </div>
          </div>
        )}
        
        {/* Flyer Gallery & Generation Section */}
        <div className="p-4 border-t border-muted/50">
            <div className="relative mb-4">
                {totalItems === 0 ? (
                    <div className="h-52 bg-background/50 flex items-center justify-center p-2 rounded-lg">
                        <div className="flex flex-col items-center justify-center text-center p-4 text-text-muted">
                            <Icon name="image" className="w-12 h-12 mb-2"/>
                            <p className="text-sm">Gere um flyer para este evento</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-hidden h-52">
                        <div
                            className="flex h-full transition-transform duration-300 ease-in-out"
                            style={{ transform: `translateX(-${galleryScrollIndex * (100 / MAX_VISIBLE_ITEMS)}%)` }}
                        >
                            {generatedFlyers.map((flyer, index) => (
                                <div
                                    key={flyer === 'loading' ? `loading-${index}` : flyer.id}
                                    className="flex-shrink-0 h-full p-1"
                                    style={{ width: `${100 / MAX_VISIBLE_ITEMS}%` }}
                                >
                                    {flyer === 'loading' ? (
                                        <div className="w-full h-full bg-background/50 rounded-md flex items-center justify-center animate-pulse">
                                            <Loader className="w-8 h-8" />
                                        </div>
                                    ) : (
                                        <img
                                            src={flyer.src}
                                            alt={`Flyer for ${event.name} #${index + 1}`}
                                            className="w-full h-full object-contain rounded-md cursor-pointer"
                                            onClick={() => setEditingFlyer(flyer)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {totalItems > MAX_VISIBLE_ITEMS && (
                     <>
                        <button
                            onClick={scrollPrev}
                            disabled={!canScrollPrev}
                            className="absolute top-1/2 left-1 -translate-y-1/2 bg-black/40 text-white p-1 rounded-full transition-opacity focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Previous Images"
                        >
                            <Icon name="chevron-down" className="w-4 h-4 rotate-90" />
                        </button>
                        <button
                            onClick={scrollNext}
                            disabled={!canScrollNext}
                            className="absolute top-1/2 right-1 -translate-y-1/2 bg-black/40 text-white p-1 rounded-full transition-opacity focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Next Images"
                        >
                            <Icon name="chevron-up" className="w-4 h-4 rotate-90" />
                        </button>
                    </>
                )}
            </div>

            <div>
              <Button onClick={handleGenerateFlyer} size="small" isLoading={isGenerating} className="w-full sm:w-auto" icon="zap">
                {totalItems > 0 ? 'Gerar Outro' : 'Gerar Flyer'}
              </Button>
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>
        </div>

      </div>
      {/* FIX: Pass a GalleryImage object to the 'image' prop instead of 'imageUrl'. */}
      {editingFlyer && (
        <ImagePreviewModal
          image={editingFlyer}
          onClose={() => setEditingFlyer(null)}
          onImageUpdate={handleImageUpdate}
          onSetChatReference={onSetChatReference}
          downloadFilename={`flyer-${event.name.replace(/\s+/g, '_')}.png`}
        />
      )}
    </>
  );
};

// FIX: Define a local interface for image files that includes the 'preview' URL needed for UI rendering.
interface ImageFileWithPreview extends ImageFile {
  preview: string;
}

// FIX: Rename function from 'fileToBase64' to 'fileToImageFile' to match usage.
// FIX: Update return type to match the local ImageFileWithPreview interface, resolving the type error on 'preview'.
const fileToImageFile = (file: File): Promise<ImageFileWithPreview> =>
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

// FIX: Update props to use the local ImageFileWithPreview type.
const ImageUploader: React.FC<{
    image: ImageFileWithPreview | null;
    onImageChange: (image: ImageFileWithPreview | null) => void;
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
            <label className="block text-sm font-medium text-subtle mb-1">{title}</label>
            <div
                {...getRootProps()}
                className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors h-28 flex flex-col justify-center items-center ${isDragActive ? 'border-primary bg-primary/10' : 'border-muted/50 hover:border-subtle'}`}
            >
                <input {...getInputProps()} />
                {image ? (
                    <>
                        {/* FIX: image.preview is now valid due to updated prop type. */}
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
                        <Icon name="upload" className="w-6 h-6 mb-1" />
                        <p>Arraste ou clique para enviar</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const ImageCarousel: React.FC<{
  images: (GalleryImage | 'loading')[];
  onImageClick: (image: GalleryImage, index: number) => void;
  alt: string;
}> = ({ images, onImageClick, alt }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // When a new image is added (as 'loading'), reset to show it
    if (images.includes('loading') && images.indexOf('loading') !== currentIndex) {
      setCurrentIndex(images.indexOf('loading'));
    } else if (!images[currentIndex] && images.length > 0) {
      // If the current index becomes invalid (e.g. image deleted), reset
      setCurrentIndex(0);
    }
  }, [images, currentIndex]);

  const goToPrevious = () => {
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? images.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const goToNext = () => {
    const isLastSlide = currentIndex === images.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };
  
  const currentImage = images[currentIndex];

  if (!images || images.length === 0) return null;

  return (
    <div className="w-full h-full relative group">
      {currentImage === 'loading' ? (
        <div className="w-full h-full bg-background/50 rounded-md flex items-center justify-center animate-pulse">
            <Loader className="w-8 h-8" />
        </div>
      ) : (
        <img
            src={currentImage.src}
            alt={`${alt} #${currentIndex + 1}`}
            className="w-full h-full object-contain rounded-md cursor-pointer"
            onClick={() => onImageClick(currentImage, currentIndex)}
        />
      )}

      {images.length > 1 && (
        <>
            <button 
                onClick={goToPrevious}
                className="absolute top-1/2 left-1 -translate-y-1/2 bg-black/40 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
                aria-label="Previous Image"
            >
                <Icon name="chevron-down" className="w-4 h-4 rotate-90" />
            </button>
            <button
                onClick={goToNext}
                className="absolute top-1/2 right-1 -translate-y-1/2 bg-black/40 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
                aria-label="Next Image"
            >
                <Icon name="chevron-up" className="w-4 h-4 rotate-90" />
            </button>
            <div className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                {currentIndex + 1} / {images.length}
            </div>
        </>
      )}
    </div>
  );
};


const DailySummaryCard: React.FC<{
    period: TimePeriod;
    title: string;
    flyers: (GalleryImage | 'loading')[];
    isGenerating: boolean;
    onGenerate: () => void;
    onImageClick: (image: GalleryImage, index: number) => void;
}> = ({ period, title, flyers, isGenerating, onGenerate, onImageClick }) => (
    <Card className="p-4 flex flex-col">
        <h4 className="text-lg font-bold text-text-main mb-3">{title}</h4>
        <div className="flex-grow bg-background/30 p-2 rounded-lg min-h-[17rem]">
            {flyers.length > 0 ? (
                <ImageCarousel
                    images={flyers}
                    onImageClick={onImageClick}
                    alt={`Flyer for ${title}`}
                />
            ) : (
                 <div className="h-full flex items-center justify-center text-center text-text-muted">
                    <p className="text-sm">Gere um flyer para este período</p>
                </div>
            )}
        </div>
        <Button onClick={onGenerate} isLoading={isGenerating} size="small" className="mt-4 w-full" icon="zap">
            {flyers.length > 0 ? 'Gerar Outro' : 'Gerar Flyer'}
        </Button>
    </Card>
);

const FormInput: React.FC<{label: string, name: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder?: string}> = ({ label, name, value, onChange, placeholder = '' }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-subtle mb-1">{label}</label>
        <input type="text" name={name} id={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2 text-text-main focus:ring-2 focus:ring-primary"/>
    </div>
);

const ManualEventForm: React.FC<{
  onAddEvent: (event: TournamentEvent) => void;
  onCancel: () => void;
  daysOfWeek: string[];
  dayTranslations: Record<string, string>;
  timezones: string[];
  selectedTimezone: string;
}> = ({ onAddEvent, onCancel, daysOfWeek, dayTranslations, timezones, selectedTimezone }) => {
    const [eventData, setEventData] = useState({
        name: '', game: '', gtd: '', buyIn: '', rebuy: '', addOn: '', stack: '',
        players: '', lateReg: '', minutes: '', structure: '',
        day: daysOfWeek[0], time: '12:00',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEventData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!eventData.name.trim() || !eventData.day || !eventData.time) {
            alert("Nome do Torneio, Dia e Horário são obrigatórios.");
            return;
        }

        const times: Record<string, string> = {};
        timezones.forEach(tz => {
            times[tz] = tz === selectedTimezone ? eventData.time : '--:--';
        });
        
        const newEvent: TournamentEvent = {
            id: `manual-${new Date().toISOString()}`,
            ...eventData,
            times,
        };
        
        onAddEvent(newEvent);
        onCancel();
    };

    return (
        <div className="mt-4 pt-4 border-t border-muted/30">
            <h3 className="text-xl font-bold mb-4 text-text-main">Adicionar Torneio Manualmente</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-3">
                        <FormInput label="Nome do Torneio" name="name" value={eventData.name} onChange={handleChange} placeholder="Ex: BOXING KO" />
                    </div>
                    <div>
                        <label htmlFor="day" className="block text-sm font-medium text-subtle mb-1">Dia</label>
                        <select name="day" id="day" value={eventData.day} onChange={handleChange} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                            {daysOfWeek.map(day => <option key={day} value={day}>{dayTranslations[day]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="time" className="block text-sm font-medium text-subtle mb-1">Horário (fuso atual)</label>
                        <input type="time" name="time" id="time" value={eventData.time} onChange={handleChange} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary"/>
                    </div>
                    <FormInput label="Game" name="game" value={eventData.game} onChange={handleChange} placeholder="Ex: NLH KO" />
                    <FormInput label="Buy-in ($)" name="buyIn" value={eventData.buyIn} onChange={handleChange} placeholder="Ex: 1" />
                    <FormInput label="GTD ($)" name="gtd" value={eventData.gtd} onChange={handleChange} placeholder="Ex: 200" />
                    <FormInput label="Rebuy ($)" name="rebuy" value={eventData.rebuy} onChange={handleChange} placeholder="Ex: 1" />
                    <FormInput label="Add-on ($)" name="addOn" value={eventData.addOn} onChange={handleChange} placeholder="Ex: N/A" />
                    <FormInput label="Stack" name="stack" value={eventData.stack} onChange={handleChange} placeholder="Ex: 15000" />
                    <FormInput label="Jogadores" name="players" value={eventData.players} onChange={handleChange} placeholder="Ex: 8 max" />
                    <FormInput label="Late Reg." name="lateReg" value={eventData.lateReg} onChange={handleChange} placeholder="Ex: 11 níveis" />
                    <FormInput label="Níveis (min)" name="minutes" value={eventData.minutes} onChange={handleChange} placeholder="Ex: 6 min" />
                    <FormInput label="Estrutura" name="structure" value={eventData.structure} onChange={handleChange} placeholder="Ex: Turbo" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" onClick={onCancel} variant="secondary">Cancelar</Button>
                    <Button type="submit" icon="zap">Salvar Torneio</Button>
                </div>
            </form>
        </div>
    );
};


export const FlyerGenerator: React.FC<FlyerGeneratorProps> = ({ 
    brandProfile, events, onFileUpload, onAddEvent, onAddImageToGallery, 
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState,
    onUpdateGalleryImage, onSetChatReference
}) => {
  const [filteredEvents, setFilteredEvents] = useState<TournamentEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState('ALL');
  const [selectedTimezone, setSelectedTimezone] = useState('-3');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');
  const [selectedLanguage, setSelectedLanguage] = useState<'pt' | 'en'>('pt');
  const [loading, setLoading] = useState(false);
  const [fileLoaded, setFileLoaded] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  // FIX: Update default model name and available options to be compliant with Gemini API guidelines.
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-2.5-flash-image');
  
  // FIX: Update state to use the local ImageFileWithPreview type.
  const [logo, setLogo] = useState<ImageFileWithPreview | null>(null);
  const [referenceImage, setReferenceImage] = useState<ImageFileWithPreview | null>(null);

  // State for daily summary flyer
  const [isGeneratingIndividual, setIsGeneratingIndividual] = useState<Partial<Record<TimePeriod, boolean>>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [dailyFlyerError, setDailyFlyerError] = useState<string | null>(null);
  const [editingDailyFlyer, setEditingDailyFlyer] = useState<{ image: GalleryImage; period: TimePeriod } | null>(null);


  const daysOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const timezones = ['-5', '-3', 'UTC', '+1', '+3', '+8', '+10'];
  const aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];

  const dayTranslations: Record<string, string> = {
    'MONDAY': 'Segunda-feira', 'TUESDAY': 'Terça-feira', 'WEDNESDAY': 'Quarta-feira',
    'THURSDAY': 'Quinta-feira', 'FRIDAY': 'Sexta-feira', 'SATURDAY': 'Sábado',
    'SUNDAY': 'Domingo', 'ALL': 'Todos os dias'
  };
  
  const periodTranslations: Record<TimePeriod, { pt: string, en: string }> = {
    ALL: { pt: 'Dia Inteiro', en: 'All Day' },
    MORNING: { pt: 'Manhã', en: 'Morning' },
    AFTERNOON: { pt: 'Tarde', en: 'Afternoon' },
    NIGHT: { pt: 'Noite', en: 'Night' },
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      try {
        await onFileUpload(file);
        setFileLoaded(true);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  };

  const createDailyFlyerForPeriod = async (periodToGenerate: TimePeriod): Promise<{imageUrl: string; prompt: string}> => {
    const timeToMinutes = (timeStr: string): number => {
        if (!timeStr || !timeStr.includes(':')) return -1;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    let periodEvents = [...filteredEvents];

    if (periodToGenerate !== 'ALL') {
        periodEvents = periodEvents.filter(event => {
            const minutes = timeToMinutes(event.times[selectedTimezone]);
            if (minutes === -1) return false;
            switch (periodToGenerate) {
                case 'MORNING': return minutes >= 360 && minutes < 720; // 06:00 - 11:59
                case 'AFTERNOON': return minutes >= 720 && minutes < 1080; // 12:00 - 17:59
                case 'NIGHT': return minutes >= 1080 || minutes < 360; // 18:00 - 05:59
                default: return true;
            }
        });
    }

    if (periodEvents.length === 0) {
        throw new Error(`Nenhum evento encontrado para o período: ${periodTranslations[periodToGenerate].pt}.`);
    }

    const sortedEvents = [...periodEvents].sort((a, b) => {
        const timeA = a.times[selectedTimezone] || '99:99';
        const timeB = b.times[selectedTimezone] || '99:99';
        return timeA.localeCompare(timeB);
    });

    const mainEvent = [...sortedEvents].sort((a, b) => {
        const gtdA = parseFloat(String(a.gtd).replace(/,/g, '')) || 0;
        const gtdB = parseFloat(String(b.gtd).replace(/,/g, '')) || 0;
        return gtdB - gtdA;
    })[0];

    const eventListStringPt = sortedEvents.map(e => 
        `- Horário: ${e.times[selectedTimezone]}, Nome: ${e.name}, Buy-in: $${e.buyIn}, GTD: $${e.gtd}`
    ).join('\n');

    const eventListStringEn = sortedEvents.map(e => 
        `- Time: ${e.times[selectedTimezone]}, Name: ${e.name}, Buy-in: $${e.buyIn}, GTD: $${e.gtd}`
    ).join('\n');
    
    const dayName = dayTranslations[selectedDay];
    const englishDayName = selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1).toLowerCase();
    const periodNamePt = periodTranslations[periodToGenerate].pt;
    const periodNameEn = periodTranslations[periodToGenerate].en;
    
    const toneOfVoiceMap: Record<ToneOfVoice, string> = {
        'Profissional': 'Professional', 'Espirituoso': 'Witty', 'Casual': 'Casual',
        'Inspirador': 'Inspirational', 'Técnico': 'Technical'
    };
    const englishTone = toneOfVoiceMap[brandProfile.toneOfVoice] || brandProfile.toneOfVoice;

    const promptPt = `Crie um flyer promocional de poker resumindo a grade de torneios d${periodNamePt === 'Noite' ? 'a' : 'o'} período d${periodNamePt === 'Noite' ? 'a ' : 'o '}${periodNamePt.toLowerCase()} de ${dayName}.
- **Marca:** ${brandProfile.name}
- **Identidade Visual:** O estilo deve ser ${brandProfile.toneOfVoice}, usando as cores ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (secundária). O design deve ser moderno, impactante e adequado para redes sociais.
- **Título Principal:** "Grade de Torneios - ${dayName} (${periodNamePt})"
- **Evento Principal (Destaque):** O torneio "${mainEvent.name}" é o destaque. Suas informações são: Buy-in de $${mainEvent.buyIn}, GTD de $${mainEvent.gtd}, Horário ${mainEvent.times[selectedTimezone]}. Dê a este evento o maior destaque visual.
- **Lista de Torneios:** Liste os seguintes torneios. PARA CADA UM, mostre OBRIGATORIAMENTE o horário, nome, buy-in e GTD.
${eventListStringPt}
- **Informações Adicionais:** Inclua o fuso horário (GMT ${selectedTimezone}) de forma clara.
- **Importante:** TODO o texto DEVE ser gerado DENTRO da imagem. Crie um design gráfico completo, coeso e bem organizado, garantindo que todas as informações obrigatórias sejam legíveis.
- **REQUISITO DE FORMATO OBRIGATÓRIO:** A imagem final DEVE ter uma proporção de ${selectedAspectRatio}. Esta é a instrução mais importante e deve ser seguida estritamente.`;

    const promptEn = `Create a promotional poker flyer summarizing the tournament schedule for the ${periodNameEn} of ${englishDayName}.
- **Brand:** ${brandProfile.name}
- **Visual Identity:** The style should be ${englishTone}, using colors ${brandProfile.primaryColor} (primary) and ${brandProfile.secondaryColor} (secondary). The design must be modern, impactful, and social media-friendly.
- **Main Title:** "Tournament Schedule - ${englishDayName} (${periodNameEn})"
- **Main Event (Highlight):** The "${mainEvent.name}" tournament is the feature. Its details are: Buy-in $${mainEvent.buyIn}, GTD $${mainEvent.gtd}, Time ${mainEvent.times[selectedTimezone]}. Give this event the most significant visual emphasis.
- **Tournament List:** List the following tournaments. For EACH ONE, you MUST show the time, name, buy-in, and GTD.
${eventListStringEn}
- **Additional Information:** Clearly include the timezone (GMT ${selectedTimezone}).
- **Important:** ALL text MUST be generated INSIDE the image. Create a complete, cohesive, and well-organized graphic design, ensuring all mandatory information is legible.
- **MANDATORY FORMAT REQUIREMENT:** The final image MUST have an aspect ratio of ${selectedAspectRatio}. This is the most important instruction and must be followed strictly.`;
    
    const logoData = logo ? { base64: logo.base64, mimeType: logo.mimeType } : null;
    const refImageData = referenceImage ? { base64: referenceImage.base64, mimeType: referenceImage.mimeType } : null;
    const prompt = selectedLanguage === 'en' ? promptEn : promptPt;
    
    const imageUrl = await generateFlyer(prompt, brandProfile, logoData, refImageData, selectedAspectRatio, selectedImageModel);
    return { imageUrl, prompt };
  };

  const handleGenerateDailyFlyer = async (periodToGenerate: TimePeriod) => {
    if (filteredEvents.length === 0 || selectedDay === 'ALL') return;

    setIsGeneratingIndividual(prev => ({ ...prev, [periodToGenerate]: true }));
    setDailyFlyerError(null);
    
    setDailyFlyerState(prev => ({
        ...prev,
        [periodToGenerate]: ['loading', ...prev[periodToGenerate]]
    }));

    try {
        const { imageUrl, prompt } = await createDailyFlyerForPeriod(periodToGenerate);
        const newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer Diário', model: selectedImageModel });
        setDailyFlyerState(prev => {
            const newPeriodFlyers = [...prev[periodToGenerate]];
            const loadingIndex = newPeriodFlyers.indexOf('loading');
            if (loadingIndex !== -1) newPeriodFlyers[loadingIndex] = newImage;
            return { ...prev, [periodToGenerate]: newPeriodFlyers };
        });
    } catch (err: any) {
        setDailyFlyerError(err.message || 'A geração do flyer falhou.');
        setDailyFlyerState(prev => {
            const newPeriodFlyers = prev[periodToGenerate].filter(f => f !== 'loading');
            return { ...prev, [periodToGenerate]: newPeriodFlyers };
        });
    } finally {
        setIsGeneratingIndividual(prev => ({ ...prev, [periodToGenerate]: false }));
    }
  };

  const handleGenerateAllPeriods = async () => {
    if (filteredEvents.length === 0 || selectedDay === 'ALL') return;

    setIsGeneratingAll(true);
    setDailyFlyerError(null);
    const periodsToGenerate: TimePeriod[] = ['ALL', 'MORNING', 'AFTERNOON', 'NIGHT'];

    setDailyFlyerState(prev => {
        const newState = { ...prev };
        periodsToGenerate.forEach(period => {
            newState[period] = ['loading', ...(newState[period] || [])];
        });
        return newState;
    });

    try {
        const results = await Promise.allSettled(
            periodsToGenerate.map(period => createDailyFlyerForPeriod(period))
        );
        
        results.forEach((result, index) => {
            const period = periodsToGenerate[index];
            let newImage: GalleryImage | null = null;
            if (result.status === 'fulfilled') {
              const { imageUrl, prompt } = result.value;
              newImage = onAddImageToGallery({ src: imageUrl, prompt, source: 'Flyer Diário', model: selectedImageModel });
            }

            setDailyFlyerState(prev => {
                const newPeriodFlyers = [...(prev[period] || [])];
                const loadingIndex = newPeriodFlyers.indexOf('loading');

                if (loadingIndex !== -1) {
                    if (newImage) {
                        newPeriodFlyers[loadingIndex] = newImage;
                    } else {
                        newPeriodFlyers.splice(loadingIndex, 1);
                        if (result.status === 'rejected') {
                            console.error(`Falha ao gerar o flyer para ${period}:`, result.reason);
                        }
                    }
                }
                return { ...prev, [period]: newPeriodFlyers };
            });
        });

    } catch (err: any) {
        setDailyFlyerError(err.message || 'Ocorreu um erro ao gerar um ou mais flyers.');
    } finally {
        setIsGeneratingAll(false);
    }
  };
  
  const handleDailyFlyerUpdate = (newImageUrl: string) => {
    if (editingDailyFlyer === null) return;
    const { image, period } = editingDailyFlyer;
    onUpdateGalleryImage(image.id, newImageUrl);
    const updatedImage = { ...image, src: newImageUrl };

    setDailyFlyerState(prev => {
        const newPeriodFlyers = [...(prev[period] || [])];
        const index = newPeriodFlyers.findIndex(f => f !== 'loading' && f.id === image.id);
        if (index > -1) {
            (newPeriodFlyers[index] as GalleryImage) = updatedImage;
        }
        return {
            ...prev,
            [period]: newPeriodFlyers,
        };
    });
    setEditingDailyFlyer({ image: updatedImage, period });
  };

  useEffect(() => {
    let filtered = events;
    if (selectedDay !== 'ALL') {
      filtered = filtered.filter(event => event.day === selectedDay);
    }
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(event => 
        String(event.name).toLowerCase().includes(lowerSearchTerm) ||
        String(event.game).toLowerCase().includes(lowerSearchTerm)
      );
    }
    setFilteredEvents(filtered);
    if (events.length > 0 && !fileLoaded) {
      setFileLoaded(true);
    }
  }, [selectedDay, searchTerm, events, fileLoaded]);

  return (
    <div>
        <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-text-main">Gerador de Flyer de Torneios</h2>
            <p className="text-lg text-text-muted mt-2 max-w-3xl mx-auto">Importe sua planilha de torneios (XLSX) e gere flyers com IA, com opções de logo e referência visual.</p>
        </div>

        <Card className="p-6 mb-8">
            <div className="flex flex-col sm:flex-row gap-4">
                <label htmlFor="file-upload" className="flex-1">
                    <div className="bg-surface/50 text-text-main hover:bg-surface/80 border border-muted/60 backdrop-blur-sm font-semibold py-3 px-4 rounded-lg cursor-pointer flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg h-full">
                        <Icon name="upload" className="w-5 h-5 mr-2" />
                        {fileLoaded ? 'Carregar Nova Planilha' : 'Carregar Planilha'}
                    </div>
                    <input id="file-upload" type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
                </label>
                <Button 
                    onClick={() => setShowManualForm(prev => !prev)}
                    variant="secondary"
                    className="flex-1 sm:flex-none"
                    icon={showManualForm ? 'chevron-up' : 'edit'}
                >
                    {showManualForm ? 'Fechar Formulário' : 'Adicionar Manualmente'}
                </Button>
            </div>


            {showManualForm && (
                 <ManualEventForm
                    onAddEvent={onAddEvent}
                    onCancel={() => setShowManualForm(false)}
                    daysOfWeek={daysOfWeek}
                    dayTranslations={dayTranslations}
                    timezones={timezones}
                    selectedTimezone={selectedTimezone}
                />
            )}

            {fileLoaded && (
                <div className="mt-4 pt-4 border-t border-muted/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                        {/* Day Filter */}
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1"><Icon name="calendar" className="inline w-4 h-4 mr-1" /> Dia da Semana</label>
                            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                                <option value="ALL">Todos os dias</option>
                                {daysOfWeek.map(day => <option key={day} value={day}>{dayTranslations[day]}</option>)}
                            </select>
                        </div>

                        {/* Timezone Filter */}
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1"><Icon name="globe" className="inline w-4 h-4 mr-1" /> Fuso Horário</label>
                            <select value={selectedTimezone} onChange={(e) => setSelectedTimezone(e.target.value)} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                                {timezones.map(tz => <option key={tz} value={tz}>GMT {tz}</option>)}
                            </select>
                        </div>
                        
                        {/* Language Filter */}
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1"><Icon name="globe" className="inline w-4 h-4 mr-1" /> Idioma</label>
                            <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value as 'pt' | 'en')} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                                <option value="pt">Português</option>
                                <option value="en">English</option>
                            </select>
                        </div>

                        {/* Aspect Ratio Filter */}
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1"><Icon name="image" className="inline w-4 h-4 mr-1" /> Formato</label>
                            <select value={selectedAspectRatio} onChange={(e) => setSelectedAspectRatio(e.target.value)} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                                {aspectRatios.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                            </select>
                        </div>

                        {/* Model Selector */}
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1"><Icon name="zap" className="inline w-4 h-4 mr-1" /> Modelo</label>
                            <select value={selectedImageModel} onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                                {/* FIX: Update model options to be compliant with Gemini API guidelines. */}
                                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                                <option value="imagen-4.0-generate-001">Imagen 4.0</option>
                            </select>
                        </div>

                        {/* Search */}
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1"><Icon name="search" className="inline w-4 h-4 mr-1" /> Buscar Evento</label>
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nome do torneio..." className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary" />
                        </div>
                    </div>
                     <div className="mt-4 pt-4 border-t border-muted/30 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ImageUploader image={logo} onImageChange={setLogo} title="Logo (Opcional)" />
                        <ImageUploader image={referenceImage} onImageChange={setReferenceImage} title="Imagem de Referência (Opcional)" />
                    </div>
                </div>
            )}
        </Card>

        {loading && <div className="flex justify-center p-12"><Loader className="h-12 w-12" /></div>}
        
        {!fileLoaded && !loading && !showManualForm && events.length === 0 && (
            <Card className="p-12 text-center">
                <Icon name="upload" className="w-16 h-16 mx-auto text-muted mb-4" />
                <h3 className="text-xl font-semibold text-text-main mb-2">Nenhum evento carregado</h3>
                <p className="text-text-muted">Clique nos botões acima para carregar uma planilha ou adicionar um evento manualmente.</p>
            </Card>
        )}

        {fileLoaded && !loading && filteredEvents.length > 0 && selectedDay !== 'ALL' && (
            <Card className="p-6 mb-8 bg-surface/80">
                <div className="text-center">
                    <h3 className="text-2xl font-bold text-text-main">Flyer Resumo do Dia: {dayTranslations[selectedDay]}</h3>
                    <p className="text-text-muted mt-1 mb-4">Gere flyers para os diferentes períodos do dia.</p>
                    <Button 
                        onClick={handleGenerateAllPeriods} 
                        variant="secondary" 
                        isLoading={isGeneratingAll}
                        disabled={Object.values(isGeneratingIndividual).some(v => v)} 
                        size="large"
                        icon="zap"
                    >
                        {isGeneratingAll ? 'Gerando Todos...' : 'Gerar Todos os Períodos'}
                    </Button>
                    {dailyFlyerError && <p className="text-red-400 text-xs mt-2">{dailyFlyerError}</p>}
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(Object.keys(periodTranslations) as TimePeriod[]).map(period => (
                        <DailySummaryCard
                            key={period}
                            period={period}
                            title={periodTranslations[period][selectedLanguage]}
                            flyers={dailyFlyerState[period]}
                            isGenerating={isGeneratingAll || !!isGeneratingIndividual[period]}
                            onGenerate={() => handleGenerateDailyFlyer(period)}
                            onImageClick={(image, index) => setEditingDailyFlyer({ image, period })}
                        />
                    ))}
                </div>
            </Card>
        )}

        {(fileLoaded || events.length > 0) && !loading && (
            <div className="space-y-6">
                {filteredEvents.length > 0 ? (
                    filteredEvents.map(event => (
                        <TournamentEventCard
                            key={event.id}
                            event={event}
                            timezone={selectedTimezone}
                            brandProfile={brandProfile}
                            logo={logo}
                            referenceImage={referenceImage}
                            aspectRatio={selectedAspectRatio}
                            language={selectedLanguage}
                            dayTranslations={dayTranslations}
                            onAddImageToGallery={onAddImageToGallery}
                            onUpdateGalleryImage={onUpdateGalleryImage}
                            onSetChatReference={onSetChatReference}
                            generatedFlyers={flyerState[event.id] || []}
                            setGeneratedFlyers={(updater) => setFlyerState(prev => ({...prev, [event.id]: updater(prev[event.id] || [])}))}
                            model={selectedImageModel}
                        />
                    ))
                ) : (
                    <Card className="text-center p-12">
                        <p className="text-text-muted">Nenhum evento encontrado para os filtros selecionados.</p>
                    </Card>
                )}
            </div>
        )}

      {/* FIX: Pass a GalleryImage object to the 'image' prop instead of 'imageUrl'. */}
      {editingDailyFlyer && (
        <ImagePreviewModal
            image={editingDailyFlyer.image}
            onClose={() => setEditingDailyFlyer(null)}
            onImageUpdate={handleDailyFlyerUpdate}
            onSetChatReference={onSetChatReference}
            downloadFilename={`flyer_diario_${selectedDay}_${editingDailyFlyer.period}.png`}
        />
      )}
    </div>
  );
};