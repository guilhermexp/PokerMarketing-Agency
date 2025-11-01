import React, { useState } from 'react';
import type { BrandProfile, MarketingCampaign, ContentInput, IconName, ChatMessage, Theme, TournamentEvent, GalleryImage, ChatReferenceImage, GenerationOptions } from '../types';
import { UploadForm } from './UploadForm';
import { ClipsTab } from './tabs/ClipsTab';
import { PostsTab } from './tabs/PostsTab';
import { AdCreativesTab } from './tabs/AdCreativesTab';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { FlyerGenerator, TimePeriod } from './FlyerGenerator';
import { AssistantPanel } from './assistant/AssistantPanel';
import { GalleryView } from './GalleryView';


interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
  onEditProfile: () => void;
  onResetCampaign: () => void;
  productImages: ContentInput['productImages'] | null;
  inspirationImages: ContentInput['inspirationImages'] | null;
  // Assistant Props
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  assistantHistory: ChatMessage[];
  isAssistantLoading: boolean;
  onAssistantSendMessage: (message: string, image: ChatReferenceImage | null) => void;
  chatReferenceImage: ChatReferenceImage | null;
  onSetChatReference: (image: GalleryImage | null) => void;
  // Theme Props
  theme: Theme;
  onThemeToggle: () => void;
  // Gallery Props
  galleryImages: GalleryImage[];
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  // Flyer Generator Props
  tournamentEvents: TournamentEvent[];
  onTournamentFileUpload: (file: File) => Promise<void>;
  onAddTournamentEvent: (event: TournamentEvent) => void;
  // FIX: Update flyer state types to use GalleryImage objects.
  flyerState: Record<string, (GalleryImage | 'loading')[]>;
  setFlyerState: React.Dispatch<React.SetStateAction<Record<string, (GalleryImage | 'loading')[]>>>;
  dailyFlyerState: Record<TimePeriod, (GalleryImage | 'loading')[]>;
  setDailyFlyerState: React.Dispatch<React.SetStateAction<Record<TimePeriod, (GalleryImage | 'loading')[]>>>;
}

type Tab = 'clips' | 'posts' | 'ads';
type View = 'campaign' | 'flyer' | 'gallery';

interface NavItemProps {
    icon: IconName;
    label: string;
    active: boolean;
    onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-white'
        : 'text-text-muted hover:bg-muted/20 hover:text-text-main'
    }`}
    aria-current={active ? 'page' : undefined}
  >
    <Icon name={icon} className="w-5 h-5" />
    <span>{label}</span>
  </button>
);


export const Dashboard: React.FC<DashboardProps> = (props) => {
  const { 
    brandProfile, campaign, onGenerate, isGenerating, onEditProfile, onResetCampaign,
    productImages, isAssistantOpen, onToggleAssistant, assistantHistory, 
    isAssistantLoading, onAssistantSendMessage, theme, onThemeToggle, 
    galleryImages, onAddImageToGallery, onUpdateGalleryImage, tournamentEvents, onTournamentFileUpload, onAddTournamentEvent,
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState,
    chatReferenceImage, onSetChatReference
  } = props;
  
  const [activeTab, setActiveTab] = useState<Tab>('clips');
  const [activeView, setActiveView] = useState<View>('campaign');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clips', label: 'Clipes de Vídeo' },
    { id: 'posts', label: 'Posts Sociais' },
    { id: 'ads', label: 'Criativos de Anúncio' },
  ];

  const showUploadForm = !campaign && !isGenerating;
  const firstProductImage = productImages && productImages.length > 0 ? productImages[0] : null;

  return (
    <div className="h-screen flex overflow-hidden bg-background text-text-main font-sans">
      {/* Sidebar */}
      <aside className="dark w-64 bg-black flex flex-col flex-shrink-0 border-r border-muted/30">
        <div className="h-16 flex items-center px-4 border-b border-muted/30 flex-shrink-0">
          <Icon name="logo" className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold text-text-main ml-2">DirectorAi</h1>
        </div>
        <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
            <NavItem 
                icon="zap" 
                label="Gerador de Campanha" 
                active={activeView === 'campaign'} 
                onClick={() => setActiveView('campaign')} 
            />
            <NavItem 
                icon="image" 
                label="Gerador de Flyer" 
                active={activeView === 'flyer'} 
                onClick={() => setActiveView('flyer')} 
            />
            <NavItem 
                icon="layout" 
                label="Galeria" 
                active={activeView === 'gallery'} 
                onClick={() => setActiveView('gallery')} 
            />
        </nav>
        <div className="p-4 border-t border-muted/30 space-y-4 flex-shrink-0">
             <div className="flex items-center space-x-3">
                {brandProfile.logo && (
                    <img src={brandProfile.logo} alt={`${brandProfile.name} logo`} className="h-10 w-10 rounded-full object-contain bg-white border border-muted/20"/>
                )}
                <div className="flex-1 overflow-hidden">
                    <span className="text-sm font-medium text-text-main truncate block">{brandProfile.name}</span>
                    <span className="text-xs text-text-muted truncate block">Sua Marca</span>
                </div>
            </div>
            <Button onClick={onEditProfile} size="small" variant="secondary" icon="edit" className="w-full">
              Editar Marca
            </Button>
            <Button onClick={onThemeToggle} size="small" variant="secondary" icon={theme === 'light' ? 'moon' : 'sun'} className="w-full">
              Mudar para modo {theme === 'light' ? 'Escuro' : 'Claro'}
            </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {activeView === 'campaign' && (
                <>
                    {showUploadForm && (
                        <UploadForm onGenerate={onGenerate} isGenerating={isGenerating} />
                    )}

                    {isGenerating && (
                        <div className="flex flex-col items-center justify-center text-center p-12 bg-surface rounded-xl border border-muted/20">
                            <Loader className="h-12 w-12" />
                            <h2 className="text-2xl font-bold mt-6">Criando Sua Campanha...</h2>
                            <p className="text-text-muted mt-2 max-w-md">A IA DirectorAi está analisando seu conteúdo e perfil de marca para gerar um conjunto completo de materiais de marketing. Isso pode levar um momento.</p>
                        </div>
                    )}

                    {campaign && (
                        <div>
                            <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
                                <h2 className="text-2xl font-bold">Sua Campanha Gerada</h2>
                                <Button onClick={onResetCampaign} variant="secondary" icon="zap">
                                    Gerar Nova Campanha
                                </Button>
                            </div>
                            
                            <div className="border-b border-muted/30 mb-6">
                                <nav className="-mb-px flex space-x-6 overflow-x-auto">
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`${
                                                activeTab === tab.id
                                                    ? 'border-primary text-primary'
                                                    : 'border-transparent text-subtle hover:text-text-main hover:border-muted'
                                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none`}
                                            aria-current={activeTab === tab.id ? 'page' : undefined}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            <div>
                            {activeTab === 'clips' && <ClipsTab brandProfile={brandProfile} videoClipScripts={campaign.videoClipScripts} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
                            {activeTab === 'posts' && <PostsTab posts={campaign.posts} brandProfile={brandProfile} referenceImage={firstProductImage} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
                            {activeTab === 'ads' && <AdCreativesTab adCreatives={campaign.adCreatives} brandProfile={brandProfile} referenceImage={firstProductImage} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
                            </div>
                        </div>
                    )}
                </>
            )}
            {activeView === 'flyer' && (
                <FlyerGenerator 
                  brandProfile={brandProfile}
                  events={tournamentEvents}
                  onFileUpload={onTournamentFileUpload}
                  onAddEvent={onAddTournamentEvent}
                  onAddImageToGallery={onAddImageToGallery}
                  flyerState={flyerState}
                  setFlyerState={setFlyerState}
                  dailyFlyerState={dailyFlyerState}
                  setDailyFlyerState={setDailyFlyerState}
                  onUpdateGalleryImage={onUpdateGalleryImage}
                  onSetChatReference={onSetChatReference}
                />
            )}
            {activeView === 'gallery' && (
                <GalleryView images={galleryImages} onUpdateImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />
            )}
        </div>
      </main>

       {/* Assistant Components */}
       <AssistantPanel 
            isOpen={isAssistantOpen}
            onClose={onToggleAssistant}
            history={assistantHistory}
            isLoading={isAssistantLoading}
            onSendMessage={onAssistantSendMessage}
            referenceImage={chatReferenceImage}
            onClearReference={() => onSetChatReference(null)}
       />
       <div className="fixed bottom-6 right-6 z-50">
          <button 
            onClick={onToggleAssistant}
            aria-label={isAssistantOpen ? "Fechar assistente de IA" : "Abrir assistente de IA"}
            aria-expanded={isAssistantOpen}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl transform-gpu transition-all duration-300 ease-in-out hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary/50 ${isAssistantOpen ? 'bg-muted hover:bg-muted/80' : 'bg-primary hover:bg-primary-hover'}`}
          >
            <div className="relative w-8 h-8 flex items-center justify-center">
                <Icon name='bot' className={`absolute inset-0 w-8 h-8 transition-all duration-300 ${isAssistantOpen ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
                <Icon name='x' className={`absolute inset-0 w-8 h-8 transition-all duration-300 ${isAssistantOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`} />
            </div>
          </button>
       </div>
    </div>
  );
};
