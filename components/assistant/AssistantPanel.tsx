import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../../types';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';

interface AssistantPanelProps {
    isOpen: boolean;
    onClose: () => void;
    history: ChatMessage[];
    isLoading: boolean;
    onSendMessage: (message: string) => void;
}

const parseMarkdown = (text: string) => {
  const toHtml = text
    .replace(/`{3}([\s\S]*?)`{3}/g, (match, p1) => `<pre><code>${p1.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>');
    
  const lines = toHtml.split('\n');
  const newLines = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        inList = true;
        newLines.push('<ul>');
      }
      newLines.push(`<li>${line.substring(2)}</li>`);
    } else {
      if (inList) {
        inList = false;
        newLines.push('</ul>');
      }
      newLines.push(line);
    }
  }
  if (inList) {
    newLines.push('</ul>');
  }
  
  return newLines
    .map(line => {
      if (line.trim() === '') return '';
      if (line.startsWith('<')) return line;
      return `<p>${line}</p>`;
    })
    .join('')
    .replace(/<\/p><p>/g, '</p><p>') // Compact paragraphs
    .replace(/<p>\s*<\/p>/g, ''); // Remove empty paragraphs
};


const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isModel = message.role === 'model';
    const content = message.parts[0].text;

    if (!content && !message.parts[0].functionCall) return null;

    const htmlContent = parseMarkdown(content || '');

    return (
        <div className={`flex ${isModel ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-xs md:max-w-sm lg:max-w-md rounded-2xl px-4 py-2.5 ${isModel ? 'bg-surface/80 rounded-bl-none' : 'bg-primary text-white rounded-br-none'}`}>
                 <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </div>
        </div>
    );
};

export const AssistantPanel: React.FC<AssistantPanelProps> = ({ isOpen, onClose, history, isLoading, onSendMessage }) => {
    const [input, setInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, isLoading]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <aside className={`fixed top-0 right-0 h-full w-96 bg-surface shadow-2xl z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} border-l border-muted/30 flex flex-col`}>
            {/* Header */}
            <div className="flex-shrink-0 h-16 flex items-center justify-between px-4 border-b border-muted/30">
                <div className="flex items-center space-x-2">
                    <Icon name="bot" className="w-6 h-6 text-primary" />
                    <h2 className="text-lg font-bold text-text-main">Assistente de IA</h2>
                </div>
                <button onClick={onClose} className="text-subtle hover:text-text-main transition-colors">
                    <Icon name="x" className="w-6 h-6" />
                </button>
            </div>
            
            {/* Chat History */}
            <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                {history.map((msg, index) => (
                    <ChatBubble key={index} message={msg} />
                ))}
                 {isLoading && history[history.length - 1]?.role === 'model' && history[history.length - 1]?.parts[0]?.text === '' && (
                    <div className="flex justify-start">
                        <div className="max-w-xs md:max-w-sm lg:max-w-md rounded-2xl px-4 py-2.5 bg-surface/80 rounded-bl-none">
                           <Loader className="w-5 h-5" />
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <div className="flex-shrink-0 p-4 border-t border-muted/30">
                <form onSubmit={handleSend} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pergunte ao assistente..."
                        className="w-full bg-background/80 border border-muted/50 rounded-lg py-2 pl-4 pr-12 text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition"
                        disabled={isLoading}
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-primary disabled:text-muted disabled:cursor-not-allowed hover:bg-primary/10 transition-colors" disabled={isLoading || !input.trim()}>
                        <Icon name="arrowRight" className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </aside>
    );
};