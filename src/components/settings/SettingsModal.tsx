/**
 * Settings Modal with Tabs
 * Modal for managing brand profile and team settings
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { BrandProfile, ToneOfVoice, ToneTarget } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { extractColorsFromLogo } from '../../services/geminiService';
import { uploadImageToBlob } from '../../services/blobService';
import { useOrganization, OrganizationProfile, useUser } from '@clerk/clerk-react';
import { ConnectInstagramModal, useInstagramAccounts } from './ConnectInstagramModal';
import { CREATIVE_MODELS_FOR_UI, getDefaultModelId } from '../../config/ai-models';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandProfile: BrandProfile;
  onSaveProfile: (profile: BrandProfile) => void;
}

type Tab = 'brand' | 'tone' | 'integrations' | 'team';

const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType: file.type, dataUrl });
    };
    reader.onerror = (error) => reject(error);
  });

const tones: ToneOfVoice[] = ['Profissional', 'Espirituoso', 'Casual', 'Inspirador', 'Técnico'];

const defaultToneTargets: ToneTarget[] = ['campaigns', 'posts', 'images', 'flyers'];

const toneTargetLabels: Record<ToneTarget, string> = {
  campaigns: 'Campanhas',
  posts: 'Posts',
  images: 'Imagens',
  flyers: 'Flyers',
  videos: 'Vídeos',
};

// Modelos criativos - configuração em config/ai-models.ts
const creativeModels = CREATIVE_MODELS_FOR_UI;
const DEFAULT_MODEL = getDefaultModelId();

// Color Widget
const ColorWidget: React.FC<{
  label: string;
  color: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  isAnalyzing: boolean;
}> = ({ label, color, onChange, name, isAnalyzing }) => (
  <div className="relative w-full">
    <label className="text-xs font-medium text-muted-foreground mb-2 block">{label}</label>
    <div className="bg-[#0a0a0a]/60 border border-border rounded-xl h-[52px] px-3 flex items-center gap-3 group transition-all hover:border-white/20 backdrop-blur-xl">
      <div className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
        <input
          type="color"
          name={name}
          value={color}
          onChange={onChange}
          className="w-full h-full rounded-lg cursor-pointer bg-transparent border-none p-0 overflow-hidden relative z-10 opacity-0"
        />
        <div
          className="absolute w-7 h-7 rounded-lg pointer-events-none z-0 ring-1 ring-ring transition-all"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className={`text-xs font-mono text-muted-foreground group-hover:text-white transition-colors ${isAnalyzing ? 'animate-pulse' : ''}`}>
        {isAnalyzing ? '...' : color.toUpperCase()}
      </span>
    </div>
  </div>
);


export function SettingsModal({ isOpen, onClose, brandProfile, onSaveProfile }: SettingsModalProps) {
  const { organization } = useOrganization();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('brand');
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  // Instagram accounts management
  const {
    accounts: instagramAccounts,
    loading: loadingAccounts,
    addAccount,
    removeAccount
  } = useInstagramAccounts(user?.id || '', organization?.id);



  const [profile, setProfile] = useState<Omit<BrandProfile, 'logo'> & { logo: string | null | File }>({
    name: brandProfile.name || '',
    description: brandProfile.description || '',
    logo: brandProfile.logo || null,
    primaryColor: brandProfile.primaryColor || '#FFFFFF',
    secondaryColor: brandProfile.secondaryColor || '#737373',
    tertiaryColor: brandProfile.tertiaryColor || '',
    toneOfVoice: brandProfile.toneOfVoice || 'Casual',
    toneTargets: brandProfile.toneTargets || defaultToneTargets,
    creativeModel: brandProfile.creativeModel || DEFAULT_MODEL,
  });
  const [isAnalyzingLogo, setIsAnalyzingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(brandProfile.logo || null);
  const [logoMeta, setLogoMeta] = useState<{ type: string; size: string; dimensions?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset profile when brandProfile changes
  useEffect(() => {
    setProfile({
      name: brandProfile.name || '',
      description: brandProfile.description || '',
      logo: brandProfile.logo || null,
      primaryColor: brandProfile.primaryColor || '#FFFFFF',
      secondaryColor: brandProfile.secondaryColor || '#737373',
      tertiaryColor: brandProfile.tertiaryColor || '',
      toneOfVoice: brandProfile.toneOfVoice || 'Casual',
      toneTargets: brandProfile.toneTargets || defaultToneTargets,
      creativeModel: brandProfile.creativeModel || DEFAULT_MODEL,
    });
    setLogoPreview(brandProfile.logo || null);
  }, [brandProfile]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setProfile((prev) => ({ ...prev, logo: file }));
      setIsAnalyzingLogo(true);

      // Extract file metadata
      const fileType = file.type.split('/')[1]?.toUpperCase() || 'IMG';
      const fileSize = formatFileSize(file.size);
      setLogoMeta({ type: fileType, size: fileSize });

      try {
        const { base64, mimeType, dataUrl } = await fileToBase64(file);
        setLogoPreview(dataUrl);

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          setLogoMeta(prev => prev ? { ...prev, dimensions: `${img.width}×${img.height}` } : null);
        };
        img.src = dataUrl;

        const colors = await extractColorsFromLogo({ base64, mimeType });
        setProfile((prev) => ({
          ...prev,
          logo: file,
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor || prev.secondaryColor,
          tertiaryColor: colors.tertiaryColor || '', // Empty string if no tertiary color
        }));
      } catch (error) {
        console.error('Failed to extract colors:', error);
      } finally {
        setIsAnalyzingLogo(false);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg'] },
    multiple: false,
  } as Parameters<typeof useDropzone>[0]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const _handleToneChange = (val: string) => {
    setProfile((prev) => ({ ...prev, toneOfVoice: val as ToneOfVoice }));
  };

  const handleToneTargetToggle = (target: ToneTarget) => {
    setProfile((prev) => {
      const current = prev.toneTargets || defaultToneTargets;
      const isActive = current.includes(target);
      return {
        ...prev,
        toneTargets: isActive
          ? current.filter(t => t !== target)
          : [...current, target]
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let logoUrl: string | null = null;

      // Upload logo to Vercel Blob to get a permanent URL
      if (profile.logo instanceof File) {
        const { base64, mimeType } = await fileToBase64(profile.logo);
        console.debug('[Settings] Uploading logo to Vercel Blob...');
        try {
          logoUrl = await uploadImageToBlob(base64, mimeType);
          console.debug('[Settings] Logo uploaded successfully:', logoUrl);
        } catch (err) {
          console.error('[Settings] Failed to upload logo to Blob:', err);
          // Fallback to data URL if upload fails
          logoUrl = `data:${mimeType};base64,${base64}`;
        }
      } else if (typeof profile.logo === 'string') {
        // If it's already a URL (http/https), use it directly
        // If it's a data URL, try to upload it to Blob
        if (profile.logo.startsWith('data:')) {
          console.debug('[Settings] Converting existing data URL to Blob...');
          try {
            const [header, base64Data] = profile.logo.split(',');
            const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
            logoUrl = await uploadImageToBlob(base64Data, mimeType);
            console.debug('[Settings] Data URL converted to Blob:', logoUrl);
          } catch (err) {
            console.error('[Settings] Failed to convert data URL to Blob:', err);
            logoUrl = profile.logo; // Keep data URL as fallback
          }
        } else {
          // Already a proper URL (http/https)
          logoUrl = profile.logo;
        }
      }

      onSaveProfile({ ...profile, logo: logoUrl });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'brand', label: 'Marca', icon: 'palette' },
    { id: 'tone', label: 'Tom', icon: 'sliders' },
    { id: 'integrations', label: 'Integrações', icon: 'link' },
    { id: 'team', label: 'Time', icon: 'users' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <div className="rounded-2xl p-6 sm:p-8 shadow-2xl border border-border bg-[#0a0a0a]/95 backdrop-blur-xl relative overflow-hidden">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors z-10"
          >
            <Icon name="x" className="w-5 h-5 text-muted-foreground hover:text-white" />
          </button>

          {/* Header */}
          <div className="flex items-center space-x-3 mb-6">
            <h2 className="text-lg font-semibold text-white">
              {organization?.name || 'Configurações'}
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id
                  ? 'text-white border-white'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
                  }`}
              >
                <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
            {activeTab === 'brand' && (
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
                  {/* Left Column - Inputs */}
                  <div className="space-y-6">
                    <div className="group">
                      <label className="block text-xs font-medium text-muted-foreground mb-2 group-focus-within:text-white transition-colors">
                        Nome da Marca
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={profile.name}
                        onChange={handleChange}
                        required
                        placeholder="Ex: Nome da Sua Marca"
                        className="w-full bg-[#0a0a0a]/60 border border-border rounded-xl p-3 text-white text-sm font-medium focus:outline-none focus:border-white/30 transition-all placeholder:text-muted-foreground backdrop-blur-xl"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-xs font-medium text-muted-foreground mb-2 group-focus-within:text-white transition-colors">
                        Descrição
                      </label>
                      <textarea
                        name="description"
                        value={profile.description}
                        onChange={handleChange}
                        required
                        rows={4}
                        placeholder="Descreva sua marca..."
                        className="w-full bg-[#0a0a0a]/60 border border-border rounded-xl p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-all resize-none placeholder:text-muted-foreground backdrop-blur-xl"
                      />
                    </div>
                  </div>

                  {/* Right Column - Assets */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">
                        Logo
                      </label>
                      <div
                        {...getRootProps()}
                        className={`group relative cursor-pointer border border-border rounded-xl h-[160px] flex flex-col items-center justify-center transition-all overflow-hidden backdrop-blur-xl ${isDragActive ? 'border-white/30' : 'hover:border-white/20'
                          }`}
                        style={{
                          background: logoPreview
                            ? 'repeating-conic-gradient(#1a1a1a 0% 25%, #0f0f0f 0% 50%) 50% / 12px 12px'
                            : '#0a0a0a'
                        }}
                      >
                        <input {...getInputProps()} />
                        {isAnalyzingLogo && (
                          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0a]/95 rounded-xl backdrop-blur-xl">
                            <Loader size={24} className="mb-3 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground animate-pulse">
                              Analisando...
                            </span>
                          </div>
                        )}
                        {logoPreview ? (
                          <>
                            {logoMeta && (
                              <div className="absolute top-2 left-2 flex gap-1.5 z-10">
                                <span className="px-2 py-0.5 bg-[#0a0a0a]/60 backdrop-blur-sm rounded text-[10px] font-mono text-white/70">
                                  {logoMeta.type}
                                </span>
                                {logoMeta.dimensions && (
                                  <span className="px-2 py-0.5 bg-[#0a0a0a]/60 backdrop-blur-sm rounded text-[10px] font-mono text-white/70">
                                    {logoMeta.dimensions}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 bg-[#0a0a0a]/60 backdrop-blur-sm rounded text-[10px] font-mono text-white/70">
                                  {logoMeta.size}
                                </span>
                              </div>
                            )}
                            <img
                              src={logoPreview}
                              alt="Logo"
                              className="max-h-36 max-w-[90%] object-contain filter group-hover:scale-105 transition-transform duration-300"
                            />
                          </>
                        ) : (
                          <div className="text-center">
                            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-3 border border-border group-hover:bg-white/10 transition-all">
                              <Icon name="upload" className="w-5 h-5 text-muted-foreground group-hover:text-white" />
                            </div>
                            <p className="text-xs font-medium text-muted-foreground">Arraste ou clique para enviar</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Colors Grid */}
                    <div className="grid gap-3 grid-cols-2">
                      <ColorWidget
                        label="Primária"
                        name="primaryColor"
                        color={profile.primaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                      <ColorWidget
                        label="Secundária"
                        name="secondaryColor"
                        color={profile.secondaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-4 flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSaving || isAnalyzingLogo || !profile.name}
                    variant="primary"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === 'tone' && (
              <div className="space-y-6 py-2">
                {/* Tom de Voz */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-3">
                    Tom de Voz
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {tones.map((tone) => {
                      const isActive = profile.toneOfVoice === tone;
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => setProfile(p => ({ ...p, toneOfVoice: tone as ToneOfVoice }))}
                          className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${isActive
                            ? 'bg-white text-black'
                            : 'bg-[#0a0a0a]/60 text-muted-foreground hover:bg-white/10 hover:text-white border border-border backdrop-blur-xl'
                            }`}
                        >
                          {tone}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Aplicar Tom em */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-3">
                    Aplicar Tom em
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(toneTargetLabels) as ToneTarget[]).map((target) => {
                      const isActive = (profile.toneTargets || defaultToneTargets).includes(target);
                      return (
                        <button
                          key={target}
                          type="button"
                          onClick={() => handleToneTargetToggle(target)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive
                            ? 'bg-white text-black'
                            : 'bg-[#0a0a0a]/60 text-muted-foreground hover:text-white hover:bg-white/10 border border-border backdrop-blur-xl'
                            }`}
                        >
                          {toneTargetLabels[target]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Modelo Criativo */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-3">
                    Modelo Criativo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {creativeModels.map((model) => {
                      const isActive = (profile.creativeModel || DEFAULT_MODEL) === model.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setProfile(p => ({ ...p, creativeModel: model.id }))}
                          className={`px-4 py-3 rounded-lg text-left transition-all backdrop-blur-xl ${isActive
                            ? 'bg-white/10 border border-border'
                            : 'bg-[#0a0a0a]/60 border border-border hover:bg-white/5'
                            }`}
                        >
                          <span className={`block text-xs font-semibold ${isActive ? 'text-white' : 'text-muted-foreground'}`}>
                            {model.label}
                          </span>
                          <span className={`block text-[10px] mt-0.5 ${isActive ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                            {model.provider}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Modelo usado para gerar campanhas, posts e prompts de vídeo.
                  </p>
                </div>

                {/* Save Button */}
                <div className="pt-4 flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving}
                    variant="primary"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="space-y-6 py-2">
                {/* Instagram Integration */}
                <div className="border border-border rounded-xl p-5 bg-white/[0.02]">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-xl flex items-center justify-center">
                        <Icon name="instagram" className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Instagram</h3>
                        <p className="text-[10px] text-muted-foreground">Publicar fotos e vídeos automaticamente</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowInstagramModal(true)}
                    >
                      <Icon name="plus" className="w-3 h-3 mr-1.5" />
                      Conectar
                    </Button>
                  </div>

                  {/* Connected Accounts */}
                  {loadingAccounts ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader size={20} className="text-muted-foreground" />
                    </div>
                  ) : instagramAccounts.length > 0 ? (
                    <div className="space-y-2">
                      {instagramAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-500/20 rounded-full flex items-center justify-center">
                              <Icon name="user" className="w-4 h-4 text-pink-400" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-white">
                                @{account.instagram_username}
                              </p>
                              <p className="text-[9px] text-muted-foreground">
                                Conectado {new Date(account.connected_at).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-[9px] font-medium">
                              Ativo
                            </span>
                            <button
                              onClick={() => {
                                if (confirm(`Desconectar @${account.instagram_username}?`)) {
                                  removeAccount(account.id);
                                }
                              }}
                              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                              title="Desconectar"
                            >
                              <Icon name="trash" className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Icon name="instagram" className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">Nenhuma conta conectada</p>
                      <p className="text-[10px] text-muted-foreground">Clique em "Conectar" para adicionar uma conta</p>
                    </div>
                  )}
                </div>

                {/* Future Integrations Placeholder */}
                <div className="border border-border border-dashed rounded-xl p-5 opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                      <Icon name="facebook" className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Facebook</h3>
                      <p className="text-[10px] text-muted-foreground">Em breve</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'team' && (
              <OrganizationProfile
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'bg-transparent shadow-none border-none',
                    navbar: 'hidden',
                    pageScrollBox: 'p-0',
                    profileSection: 'border-border',
                    profileSectionTitle: 'text-muted-foreground',
                    profileSectionContent: 'text-white',
                    formFieldLabel: 'text-muted-foreground',
                    formFieldInput: 'bg-white/5 border-border text-white',
                    formButtonPrimary: 'bg-primary text-black hover:bg-primary/90',
                    membersPageInviteButton: 'bg-primary text-black hover:bg-primary/90',
                    tableHead: 'text-muted-foreground',
                    tableCell: 'text-white/80',
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Connect Instagram Modal */}
      <ConnectInstagramModal
        isOpen={showInstagramModal}
        onClose={() => setShowInstagramModal(false)}
        userId={user?.id || ''}
        organizationId={organization?.id}
        onAccountConnected={addAccount}
      />
    </div>
  );
}
