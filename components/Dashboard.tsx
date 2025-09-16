import React, { useState } from 'react';
import type { BrandProfile, MarketingCampaign, ContentInput, IconName, ChatMessage, Theme, TournamentEvent } from '../types';
import { UploadForm } from './UploadForm';
import { ClipsTab } from './tabs/ClipsTab';
import { PostsTab } from './tabs/PostsTab';
import { AdCreativesTab } from './tabs/AdCreativesTab';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { FlyerGenerator } from './FlyerGenerator';
import { AssistantPanel } from './assistant/AssistantPanel';

interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  onGenerate: (input: ContentInput) => void;
  isGenerating: boolean;
  onEditProfile: () => void;
  onResetCampaign: () => void;
  referenceImage: ContentInput['image'] | null;
  // Assistant Props
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  assistantHistory: ChatMessage[];
  isAssistantLoading: boolean;
  onAssistantSendMessage: (message: string) => void;
  // Theme Props
  theme: Theme;
  onThemeToggle: () => void;
  // Flyer Generator Props
  tournamentEvents: TournamentEvent[];
  onTournamentFileUpload: (file: File) => Promise<void>;
}

type Tab = 'clips' | 'posts' | 'ads';
type View = 'campaign' | 'flyer';

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
        ? 'bg-primary/20 text-primary'
        : 'text-subtle hover:bg-surface hover:text-text-main'
    }`}
    aria-current={active ? 'page' : undefined}
  >
    <Icon name={icon} className="w-5 h-5" />
    <span>{label}</span>
  </button>
);


export const Dashboard: React.FC<DashboardProps> = ({ 
  brandProfile, 
  campaign, 
  onGenerate, 
  isGenerating,
  onEditProfile,
  onResetCampaign,
  referenceImage,
  isAssistantOpen,
  onToggleAssistant,
  assistantHistory,
  isAssistantLoading,
  onAssistantSendMessage,
  theme,
  onThemeToggle,
  tournamentEvents,
  onTournamentFileUpload
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('clips');
  const [activeView, setActiveView] = useState<View>('campaign');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clips', label: 'Clipes de Vídeo' },
    { id: 'posts', label: 'Posts Sociais' },
    { id: 'ads', label: 'Criativos de Anúncio' },
  ];

  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="h-screen flex overflow-hidden bg-background text-text-main font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-surface flex flex-col flex-shrink-0 border-r border-muted/20">
        <div className="h-16 flex items-center px-4 border-b border-muted/20 flex-shrink-0">
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
            <div className="border-t border-muted/20 my-2"></div>
            <NavItem
                icon="bot"
                label="Assistente de IA"
                active={isAssistantOpen}
                onClick={onToggleAssistant}
            />
        </nav>
        <div className="p-4 border-t border-muted/20 space-y-4 flex-shrink-0">
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
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${isAssistantOpen ? 'pr-96' : ''}`}>
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
                                <h2 className="text-3xl font-extrabold">Sua Campanha Gerada</h2>
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
                            {activeTab === 'clips' && <ClipsTab videoClipScripts={campaign.videoClipScripts} />}
                            {activeTab === 'posts' && <PostsTab posts={campaign.posts} brandProfile={brandProfile} referenceImage={referenceImage} />}
                            {activeTab === 'ads' && <AdCreativesTab adCreatives={campaign.adCreatives} brandProfile={brandProfile} referenceImage={referenceImage} />}
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
                />
            )}
        </div>
      </main>

       {/* Assistant Panel */}
       <AssistantPanel 
            isOpen={isAssistantOpen}
            onClose={onToggleAssistant}
            history={assistantHistory}
            isLoading={isAssistantLoading}
            onSendMessage={onAssistantSendMessage}
       />
    </div>
  );
};