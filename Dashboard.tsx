
import React, { useState } from 'react';
import type { BrandProfile, MarketingCampaign, ContentInput } from '../types';
import { UploadForm } from './UploadForm';
import { ClipsTab } from './tabs/ClipsTab';
import { PostsTab } from './tabs/PostsTab';
import { AdCreativesTab } from './tabs/AdCreativesTab';
import { Loader } from './common/Loader';
import { Icon } from './common/Icon';
import { Button } from './common/Button';

interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  onGenerate: (input: ContentInput) => void;
  isGenerating: boolean;
  onEditProfile: () => void;
  onResetCampaign: () => void;
  // FIX: Add referenceImage to the props interface to resolve type error in App.tsx.
  // FIX: Correct the type for 'referenceImage'. It should be an element of 'ContentInput['productImages']'.
  referenceImage: NonNullable<ContentInput['productImages']>[number] | null;
}

type Tab = 'clips' | 'posts' | 'ads';

export const Dashboard: React.FC<DashboardProps> = ({ 
  brandProfile, 
  campaign, 
  onGenerate, 
  isGenerating,
  onEditProfile,
  onResetCampaign,
  // FIX: Destructure referenceImage from props.
  referenceImage
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('clips');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'clips', label: 'Clipes de Vídeo' },
    { id: 'posts', label: 'Posts Sociais' },
    { id: 'ads', label: 'Criativos de Anúncio' },
  ];

  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="min-h-screen bg-background text-text-main">
      <header className="bg-surface border-b border-muted/20">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Icon name="logo" className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-text-main">EchoReach</h1>
          </div>
          <div className="flex items-center space-x-4">
             <div className="flex items-center space-x-3">
                <div className="text-right">
                    <span className="text-sm font-medium text-text-main hidden sm:block">{brandProfile.name}</span>
                    <span className="text-xs text-text-muted hidden sm:block">Sua Marca</span>
                </div>
                {brandProfile.logo && (
                    <img src={brandProfile.logo} alt={`${brandProfile.name} logo`} className="h-9 w-9 rounded-full object-contain bg-white border border-muted/20"/>
                )}
            </div>
            <Button onClick={onEditProfile} size="small" variant="secondary" icon="edit">
              Editar Marca
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {showUploadForm && (
          // @ts-ignore
          <UploadForm onGenerate={onGenerate} isGenerating={isGenerating} />
        )}

        {isGenerating && (
          <div className="flex flex-col items-center justify-center text-center p-12 bg-surface rounded-xl border border-muted/20">
            <Loader className="h-12 w-12" />
            <h2 className="text-2xl font-bold mt-6">Criando Sua Campanha...</h2>
            <p className="text-text-muted mt-2 max-w-md">A IA EchoReach está analisando seu conteúdo e perfil de marca para gerar um conjunto completo de materiais de marketing. Isso pode levar um momento.</p>
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
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            <div>
              {/* @ts-ignore */}
              {activeTab === 'clips' && <ClipsTab videoClipScripts={campaign.videoClipScripts} />}
              {/* FIX: Pass missing brandProfile and referenceImage props to PostsTab. */}
              {/* @ts-ignore */}
              {activeTab === 'posts' && <PostsTab posts={campaign.posts} brandProfile={brandProfile} referenceImage={referenceImage} />}
              {/* FIX: Pass missing referenceImage prop to AdCreativesTab. */}
              {/* @ts-ignore */}
              {activeTab === 'ads' && <AdCreativesTab adCreatives={campaign.adCreatives} brandProfile={brandProfile} referenceImage={referenceImage} />}
            </div>
           </div>
        )}
      </main>
    </div>
  );
};
