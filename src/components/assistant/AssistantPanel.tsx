import React, { useState, useEffect, useRef } from "react";
import type { ChatMessage, ChatReferenceImage } from "../../types";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";

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
    .replace(
      /`{3}([\s\S]*?)`{3}/g,
      (match, p1) =>
        `<pre class="bg-black/50 p-2 rounded my-2 overflow-x-auto"><code>${p1.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`,
    )
    .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");

  const lines = toHtml.split("\n");
  const newLines = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("* ") || line.startsWith("- ")) {
      if (!inList) {
        inList = true;
        newLines.push('<ul class="list-disc pl-4 space-y-1 my-2">');
      }
      newLines.push(`<li>${line.substring(2)}</li>`);
    } else {
      if (inList) {
        inList = false;
        newLines.push("</ul>");
      }
      if (line.trim() !== "")
        newLines.push(`<p class="mb-2 last:mb-0">${line}</p>`);
    }
  }
  if (inList) newLines.push("</ul>");

  return newLines.join("");
};

const ChatBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isModel = message.role === "model";
  const textPart = message.parts.find((p) => p.text)?.text;
  const imagePart = message.parts.find((p) => p.inlineData);

  if (!textPart && !message.parts[0].functionCall && !imagePart) return null;
  const htmlContent = textPart ? parseMarkdown(textPart) : "";

  return (
    <div
      className={`flex flex-col ${isModel ? "items-start" : "items-end"} space-y-2 animate-fade-in-up`}
    >
      <div
        className={`max-w-[90%] rounded-3xl px-5 py-4 shadow-xl ${isModel ? "bg-[#121212] border border-white/5 rounded-bl-none text-white/90" : "bg-primary text-black font-bold rounded-br-none"}`}
      >
        {imagePart && (
          <div className="mb-3 rounded-2xl overflow-hidden border border-white/10 group relative">
            <img
              src={`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`}
              alt="Anexo"
              className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-[10px] font-black uppercase text-white bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md">
                Full Preview
              </span>
            </div>
          </div>
        )}
        {htmlContent && (
          <div
            className="text-[11px] leading-relaxed prose prose-invert"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>
    </div>
  );
};

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  isOpen,
  onClose,
  history,
  isLoading,
  onSendMessage,
  referenceImage,
  onClearReference,
}) => {
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isLoading]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || referenceImage) && !isLoading) {
      onSendMessage(input.trim(), referenceImage);
      setInput("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      onSendMessage("Carreguei esta referência externa para usarmos.", {
        id: `local-${Date.now()}`,
        src: dataUrl,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-full sm:w-[380px] h-full bg-[#080808] border-l border-white/10 flex flex-col flex-shrink-0">
      {/* Header minimalista */}
      <div className="flex-shrink-0 h-14 flex items-center justify-between px-4">
        <img src="/icon.png" alt="Socialab" className="w-9 h-9 rounded-xl" />
        <div className="flex items-center gap-1">
          <button className="p-2 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
            <Icon name="clock" className="w-4 h-4" />
          </button>
          <button className="p-2 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
            <Icon name="plus" className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/5"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Flow */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto scroll-smooth custom-scrollbar">
        {history.map((msg, index) => (
          <ChatBubble key={index} message={msg} />
        ))}
        {isLoading &&
          history[history.length - 1]?.role === "model" &&
          (history[history.length - 1].parts[0]?.text === "" ||
            !history[history.length - 1].parts[0].text) && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-6 py-4 bg-[#121212] border border-white/5">
                <Loader size={20} className="text-white/60" />
              </div>
            </div>
          )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-4">
        {referenceImage && (
          <div className="relative mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3 animate-fade-in-up">
            <img
              src={referenceImage.src}
              alt="Reference"
              className="w-10 h-10 object-cover rounded-md border border-white/10"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-primary">
                Referência anexada
              </p>
              <p className="text-[10px] text-white/40 truncate">
                {referenceImage.id.substring(0, 8)}
              </p>
            </div>
            <button
              onClick={onClearReference}
              className="w-6 h-6 rounded-md bg-black/40 text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all flex items-center justify-center"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="relative">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*"
          />

          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden focus-within:border-white/20 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Pergunte, pesquise ou converse..."
              className="w-full bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder:text-white/30 outline-none resize-none min-h-[80px] max-h-[200px]"
              disabled={isLoading}
              rows={2}
            />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all flex items-center justify-center"
              >
                <Icon name="plus" className="w-4 h-4" />
              </button>
              <button
                type="submit"
                className="w-7 h-7 rounded-lg text-white/30 hover:text-white/60 disabled:text-white/10 transition-all flex items-center justify-center"
                disabled={isLoading || (!input.trim() && !referenceImage)}
              >
                <Icon name="arrow-up" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
};
