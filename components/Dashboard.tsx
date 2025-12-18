
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

type View = 'campaign' | 'flyer' | 'gallery';

interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
  onEditProfile: () => void;
  onResetCampaign: () => void;
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  assistantHistory: ChatMessage[];
  isAssistantLoading: boolean;
  onAssistantSendMessage: (message: string, image: ChatReferenceImage | null) => void;
  chatReferenceImage: ChatReferenceImage | null;
  onSetChatReference: (image: GalleryImage | null) => void;
  theme: Theme;
  onThemeToggle: () => void;
  galleryImages: GalleryImage[];
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  tournamentEvents: TournamentEvent[];
  onTournamentFileUpload: (file: File) => Promise<void>;
  onAddTournamentEvent: (event: TournamentEvent) => void;
  flyerState: Record<string, (GalleryImage | 'loading')[]>;
  setFlyerState: React.Dispatch<React.SetStateAction<Record<string, (GalleryImage | 'loading')[]>>>;
  dailyFlyerState: Record<TimePeriod, (GalleryImage | 'loading')[]>;
  setDailyFlyerState: React.Dispatch<React.SetStateAction<Record<TimePeriod, (GalleryImage | 'loading')[]>>>;
  // Navigation
  activeView: View;
  onViewChange: (view: View) => void;
  onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
}

type Tab = 'clips' | 'posts' | 'ads';

interface NavItemProps {
    icon: IconName;
    label: string;
    active: boolean;
    onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-4 px-6 py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.3em] transition-all duration-500 ${
      active
        ? 'bg-white text-black shadow-2xl'
        : 'text-white/30 hover:text-white hover:bg-white/5'
    }`}
  >
    <Icon name={icon} className={`w-4 h-4 ${active ? 'text-black' : 'text-white/20'}`} />
    <span>{label}</span>
  </button>
);

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const { 
    brandProfile, campaign, onGenerate, isGenerating, onEditProfile, onResetCampaign,
    isAssistantOpen, onToggleAssistant, assistantHistory, 
    isAssistantLoading, onAssistantSendMessage, galleryImages, onAddImageToGallery, 
    onUpdateGalleryImage, tournamentEvents, onTournamentFileUpload, onAddTournamentEvent,
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState,
    chatReferenceImage, onSetChatReference, activeView, onViewChange, onPublishToCampaign
  } = props;
  
  const [activeTab, setActiveTab] = useState<Tab>('clips');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clips', label: 'Clips' },
    { id: 'posts', label: 'Social' },
    { id: 'ads', label: 'Ads' },
  ];

  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="h-screen flex overflow-hidden bg-black text-white font-sans selection:bg-primary selection:text-black">
      <aside className="w-72 bg-[#050505]/60 flex flex-col flex-shrink-0 border-r border-white/5 backdrop-blur-3xl z-20">
        <div className="h-24 flex items-center px-8 flex-shrink-0">
          <div className="w-10 h-10 aura-card flex items-center justify-center mr-4 bg-white/5 border-white/10 shadow-inner">
             <Icon name="logo" className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-sm font-black text-white tracking-[0.4em] uppercase">Director<span className="opacity-30">Ai</span></h1>
        </div>

        <nav className="flex-grow p-6 space-y-3">
            <NavItem icon="zap" label="Direct" active={activeView === 'campaign'} onClick={() => onViewChange('campaign')} />
            <NavItem icon="image" label="Flyers" active={activeView === 'flyer'} onClick={() => onViewChange('flyer')} />
            <NavItem icon="layout" label="Assets" active={activeView === 'gallery'} onClick={() => onViewChange('gallery')} />
        </nav>

        <div className="p-8 space-y-6">
             <div className="p-5 aura-card border-white/10 space-y-4 bg-white/[0.02]">
                <div className="flex items-center space-x-4">
                    {brandProfile.logo ? (
                        <img src={brandProfile.logo} alt="Logo" className="h-10 w-10 rounded-full object-contain filter grayscale brightness-125"/>
                    ) : (
                        <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center border border-white/10"><Icon name="bot" className="w-5 h-5 text-white/40" /></div>
                    )}
                    <div className="flex-1 overflow-hidden">
                        <span className="text-[10px] font-black text-white truncate block uppercase tracking-widest">{brandProfile.name}</span>
                        <span className="text-[8px] text-white/30 uppercase font-bold tracking-[0.2em] mt-1">Status: Operational</span>
                    </div>
                </div>
            </div>
            <button onClick={onEditProfile} className="w-full text-[9px] font-black uppercase tracking-[0.4em] text-white/20 hover:text-white transition-colors py-3 border border-white/5 rounded-xl hover:bg-white/5">System Setup</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative z-10 bg-[#070707]">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-12 sm:py-16 relative">
            {activeView === 'campaign' && (
                <>
                    {showUploadForm && <UploadForm onGenerate={onGenerate} isGenerating={isGenerating} />}
                    {isGenerating && (
                        <div className="flex flex-col items-center justify-center text-center p-32 aura-card border-white/5 bg-white/[0.01]">
                            <Loader className="h-12 w-12" />
                            <h2 className="text-4xl font-black mt-10 tracking-[-0.05em] uppercase">Synthesizing Identity</h2>
                            <p className="text-white/40 mt-4 max-w-xs text-xs font-medium tracking-wide">Autonomous agents are configuring your marketing ecosystem.</p>
                        </div>
                    )}
                    {campaign && (
                        <div className="animate-fade-in-up">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-16 gap-6">
                                <div>
                                    <h2 className="text-5xl font-black tracking-[-0.05em] uppercase leading-none">Generated Output</h2>
                                    <p className="text-[10px] uppercase tracking-[0.4em] text-white/30 font-black mt-4">Multi-Platform Campaign Strategy</p>
                                </div>
                                <Button onClick={onResetCampaign} variant="primary" icon="zap" size="large">New Strategy</Button>
                            </div>
                            <div className="mb-12 flex flex-wrap gap-4">
                                {tabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-10 py-4 rounded-full text-[9px] font-black uppercase tracking-[0.3em] transition-all duration-500 border ${activeTab === tab.id ? 'bg-white text-black border-white' : 'bg-transparent text-white/40 border-white/10 hover:border-white/30 hover:text-white'}`}>{tab.label}</button>
                                ))}
                            </div>
                            <div className="space-y-12">
                                {activeTab === 'clips' && <ClipsTab brandProfile={brandProfile} videoClipScripts={campaign.videoClipScripts} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
                                {activeTab === 'posts' && <PostsTab posts={campaign.posts} brandProfile={brandProfile} referenceImage={null} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
                                {activeTab === 'ads' && <AdCreativesTab adCreatives={campaign.adCreatives} brandProfile={brandProfile} referenceImage={null} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
                            </div>
                        </div>
                    )}
                </>
            )}
            {activeView === 'flyer' && (
                <FlyerGenerator 
                  brandProfile={brandProfile} events={tournamentEvents} onFileUpload={onTournamentFileUpload} onAddEvent={onAddTournamentEvent} onAddImageToGallery={onAddImageToGallery} flyerState={flyerState} setFlyerState={setFlyerState} dailyFlyerState={dailyFlyerState} setDailyFlyerState={setDailyFlyerState} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference}
                  onPublishToCampaign={onPublishToCampaign}
                />
            )}
            {activeView === 'gallery' && <GalleryView images={galleryImages} onUpdateImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} />}
        </div>
      </main>

       <AssistantPanel isOpen={isAssistantOpen} onClose={onToggleAssistant} history={assistantHistory} isLoading={isAssistantLoading} onSendMessage={onAssistantSendMessage} referenceImage={chatReferenceImage} onClearReference={() => onSetChatReference(null)} />
       <div className="fixed bottom-10 right-10 z-50">
          <button onClick={onToggleAssistant} className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center shadow-2xl transition-all duration-700 hover:scale-110 border border-white/10 ${isAssistantOpen ? 'bg-white/5 backdrop-blur-2xl text-white' : 'bg-white text-black'}`}>
            <div className="relative w-8 h-8 flex items-center justify-center">
                <Icon name='bot' className={`absolute inset-0 w-8 h-8 transition-all duration-700 ${isAssistantOpen ? 'opacity-0 -rotate-180 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
                <Icon name='x' className={`absolute inset-0 w-8 h-8 transition-all duration-700 ${isAssistantOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-180 scale-50'}`} />
            </div>
          </button>
       </div>
    </div>
  );
};
