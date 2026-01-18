
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useClerk } from '@clerk/clerk-react';
import type { BrandProfile, ToneOfVoice } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { extractColorsFromLogo } from '../../services/geminiService';

interface BrandProfileSetupProps {
  onProfileSubmit: (profile: BrandProfile) => void;
  existingProfile?: BrandProfile | null;
}

const fileToBase64 = (file: File): Promise<{ base64: string, mimeType: string, dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType: file.type, dataUrl });
    };
    reader.onerror = error => reject(error);
  });

const tones: ToneOfVoice[] = ['Profissional', 'Espirituoso', 'Casual', 'Inspirador', 'Técnico'];

// Custom Dropdown Component for Aura OS Aesthetic
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
      <label className="block text-[10px] font-medium text-white/60 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#0a0a0a]/60 border border-white/[0.08] rounded-lg p-2.5 flex items-center justify-between text-left transition-all hover:border-white/20 active:scale-[0.98] outline-none backdrop-blur-xl"
      >
        <span className="text-xs font-medium text-white truncate">{value}</span>
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} className="w-3 h-3 text-white/40 flex-shrink-0 ml-1.5" />
      </button>

      {isOpen && (
        <div className="absolute z-[100] bottom-full mb-2 w-full bg-[#0a0a0a]/95 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setIsOpen(false); }}
              className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${value === opt
                ? 'bg-white text-black'
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

// Compact Color Widget for Aura OS Aesthetic
const ColorWidget: React.FC<{
  label: string;
  color: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  isAnalyzing: boolean;
}> = ({ label, color, onChange, name, isAnalyzing }) => (
  <div className="bg-[#0a0a0a]/60 border border-white/[0.08] p-2.5 rounded-lg flex items-center justify-between group transition-all hover:border-white/20 w-full overflow-hidden backdrop-blur-xl">
    <div className="flex flex-col min-w-0 flex-1 pr-1.5">
      <label className="text-[10px] font-medium text-white/60 mb-0.5 truncate">{label}</label>
      <span className={`text-[10px] font-mono text-white/40 group-hover:text-white transition-colors truncate ${isAnalyzing ? 'animate-pulse' : ''}`}>
        {isAnalyzing ? 'Sync...' : color.toUpperCase()}
      </span>
    </div>
    <div className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
      <input
        type="color"
        name={name}
        value={color}
        onChange={onChange}
        className="w-full h-full rounded-md cursor-pointer bg-transparent border-none p-0 overflow-hidden relative z-10 opacity-0"
      />

      <div
        className="absolute w-5 h-5 rounded-md pointer-events-none z-0 border border-white/20 shadow-md transition-all duration-500"
        style={{ backgroundColor: color }}
      ></div>
    </div>
  </div>
);

export const BrandProfileSetup: React.FC<BrandProfileSetupProps> = ({ onProfileSubmit, existingProfile }) => {
  const { signOut } = useClerk();
  const [profile, setProfile] = useState<Omit<BrandProfile, 'logo'> & { logo: string | null | File }>({
    name: existingProfile?.name || '',
    description: existingProfile?.description || '',
    logo: existingProfile?.logo || null,
    primaryColor: existingProfile?.primaryColor || '#FFFFFF',
    secondaryColor: existingProfile?.secondaryColor || '#737373',
    tertiaryColor: existingProfile?.tertiaryColor || '',
    toneOfVoice: existingProfile?.toneOfVoice || 'Casual',
  });
  const [isAnalyzingLogo, setIsAnalyzingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(existingProfile?.logo || null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      console.log('[BrandProfile] Logo dropped:', { name: file.name, type: file.type, size: file.size });
      setProfile(prev => ({ ...prev, logo: file }));
      setIsAnalyzingLogo(true);
      try {
        const { base64, mimeType, dataUrl } = await fileToBase64(file);
        console.log('[BrandProfile] Logo converted to base64:', { mimeType, base64Length: base64.length });
        setLogoPreview(dataUrl);

        console.log('[BrandProfile] Calling extractColorsFromLogo...');
        const colors = await extractColorsFromLogo({ base64, mimeType });
        console.log('[BrandProfile] Colors extracted:', colors);

        setProfile(prev => ({
          ...prev,
          logo: file,
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor ?? prev.secondaryColor,
          tertiaryColor: colors.tertiaryColor ?? '',
        }));
        console.log('[BrandProfile] Profile updated with colors');
      } catch (error) {
        console.error("[BrandProfile] Failed to extract colors:", error);
        alert(`Erro ao extrair cores: ${error.message}`);
      } finally {
        setIsAnalyzingLogo(false);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg'] },
    multiple: false
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleToneChange = (val: string) => {
    setProfile(prev => ({ ...prev, toneOfVoice: val as ToneOfVoice }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let logoBase64: string | null = null;
    if (profile.logo instanceof File) {
      const { dataUrl } = await fileToBase64(profile.logo);
      logoBase64 = dataUrl;
    } else if (typeof profile.logo === 'string') {
      logoBase64 = profile.logo;
    }
    onProfileSubmit({ ...profile, logo: logoBase64 });
  };

  const isFormValid = profile.name && profile.description;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans selection:bg-white/20 selection:text-white">
      <div className="max-w-[1280px] w-full z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center px-2">

        {/* Left Side Info */}
        <div className="lg:col-span-4 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/[0.08] flex items-center justify-center backdrop-blur-xl">
                <Icon name="logo" className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white/60">CPC Agency</span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex items-center space-x-2 px-3 py-2 bg-white/5 border border-white/[0.08] rounded-lg text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all text-xs font-medium backdrop-blur-xl"
            >
              <Icon name="log-out" className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>

          <div className="space-y-2 mb-6">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
              Configure seu<br />
              perfil de marca
            </h1>
          </div>

          <p className="text-sm text-white/60 font-normal max-w-sm mb-10 leading-relaxed">
            Defina a identidade visual e o tom de voz da sua marca para personalizar todo o conteúdo gerado.
          </p>

          <div className="hidden lg:block space-y-4">
            <div className="rounded-xl p-4 flex items-center justify-between border border-white/[0.08] bg-[#0a0a0a]/80 backdrop-blur-xl">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                <div>
                  <p className="text-xs font-medium text-white">Extração de cores</p>
                  <p className="text-xs text-white/40">{isAnalyzingLogo ? 'Analisando...' : 'Pronto'}</p>
                </div>
              </div>
              {isAnalyzingLogo && <Loader className="w-4 h-4 text-white" />}
            </div>
          </div>
        </div>

        {/* Main Configuration Panel */}
        <div className="lg:col-span-8 w-full">
          <div className="rounded-2xl p-6 sm:p-8 md:p-10 shadow-2xl border border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl relative overflow-hidden">
            <div className="flex items-center space-x-3 mb-8">
              <h2 className="text-xl font-semibold text-white">Perfil da Marca</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14">
                {/* Inputs */}
                <div className="space-y-6">
                  <div className="group">
                    <label className="block text-xs font-medium text-white/60 mb-2 group-focus-within:text-white transition-colors">Nome da Marca</label>
                    <input
                      type="text"
                      name="name"
                      value={profile.name}
                      onChange={handleChange}
                      required
                      placeholder="CPC POKER"
                      className="w-full bg-[#0a0a0a]/60 border border-white/[0.08] rounded-xl p-3 text-white text-sm font-medium focus:outline-none focus:border-white/30 transition-all placeholder:text-white/20 backdrop-blur-xl"
                    />
                  </div>
                  <div className="group">
                    <label className="block text-xs font-medium text-white/60 mb-2 group-focus-within:text-white transition-colors">Descrição</label>
                    <textarea
                      name="description"
                      value={profile.description}
                      onChange={handleChange}
                      required
                      rows={4}
                      placeholder="Clube de Poker"
                      className="w-full bg-[#0a0a0a]/60 border border-white/[0.08] rounded-xl p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-all resize-none placeholder:text-white/20 backdrop-blur-xl"
                    />
                  </div>
                </div>

                {/* Assets */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-2">Logo</label>
                    <div
                      {...getRootProps()}
                      className={`group relative cursor-pointer bg-[#0a0a0a]/60 border border-white/[0.08] rounded-2xl p-6 h-[200px] flex flex-col items-center justify-center transition-all backdrop-blur-xl ${isDragActive ? 'border-white/30' : 'hover:border-white/20'}`}
                    >
                      <input {...getInputProps()} />
                      {isAnalyzingLogo && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0a0a]/95 rounded-2xl backdrop-blur-xl">
                          <Loader className="w-8 h-8 mb-4 text-white" />
                          <span className="text-xs font-medium text-white/60 animate-pulse">Analisando...</span>
                        </div>
                      )}
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="max-h-32 max-w-full object-contain filter group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="text-center">
                          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-3 border border-white/[0.08] group-hover:bg-white/10 transition-all">
                            <Icon name="upload" className="w-5 h-5 text-white/40 group-hover:text-white" />
                          </div>
                          <p className="text-xs font-medium text-white/40">Arraste ou clique para fazer upload</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Technical Grid */}
                  <div className={`grid grid-cols-2 gap-2.5 ${profile.tertiaryColor ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
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
                    {profile.tertiaryColor && (
                      <ColorWidget
                        label="Tertiary"
                        name="tertiaryColor"
                        color={profile.tertiaryColor}
                        onChange={handleChange}
                        isAnalyzing={isAnalyzingLogo}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/[0.08]">
                <Button
                  type="submit"
                  disabled={!isFormValid || isAnalyzingLogo}
                  size="large"
                  className="w-full py-3.5 text-sm font-semibold bg-white text-black hover:bg-white/90 active:scale-[0.99] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  variant="primary"
                >
                  {existingProfile ? 'Atualizar Perfil' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>

          <p className="text-center text-white/20 text-xs font-medium mt-6">
            CPC Agency
          </p>
        </div>
      </div>
    </div>
  );
};
