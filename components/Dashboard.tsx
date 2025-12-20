
import React, { useState } from 'react';
import type { BrandProfile, MarketingCampaign, ContentInput, IconName, ChatMessage, Theme, TournamentEvent, GalleryImage, ChatReferenceImage, GenerationOptions, WeekScheduleInfo, StyleReference } from '../types';
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
import { CalendarView } from './calendar/CalendarView';
import type { ScheduledPost } from '../types';

type View = 'campaign' | 'flyer' | 'gallery' | 'calendar';

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
  weekScheduleInfo: WeekScheduleInfo | null;
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
  // Style References
  styleReferences: StyleReference[];
  onAddStyleReference: (ref: Omit<StyleReference, 'id' | 'createdAt'>) => void;
  onRemoveStyleReference: (id: string) => void;
  onSelectStyleReference: (ref: StyleReference) => void;
  selectedStyleReference: StyleReference | null;
  onClearSelectedStyleReference: () => void;
  // Calendar & Scheduling
  scheduledPosts: ScheduledPost[];
  onSchedulePost: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateScheduledPost: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDeleteScheduledPost: (postId: string) => void;
}

type Tab = 'clips' | 'posts' | 'ads';

interface NavItemProps {
    icon: IconName;
    label: string;
    active: boolean;
    onClick: () => void;
    collapsed?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, collapsed }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
      active
        ? 'bg-white text-black'
        : 'text-white/30 hover:text-white hover:bg-white/5'
    }`}
  >
    <Icon name={icon} className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-black' : 'text-white/20'}`} />
    {!collapsed && <span>{label}</span>}
  </button>
);

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const {
    brandProfile, campaign, onGenerate, isGenerating, onEditProfile, onResetCampaign,
    isAssistantOpen, onToggleAssistant, assistantHistory,
    isAssistantLoading, onAssistantSendMessage, galleryImages, onAddImageToGallery,
    onUpdateGalleryImage, tournamentEvents, weekScheduleInfo, onTournamentFileUpload, onAddTournamentEvent,
    flyerState, setFlyerState, dailyFlyerState, setDailyFlyerState,
    chatReferenceImage, onSetChatReference, activeView, onViewChange, onPublishToCampaign,
    styleReferences, onAddStyleReference, onRemoveStyleReference, onSelectStyleReference, selectedStyleReference, onClearSelectedStyleReference,
    scheduledPosts, onSchedulePost, onUpdateScheduledPost, onDeleteScheduledPost
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>('clips');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clips', label: 'Clips' },
    { id: 'posts', label: 'Social' },
    { id: 'ads', label: 'Ads' },
  ];

  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="h-screen flex overflow-hidden bg-black text-white font-sans selection:bg-primary selection:text-black">
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} bg-[#070707] flex flex-col flex-shrink-0 border-r border-white/5 z-20 transition-all duration-300`}>
        <div className={`h-16 flex items-center justify-between ${sidebarCollapsed ? 'px-3' : 'px-4'} flex-shrink-0`}>
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 flex-shrink-0">
               <Icon name="logo" className="h-4 w-4 text-white" />
            </div>
            {!sidebarCollapsed && <h1 className="text-[10px] font-black text-white tracking-[0.3em] uppercase ml-3">Director<span className="opacity-30">Ai</span></h1>}
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 text-white/20 hover:text-white/60 transition-colors"
          >
            <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} className="w-3.5 h-3.5" />
          </button>
        </div>

        <nav className={`flex-grow ${sidebarCollapsed ? 'p-2' : 'p-3'} space-y-1`}>
            <NavItem icon="zap" label="Direct" active={activeView === 'campaign'} onClick={() => onViewChange('campaign')} collapsed={sidebarCollapsed} />
            <NavItem icon="image" label="Flyers" active={activeView === 'flyer'} onClick={() => onViewChange('flyer')} collapsed={sidebarCollapsed} />
            <NavItem icon="calendar" label="Agenda" active={activeView === 'calendar'} onClick={() => onViewChange('calendar')} collapsed={sidebarCollapsed} />
            <NavItem icon="layout" label="Assets" active={activeView === 'gallery'} onClick={() => onViewChange('gallery')} collapsed={sidebarCollapsed} />
        </nav>

        <div className={`${sidebarCollapsed ? 'p-2' : 'p-3'} space-y-3`}>
             {!sidebarCollapsed ? (
               <>
                 <div className="w-full flex items-center gap-2 py-2 px-3 border border-white/5 rounded-lg">
                    {brandProfile.logo ? (
                        <img src={brandProfile.logo} alt="Logo" className="h-5 w-5 rounded object-contain filter grayscale brightness-125 flex-shrink-0"/>
                    ) : (
                        <div className="h-5 w-5 rounded bg-white/10 flex items-center justify-center flex-shrink-0"><Icon name="bot" className="w-2.5 h-2.5 text-white/40" /></div>
                    )}
                    <div className="flex-1 overflow-hidden">
                        <span className="text-[8px] font-black text-white/20 truncate block uppercase tracking-[0.2em]">{brandProfile.name}</span>
                    </div>
                </div>
                <button onClick={onEditProfile} className="w-full text-[8px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-white transition-colors py-2 border border-white/5 rounded-lg hover:bg-white/5">System Setup</button>
               </>
             ) : (
               <button onClick={onEditProfile} title="System Setup" className="w-full flex justify-center py-2 text-white/20 hover:text-white transition-colors border border-white/5 rounded-lg hover:bg-white/5">
                 <Icon name="settings" className="w-3.5 h-3.5" />
               </button>
             )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative z-10 bg-[#070707]">
            {activeView === 'campaign' && (
                <div className="px-6 py-5">
                    {showUploadForm && <UploadForm onGenerate={onGenerate} isGenerating={isGenerating} />}
                    {isGenerating && (
                        <div className="flex flex-col items-center justify-center text-center p-32 aura-card border-white/5 bg-white/[0.01]">
                            <Loader className="h-12 w-12" />
                            <h2 className="text-4xl font-black mt-10 tracking-[-0.05em] uppercase">Synthesizing Identity</h2>
                            <p className="text-white/40 mt-4 max-w-xs text-xs font-medium tracking-wide">Autonomous agents are configuring your marketing ecosystem.</p>
                        </div>
                    )}
                    {campaign && (
                        <div className="animate-fade-in-up space-y-6">
                            {/* Header Section */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="text-left">
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Campanha Gerada</h2>
                                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">
                                        {campaign.videoClipScripts.length} clips • {campaign.posts.length} posts • {campaign.adCreatives.length} anúncios
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Tabs Navigation */}
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
                                                activeTab === tab.id
                                                    ? 'bg-white text-black'
                                                    : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 border border-white/5'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                    <div className="w-px h-6 bg-white/10 mx-1"></div>
                                    <Button onClick={onResetCampaign} variant="secondary" icon="zap" size="small">Nova Campanha</Button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="space-y-4">
                                {activeTab === 'clips' && <ClipsTab brandProfile={brandProfile} videoClipScripts={campaign.videoClipScripts} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} />}
                                {activeTab === 'posts' && <PostsTab posts={campaign.posts} brandProfile={brandProfile} referenceImage={null} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} />}
                                {activeTab === 'ads' && <AdCreativesTab adCreatives={campaign.adCreatives} brandProfile={brandProfile} referenceImage={null} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} />}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {activeView === 'flyer' && (
                <div className="flex h-full overflow-hidden">
                    <FlyerGenerator
                      brandProfile={brandProfile} events={tournamentEvents} weekScheduleInfo={weekScheduleInfo} onFileUpload={onTournamentFileUpload} onAddEvent={onAddTournamentEvent} onAddImageToGallery={onAddImageToGallery} flyerState={flyerState} setFlyerState={setFlyerState} dailyFlyerState={dailyFlyerState} setDailyFlyerState={setDailyFlyerState} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference}
                      onPublishToCampaign={onPublishToCampaign}
                      selectedStyleReference={selectedStyleReference}
                      onClearSelectedStyleReference={onClearSelectedStyleReference}
                      styleReferences={styleReferences}
                      onSelectStyleReference={onSelectStyleReference}
                    />
                </div>
            )}
            {activeView === 'gallery' && (
                <div className="px-6 py-5">
                    <GalleryView images={galleryImages} onUpdateImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} onSelectStyleReference={onSelectStyleReference} />
                </div>
            )}
            {activeView === 'calendar' && (
                <div className="px-6 py-5 h-full">
                    <CalendarView
                      scheduledPosts={scheduledPosts}
                      onSchedulePost={onSchedulePost}
                      onUpdateScheduledPost={onUpdateScheduledPost}
                      onDeleteScheduledPost={onDeleteScheduledPost}
                      galleryImages={galleryImages}
                    />
                </div>
            )}
      </main>

       <AssistantPanel isOpen={isAssistantOpen} onClose={onToggleAssistant} history={assistantHistory} isLoading={isAssistantLoading} onSendMessage={onAssistantSendMessage} referenceImage={chatReferenceImage} onClearReference={() => onSetChatReference(null)} />
       <div className="fixed bottom-6 right-6 z-50">
          <button onClick={onToggleAssistant} className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105 ${isAssistantOpen ? 'bg-white/10 backdrop-blur-xl text-white border border-white/10' : 'bg-white/10 backdrop-blur-xl text-white/60 hover:text-white border border-white/5'}`}>
            <Icon name={isAssistantOpen ? 'x' : 'zap'} className="w-5 h-5" />
          </button>
       </div>
    </div>
  );
};
