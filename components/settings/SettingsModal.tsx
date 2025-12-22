/**
 * Settings Modal with Tabs
 * Modal for managing brand profile and team settings
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { BrandProfile, ToneOfVoice } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { extractColorsFromLogo } from '../../services/geminiService';
import { TeamManagement } from '../team/TeamManagement';
import { useOrganization } from '../../contexts/OrganizationContext';

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

// Color Widget similar to BrandProfileSetup
const ColorWidget: React.FC<{
  label: string;
  color: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  isAnalyzing: boolean;
}> = ({ label, color, onChange, name, isAnalyzing }) => (
  <div className="bg-[#111111] border border-white/5 p-3 rounded-xl flex items-center justify-between group transition-all hover:border-white/10 w-full overflow-hidden">
    <div className="flex flex-col min-w-0 flex-1 pr-1.5">
      <label className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em] mb-1 truncate">{label}</label>
      <span className={`text-[8px] font-mono text-white/40 group-hover:text-white transition-colors truncate ${isAnalyzing ? 'animate-pulse' : ''}`}>
        {isAnalyzing ? 'SYNC...' : color.toUpperCase()}
      </span>
    </div>
    <div className="relative w-6 h-6 flex items-center justify-center flex-shrink-0">
      <div className="absolute inset-0 border border-white/5 rounded-full"></div>
      <div className={`absolute inset-0.5 border border-white/10 rounded-full border-dashed ${isAnalyzing ? 'animate-spin' : 'animate-[spin_20s_linear_infinite]'}`}></div>
      <input
        type="color"
        name={name}
        value={color}
        onChange={onChange}
        className="w-full h-full rounded-sm cursor-pointer bg-transparent border-none p-0 overflow-hidden relative z-10 opacity-0"
      />
      <div
        className="absolute w-3 h-3 rounded-sm pointer-events-none z-0 border border-white/20 shadow-lg transition-all duration-500"
        style={{ backgroundColor: color }}
      ></div>
    </div>
  </div>
);

// Custom Select similar to BrandProfileSetup
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
      <label className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5 block">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#111111] border border-white/5 rounded-xl p-3 flex items-center justify-between text-left transition-all hover:border-white/20 active:scale-[0.98] outline-none"
      >
        <span className="text-[9px] font-black text-white uppercase tracking-widest truncate">{value}</span>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-2.5 h-2.5 text-white/20 flex-shrink-0 ml-1.5" />
      </button>

      {isOpen && (
        <div className="absolute z-[100] bottom-full mb-2 w-full bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-fade-in-up">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setIsOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-[8px] font-black uppercase tracking-widest transition-colors ${
                value === opt
                  ? 'bg-primary text-black'
                  : 'text-white/40 hover:bg-white/5 hover:text-white'
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
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState<Tab>('brand');
  const [profile, setProfile] = useState<Omit<BrandProfile, 'logo'> & { logo: string | null | File }>({
    name: brandProfile.name || '',
    description: brandProfile.description || '',
    logo: brandProfile.logo || null,
    primaryColor: brandProfile.primaryColor || '#FFFFFF',
    secondaryColor: brandProfile.secondaryColor || '#737373',
    toneOfVoice: brandProfile.toneOfVoice || 'Casual',
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

      {/* Animated Background Elements */}
      <div className="glow-spot top-[-20%] left-[-10%] opacity-10 pointer-events-none"></div>
      <div className="glow-spot bottom-[-20%] right-[-10%] opacity-10 pointer-events-none" style={{ animationDelay: '-5s' }}></div>

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
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-1 h-6 bg-primary rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)]"></div>
            <h2 className="text-lg font-black text-white uppercase tracking-[0.2em]">
              {currentOrganization ? currentOrganization.name : 'Configuracoes'}
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
          <div className="max-h-[60vh] overflow-y-auto">
            {activeTab === 'brand' && (
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
                  {/* Left Column - Inputs */}
                  <div className="space-y-8">
                    <div className="group">
                      <label className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 group-focus-within:text-white transition-colors">
                        Label de Identidade
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={profile.name}
                        onChange={handleChange}
                        required
                        placeholder="EX: CPC POKER ONLINE"
                        className="w-full bg-[#111111] border border-white/5 rounded-2xl p-4 text-white text-base font-bold focus:outline-none focus:border-primary/50 transition-all placeholder:text-white/5"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 group-focus-within:text-white transition-colors">
                        Manifesto Core
                      </label>
                      <textarea
                        name="description"
                        value={profile.description}
                        onChange={handleChange}
                        required
                        rows={4}
                        placeholder="Defina a essencia da sua marca..."
                        className="w-full bg-[#111111] border border-white/5 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-primary/50 transition-all resize-none placeholder:text-white/5"
                      />
                    </div>
                  </div>

                  {/* Right Column - Assets */}
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">
                        Master Logo Asset
                      </label>
                      <div
                        {...getRootProps()}
                        className={`group relative cursor-pointer bg-[#111111] border border-white/5 rounded-3xl p-6 h-[180px] flex flex-col items-center justify-center transition-all ${
                          isDragActive ? 'border-primary' : 'hover:border-white/10'
                        }`}
                      >
                        <input {...getInputProps()} />
                        {isAnalyzingLogo && (
                          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/95 rounded-3xl backdrop-blur-xl">
                            <Loader className="w-8 h-8 mb-4 text-primary" />
                            <span className="text-[9px] font-black text-white uppercase tracking-[0.4em] animate-pulse">
                              Syncing...
                            </span>
                          </div>
                        )}
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo"
                            className="max-h-28 max-w-full object-contain filter group-hover:scale-105 transition-transform duration-700"
                          />
                        ) : (
                          <div className="text-center">
                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10 group-hover:bg-primary/10 transition-all">
                              <Icon name="upload" className="w-5 h-5 text-white/10 group-hover:text-primary" />
                            </div>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Drop Asset</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Technical Grid */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <CustomSelect
                        label="Tone"
                        value={profile.toneOfVoice}
                        options={tones}
                        onChange={handleToneChange}
                      />
                      <ColorWidget
                        label="Primary"
                        name="primaryColor"
                        color={profile.primaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                      <ColorWidget
                        label="Accent"
                        name="secondaryColor"
                        color={profile.secondaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-6 border-t border-white/5">
                  <Button
                    type="submit"
                    disabled={isSaving || isAnalyzingLogo || !profile.name}
                    size="large"
                    className="w-full py-5 text-[10px] font-black tracking-[0.5em] bg-white text-black hover:bg-white active:scale-[0.99] rounded-2xl"
                    variant="primary"
                  >
                    {isSaving ? 'SYNCING...' : 'SYNC_PROTOCOL'}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === 'team' && <TeamManagement />}
          </div>
        </div>
      </div>
    </div>
  );
}
