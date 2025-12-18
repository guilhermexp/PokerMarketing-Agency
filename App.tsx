
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { BrandProfileSetup } from './components/BrandProfileSetup';
import { Dashboard } from './components/Dashboard';
import { Loader } from './components/common/Loader';
import { generateCampaign, editImage, generateLogo, generateImage } from './services/geminiService';
import { runAssistantConversationStream } from './services/assistantService';
import { loadImagesFromDB, saveImagesToDB } from './services/storageService';
import type { BrandProfile, MarketingCampaign, ContentInput, ChatMessage, Theme, TournamentEvent, GalleryImage, ChatReferenceImage, ChatPart, GenerationOptions } from './types';
import { Icon } from './components/common/Icon';

export type TimePeriod = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'HIGHLIGHTS';
export type ViewType = 'campaign' | 'flyer' | 'gallery';

const MAX_GALLERY_SIZE = 12; 
const MAX_CHAT_HISTORY_MESSAGES = 10;

const excelTimeToStr = (val: any): string => {
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return String(val || '');
};

const resizeImageForChat = (dataUrl: string, maxWidth: number, maxHeight: number): Promise<{ base64: string; mimeType: 'image/jpeg' }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) { height = Math.round(height * (maxWidth / width)); width = maxWidth; }
      } else {
        if (height > maxHeight) { width = Math.round(width * (maxHeight / height)); height = maxHeight; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context error'));
      ctx.drawImage(img, 0, 0, width, height);
      const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.6); 
      resolve({ base64: resizedDataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
};

const getTruncatedHistory = (history: ChatMessage[], maxLength: number = MAX_CHAT_HISTORY_MESSAGES): ChatMessage[] => {
    const truncated = history.length <= maxLength ? [...history] : history.slice(-maxLength);
    return truncated.map((msg, index) => {
        if (index < truncated.length - 2) {
            return {
                ...msg,
                parts: msg.parts.map(part => part.inlineData ? { text: "[Imagem de referência anterior]" } : part)
            };
        }
        return msg;
    });
};

function App() {
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('campaign');

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [chatReferenceImage, setChatReferenceImage] = useState<ChatReferenceImage | null>(null);
  const [toolImageReference, setToolImageReference] = useState<ChatReferenceImage | null>(null);
  const [lastUploadedImage, setLastUploadedImage] = useState<ChatReferenceImage | null>(null);

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>([]);
  const [flyerState, setFlyerState] = useState<Record<string, (GalleryImage | 'loading')[]>>({});
  const [dailyFlyerState, setDailyFlyerState] = useState<Record<TimePeriod, (GalleryImage | 'loading')[]>>({ 
    ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [], HIGHLIGHTS: [] 
  });

  const [theme, setTheme] = useState<Theme>('dark');
  
  useEffect(() => {
    const initAppData = async () => {
        try {
          const savedProfile = localStorage.getItem('brandProfile');
          if (savedProfile) setBrandProfile(JSON.parse(savedProfile));
          const dbImages = await loadImagesFromDB();
          setGalleryImages(dbImages.sort((a,b) => Number(b.id) - Number(a.id)));
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    initAppData();
  }, []);
  
  useEffect(() => {
    if (brandProfile && chatHistory.length === 0) {
      setChatHistory([{
        role: 'model',
        parts: [{ text: `Sistema Online. Olá Diretor! Sou o seu Agente Criativo de Elite. O que vamos forjar hoje?` }]
      }]);
    }
  }, [brandProfile]);

  const handleAddImageToGallery = (image: Omit<GalleryImage, 'id'>): GalleryImage => {
    const newImage: GalleryImage = { ...image, id: Date.now().toString() };
    setGalleryImages(prev => {
      const updated = [newImage, ...prev].slice(0, MAX_GALLERY_SIZE);
      saveImagesToDB(updated);
      return updated;
    });
    return newImage;
  };

  const handleUpdateGalleryImage = (imageId: string, newImageSrc: string) => {
    setGalleryImages(prev => {
        const updatedGallery = prev.map(img => img.id === imageId ? { ...img, src: newImageSrc } : img);
        saveImagesToDB(updatedGallery);
        return updatedGallery;
    });
    if (toolImageReference?.id === imageId) setToolImageReference({ id: imageId, src: newImageSrc });
  };

  const handleGenerateCampaign = async (input: ContentInput, options: GenerationOptions) => {
      setIsGenerating(true);
      setError(null);
      setActiveView('campaign');
      try {
          const r = await generateCampaign(brandProfile!, input, options);
          setCampaign(r);
      } catch (e: any) {
          setError(e.message);
      } finally {
          setIsGenerating(false);
      }
  };

  const handlePublishFlyerToCampaign = (text: string, flyer: GalleryImage) => {
      const input: ContentInput = {
          transcript: text,
          productImages: [{
              base64: flyer.src.split(',')[1],
              mimeType: flyer.src.match(/:(.*?);/)?.[1] || 'image/png'
          }],
          inspirationImages: null
      };
      const options: GenerationOptions = {
          videoClipScripts: { generate: true, count: 1 },
          posts: { instagram: { generate: true, count: 1 }, facebook: { generate: true, count: 1 }, twitter: { generate: true, count: 1 }, linkedin: { generate: false, count: 0 } },
          adCreatives: { facebook: { generate: true, count: 1 }, google: { generate: false, count: 0 } }
      };
      setCampaign(null);
      handleGenerateCampaign(input, options);
  };

  const executeTool = async (toolCall: any): Promise<any> => {
      const { name, args } = toolCall;
      if (name === 'create_image') {
          try {
              const productImages = lastUploadedImage ? [{ base64: lastUploadedImage.src.split(',')[1], mimeType: lastUploadedImage.src.match(/:(.*?);/)?.[1] || 'image/png' }] : undefined;
              const imageUrl = await generateImage(args.description, brandProfile!, { aspectRatio: args.aspect_ratio || '1:1', model: 'gemini-3-pro-image-preview', productImages });
              const newImg = handleAddImageToGallery({ src: imageUrl, prompt: args.description, source: 'Edição', model: 'gemini-3-pro-image-preview' });
              setToolImageReference({ id: newImg.id, src: newImg.src });
              return { success: true, image_data: imageUrl, message: "Asset visual forjado com sucesso." };
          } catch (e: any) { return { error: e.message }; }
      }
      if (name === 'edit_referenced_image') {
        if (!toolImageReference) return { error: "Nenhuma imagem em foco." };
        try {
          const [h, b64] = toolImageReference.src.split(',');
          const m = h.match(/:(.*?);/)?.[1] || 'image/png';
          const newUrl = await editImage(b64, m, args.prompt);
          handleUpdateGalleryImage(toolImageReference.id, newUrl);
          return { success: true, image_data: newUrl, message: "Ajuste aplicado." };
        } catch (e: any) { return { error: e.message }; }
      }
      return { error: `Comando não reconhecido: ${name}` };
  };

  const handleAssistantSendMessage = async (message: string, image: ChatReferenceImage | null) => {
      setIsAssistantLoading(true);
      const userMessageParts: ChatPart[] = [];
      if (image) {
        setLastUploadedImage(image);
        if (!image.id.startsWith('local-')) setToolImageReference(image);
        const { base64, mimeType } = await resizeImageForChat(image.src, 384, 384);
        userMessageParts.push({ inlineData: { data: base64, mimeType } });
      }
      if (message.trim()) userMessageParts.push({ text: message });
      const userMessage: ChatMessage = { role: 'user', parts: userMessageParts };
      setChatReferenceImage(null);
      const history = [...chatHistory, userMessage];
      setChatHistory(history);
      try {
          setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
          const streamResponse = await runAssistantConversationStream(getTruncatedHistory(history), brandProfile);
          let accumulatedText = '';
          let functionCall: any;
          for await (const chunk of streamResponse) {
              if (chunk.text) {
                  accumulatedText += chunk.text;
                  setChatHistory(prev => {
                      const next = [...prev];
                      if (next[next.length - 1].role === 'model') next[next.length - 1] = { ...next[next.length - 1], parts: [{ text: accumulatedText }] };
                      return next;
                  });
              }
              const fc = chunk.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
              if (fc) functionCall = fc;
          }
          if (functionCall) {
              const modelMsg: ChatMessage = { role: 'model', parts: [{ functionCall }] };
              setChatHistory(prev => { const next = [...prev]; next[next.length - 1] = modelMsg; return next; });
              const result = await executeTool(functionCall);
              const toolMsg: ChatMessage = { role: 'tool', parts: [{ functionResponse: { name: functionCall.name, response: result } }] };
              setChatHistory(prev => [...prev, toolMsg]);
              if (result.image_data) {
                  const [header, base64] = result.image_data.split(',');
                  setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "Gerei uma prévia:", inlineData: { data: base64, mimeType: header.match(/:(.*?);/)?.[1] || 'image/png' } }] }]);
              }
              setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
              const finalStream = await runAssistantConversationStream(getTruncatedHistory([...history, modelMsg, toolMsg]), brandProfile);
              let finalAcc = '';
              for await (const chunk of finalStream) {
                   if (chunk.text) {
                      finalAcc += chunk.text;
                      setChatHistory(prev => {
                          const next = [...prev];
                          if (next[next.length - 1].role === 'model') next[next.length - 1] = { ...next[next.length - 1], parts: [{ text: finalAcc }] };
                          return next;
                      });
                  }
              }
          } 
      } catch (err: any) {
           setChatHistory(prev => {
              const next = [...prev];
              if (next[next.length - 1].role === 'model') next[next.length - 1] = { ...next[next.length - 1], parts: [{ text: `Erro: ${err.message}` }] };
              return next;
           });
      } finally { setIsAssistantLoading(false); }
  };

  const handleTournamentFileUpload = (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          const events: TournamentEvent[] = [];
          let currentDay = "";
          const dayMap: any = { 'MONDAY': 'MONDAY', 'SEGUNDA': 'MONDAY', 'TUESDAY': 'TUESDAY', 'TERÇA': 'TUESDAY', 'WEDNESDAY': 'WEDNESDAY', 'QUARTA': 'WEDNESDAY', 'THURSDAY': 'THURSDAY', 'QUINTA': 'THURSDAY', 'FRIDAY': 'FRIDAY', 'SEXTA': 'FRIDAY', 'SATURDAY': 'SATURDAY', 'SÁBADO': 'SATURDAY', 'SUNDAY': 'SUNDAY', 'DOMINGO': 'SUNDAY' };
          json.forEach((row, i) => {
            const raw = String(row[1] || '').trim().toUpperCase();
            if (dayMap[raw]) currentDay = dayMap[raw];
            else if (row[9] && i > 2 && row[9] !== "NAME" && currentDay) {
              events.push({
                id: `${currentDay}-${i}`, day: currentDay, name: String(row[9]), game: String(row[10]), gtd: String(row[8]), buyIn: String(row[11]), rebuy: String(row[12]), addOn: String(row[13]), stack: String(row[15]), players: String(row[16]), lateReg: String(row[17]), minutes: String(row[18]), structure: String(row[19]), times: { '-3': excelTimeToStr(row[2]) }
              });
            }
          });
          setTournamentEvents(events);
          resolve();
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader className="h-16 w-16" /></div>;

  return (
    <>
      {error && (
        <div className="fixed bottom-6 right-6 bg-surface border border-red-500/50 rounded-xl z-[100] max-w-sm p-4 flex items-start space-x-4 animate-fade-in-up">
            <Icon name="x" className="w-4 h-4 text-red-400" />
            <div className="flex-1"><p className="font-bold text-sm">Erro</p><p className="text-sm opacity-50">{error}</p></div>
        </div>
      )}
      {!brandProfile || isEditingProfile ? (
        <BrandProfileSetup onProfileSubmit={(p) => { setBrandProfile(p); setIsEditingProfile(false); localStorage.setItem('brandProfile', JSON.stringify(p)); }} existingProfile={brandProfile} />
      ) : (
        <Dashboard
          brandProfile={brandProfile!}
          campaign={campaign}
          onGenerate={handleGenerateCampaign}
          isGenerating={isGenerating}
          onEditProfile={() => setIsEditingProfile(true)}
          onResetCampaign={() => setCampaign(null)}
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
          assistantHistory={chatHistory}
          isAssistantLoading={isAssistantLoading}
          onAssistantSendMessage={handleAssistantSendMessage}
          chatReferenceImage={chatReferenceImage}
          onSetChatReference={(img) => { setChatReferenceImage(img ? { id: img.id, src: img.src } : null); if (img && !isAssistantOpen) setIsAssistantOpen(true); }}
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          galleryImages={galleryImages}
          onAddImageToGallery={handleAddImageToGallery}
          onUpdateGalleryImage={handleUpdateGalleryImage}
          tournamentEvents={tournamentEvents}
          onTournamentFileUpload={handleTournamentFileUpload}
          onAddTournamentEvent={(ev) => setTournamentEvents(p => [ev, ...p])}
          flyerState={flyerState}
          setFlyerState={setFlyerState}
          dailyFlyerState={dailyFlyerState}
          setDailyFlyerState={setDailyFlyerState}
          activeView={activeView}
          onViewChange={setActiveView}
          onPublishToCampaign={handlePublishFlyerToCampaign}
        />
      )}
    </>
  );
}

export default App;
