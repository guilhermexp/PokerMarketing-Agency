
import React, { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import type { BrandProfile, MarketingCampaign, ContentInput, IconName, ChatMessage, Theme, TournamentEvent, GalleryImage, ChatReferenceImage, GenerationOptions, WeekScheduleInfo, StyleReference, InstagramPublishState, CampaignSummary } from '../types';
import type { WeekScheduleWithCount } from '../services/apiClient';
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
import { CampaignsList } from './CampaignsList';
import { SchedulesListView } from './SchedulesListView';
import { OrganizationSwitcher } from './organization/OrganizationSwitcher';
import type { ScheduledPost } from '../types';

type View = 'campaign' | 'campaigns' | 'flyer' | 'gallery' | 'calendar';

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
  onDeleteGalleryImage?: (imageId: string) => void;
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
  // Instagram Publishing
  onPublishToInstagram: (post: ScheduledPost) => void;
  publishingStates: Record<string, InstagramPublishState>;
  // Campaigns List
  campaignsList: CampaignSummary[];
  onLoadCampaign: (campaignId: string) => void;
  userId?: string;
  // Week Schedule
  isWeekExpired?: boolean;
  onClearExpiredSchedule?: () => void;
  // All schedules list
  allSchedules?: WeekScheduleWithCount[];
  currentScheduleId?: string | null;
  onSelectSchedule?: (schedule: WeekScheduleWithCount) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
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
    className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3'} py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
      active
        ? 'bg-white/[0.08] text-white'
        : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
    }`}
  >
    <Icon name={icon} className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-white/30'}`} />
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
    chatReferenceImage, onSetChatReference, activeView, onViewChange, onPublishToCampaign, onDeleteGalleryImage,
    styleReferences, onAddStyleReference, onRemoveStyleReference, onSelectStyleReference, selectedStyleReference, onClearSelectedStyleReference,
    scheduledPosts, onSchedulePost, onUpdateScheduledPost, onDeleteScheduledPost,
    onPublishToInstagram, publishingStates,
    campaignsList, onLoadCampaign, userId,
    isWeekExpired, onClearExpiredSchedule,
    allSchedules, currentScheduleId, onSelectSchedule, onDeleteSchedule
  } = props;

  const { signOut } = useClerk();
  const [activeTab, setActiveTab] = useState<Tab>('clips');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isInsideSchedule, setIsInsideSchedule] = useState(false);

  // Format date string (handles both ISO and DD/MM formats)
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    // If already in DD/MM format, return as is
    if (/^\d{2}\/\d{2}$/.test(dateStr)) return dateStr;
    // Parse ISO date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Handler para selecionar planilha e entrar no modo edição
  const handleEnterSchedule = (schedule: WeekScheduleWithCount) => {
    onSelectSchedule?.(schedule);
    setIsInsideSchedule(true);
  };

  // Handler para voltar para lista de planilhas
  const handleBackToSchedulesList = () => {
    setIsInsideSchedule(false);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clips', label: 'Clips' },
    { id: 'posts', label: 'Social' },
    { id: 'ads', label: 'Ads' },
  ];

  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="h-screen flex overflow-hidden bg-black text-white font-sans selection:bg-primary selection:text-black">
      <aside className={`${sidebarCollapsed ? 'w-14' : 'w-52'} bg-[#0a0a0a] flex flex-col flex-shrink-0 border-r border-white/[0.06] z-20 transition-all duration-300`}>
        {/* Header */}
        <div className={`h-14 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-3'} flex-shrink-0 border-b border-white/[0.04]`}>
          {sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors"
            >
              <Icon name="logo" className="h-4 w-4 text-white/70" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 flex-shrink-0">
                  <Icon name="logo" className="h-3.5 w-3.5 text-white/70" />
                </div>
                <span className="text-xs font-semibold text-white/80">Director</span>
              </div>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.04] rounded-md transition-all"
              >
                <Icon name="chevron-left" className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Organization Switcher */}
        {!sidebarCollapsed && (
          <div className="px-2 py-2 border-b border-white/[0.04]">
            <OrganizationSwitcher />
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-grow ${sidebarCollapsed ? 'px-2 py-3' : 'px-2 py-3'} space-y-0.5`}>
            <NavItem icon="zap" label="Direct" active={activeView === 'campaign'} onClick={() => onViewChange('campaign')} collapsed={sidebarCollapsed} />
            <NavItem icon="layers" label="Campanhas" active={activeView === 'campaigns'} onClick={() => onViewChange('campaigns')} collapsed={sidebarCollapsed} />
            <NavItem icon="image" label="Flyers" active={activeView === 'flyer'} onClick={() => onViewChange('flyer')} collapsed={sidebarCollapsed} />
            <NavItem icon="calendar" label="Agenda" active={activeView === 'calendar'} onClick={() => onViewChange('calendar')} collapsed={sidebarCollapsed} />
            <NavItem icon="layout" label="Assets" active={activeView === 'gallery'} onClick={() => onViewChange('gallery')} collapsed={sidebarCollapsed} />
        </nav>

        {/* Footer - Brand Info & Logout */}
        <div className={`${sidebarCollapsed ? 'p-2' : 'p-2'} border-t border-white/[0.04] space-y-1`}>
             {!sidebarCollapsed ? (
               <>
                 <button
                   onClick={onEditProfile}
                   className="w-full flex items-center gap-2 py-2 px-2 bg-white/[0.03] hover:bg-white/[0.06] rounded-lg transition-colors"
                 >
                    {brandProfile.logo ? (
                        <img src={brandProfile.logo} alt="Logo" className="h-6 w-6 rounded object-cover flex-shrink-0"/>
                    ) : (
                        <div className="h-6 w-6 rounded bg-white/10 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white/60">
                          {brandProfile.name.substring(0, 2).toUpperCase()}
                        </div>
                    )}
                    <span className="text-[10px] font-medium text-white/50 truncate flex-1 text-left">{brandProfile.name}</span>
                    <Icon name="settings" className="w-3.5 h-3.5 text-white/20" />
                </button>
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-2 py-2 px-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Icon name="log-out" className="w-4 h-4" />
                  <span className="text-[10px] font-medium">Sair</span>
                </button>
               </>
             ) : (
               <>
                 <button
                   onClick={onEditProfile}
                   title={brandProfile.name}
                   className="w-full flex justify-center py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                 >
                   {brandProfile.logo ? (
                     <img src={brandProfile.logo} alt="Logo" className="h-5 w-5 rounded object-cover"/>
                   ) : (
                     <span className="text-[9px] font-bold text-white/50">
                       {brandProfile.name.substring(0, 2).toUpperCase()}
                     </span>
                   )}
                 </button>
                 <button
                   onClick={() => signOut()}
                   title="Sair"
                   className="w-full flex justify-center py-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                 >
                   <Icon name="log-out" className="w-4 h-4" />
                 </button>
               </>
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
                                {activeTab === 'clips' && <ClipsTab brandProfile={brandProfile} videoClipScripts={campaign.videoClipScripts} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} userId={userId} />}
                                {activeTab === 'posts' && <PostsTab posts={campaign.posts} brandProfile={brandProfile} referenceImage={null} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} userId={userId} />}
                                {activeTab === 'ads' && <AdCreativesTab adCreatives={campaign.adCreatives} brandProfile={brandProfile} referenceImage={null} onAddImageToGallery={onAddImageToGallery} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference} styleReferences={styleReferences} onAddStyleReference={onAddStyleReference} onRemoveStyleReference={onRemoveStyleReference} userId={userId} />}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {activeView === 'flyer' && !isInsideSchedule && (
                <SchedulesListView
                  schedules={allSchedules || []}
                  onSelectSchedule={handleEnterSchedule}
                  onFileUpload={onTournamentFileUpload}
                  currentScheduleId={currentScheduleId}
                  onEnterAfterUpload={() => setIsInsideSchedule(true)}
                  onDeleteSchedule={onDeleteSchedule}
                />
            )}
            {activeView === 'flyer' && isInsideSchedule && (
                <div className="flex flex-col h-full">
                    {/* Back button header */}
                    <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 flex-shrink-0 bg-[#070707]">
                      <button
                        onClick={handleBackToSchedulesList}
                        className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors"
                      >
                        <Icon name="arrow-left" className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Voltar às Planilhas</span>
                      </button>
                      {weekScheduleInfo && (
                        <>
                          <div className="h-4 w-px bg-white/10" />
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                            Semana {formatDateDisplay(weekScheduleInfo.startDate)} - {formatDateDisplay(weekScheduleInfo.endDate)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <FlyerGenerator
                        brandProfile={brandProfile} events={tournamentEvents} weekScheduleInfo={weekScheduleInfo} onFileUpload={onTournamentFileUpload} onAddEvent={onAddTournamentEvent} onAddImageToGallery={onAddImageToGallery} flyerState={flyerState} setFlyerState={setFlyerState} dailyFlyerState={dailyFlyerState} setDailyFlyerState={setDailyFlyerState} onUpdateGalleryImage={onUpdateGalleryImage} onSetChatReference={onSetChatReference}
                        onPublishToCampaign={onPublishToCampaign}
                        selectedStyleReference={selectedStyleReference}
                        onClearSelectedStyleReference={onClearSelectedStyleReference}
                        styleReferences={styleReferences}
                        onSelectStyleReference={onSelectStyleReference}
                        isWeekExpired={isWeekExpired}
                        onClearExpiredSchedule={onClearExpiredSchedule}
                        userId={userId}
                        allSchedules={allSchedules}
                        currentScheduleId={currentScheduleId}
                        onSelectSchedule={onSelectSchedule}
                      />
                    </div>
                </div>
            )}
            {activeView === 'gallery' && (
                <div className="px-6 py-5">
                    <GalleryView
                        images={galleryImages}
                        onUpdateImage={onUpdateGalleryImage}
                        onDeleteImage={onDeleteGalleryImage}
                        onSetChatReference={onSetChatReference}
                        styleReferences={styleReferences}
                        onAddStyleReference={onAddStyleReference}
                        onRemoveStyleReference={onRemoveStyleReference}
                        onSelectStyleReference={onSelectStyleReference}
                        onPublishToCampaign={onPublishToCampaign}
                        onSchedulePost={(image) => {
                            // Create scheduled post for tomorrow at noon
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrow.setHours(12, 0, 0, 0);
                            const dateStr = tomorrow.toISOString().split('T')[0];
                            onSchedulePost({
                                type: 'flyer',
                                contentId: image.id,
                                imageUrl: image.src,
                                caption: image.prompt || 'Post agendado',
                                hashtags: ['poker', 'torneio'],
                                scheduledDate: dateStr,
                                scheduledTime: '12:00',
                                scheduledTimestamp: tomorrow.getTime(),
                                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                                platforms: { instagram: true, facebook: false },
                                status: 'draft'
                            });
                            onViewChange('calendar');
                        }}
                    />
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
                      onPublishToInstagram={onPublishToInstagram}
                      publishingStates={publishingStates}
                    />
                </div>
            )}
            {activeView === 'campaigns' && userId && (
                <div className="px-6 py-5">
                    <CampaignsList
                      userId={userId}
                      onSelectCampaign={onLoadCampaign}
                      onNewCampaign={() => onViewChange('campaign')}
                      currentCampaignId={campaign?.id}
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
