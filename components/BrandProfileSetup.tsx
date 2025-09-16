import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { BrandProfile, ToneOfVoice } from '../types';
import { Card } from './common/Card';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import { Loader } from './common/Loader';
import { extractColorsFromLogo } from '../services/geminiService';

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

export const BrandProfileSetup: React.FC<BrandProfileSetupProps> = ({ onProfileSubmit, existingProfile }) => {
  const [profile, setProfile] = useState<Omit<BrandProfile, 'logo'> & { logo: string | null | File }>({
    name: existingProfile?.name || '',
    description: existingProfile?.description || '',
    logo: existingProfile?.logo || null,
    primaryColor: existingProfile?.primaryColor || '#14b8a6',
    secondaryColor: existingProfile?.secondaryColor || '#4f46e5',
    toneOfVoice: existingProfile?.toneOfVoice || 'Casual',
  });
  const [isAnalyzingLogo, setIsAnalyzingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(existingProfile?.logo || null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setProfile(prev => ({ ...prev, logo: file }));

      setIsAnalyzingLogo(true);
      try {
        const { base64, mimeType, dataUrl } = await fileToBase64(file);
        setLogoPreview(dataUrl);
        const colors = await extractColorsFromLogo({ base64, mimeType });
        setProfile(prev => ({
          ...prev,
          logo: file, // Keep the file object for final submission
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor,
        }));
      } catch (error) {
        console.error("Failed to extract colors from logo:", error);
        // Optionally, set an error state to show a message to the user
      } finally {
        setIsAnalyzingLogo(false);
      }
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg'] },
    multiple: false
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
            <div className="text-center mb-8">
                <Icon name="logo" className="w-12 h-12 text-primary mx-auto mb-3" />
                <h1 className="text-5xl font-extrabold text-text-main">Bem-vindo ao DirectorAi</h1>
                <p className="text-lg text-text-muted mt-2">Seu kit de crescimento com IA para criadores.</p>
            </div>
            <Card className="p-8">
                <h2 className="text-2xl font-bold text-text-main mb-6 text-center md:text-left">Primeiro, vamos configurar a identidade da sua marca</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-6">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-subtle mb-1">Nome da Marca</label>
                                <input type="text" name="name" id="name" value={profile.name} onChange={handleChange} required className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary"/>
                            </div>
                            <div>
                                <label htmlFor="description" className="block text-sm font-medium text-subtle mb-1">Descrição da Marca (O que você faz)</label>
                                <textarea name="description" id="description" value={profile.description} onChange={handleChange} required rows={4} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-subtle mb-1">Logo da Marca</label>
                            <div {...getRootProps()} className="cursor-pointer border-2 border-dashed border-muted hover:border-primary rounded-lg p-4 h-full flex items-center justify-center">
                                <input {...getInputProps()} />
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Logo Preview" className="h-24 w-24 object-contain" />
                                ) : (
                                    <div className="text-center text-text-muted">
                                        <Icon name="upload" className="w-8 h-8 mx-auto mb-2"/>
                                        <p className="text-sm">Arraste o logo aqui</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label htmlFor="primaryColor" className="flex items-center text-sm font-medium text-subtle mb-1">
                                Cor Primária
                                {isAnalyzingLogo && <Loader className="w-4 h-4 ml-2" />}
                            </label>
                            <input type="color" name="primaryColor" id="primaryColor" value={profile.primaryColor} onChange={handleChange} disabled={isAnalyzingLogo} className="w-full h-10 p-1 bg-surface/80 border border-muted/50 rounded-lg cursor-pointer disabled:opacity-50"/>
                        </div>
                         <div>
                            <label htmlFor="secondaryColor" className="flex items-center text-sm font-medium text-subtle mb-1">
                                Cor Secundária
                                {isAnalyzingLogo && <Loader className="w-4 h-4 ml-2" />}
                            </label>
                            <input type="color" name="secondaryColor" id="secondaryColor" value={profile.secondaryColor} onChange={handleChange} disabled={isAnalyzingLogo} className="w-full h-10 p-1 bg-surface/80 border border-muted/50 rounded-lg cursor-pointer disabled:opacity-50"/>
                        </div>
                         <div>
                            <label htmlFor="toneOfVoice" className="block text-sm font-medium text-subtle mb-1">Tom de Voz</label>
                            <select name="toneOfVoice" id="toneOfVoice" value={profile.toneOfVoice} onChange={handleChange} className="w-full bg-surface/80 border-muted/50 border rounded-lg p-2.5 text-text-main focus:ring-2 focus:ring-primary">
                                {tones.map(tone => <option key={tone} value={tone}>{tone}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="pt-4">
                        <Button type="submit" disabled={!isFormValid || isAnalyzingLogo} size="large" className="w-full" icon="arrowRight">
                            {existingProfile ? 'Salvar Alterações' : 'Salvar e Continuar'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    </div>
  );
};