/**
 * Settings Modal with Tabs
 * Modal for managing brand profile and team settings
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { BrandProfile, ToneOfVoice, ToneTarget, CreativeModel } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { extractColorsFromLogo } from '../../services/geminiService';
import { useOrganization, OrganizationProfile } from '@clerk/clerk-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandProfile: BrandProfile;
  onSaveProfile: (profile: BrandProfile) => void;
}

type Tab = 'brand' | 'team';

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

const tones: ToneOfVoice[] = ['Profissional', 'Espirituoso', 'Casual', 'Inspirador', 'Tecnico'];

const defaultToneTargets: ToneTarget[] = ['campaigns', 'posts', 'images', 'flyers'];

const toneTargetLabels: Record<ToneTarget, string> = {
  campaigns: 'Campanhas',
  posts: 'Posts',
  images: 'Imagens',
  flyers: 'Flyers',
  videos: 'Vídeos',
};

// Modelos criativos disponíveis
const creativeModels: { id: CreativeModel; label: string; provider: string }[] = [
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', provider: 'Google' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', provider: 'Google' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI' },
  { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast', provider: 'xAI' },
];

// Color Widget
const ColorWidget: React.FC<{
  label: string;
  color: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  isAnalyzing: boolean;
}> = ({ label, color, onChange, name, isAnalyzing }) => (
  <div className="bg-[#111111] border border-white/10 p-3 rounded-xl flex items-center justify-between group transition-all hover:border-white/20 w-full overflow-hidden">
    <div className="flex flex-col min-w-0 flex-1 pr-2">
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1 truncate">{label}</label>
      <span className={`text-[10px] font-mono text-white/50 group-hover:text-white transition-colors truncate ${isAnalyzing ? 'animate-pulse' : ''}`}>
        {isAnalyzing ? '...' : color.toUpperCase()}
      </span>
    </div>
    <div className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
      <input
        type="color"
        name={name}
        value={color}
        onChange={onChange}
        className="w-full h-full rounded-lg cursor-pointer bg-transparent border-none p-0 overflow-hidden relative z-10 opacity-0"
      />
      <div
        className="absolute w-6 h-6 rounded-lg pointer-events-none z-0 border border-white/20 shadow-lg transition-all"
        style={{ backgroundColor: color }}
      ></div>
    </div>
  </div>
);

// Custom Select
const CustomSelect: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}> = ({ label, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#111111] border border-white/10 rounded-xl p-3 flex items-center justify-between text-left transition-all hover:border-white/20 outline-none"
      >
        <span className="text-xs font-medium text-white truncate">{value}</span>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-3 h-3 text-white/30 flex-shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-[100] bottom-full mb-2 w-full bg-[#151515] border border-white/10 rounded-xl overflow-hidden shadow-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setIsOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-xs font-medium transition-colors ${
                value === opt
                  ? 'bg-primary text-black'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export function SettingsModal({ isOpen, onClose, brandProfile, onSaveProfile }: SettingsModalProps) {
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState<Tab>('brand');
  const [profile, setProfile] = useState<Omit<BrandProfile, 'logo'> & { logo: string | null | File }>({
    name: brandProfile.name || '',
    description: brandProfile.description || '',
    logo: brandProfile.logo || null,
    primaryColor: brandProfile.primaryColor || '#FFFFFF',
    secondaryColor: brandProfile.secondaryColor || '#737373',
    toneOfVoice: brandProfile.toneOfVoice || 'Casual',
    toneTargets: brandProfile.toneTargets || defaultToneTargets,
    creativeModel: brandProfile.creativeModel || 'gemini-3-pro',
  });
  const [isAnalyzingLogo, setIsAnalyzingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(brandProfile.logo || null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset profile when brandProfile changes
  useEffect(() => {
    setProfile({
      name: brandProfile.name || '',
      description: brandProfile.description || '',
      logo: brandProfile.logo || null,
      primaryColor: brandProfile.primaryColor || '#FFFFFF',
      secondaryColor: brandProfile.secondaryColor || '#737373',
      toneOfVoice: brandProfile.toneOfVoice || 'Casual',
      toneTargets: brandProfile.toneTargets || defaultToneTargets,
      creativeModel: brandProfile.creativeModel || 'gemini-3-pro',
    });
    setLogoPreview(brandProfile.logo || null);
  }, [brandProfile]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setProfile((prev) => ({ ...prev, logo: file }));
      setIsAnalyzingLogo(true);
      try {
        const { base64, mimeType, dataUrl } = await fileToBase64(file);
        setLogoPreview(dataUrl);
        const colors = await extractColorsFromLogo({ base64, mimeType });
        setProfile((prev) => ({
          ...prev,
          logo: file,
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor,
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
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleToneChange = (val: string) => {
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
      let logoBase64: string | null = null;
      if (profile.logo instanceof File) {
        const { dataUrl } = await fileToBase64(profile.logo);
        logoBase64 = dataUrl;
      } else if (typeof profile.logo === 'string') {
        logoBase64 = profile.logo;
      }
      onSaveProfile({ ...profile, logo: logoBase64 });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'brand', label: 'Marca', icon: 'palette' },
    { id: 'team', label: 'Time', icon: 'users' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <div className="aura-card p-6 sm:p-8 shadow-[0_50px_100px_rgba(0,0,0,0.8)] border-white/10 bg-[#050505] relative overflow-hidden">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors z-10"
          >
            <Icon name="x" className="w-5 h-5 text-white/60" />
          </button>

          {/* Header */}
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-1 h-5 bg-primary rounded-full"></div>
            <h2 className="text-base font-bold text-white">
              {organization?.name || 'Configurações'}
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-[9px] font-black uppercase tracking-[0.2em] transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-white border-primary'
                    : 'text-white/30 border-transparent hover:text-white/60'
                }`}
              >
                <Icon name={tab.icon as any} className="w-4 h-4" />
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
                  <div className="space-y-8">
                    <div className="group">
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 group-focus-within:text-white transition-colors">
                        Nome da Marca
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={profile.name}
                        onChange={handleChange}
                        required
                        placeholder="Ex: CPC Poker Online"
                        className="w-full bg-[#111111] border border-white/10 rounded-xl p-3 text-white text-sm font-medium focus:outline-none focus:border-primary/50 transition-all placeholder:text-white/20"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 group-focus-within:text-white transition-colors">
                        Descrição
                      </label>
                      <textarea
                        name="description"
                        value={profile.description}
                        onChange={handleChange}
                        required
                        rows={4}
                        placeholder="Descreva sua marca..."
                        className="w-full bg-[#111111] border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-primary/50 transition-all resize-none placeholder:text-white/20"
                      />
                    </div>
                  </div>

                  {/* Right Column - Assets */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                        Logo
                      </label>
                      <div
                        {...getRootProps()}
                        className={`group relative cursor-pointer bg-[#111111] border border-white/10 rounded-xl p-6 h-[160px] flex flex-col items-center justify-center transition-all ${
                          isDragActive ? 'border-primary' : 'hover:border-white/20'
                        }`}
                      >
                        <input {...getInputProps()} />
                        {isAnalyzingLogo && (
                          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/95 rounded-xl backdrop-blur-xl">
                            <Loader className="w-6 h-6 mb-3 text-primary" />
                            <span className="text-[10px] font-medium text-white/60 animate-pulse">
                              Analisando...
                            </span>
                          </div>
                        )}
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo"
                            className="max-h-24 max-w-full object-contain filter group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="text-center">
                            <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center mx-auto mb-3 border border-white/10 group-hover:bg-primary/10 transition-all">
                              <Icon name="upload" className="w-4 h-4 text-white/20 group-hover:text-primary" />
                            </div>
                            <p className="text-[10px] font-medium text-white/30">Arraste ou clique para enviar</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Technical Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <CustomSelect
                        label="Tom"
                        value={profile.toneOfVoice}
                        options={tones}
                        onChange={handleToneChange}
                      />
                      <ColorWidget
                        label="Cor Principal"
                        name="primaryColor"
                        color={profile.primaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                      <ColorWidget
                        label="Cor Secundária"
                        name="secondaryColor"
                        color={profile.secondaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                    </div>

                    {/* Tone Targets */}
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                        Aplicar Tom em
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(toneTargetLabels) as ToneTarget[]).map((target) => {
                          const isActive = (profile.toneTargets || defaultToneTargets).includes(target);
                          return (
                            <button
                              key={target}
                              type="button"
                              onClick={() => handleToneTargetToggle(target)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                                isActive
                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                  : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                              }`}
                            >
                              {toneTargetLabels[target]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Creative Model Selector */}
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                        Modelo Criativo
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {creativeModels.map((model) => {
                          const isActive = (profile.creativeModel || 'gemini-3-pro') === model.id;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => setProfile(p => ({ ...p, creativeModel: model.id }))}
                              className={`px-3 py-2 rounded-lg text-[10px] font-medium transition-all flex flex-col items-start ${
                                isActive
                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                  : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                              }`}
                            >
                              <span className="font-bold">{model.label}</span>
                              <span className={`text-[8px] ${isActive ? 'text-primary/60' : 'text-white/30'}`}>
                                {model.provider}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-white/30 mt-2">
                        Modelo usado para gerar campanhas, posts e prompts de vídeo.
                      </p>
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

            {activeTab === 'team' && (
              <OrganizationProfile
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'bg-transparent shadow-none border-none',
                    navbar: 'hidden',
                    pageScrollBox: 'p-0',
                    profileSection: 'border-white/10',
                    profileSectionTitle: 'text-white/60',
                    profileSectionContent: 'text-white',
                    formFieldLabel: 'text-white/60',
                    formFieldInput: 'bg-white/5 border-white/10 text-white',
                    formButtonPrimary: 'bg-primary text-black hover:bg-primary/90',
                    membersPageInviteButton: 'bg-primary text-black hover:bg-primary/90',
                    tableHead: 'text-white/40',
                    tableCell: 'text-white/80',
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
