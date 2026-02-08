/**
 * BottomPromptBar Component
 * Floating input bar for video generation with cameo selection
 */

import { AnimatePresence, motion } from 'framer-motion';
import React, { useRef, useState, useEffect } from 'react';
import { ArrowUp, Plus, User, Palette, Upload, X, Sparkles, Image as _ImageLucide, Edit3 } from 'lucide-react';
import {
  CameoProfile,
  FeedPost,
  GenerateVideoParams,
  GenerationMode,
  MediaType,
  PlaygroundImageFile,
  PlaygroundAspectRatio,
  PlaygroundResolution,
  PlaygroundVeoModel,
  PlaygroundImageSize,
  ImageFile,
  PostStatus,
} from './types';
import { editImage } from '../../services/geminiService';

const defaultCameoProfiles: CameoProfile[] = [
  { id: '1', name: 'asr', imageUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=asr&backgroundColor=transparent' },
  { id: '2', name: 'skirano', imageUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=skirano&backgroundColor=transparent' },
  { id: '3', name: 'lc-99', imageUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=lc99&backgroundColor=transparent' },
  { id: '4', name: 'sama', imageUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=sama&backgroundColor=transparent' },
  { id: '5', name: 'justinem', imageUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=justinem&backgroundColor=transparent' },
];

const examplePrompts = [
  "Programando no topo de uma montanha nevada...",
  "Paraquedismo sobre o mar azul cristalino das Bahamas...",
  "Caminhando no tapete vermelho de uma estreia de cinema...",
  "Pilotando uma nave espacial atraves de uma nebulosa colorida...",
  "Tocando como DJ em um festival de musica neon gigante...",
  "Descobrindo um templo antigo no meio da selva...",
  "Tomando um cafe em um charmoso cafe parisiense...",
  "Surfando uma onda gigante ao por do sol...",
  "Tocando guitarra em frente a uma multidao imensa...",
  "Flutuando em gravidade zero em uma estacao espacial...",
];

const urlToImageFile = async (url: string): Promise<PlaygroundImageFile> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        const file = new File([blob], 'cameo.png', { type: blob.type });
        resolve({ file, base64 });
      } else {
        reject(new Error("Falha ao ler dados da imagem como string"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const fileToImageFile = (file: File): Promise<PlaygroundImageFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        if (base64) {
          resolve({ file, base64 });
        } else {
          reject(new Error('Falha ao extrair dados base64.'));
        }
      } else {
        reject(new Error('O resultado do FileReader nao e uma string.'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

interface BottomPromptBarProps {
  onGenerate: (params: GenerateVideoParams) => void;
  editingImage?: { url: string; base64: string; mimeType: string } | null;
  onClearEditingImage?: () => void;
  setFeed?: React.Dispatch<React.SetStateAction<FeedPost[]>>;
  setErrorToast?: (message: string) => void;
  brandProfile?: { name?: string; logo?: string };
  mediaType: MediaType;
  setMediaType: (mediaType: MediaType) => void;
}

export const BottomPromptBar: React.FC<BottomPromptBarProps> = ({
  onGenerate,
  editingImage,
  onClearEditingImage,
  setFeed,
  setErrorToast,
  brandProfile,
  mediaType,
  setMediaType,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [useBrandProfile, setUseBrandProfile] = useState(false);
  const [selectedCameoId, setSelectedCameoId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<CameoProfile[]>(defaultCameoProfiles);
  const [profileImages, setProfileImages] = useState<Record<string, PlaygroundImageFile>>({});
  const uploadedImageUrlsRef = useRef<string[]>([]);
  const [promptIndex, setPromptIndex] = useState(0);

  // Image generation options
  const [imageSize, setImageSize] = useState<PlaygroundImageSize>(PlaygroundImageSize.K1);
  const [productImages, setProductImages] = useState<(ImageFile & { preview: string })[]>([]);
  const [styleReference, setStyleReference] = useState<(ImageFile & { preview: string }) | null>(null);

  // Expand when editing image is provided
  useEffect(() => {
    if (editingImage) {
      setIsExpanded(true);
      setMediaType(MediaType.IMAGE);
    }
  }, [editingImage, setMediaType]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productImagesInputRef = useRef<HTMLInputElement>(null);
  const styleReferenceInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node) && prompt === '' && !selectedCameoId) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [prompt, selectedCameoId]);

  useEffect(() => {
    const urls = uploadedImageUrlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (prompt !== '') return;
    const interval = setInterval(() => {
      setPromptIndex((prev) => (prev + 1) % examplePrompts.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [prompt]);

  const handleFocus = () => setIsExpanded(true);

  const handleCameoSelect = (id: string) => {
    if (selectedCameoId === id) {
      setSelectedCameoId(null);
    } else {
      setSelectedCameoId(id);
    }
    if (!isExpanded) setIsExpanded(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (!file.type.startsWith('image/')) {
          console.error("Apenas arquivos de imagem sao suportados.");
          return;
        }

        const imgFile = await fileToImageFile(file);
        const newId = `user-${Date.now()}`;
        const objectUrl = URL.createObjectURL(file);
        uploadedImageUrlsRef.current.push(objectUrl);

        const newProfile: CameoProfile = {
          id: newId,
          name: 'Voce',
          imageUrl: objectUrl,
        };

        setProfiles(prev => [newProfile, ...prev]);
        setProfileImages(prev => ({ ...prev, [newId]: imgFile }));
        setSelectedCameoId(newId);

        if (!isExpanded) setIsExpanded(true);
      } catch (error) {
        console.error("Erro ao carregar arquivo", error);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fillPrompt = () => {
    const currentPrompt = examplePrompts[promptIndex];
    setPrompt(currentPrompt);
    if (inputRef.current) {
      inputRef.current.focus();
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
        }
      }, 0);
    }
  };

  const getProfileImage = async (profile: CameoProfile): Promise<PlaygroundImageFile> => {
    if (profileImages[profile.id]) {
      return profileImages[profile.id];
    }

    if (profile.id.startsWith('user-')) {
      throw new Error('Dados da imagem nao encontrados no cache.');
    }

    const imgFile = await urlToImageFile(profile.imageUrl);
    setProfileImages(prev => ({ ...prev, [profile.id]: imgFile }));
    return imgFile;
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 14 - productImages.length;
    const filesToProcess = Array.from(files as FileList).slice(0, remainingSlots) as File[];

    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) continue;

      try {
        const imgFile = await fileToImageFile(file);
        const preview = URL.createObjectURL(file);
        uploadedImageUrlsRef.current.push(preview);

        setProductImages(prev => [...prev, {
          base64: imgFile.base64,
          mimeType: file.type,
          preview,
        }]);
      } catch (error) {
        console.error("Erro ao carregar imagem de produto", error);
      }
    }

    if (productImagesInputRef.current) productImagesInputRef.current.value = '';
  };

  const handleStyleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    try {
      const imgFile = await fileToImageFile(file);
      const preview = URL.createObjectURL(file);
      uploadedImageUrlsRef.current.push(preview);

      setStyleReference({
        base64: imgFile.base64,
        mimeType: file.type,
        preview,
      });
    } catch (error) {
      console.error("Erro ao carregar referencia de estilo", error);
    }

    if (styleReferenceInputRef.current) styleReferenceInputRef.current.value = '';
  };

  const removeProductImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeStyleReference = () => {
    setStyleReference(null);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    // Handle image editing mode
    if (editingImage && mediaType === MediaType.IMAGE) {
      try {
        const resultUrl = await editImage(
          editingImage.base64,
          editingImage.mimeType,
          prompt,
          undefined, // no mask
          undefined, // no reference image
        );

        // Create a new post with the edited image
        const newPostId = Date.now().toString();
        const newPost = {
          id: newPostId,
          mediaType: MediaType.IMAGE,
          username: (brandProfile?.name || 'voce'),
          avatarUrl: brandProfile?.logo || 'https://api.dicebear.com/7.x/avataaars/svg?seed=voce',
          description: prompt,
          modelTag: 'Gemini Edit',
          status: PostStatus.SUCCESS,
          aspectRatio: PlaygroundAspectRatio.SQUARE,
          imageUrl: resultUrl,
        };

        // Add to feed
        setFeed?.(prev => [newPost, ...prev]);

        // Clear editing state
        setPrompt('');
        onClearEditingImage?.();

        if (inputRef.current) {
          inputRef.current.style.height = '28px';
          inputRef.current.focus();
        }
      } catch (error) {
        console.error('Image edit failed:', error);
        setErrorToast?.('Falha ao editar imagem');
      }
      return;
    }

    // Normal generation mode
    let mode = GenerationMode.TEXT_TO_VIDEO;
    let referenceImages: PlaygroundImageFile[] | undefined = undefined;
    let selectedModel = PlaygroundVeoModel.VEO_FAST;
    let currentAspectRatio = PlaygroundAspectRatio.PORTRAIT;

    if (selectedCameoId) {
      mode = GenerationMode.REFERENCES_TO_VIDEO;
      selectedModel = PlaygroundVeoModel.VEO;
      currentAspectRatio = PlaygroundAspectRatio.LANDSCAPE;

      const cameo = profiles.find(c => c.id === selectedCameoId);
      if (cameo) {
        try {
          const imgFile = await getProfileImage(cameo);
          referenceImages = [imgFile];
        } catch (e) {
          console.error("Falha ao carregar imagem do rosto", e);
          return;
        }
      }
    }

    const params: GenerateVideoParams = {
      prompt,
      mediaType,
      useBrandProfile,
      model: selectedModel,
      aspectRatio: currentAspectRatio,
      resolution: PlaygroundResolution.P720,
      mode: mode,
      referenceImages: referenceImages,
      // Image generation options (only used when mediaType === IMAGE)
      imageSize: mediaType === MediaType.IMAGE ? imageSize : undefined,
      productImages: mediaType === MediaType.IMAGE && productImages.length > 0
        ? productImages.map(({ base64, mimeType }) => ({ base64, mimeType }))
        : undefined,
      styleReference: mediaType === MediaType.IMAGE && styleReference
        ? { base64: styleReference.base64, mimeType: styleReference.mimeType }
        : undefined,
    };

    onGenerate(params);

    setPrompt('');

    if (inputRef.current) {
      inputRef.current.style.height = '28px';
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Tab' && prompt === '' && isExpanded) {
      e.preventDefault();
      fillPrompt();
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedCameoId);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none mb-6">

      <motion.div
        ref={barRef}
        className="w-full max-w-2xl mx-4 bg-[#000000]/95 border border-white/10 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.7)] overflow-hidden pointer-events-auto relative group rounded-[32px]"
        initial={false}
        animate={{
          height: 'auto',
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      >
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="px-3 pt-3"
            >
              <div className="bg-[#000000]/60 rounded-2xl p-2 border border-white/10 shadow-inner">
                <div className="flex items-center gap-2 mb-1 px-2 text-white/70 pt-1">
                  <User className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Selecionar Rosto</p>
                </div>

                <div className="flex gap-3 overflow-x-auto no-scrollbar items-center px-2 py-2 -my-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-12 h-12 shrink-0 rounded-xl border-2 border-dashed border-white/20 hover:border-white/80 bg-white/0 hover:bg-white/5 text-white/40 hover:text-white flex items-center justify-center transition-all duration-300 relative group/upload hover:scale-105 hover:shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                    title="Carregar sua foto"
                  >
                    <Plus className="w-6 h-6 transition-transform group-hover/upload:rotate-90 duration-300" />
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/png, image/jpeg, image/webp" className="hidden" />
                  </button>

                  <div className="w-px h-6 bg-white/10 shrink-0 rounded-full"></div>

                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => handleCameoSelect(profile.id)}
                      className={`w-12 h-12 shrink-0 rounded-xl overflow-hidden transition-all duration-300 relative group/cameo bg-black/50 ${selectedCameoId === profile.id
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-black/80 scale-105 opacity-100 z-10 shadow-lg'
                          : 'opacity-60 hover:opacity-100 hover:scale-105 grayscale hover:grayscale-0 border border-white/5'
                        }`}
                    >
                      <img src={profile.imageUrl} alt={profile.name} className={`w-full h-full object-cover ${profile.id.startsWith('user-') ? '' : 'p-0.5'}`} />
                      {selectedCameoId !== profile.id && <div className="absolute inset-0 bg-black/20 group-hover/cameo:bg-transparent transition-colors"></div>}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Options Panel - only shows when Image is selected */}
        <AnimatePresence>
          {isExpanded && mediaType === MediaType.IMAGE && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="px-3 pt-3"
            >
              <div className="bg-[#000000]/60 rounded-2xl p-3 border border-white/10 shadow-inner">
                <div className="flex items-center gap-2 mb-2 px-1 text-white/70">
                  <Sparkles className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Opcoes de Imagem</p>
                </div>

                <div className="flex flex-wrap gap-4 px-1">
                  {/* Editing Image Panel */}
                  {editingImage && (
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-purple-400 uppercase tracking-wide flex items-center gap-1">
                          <Edit3 className="w-3 h-3" />
                          Editando Imagem
                        </span>
                        <button
                          onClick={onClearEditingImage}
                          className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <img
                          src={editingImage.url}
                          alt="Editando"
                          className="w-12 h-12 object-cover rounded-lg border border-white/10"
                        />
                        <div className="flex-1">
                          <p className="text-xs text-white/80">Descreva as alteracoes:</p>
                          <p className="text-[10px] text-white/50">Ex: "Adicione um chapéu", "Mude a cor do fundo para azul"</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quality Selector */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/40 uppercase tracking-wide">Qualidade</span>
                    <select
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as PlaygroundImageSize)}
                      className="bg-[#000000]/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 appearance-none cursor-pointer hover:border-white/20 outline-none backdrop-blur-2xl focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value={PlaygroundImageSize.K1}>1K</option>
                      <option value={PlaygroundImageSize.K2}>2K</option>
                      <option value={PlaygroundImageSize.K4}>4K</option>
                    </select>
                  </div>

                  {/* Style Reference */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/40 uppercase tracking-wide">Estilo</span>
                    {styleReference ? (
                      <div className="relative group">
                        <img
                          src={styleReference.preview}
                          alt="Estilo"
                          className="w-8 h-8 object-cover rounded-lg border border-white/10"
                        />
                        <button
                          onClick={removeStyleReference}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ) : (
                      <label className="bg-[#000000]/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/60 flex items-center gap-1.5 cursor-pointer hover:border-white/20 hover:bg-[#000000] transition-colors backdrop-blur-2xl">
                        <Upload className="w-3 h-3" />
                        <span>Add</span>
                        <input
                          type="file"
                          ref={styleReferenceInputRef}
                          onChange={handleStyleReferenceUpload}
                          accept="image/*"
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Product Images / Assets */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/40 uppercase tracking-wide">Ativos ({productImages.length}/14)</span>
                    <div className="flex items-center gap-1.5">
                      {productImages.map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img.preview}
                            alt={`Ativo ${index + 1}`}
                            className="w-8 h-8 object-cover rounded-lg border border-white/10"
                          />
                          <button
                            onClick={() => removeProductImage(index)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                      {productImages.length < 14 && (
                        <label className="w-8 h-8 bg-[#000000]/80 border border-white/10 rounded-lg flex items-center justify-center cursor-pointer hover:border-white/20 hover:bg-[#000000] transition-colors backdrop-blur-2xl">
                          <Plus className="w-4 h-4 text-white/40" />
                          <input
                            type="file"
                            ref={productImagesInputRef}
                            onChange={handleProductImageUpload}
                            accept="image/*"
                            multiple
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`flex items-end gap-3 px-3 pb-3 relative transition-all ${isExpanded ? 'pt-3' : 'pt-3'}`}>
          <button
            onClick={() => {
              setIsExpanded(!isExpanded);
              if (!isExpanded && inputRef.current) {
                setTimeout(() => inputRef.current?.focus(), 100);
              }
            }}
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 shrink-0 shadow-lg backdrop-blur-2xl ${isExpanded ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10 rotate-45' : 'text-white bg-gradient-to-br from-indigo-500 to-purple-600 hover:scale-105 shadow-[0_0_15px_rgba(99,102,241,0.5)]'}`}
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Brand Profile Toggle - smaller */}
          <button
            onClick={() => setUseBrandProfile(!useBrandProfile)}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 shrink-0 backdrop-blur-2xl ${useBrandProfile
                ? 'bg-white text-black shadow-md'
                : 'bg-[#000000]/60 text-white/60 border border-white/10 hover:text-white hover:border-white/20'
              }`}
            title={useBrandProfile ? "Usando cores e tom da marca" : "Sem personalização de marca"}
          >
            <Palette className="w-4 h-4" />
          </button>

          <div className="flex-grow relative py-2 flex items-center">
            <AnimatePresence mode="wait">
              {prompt === '' && isExpanded && (
                <motion.div
                  key={examplePrompts[promptIndex]}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-y-0 left-0 flex items-center w-full pointer-events-none pr-2"
                >
                  <span className="text-white/40 text-lg font-light tracking-wide truncate flex-grow">
                    {examplePrompts[promptIndex]}
                  </span>
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="ml-2 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-mono text-white/50 uppercase flex items-center gap-1 pointer-events-auto cursor-pointer hover:bg-white/10 hover:text-white/70 transition-colors backdrop-blur-2xl"
                    onClick={fillPrompt}
                  >
                    Tab
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onFocus={handleFocus}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={!isExpanded ? "Descreva a cena..." : ""}
              className={`w-full bg-transparent text-white outline-none resize-none overflow-hidden py-0.5 leading-relaxed text-lg font-light tracking-wide relative z-10 placeholder:text-white/40 focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded-md ${prompt === '' && isExpanded ? 'opacity-0 focus:opacity-100' : ''}`}
              style={{ height: '28px' }}
            />
          </div>

          <div className="flex items-center gap-2.5 shrink-0 pb-0.5">
            <AnimatePresence mode="wait">
              {selectedCameoId && selectedProfile && (
                <motion.div
                  key="cameo-badge"
                  initial={{ width: 0, opacity: 0, scale: 0.9 }}
                  animate={{ width: 'auto', opacity: 1, scale: 1 }}
                  exit={{ width: 0, opacity: 0, scale: 0.9 }}
                  className="overflow-hidden flex items-center justify-center h-11 px-1.5 bg-white/10 border border-white/10 backdrop-blur-2xl text-white rounded-xl"
                >
                  <img src={selectedProfile.imageUrl} alt={selectedProfile.name} className="w-8 h-8 rounded-lg object-cover bg-[#000000]/60" />
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 backdrop-blur-2xl ${prompt.trim()
                  ? 'bg-white text-black hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.6)]'
                  : 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed'
                }`}
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BottomPromptBar;
