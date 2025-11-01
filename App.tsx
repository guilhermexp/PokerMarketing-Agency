import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { BrandProfileSetup } from './components/BrandProfileSetup';
import { Dashboard } from './components/Dashboard';
import { Loader } from './components/common/Loader';
import { generateCampaign, editImage, generateLogo } from './services/geminiService';
import { runAssistantConversationStream } from './services/assistantService';
import type { BrandProfile, MarketingCampaign, ContentInput, ChatMessage, Theme, TournamentEvent, GalleryImage, ChatReferenceImage, ChatPart, GenerationOptions } from './types';
import { Icon } from './components/common/Icon';

// Define TimePeriod here as it's used for state
export type TimePeriod = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
const MAX_GALLERY_SIZE = 15; // Limit to 15 images to avoid storage quota issues
const MAX_CHAT_HISTORY_MESSAGES = 10; // Limit chat history sent to API to prevent token overflow

// Helper function to resize an image for chat context to avoid token limits
const resizeImageForChat = (
  dataUrl: string,
  maxWidth: number,
  maxHeight: number
): Promise<{ base64: string; mimeType: 'image/jpeg' }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round(width * (maxHeight / height));
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }
      ctx.drawImage(img, 0, 0, width, height);
      
      // Use JPEG for better compression and specify quality
      const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8); 
      const base64 = resizedDataUrl.split(',')[1];
      
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    img.onerror = (err) => {
      reject(err);
    };
    img.src = dataUrl;
  });
};

// Helper function for truncating chat history
const getTruncatedHistory = (history: ChatMessage[], maxLength: number = MAX_CHAT_HISTORY_MESSAGES): ChatMessage[] => {
    if (history.length <= maxLength) {
        return history;
    }
    // Keep the last `maxLength` messages
    return history.slice(-maxLength);
};


function App() {
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [productImages, setProductImages] = useState<ContentInput['productImages'] | null>(null);
  const [inspirationImages, setInspirationImages] = useState<ContentInput['inspirationImages'] | null>(null);


  // Assistant State
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [chatReferenceImage, setChatReferenceImage] = useState<ChatReferenceImage | null>(null);
  const [toolImageReference, setToolImageReference] = useState<ChatReferenceImage | null>(null);


  // Gallery State
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  // Flyer Generator State
  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>([]);
  // FIX: Update flyer state to store GalleryImage objects instead of string URLs.
  const [flyerState, setFlyerState] = useState<Record<string, (GalleryImage | 'loading')[]>>({});
  const [dailyFlyerState, setDailyFlyerState] = useState<Record<TimePeriod, (GalleryImage | 'loading')[]>>({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [] });


  // Theme State
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
    return 'dark'; // Default to dark mode
  });
  
  // Auto-dismiss for the error message
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000); // Auto-dismiss after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Theme effect
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.error("Failed to save theme to local storage", e);
    }
  }, [theme]);
  
  const handleThemeToggle = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  // Load brand profile and gallery from local storage on initial load
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('brandProfile');
      if (savedProfile) {
        setBrandProfile(JSON.parse(savedProfile));
      }
      const savedGallery = localStorage.getItem('galleryImages');
      if (savedGallery) {
        setGalleryImages(JSON.parse(savedGallery));
      }
    } catch (e) {
      console.error("Failed to load data from local storage", e);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Add initial assistant message
  useEffect(() => {
    if (brandProfile && chatHistory.length === 0) {
      setChatHistory([{
        role: 'model',
        parts: [{ text: `Olá! Eu sou seu assistente de IA. Como posso ajudar com a marca '${brandProfile.name}' hoje? Você pode me pedir para melhorar seu logo, por exemplo.` }]
      }]);
    }
  }, [brandProfile]);

  const handleProfileSubmit = (profile: BrandProfile) => {
    setBrandProfile(profile);
    setIsEditingProfile(false);
    try {
      localStorage.setItem('brandProfile', JSON.stringify(profile));
    } catch (e: any) {
       if (e.name === 'QuotaExceededError') {
           console.error("Failed to save brand profile to local storage: Quota exceeded. The logo image might be too large.", e);
           setError("Falha ao salvar o perfil da marca. A imagem do logo pode ser muito grande.");
       } else {
           console.error("Failed to save brand profile to local storage", e);
       }
    }
  };

  const handleGenerate = async (input: ContentInput, options: GenerationOptions) => {
    if (!brandProfile) {
      setError("O perfil da marca não está definido.");
      return;
    }
    
    if (!input.transcript) {
        setError("Uma transcrição é necessária para gerar uma campanha.");
        return;
    }

    setIsGenerating(true);
    setError(null);
    setCampaign(null); // Clear previous campaign results
    setProductImages(input.productImages);
    setInspirationImages(input.inspirationImages);
    try {
      const result = await generateCampaign(brandProfile, input, options);
      setCampaign(result);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleResetCampaign = () => {
      setCampaign(null);
      setError(null);
      setProductImages(null);
      setInspirationImages(null);
      // Reset flyer states as well if a new campaign implies a full reset
      setFlyerState({});
      setDailyFlyerState({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [] });
      setTournamentEvents([]);
  };

  // --- Gallery Logic ---
  const handleAddImageToGallery = (image: Omit<GalleryImage, 'id'>): GalleryImage => {
    const newImage: GalleryImage = { ...image, id: new Date().toISOString() + Math.random() };
    setGalleryImages(prev => {
      let updatedGallery = [...prev, newImage];
      
      // First, enforce the MAX_GALLERY_SIZE limit.
      if (updatedGallery.length > MAX_GALLERY_SIZE) {
        updatedGallery.splice(0, updatedGallery.length - MAX_GALLERY_SIZE);
      }
  
      // Now, try to save and handle quota errors by removing oldest images until it fits.
      while (updatedGallery.length > 0) {
          try {
              localStorage.setItem('galleryImages', JSON.stringify(updatedGallery));
              // If setItem succeeds, break the loop.
              break;
          } catch (e: any) {
              // Check if it's a quota error and if there are images to remove.
              if (e.name === 'QuotaExceededError' && updatedGallery.length > 1) {
                  console.warn("Local storage quota exceeded. Removing oldest image from gallery and retrying.");
                  // Remove the oldest image (at the beginning of the array). The new image is at the end.
                  updatedGallery.shift(); 
              } else {
                  // If it's not a quota error, or we can't remove any more images, log the error and break.
                  console.error("Failed to save gallery to local storage even after reducing size.", e);
                  // We might want to set an app-level error here to notify the user.
                  setError("Falha ao salvar a imagem na galeria. O armazenamento local pode estar cheio ou corrompido.");
                  break;
              }
          }
      }

      return updatedGallery;
    });
    return newImage;
  };

  const handleUpdateGalleryImage = (imageId: string, newImageSrc: string) => {
    // 1. Update main gallery
    setGalleryImages(prev => {
        // FIX: Explicitly type the updated object to fix a type inference issue where
        // the 'model' property was being widened to 'string' instead of 'ImageModel'.
        const updatedGallery = prev.map(img => {
            if (img.id === imageId) {
                const updatedImage: GalleryImage = { ...img, src: newImageSrc, prompt: "Edição via Assistente", model: 'gemini-imagen' };
                return updatedImage;
            }
            return img;
        });
        try {
            localStorage.setItem('galleryImages', JSON.stringify(updatedGallery));
        } catch (e: any) {
            console.error("Failed to save updated gallery to local storage", e);
             if (e.name === 'QuotaExceededError') {
                setError("Falha ao salvar a galeria. O armazenamento local está cheio.");
            }
        }
        return updatedGallery;
    });

    // 2. Update individual flyer state to reflect changes
    setFlyerState(prev => {
        const newState = { ...prev };
        for (const eventId in newState) {
            newState[eventId] = newState[eventId].map(img =>
                img !== 'loading' && img.id === imageId ? { ...img, src: newImageSrc } : img
            );
        }
        return newState;
    });

    // 3. Update daily flyer state to reflect changes
    setDailyFlyerState(prev => {
        const newState = { ...prev };
        for (const periodKey in newState) {
            const period = periodKey as TimePeriod;
            newState[period] = newState[period].map(img =>
                img !== 'loading' && img.id === imageId ? { ...img, src: newImageSrc } : img
            );
        }
        return newState;
    });
  };

  // --- Flyer Generator Logic ---
  const formatTime = (timeValue: any): string => {
    if (!timeValue) return '--:--';
    if (typeof timeValue === 'number') {
      const date = new Date((timeValue - 25569) * 86400 * 1000);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    }
    if (timeValue instanceof Date) {
        return timeValue.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return String(timeValue).substr(0, 5) || '--:--';
  };

  const handleTournamentFileUpload = (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target!.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const sheetData: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
          
          const processedEvents: TournamentEvent[] = [];
          let currentDay = "";
          const daysOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

          sheetData.forEach((row, rowIndex) => {
            const dayCandidate = String(row[1] || '').toUpperCase();
            if (daysOfWeek.includes(dayCandidate)) {
              currentDay = dayCandidate;
            } else if (row[9] && rowIndex > 2 && row[9] !== "NAME") {
              const eventData: TournamentEvent = {
                id: `${currentDay}-${rowIndex}`, day: currentDay,
                name: String(row[9]), game: String(row[10]), gtd: String(row[8]),
                buyIn: String(row[11]), rebuy: String(row[12]), addOn: String(row[13]),
                stack: String(row[15]), players: String(row[16]), lateReg: String(row[17]),
                minutes: String(row[18]), structure: String(row[19]),
                times: {
                  '-5': formatTime(row[1]), '-3': formatTime(row[2]), 'UTC': formatTime(row[3]),
                  '+1': formatTime(row[4]), '+3': formatTime(row[5]), '+8': formatTime(row[6]),
                  '+10': formatTime(row[7])
                }
              };
              processedEvents.push(eventData);
            }
          });
          
          setTournamentEvents(processedEvents);
          // Reset flyer state when a new file is uploaded
          setFlyerState({});
          setDailyFlyerState({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [] });
          resolve();
        } catch (error: any) {
          setError('Erro ao processar arquivo: ' + error.message);
          reject(error);
        }
      };
      reader.onerror = (error) => {
        setError('Falha ao ler o arquivo.');
        reject(error);
      }
      reader.readAsArrayBuffer(file);
    });
  };

  const handleAddTournamentEvent = (newEvent: TournamentEvent) => {
    setTournamentEvents(prevEvents => [newEvent, ...prevEvents]);
  };


  // --- Assistant Logic ---
  const handleSetChatReference = (image: GalleryImage | null) => {
    if (image) {
      setChatReferenceImage({ id: image.id, src: image.src });
      // Open assistant if not already open
      if (!isAssistantOpen) {
          setIsAssistantOpen(true);
      }
    } else {
      setChatReferenceImage(null);
    }
  };

  const executeTool = async (toolCall: any): Promise<any> => {
      const { name, args } = toolCall;
      
      if (name === 'create_brand_logo') {
        try {
            if (!brandProfile) {
                 return { error: "O perfil da marca precisa ser definido antes de criar um logo." };
            }
            const newLogoUrl = await generateLogo(args.prompt);
            const updatedProfile = { ...brandProfile, logo: newLogoUrl };
            handleProfileSubmit(updatedProfile);
            handleAddImageToGallery({ src: newLogoUrl, prompt: args.prompt, source: 'Logo', model: 'gemini-imagen' });
            return { success: true, message: "Criei e salvei o novo logo com sucesso. Agora ele está aplicado ao seu perfil de marca." };
        } catch (e: any) {
            return { error: `Falha ao criar o logo: ${e.message}` };
        }
      }

      if (name === 'edit_brand_logo') {
        try {
            const currentLogo = brandProfile?.logo;
            if (!currentLogo) {
                return { error: "Nenhum logo de marca está definido para editar. Você poderia criar um primeiro usando a ferramenta create_brand_logo." };
            }
            const [header, base64Data] = currentLogo.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            
            const newLogoUrl = await editImage(base64Data, mimeType, args.prompt);
            
            const updatedProfile = { ...brandProfile!, logo: newLogoUrl };
            handleProfileSubmit(updatedProfile);
            handleAddImageToGallery({ src: newLogoUrl, prompt: args.prompt, source: 'Logo', model: 'gemini-imagen' });

            return { success: true, message: "Logo atualizado com sucesso. O novo logo agora está visível no seu perfil de marca." };
        } catch (e: any) {
            return { error: `Falha ao editar o logo: ${e.message}` };
        }
      }

      if (name === 'edit_referenced_image') {
        if (!toolImageReference) {
          return { error: "Nenhuma imagem foi referenciada no chat. Por favor, peça ao usuário para fornecer uma imagem primeiro." };
        }
        try {
          const [header, base64Data] = toolImageReference.src.split(',');
          const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
          const newImageUrl = await editImage(base64Data, mimeType, args.prompt);
          
          handleUpdateGalleryImage(toolImageReference.id, newImageUrl);
          setToolImageReference(null);
          
          return { success: true, message: "A imagem foi editada com sucesso e atualizada na sua galeria." };
        } catch (e: any) {
          setToolImageReference(null);
          return { error: `Falha ao editar a imagem: ${e.message}` };
        }
      }

      if (name === 'get_tournament_events') {
        if (tournamentEvents.length === 0) {
          return { success: false, message: "Nenhuma planilha de torneios foi carregada. Por favor, peça ao usuário para carregar uma primeiro." };
        }

        let results = [...tournamentEvents];
        if (args.day_of_week) {
            results = results.filter(e => e.day.toUpperCase() === args.day_of_week.toUpperCase());
        }
        if (args.name_contains) {
            results = results.filter(e => e.name.toLowerCase().includes(args.name_contains.toLowerCase()));
        }

        if (results.length === 0) {
            return { success: true, count: 0, message: "Não encontrei nenhum evento que corresponda a esses critérios." };
        }

        const summary = results.map(e => ({
            day: e.day,
            name: e.name,
            buyIn: e.buyIn,
            gtd: e.gtd,
            time_gmt_minus_3: e.times['-3'] 
        }));

        return { success: true, count: summary.length, events: summary };
      }
      
      return { error: `Ferramenta desconhecida: ${name}` };
  };

  const handleAssistantSendMessage = async (message: string) => {
      setIsAssistantLoading(true);

      const imageRef = chatReferenceImage;
      if (imageRef) {
        setToolImageReference(imageRef); // Store original for high-res tool use
        setChatReferenceImage(null);
      }

      const userMessageParts: ChatPart[] = [];
      
      if (imageRef) {
        try {
          // Further reduce size for chat context to prevent token overflow even on first message.
          const { base64: resizedBase64, mimeType: resizedMimeType } = await resizeImageForChat(imageRef.src, 256, 256);
          userMessageParts.push({
              inlineData: { data: resizedBase64, mimeType: resizedMimeType }
          });
        } catch (resizeError) {
          console.error("Failed to resize image for chat:", resizeError);
          setError("Falha ao processar a imagem para o assistente.");
          setIsAssistantLoading(false);
          return;
        }
      }

      userMessageParts.push({ text: message });
      const userMessage: ChatMessage = { role: 'user', parts: userMessageParts };
      
      // Update state with the user's message immediately
      const newHistoryWithUserMessage = [...chatHistory, userMessage];
      setChatHistory(newHistoryWithUserMessage);
      
      try {
          // Add a placeholder for the model's response
          setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

          const streamResponse = await runAssistantConversationStream(getTruncatedHistory(newHistoryWithUserMessage), brandProfile);

          let accumulatedText = '';
          let functionCall: any;
          for await (const chunk of streamResponse) {
              if (chunk.text) {
                  accumulatedText += chunk.text;
                  setChatHistory(prev => {
                      const newHistory = [...prev];
                      if (newHistory.length > 0 && newHistory[newHistory.length - 1].role === 'model') {
                        newHistory[newHistory.length - 1] = { role: 'model', parts: [{ text: accumulatedText }] };
                      }
                      return newHistory;
                  });
              }
              const chunkFunctionCall = chunk.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
              if (chunkFunctionCall) {
                  functionCall = chunkFunctionCall;
              }
          }

          if (functionCall) {
              const modelFunctionCallMessage: ChatMessage = { role: 'model', parts: [{ functionCall }] };
              setChatHistory(prev => {
                  const newHistory = [...prev];
                  newHistory[newHistory.length - 1] = modelFunctionCallMessage;
                  return newHistory;
              });
              
              const toolResult = await executeTool(functionCall);
              const toolResponseMessage: ChatMessage = { role: 'tool', parts: [{ functionResponse: { name: functionCall.name, response: toolResult } }] };
              
              setChatHistory(prev => [...prev, toolResponseMessage]);
              
              const historyForFinalApiCall = [...newHistoryWithUserMessage, modelFunctionCallMessage, toolResponseMessage];
              
              setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

              const finalStreamResponse = await runAssistantConversationStream(getTruncatedHistory(historyForFinalApiCall), brandProfile);
              
              let finalAccumulatedText = '';
              for await (const chunk of finalStreamResponse) {
                   if (chunk.text) {
                      finalAccumulatedText += chunk.text;
                      setChatHistory(prev => {
                          const newHistory = [...prev];
                          if (newHistory.length > 0 && newHistory[newHistory.length - 1].role === 'model') {
                            newHistory[newHistory.length - 1] = { role: 'model', parts: [{ text: finalAccumulatedText }] };
                          }
                          return newHistory;
                      });
                  }
              }
          } 

      } catch (err: any) {
           let finalMessage = "Ocorreu um erro inesperado.";
           if (err.message) {
               if (err.message.includes("token count exceeds")) {
                   finalMessage = "A imagem ou a conversa é muito longa e excedeu o limite de contexto da IA.";
               } else {
                   // Try to parse nested JSON errors, but default to the raw message if parsing fails
                   finalMessage = err.message;
               }
           }
           const errorMessage = `Desculpe, ocorreu um erro: ${finalMessage}`;
           setChatHistory(prev => {
              const newHistory = [...prev];
              // Replace the 'loading' model bubble with the error message
              if (newHistory.length > 0 && newHistory[newHistory.length - 1].role === 'model') {
                  newHistory[newHistory.length - 1] = { role: 'model', parts: [{ text: errorMessage }] };
              }
              return newHistory;
           });
      } finally {
          setIsAssistantLoading(false);
          if (toolImageReference) {
              setToolImageReference(null);
          }
      }
  };


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="h-16 w-16" />
      </div>
    );
  }

  const showProfileSetup = !brandProfile || isEditingProfile;

  return (
    <>
      {error && (
        <div 
          className="fixed bottom-6 right-6 bg-surface border border-red-500/50 rounded-xl shadow-2xl z-50 max-w-sm p-4 flex items-start space-x-4 animate-fade-in-up"
          role="alert"
          aria-live="assertive"
        >
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                <Icon name="x" className="w-4 h-4" />
            </div>
            <div className="flex-1">
                <p className="font-bold text-text-main text-sm">Ocorreu um Erro</p>
                <p className="text-sm text-text-muted mt-1">{error}</p>
            </div>
            <button 
                onClick={() => setError(null)} 
                className="text-subtle hover:text-text-main transition-colors"
                aria-label="Fechar notificação"
            >
                <Icon name="x" className="w-5 h-5" />
            </button>
        </div>
      )}
      {showProfileSetup ? (
        <BrandProfileSetup onProfileSubmit={handleProfileSubmit} existingProfile={brandProfile} />
      ) : (
        <Dashboard
          brandProfile={brandProfile!}
          campaign={campaign}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          onEditProfile={() => setIsEditingProfile(true)}
          onResetCampaign={handleResetCampaign}
          productImages={productImages}
          inspirationImages={inspirationImages}
          // Assistant Props
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
          assistantHistory={chatHistory}
          isAssistantLoading={isAssistantLoading}
          onAssistantSendMessage={handleAssistantSendMessage}
          chatReferenceImage={chatReferenceImage}
          onSetChatReference={handleSetChatReference}
          // Theme Props
          theme={theme}
          onThemeToggle={handleThemeToggle}
          // Gallery Props
          galleryImages={galleryImages}
          onAddImageToGallery={handleAddImageToGallery}
          onUpdateGalleryImage={handleUpdateGalleryImage}
          // Flyer Generator Props
          tournamentEvents={tournamentEvents}
          onTournamentFileUpload={handleTournamentFileUpload}
          onAddTournamentEvent={handleAddTournamentEvent}
          flyerState={flyerState}
          setFlyerState={setFlyerState}
          dailyFlyerState={dailyFlyerState}
          setDailyFlyerState={setDailyFlyerState}
        />
      )}
    </>
  );
}

export default App;