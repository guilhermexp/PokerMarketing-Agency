import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { BrandProfileSetup } from './components/BrandProfileSetup';
import { Dashboard } from './components/Dashboard';
import { Loader } from './components/common/Loader';
import { generateCampaign, editImage, generateLogo } from './services/geminiService';
import { runAssistantConversationStream } from './services/assistantService';
import type { BrandProfile, MarketingCampaign, ContentInput, ChatMessage, Theme, TournamentEvent, GalleryImage } from './types';

// Define TimePeriod here as it's used for state
export type TimePeriod = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
const MAX_GALLERY_SIZE = 30; // Limit to 30 images to avoid storage quota issues

function App() {
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [referenceImage, setReferenceImage] = useState<ContentInput['image'] | null>(null);

  // Assistant State
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);

  // Gallery State
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

  // Flyer Generator State
  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>([]);
  const [flyerState, setFlyerState] = useState<Record<string, (string | 'loading')[]>>({});
  const [dailyFlyerState, setDailyFlyerState] = useState<Record<TimePeriod, (string | 'loading')[]>>({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [] });


  // Theme State
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
    return 'dark'; // Default to dark mode
  });

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
    } catch (e) {
       console.error("Failed to save brand profile to local storage", e);
    }
  };

  const handleGenerate = async (input: ContentInput) => {
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
    setReferenceImage(input.image); // Store the reference image
    try {
      const result = await generateCampaign(brandProfile, input);
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
      setReferenceImage(null); // Clear the reference image
      // Reset flyer states as well if a new campaign implies a full reset
      setFlyerState({});
      setDailyFlyerState({ ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [] });
      setTournamentEvents([]);
  };

  // --- Gallery Logic ---
  const handleAddImageToGallery = (image: Omit<GalleryImage, 'id'>) => {
    const newImage: GalleryImage = { ...image, id: new Date().toISOString() + Math.random() };
    setGalleryImages(prev => {
      // Add the new image and then slice the array to respect the size limit
      const updatedGallery = [...prev, newImage];
      
      // If the gallery exceeds the max size, remove the oldest images (from the start of the array)
      if (updatedGallery.length > MAX_GALLERY_SIZE) {
        updatedGallery.splice(0, updatedGallery.length - MAX_GALLERY_SIZE);
      }
  
      try {
        localStorage.setItem('galleryImages', JSON.stringify(updatedGallery));
      } catch (e) {
        console.error("Failed to save gallery to local storage", e);
        // This catch block will now likely only be hit for other reasons than quota.
      }
      return updatedGallery;
    });
  };

  const handleUpdateGalleryImage = (imageId: string, newImageSrc: string) => {
    setGalleryImages(prev => {
      const updatedGallery = prev.map(img =>
        img.id === imageId ? { ...img, src: newImageSrc, prompt: "Edição Manual via Galeria" } : img
      );
      try {
        localStorage.setItem('galleryImages', JSON.stringify(updatedGallery));
      } catch (e) {
        console.error("Failed to save updated gallery to local storage", e);
      }
      return updatedGallery;
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
          // FIX: Corrected typo from Uint88Array to Uint8Array.
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


  // --- Assistant Logic ---
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
            handleAddImageToGallery({ src: newLogoUrl, prompt: args.prompt, source: 'Logo' });
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
            handleProfileSubmit(updatedProfile); // This updates state and localStorage
            handleAddImageToGallery({ src: newLogoUrl, prompt: args.prompt, source: 'Logo' });

            return { success: true, message: "Logo atualizado com sucesso. O novo logo agora está visível no seu perfil de marca." };
        } catch (e: any) {
            return { error: `Falha ao editar o logo: ${e.message}` };
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
      const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
      let currentHistory: ChatMessage[] = [...chatHistory, userMessage];
      setChatHistory(currentHistory);
      
      try {
          // Add placeholder for model response
          setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

          const streamResponse = await runAssistantConversationStream(currentHistory, brandProfile);

          let accumulatedText = '';
          let functionCall: any;
          for await (const chunk of streamResponse) {
              if (chunk.text) {
                  accumulatedText += chunk.text;
                  setChatHistory(prev => {
                      const newHistory = [...prev];
                      newHistory[newHistory.length - 1].parts = [{ text: accumulatedText }];
                      return newHistory;
                  });
              }
              const chunkFunctionCall = chunk.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
              if (chunkFunctionCall) {
                  functionCall = chunkFunctionCall;
              }
          }

          if (functionCall) {
              const historyWithFunctionCall = [...currentHistory, { role: 'model', parts: [{ functionCall }] } as ChatMessage];
              
              const toolResult = await executeTool(functionCall);
              const toolResponseMessage: ChatMessage = { role: 'tool', parts: [{ functionResponse: { name: functionCall.name, response: toolResult } }] };
              
              const historyWithToolResult = [...historyWithFunctionCall, toolResponseMessage];
              currentHistory = historyWithToolResult;
              setChatHistory(currentHistory);
              
              // Add new placeholder for final model response
              setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

              const finalStreamResponse = await runAssistantConversationStream(currentHistory, brandProfile);
              
              let finalAccumulatedText = '';
              for await (const chunk of finalStreamResponse) {
                   if (chunk.text) {
                      finalAccumulatedText += chunk.text;
                      setChatHistory(prev => {
                          const newHistory = [...prev];
                          newHistory[newHistory.length - 1].parts = [{ text: finalAccumulatedText }];
                          return newHistory;
                      });
                  }
              }
          } 

      } catch (err: any) {
           const errorMessage = `Desculpe, ocorreu um erro: ${err.message}`;
           setChatHistory(prev => {
               const newHistory = [...prev.slice(0, -1)];
               return [...newHistory, { role: 'model', parts: [{ text: errorMessage }] }];
           });
      } finally {
          setIsAssistantLoading(false);
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
        <div className="fixed top-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="absolute top-1 right-2 text-white font-bold">&times;</button>
        </div>
      )}
      {showProfileSetup ? (
        <BrandProfileSetup onProfileSubmit={handleProfileSubmit} existingProfile={brandProfile} />
      ) : (
        <Dashboard
          brandProfile={brandProfile!} // brandProfile is guaranteed to be non-null here
          campaign={campaign}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          onEditProfile={() => setIsEditingProfile(true)}
          onResetCampaign={handleResetCampaign}
          referenceImage={referenceImage}
          // Assistant Props
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
          assistantHistory={chatHistory}
          isAssistantLoading={isAssistantLoading}
          onAssistantSendMessage={handleAssistantSendMessage}
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
