
import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage, ChatReferenceImage } from '../../types';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';

interface AssistantPanelProps {
    isOpen: boolean;
    onClose: () => void;
    history: ChatMessage[];
    isLoading: boolean;
    onSendMessage: (message: string, image: ChatReferenceImage | null) => void;
    referenceImage: ChatReferenceImage | null;
    onClearReference: () => void;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

const parseMarkdown = (text: string) => {
  const toHtml = text
    .replace(/`{3}([\s\S]*?)`{3}/g, (match, p1) => `<pre class="bg-black/50 p-2 rounded my-2 overflow-x-auto"><code>${p1.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
  const lines = toHtml.split('\n');
  const newLines = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) { inList = true; newLines.push('<ul class="list-disc pl-4 space-y-1 my-2">'); }
      newLines.push(`<li>${line.substring(2)}</li>`);
    } else {
      if (inList) { inList = false; newLines.push('</ul>'); }
      if (line.trim() !== '') newLines.push(`<p class="mb-2 last:mb-0">${line}</p>`);
    }
  }
  if (inList) newLines.push('</ul>');
  
  return newLines.join('');
};

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isModel = message.role === 'model';
    const textPart = message.parts.find(p => p.text)?.text;
    const imagePart = message.parts.find(p => p.inlineData);

    if (!textPart && !message.parts[0].functionCall && !imagePart) return null;
    const htmlContent = textPart ? parseMarkdown(textPart) : '';

    return (
        <div className={`flex flex-col ${isModel ? 'items-start' : 'items-end'} space-y-2 animate-fade-in-up`}>
            <div className={`max-w-[90%] rounded-3xl px-5 py-4 shadow-xl ${isModel ? 'bg-[#121212] border border-white/5 rounded-bl-none text-white/90' : 'bg-primary text-black font-bold rounded-br-none'}`}>
                 {imagePart && (
                    <div className="mb-3 rounded-2xl overflow-hidden border border-white/10 group relative">
                        <img src={`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`} alt="Anexo" className="w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] font-black uppercase text-white bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md">Full Preview</span>
                        </div>
                    </div>
                 )}
                 {htmlContent && <div className="text-[11px] leading-relaxed prose prose-invert" dangerouslySetInnerHTML={{ __html: htmlContent }} />}
            </div>
        </div>
    );
};

export const AssistantPanel: React.FC<AssistantPanelProps> = ({ isOpen, onClose, history, isLoading, onSendMessage, referenceImage, onClearReference }) => {
    const [input, setInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, isLoading]);
    
    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if ((input.trim() || referenceImage) && !isLoading) {
            onSendMessage(input.trim(), referenceImage);
            setInput('');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const dataUrl = await fileToDataUrl(file);
            onSendMessage("Carreguei esta referência externa para usarmos.", { id: `local-${Date.now()}`, src: dataUrl });
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <aside className={`fixed bottom-24 right-6 z-40 w-[450px] max-w-[calc(100vw-3rem)] h-[750px] max-h-[calc(100vh-8rem)] bg-[#080808]/98 backdrop-blur-3xl rounded-[3rem] shadow-[0_40px_120px_rgba(0,0,0,0.9)] border border-white/10 flex flex-col origin-bottom-right transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 translate-y-10 pointer-events-none'}`}>
            {/* Header com Engine Status */}
            <div className="flex-shrink-0 h-24 flex items-center justify-between px-10 border-b border-white/5">
                <div className="flex items-center space-x-5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-inner">
                        <Icon name="bot" className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-white uppercase tracking-[0.25em]">Aura Creative Agent</h2>
                        <div className="flex items-center space-x-2 mt-1">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Gemini 3 Pro • Creative Core Active</span>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="p-3 text-white/10 hover:text-white transition-all hover:bg-white/5 rounded-2xl">
                    <Icon name="x" className="w-5 h-5" />
                </button>
            </div>
            
            {/* Chat Flow */}
            <div className="flex-grow p-8 space-y-8 overflow-y-auto scroll-smooth custom-scrollbar">
                {history.map((msg, index) => (
                    <ChatBubble key={index} message={msg} />
                ))}
                 {isLoading && history[history.length - 1]?.role === 'model' && (history[history.length - 1].parts[0]?.text === '' || !history[history.length - 1].parts[0].text) && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl px-6 py-4 bg-[#121212] border border-white/5">
                           <Loader className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Ecosystem */}
            <div className="flex-shrink-0 p-8 pt-4 border-t border-white/5 bg-white/[0.01]">
                {referenceImage && (
                    <div className="relative mb-5 p-3 bg-primary/10 border border-primary/20 rounded-[1.5rem] flex items-center space-x-4 animate-fade-in-up">
                        <img src={referenceImage.src} alt="Reference" className="w-14 h-14 object-cover rounded-xl border border-white/10 shadow-lg" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-primary uppercase tracking-widest">Active Reference</p>
                            <p className="text-[10px] text-white/40 truncate font-mono mt-0.5">Asset Protocol: {referenceImage.id.substring(0,8)}</p>
                        </div>
                        <button 
                            onClick={onClearReference}
                            className="w-10 h-10 rounded-xl bg-black/40 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all flex items-center justify-center border border-white/5"
                        >
                            <Icon name="x" className="w-4 h-4" />
                        </button>
                    </div>
                )}
                
                <form onSubmit={handleSend} className="relative flex items-center space-x-4">
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/5 border border-white/10 text-white/20 hover:text-primary hover:border-primary/40 transition-all flex items-center justify-center hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] group"
                    >
                        <Icon name="paperclip" className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept="image/*" 
                    />
                    
                    <div className="relative flex-grow group">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Crie ou edite ativos visuais..."
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4.5 px-6 text-[13px] text-white placeholder:text-white/10 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all outline-none"
                            disabled={isLoading}
                        />
                        <button 
                            type="submit" 
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-primary text-black disabled:opacity-10 disabled:grayscale hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-[0_10px_30px_rgba(245,158,11,0.2)]" 
                            disabled={isLoading || (!input.trim() && !referenceImage)}
                        >
                            <Icon name="send" className="w-5 h-5" />
                        </button>
                    </div>
                </form>
            </div>
        </aside>
    );
};
