
import React from 'react';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import type { GenerationOptions, GenerationSetting } from '../types';

interface GenerationOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  onConfirm: () => void;
  isGenerating: boolean;
}

const NumberStepper: React.FC<{
    value: number;
    onChange: (newValue: number) => void;
    min?: number;
    max?: number;
    disabled?: boolean;
}> = ({ value, onChange, min = 1, max = 5, disabled = false }) => {
    const handleIncrement = () => onChange(Math.min(max, value + 1));
    const handleDecrement = () => onChange(Math.max(min, value - 1));

    return (
        <div className={`flex items-center space-x-1.5 transition-opacity ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
            <button
                type="button"
                onClick={handleDecrement}
                disabled={disabled || value <= min}
                className="w-6 h-6 rounded-md bg-surface/50 border border-muted/50 text-text-muted hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Diminuir quantidade"
            >
                -
            </button>
            <span className="font-medium text-text-main w-6 text-center">{value}</span>
            <button
                type="button"
                onClick={handleIncrement}
                disabled={disabled || value >= max}
                className="w-6 h-6 rounded-md bg-surface/50 border border-muted/50 text-text-muted hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Aumentar quantidade"
            >
                +
            </button>
        </div>
    );
};

const GenerationItem: React.FC<{
    label: string;
    setting: GenerationSetting;
    onSettingChange: (newSetting: GenerationSetting) => void;
}> = ({ label, setting, onSettingChange }) => {
    
    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingChange({ ...setting, generate: e.target.checked });
    };

    const handleCountChange = (newCount: number) => {
        onSettingChange({ ...setting, count: newCount });
    };

    return (
        <div className="flex justify-between items-center py-2">
             <label className="flex items-center space-x-3 cursor-pointer text-sm text-text-main">
                <input
                  type="checkbox"
                  checked={setting.generate}
                  onChange={handleCheckboxChange}
                  className="h-4 w-4 rounded border-muted/50 text-primary focus:ring-primary bg-surface/50 transition"
                />
                <span>{label}</span>
            </label>
            <NumberStepper
                value={setting.count}
                onChange={handleCountChange}
                disabled={!setting.generate}
            />
        </div>
    )
};


const GenerationCategory: React.FC<{
    title: string;
    items: { key: string; label: string }[];
    categorySettings: Record<string, GenerationSetting>;
    onCategorySettingsChange: (newSettings: Record<string, GenerationSetting>) => void;
}> = ({ title, items, categorySettings, onCategorySettingsChange }) => {

    // FIX: Explicitly type the argument 's' to 'GenerationSetting' to resolve 'unknown' type error.
    const allChecked = Object.values(categorySettings).every((s: GenerationSetting) => s.generate);
    // FIX: Explicitly type the argument 's' to 'GenerationSetting' to resolve 'unknown' type error.
    const someChecked = Object.values(categorySettings).some((s: GenerationSetting) => s.generate);

    const handleMasterCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { checked } = e.target;
        const newSettings = { ...categorySettings };
        for (const key in newSettings) {
            newSettings[key] = { ...newSettings[key], generate: checked };
        }
        onCategorySettingsChange(newSettings);
    };

    const handleItemChange = (key: string, newSetting: GenerationSetting) => {
        onCategorySettingsChange({ ...categorySettings, [key]: newSetting });
    };

    return (
        <div className="bg-background/50 p-4 rounded-lg">
            <div className="flex justify-between items-center pb-2 border-b border-muted/30">
                <label className="flex items-center space-x-3 cursor-pointer font-bold text-text-main">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={input => { if (input) input.indeterminate = !allChecked && someChecked; }}
                      onChange={handleMasterCheckboxChange}
                      className="h-4 w-4 rounded border-muted/50 text-primary focus:ring-primary bg-surface"
                    />
                    <span>{title}</span>
                </label>
            </div>
            <div className="pl-2 pt-2 space-y-1">
                {items.map(item => (
                    <GenerationItem
                        key={item.key}
                        label={item.label}
                        setting={categorySettings[item.key]}
                        onSettingChange={(newSetting) => handleItemChange(item.key, newSetting)}
                    />
                ))}
            </div>
        </div>
    );
};


export const GenerationOptionsModal: React.FC<GenerationOptionsModalProps> = ({ isOpen, onClose, options, setOptions, onConfirm, isGenerating }) => {
  if (!isOpen) return null;
  
  // FIX: Explicitly type the argument 'v' to 'GenerationSetting' to resolve 'unknown' type error.
  const nothingSelected = !options.videoClipScripts.generate &&
                         !Object.values(options.posts).some((v: GenerationSetting) => v.generate) &&
                         !Object.values(options.adCreatives).some((v: GenerationSetting) => v.generate);

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-xl shadow-2xl w-full max-w-lg border border-muted/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-muted/30">
            <h2 className="text-xl font-bold text-text-main">Selecione o que Gerar</h2>
            <p className="text-sm text-text-muted mt-1">Escolha quais materiais de marketing e a quantidade que a IA deve criar.</p>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="bg-background/50 p-4 rounded-lg">
                <GenerationItem
                    label="Clipes de Vídeo"
                    setting={options.videoClipScripts}
                    onSettingChange={(newSetting) => setOptions(prev => ({...prev, videoClipScripts: newSetting}))}
                />
            </div>
            
            <GenerationCategory
                title="Posts para Redes Sociais"
                items={[
                    { key: 'instagram', label: 'Instagram' },
                    { key: 'facebook', label: 'Facebook' },
                    { key: 'twitter', label: 'Twitter (X)' },
                    { key: 'linkedin', label: 'LinkedIn' },
                ]}
                categorySettings={options.posts}
                onCategorySettingsChange={(newSettings) => setOptions(prev => ({...prev, posts: newSettings}))}
            />

            <GenerationCategory
                title="Criativos de Anúncio"
                items={[
                    { key: 'facebook', label: 'Facebook Ads' },
                    { key: 'google', label: 'Google Ads' },
                ]}
                categorySettings={options.adCreatives}
                onCategorySettingsChange={(newSettings) => setOptions(prev => ({...prev, adCreatives: newSettings}))}
            />
        </div>
        <div className="p-6 bg-surface/50 border-t border-muted/30 flex justify-end items-center gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isGenerating}>Cancelar</Button>
          <Button 
            onClick={onConfirm}
            isLoading={isGenerating}
            disabled={isGenerating || nothingSelected}
            icon="zap"
          >
            Gerar Campanha
          </Button>
        </div>
      </div>
    </div>
  );
};
