import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Send,
  RotateCcw,
  Clock3,
  Plus,
  Paperclip,
  X,
  AtSign,
  Image as ImageIcon,
  FileVideo,
  FileText,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useStudioAgent } from '../../hooks/useStudioAgent';
import {
  searchStudioAgentFiles,
  type StudioAgentAttachment,
  type StudioAgentMention,
  type StudioType,
} from '../../services/api/studioAgent';
import { MessageResponse } from '../assistant/MessageResponse';
import { uploadToBlob } from '../../services/api/uploadApi';

interface StudioAgentPanelProps {
  studioType: StudioType;
  topicId: string | null;
  compact?: boolean;
  layout?: 'inline' | 'sidebar';
}

function normalizeAssistantMarkdown(content: string): string {
  if (!content) return '';

  let text = content;
  const escapedNewLines = (text.match(/\\n/g) || []).length;
  const realNewLines = (text.match(/\n/g) || []).length;

  if (escapedNewLines > 0 && realNewLines === 0) {
    text = text.replace(/\\n/g, '\n');
  }

  text = text
    .replace(/\\t/g, '  ')
    .replace(/\\([`*_#[\]()>-])/g, '$1');

  return text;
}

function getAttachmentIcon(type: StudioAgentAttachment['type']) {
  if (type === 'image') return <ImageIcon className="w-3.5 h-3.5" />;
  if (type === 'video') return <FileVideo className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

export const StudioAgentPanel: React.FC<StudioAgentPanelProps> = ({
  studioType,
  topicId,
  compact = false,
  layout = 'inline',
}) => {
  const [input, setInput] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<Array<StudioAgentAttachment & { id: string }>>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const answerInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    toolEvents,
    pendingInteraction,
    isStreaming,
    error,
    sendMessage,
    answerInteraction,
    reset,
  } = useStudioAgent(studioType, topicId);

  const disabled = !topicId || isStreaming || isUploadingAttachment;
  const mentionRegex = /(?:^|\s)@([^\s@]*)$/;

  const subtitle = useMemo(() => {
    if (!topicId) {
      return 'Crie ou selecione um tópico para iniciar o modo agente.';
    }
    return studioType === 'image'
      ? 'Converse com o agente e gere imagens via tools do studio.'
      : 'Converse com o agente e gere vídeos via tools do studio.';
  }, [studioType, topicId]);

  useEffect(() => {
    const match = input.match(mentionRegex);
    if (!match) {
      setMentionOpen(false);
      setMentionSuggestions([]);
      setMentionSelectedIndex(0);
      return;
    }

    const nextQuery = match[1] || '';
    setMentionOpen(true);

    const timer = setTimeout(async () => {
      try {
        const result = await searchStudioAgentFiles(nextQuery, 10);
        setMentionSuggestions(result.files || []);
        setMentionSelectedIndex(0);
      } catch {
        setMentionSuggestions([]);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [input]);

  const insertMention = (path: string) => {
    setInput((prev) => prev.replace(mentionRegex, (m) => m.replace(/@([^\s@]*)$/, `@${path} `)));
    setMentionOpen(false);
    setMentionSuggestions([]);
    setMentionSelectedIndex(0);
  };

  const removeDraftAttachment = (id: string) => {
    setDraftAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const extractMentions = (text: string): StudioAgentMention[] => {
    const matches = Array.from(text.matchAll(/(^|\s)@([^\s@]+)/g));
    const unique = Array.from(new Set(matches.map((m) => m[2].trim()).filter(Boolean)));
    return unique.map((path) => ({ path }));
  };

  const handleAttachmentPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingAttachment(true);

    try {
      for (const file of Array.from(files)) {
        const mimeType = file.type || 'application/octet-stream';
        const kind: StudioAgentAttachment['type'] = mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('video/')
            ? 'video'
            : 'file';

        const uploaded = await uploadToBlob(file, file.name, mimeType);
        setDraftAttachments((prev) => [
          ...prev,
          {
            id: nanoid(),
            type: kind,
            url: uploaded.url,
            name: file.name,
            mimeType,
          },
        ]);
      }
    } finally {
      setIsUploadingAttachment(false);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
    }
  };

  const submitCurrentMessage = async () => {
    if (disabled) return;

    const text = input.trim();
    const attachments = draftAttachments.map(({ id, ...rest }) => rest);
    if (!text && attachments.length === 0) return;

    const mentions = extractMentions(text);
    await sendMessage(text, { attachments, mentions });

    setInput('');
    setDraftAttachments([]);
    setMentionOpen(false);
    setMentionSuggestions([]);
  };

  const renderMessageAttachments = (attachments?: StudioAgentAttachment[]) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div className="mt-2 space-y-2">
        {attachments.map((att, idx) => (
          <div key={`${att.url}_${idx}`} className="rounded-xl border border-border/70 bg-black/30 overflow-hidden">
            {att.type === 'image' && (
              <img src={att.url} alt={att.name || 'Imagem'} className="max-h-64 w-full object-contain bg-black/40" />
            )}
            {att.type === 'video' && (
              <video src={att.url} controls className="max-h-72 w-full bg-black" />
            )}
            {att.type === 'file' && (
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-xs text-white/90 hover:bg-white/5"
              >
                {getAttachmentIcon('file')}
                <span className="truncate">{att.name || att.url}</span>
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderDraftAttachments = () => {
    if (draftAttachments.length === 0) return null;

    return (
      <div className="mb-3 space-y-2">
        {draftAttachments.map((att) => (
          <div
            key={att.id}
            className="relative p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-md overflow-hidden bg-black/40 border border-border/60 flex items-center justify-center">
              {att.type === 'image' ? (
                <img src={att.url} alt={att.name || 'Imagem'} className="w-full h-full object-cover" />
              ) : att.type === 'video' ? (
                <FileVideo className="w-4 h-4 text-primary" />
              ) : (
                <FileText className="w-4 h-4 text-primary" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-primary truncate">
                {att.type === 'image' ? 'Imagem anexada' : att.type === 'video' ? 'Vídeo anexado' : 'Arquivo anexado'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{att.name || att.url}</p>
            </div>

            <button
              onClick={() => removeDraftAttachment(att.id)}
              className="w-6 h-6 rounded-lg bg-black/40 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all flex items-center justify-center"
              title="Remover anexo"
              type="button"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderMentionSuggestions = () => {
    if (!mentionOpen || mentionSuggestions.length === 0) return null;

    return (
      <div className="absolute left-0 right-0 bottom-[calc(100%+8px)] rounded-xl border border-border bg-[#0b0b0b] shadow-2xl overflow-hidden z-30 max-h-52 overflow-y-auto">
        {mentionSuggestions.map((path, index) => (
          <button
            key={path}
            type="button"
            className={`w-full text-left px-3 py-2 text-xs border-b border-border/60 last:border-b-0 flex items-center gap-2 ${
              index === mentionSelectedIndex
                ? 'bg-white/10 text-white'
                : 'text-white/85 hover:bg-white/5'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              insertMention(path);
            }}
          >
            <AtSign className="w-3.5 h-3.5 text-primary" />
            <span className="truncate">{path}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderComposer = (size: 'sidebar' | 'inline') => {
    const textSize = size === 'sidebar' ? 'text-[13px]' : 'text-xs';

    return (
      <div className="relative">
        {renderMentionSuggestions()}

        <div className="relative rounded-2xl border border-border bg-[#06070a] overflow-hidden">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={size === 'sidebar' ? 3 : 2}
            disabled={disabled}
            onKeyDown={(e) => {
              if (mentionOpen && mentionSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionSelectedIndex((prev) => (prev + 1) % mentionSuggestions.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionSelectedIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  insertMention(mentionSuggestions[mentionSelectedIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionOpen(false);
                  return;
                }
              }

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitCurrentMessage().catch(() => {});
              }
            }}
            placeholder={topicId ? 'Converse com o agente...' : 'Selecione um tópico para habilitar'}
            className={`w-full bg-transparent px-4 py-3 pr-14 ${textSize} text-white placeholder:text-muted-foreground resize-none outline-none`}
          />

          <div className="border-t border-border/70 px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => handleAttachmentPick(e.target.files).catch(() => {})}
              />
              <button
                type="button"
                className="w-8 h-8 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 flex items-center justify-center disabled:opacity-40"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={disabled}
                title="Anexar arquivos"
              >
                {isUploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>

              <span className="text-[11px] text-muted-foreground hidden sm:inline-flex">
                Use @ para mencionar arquivos
              </span>
            </div>

            <button
              onClick={() => submitCurrentMessage().catch(() => {})}
              disabled={disabled || (!input.trim() && draftAttachments.length === 0)}
              className="w-9 h-9 rounded-xl bg-primary/90 text-primary-foreground hover:bg-primary disabled:opacity-40 flex items-center justify-center transition-colors"
              type="button"
            >
              {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (layout === 'sidebar') {
    return (
      <aside className="assistant-panel w-[420px] max-w-[42vw] min-w-[360px] h-full bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-border flex flex-col flex-shrink-0">
        <div className="h-14 px-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/icon.png" alt="Studio" className="w-8 h-8 rounded-lg border border-border/60" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">Modo Agente</p>
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center"
              title="Histórico"
              type="button"
            >
              <Clock3 className="w-4 h-4" />
            </button>
            <button
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center"
              title="Novo contexto"
              type="button"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => reset().catch(() => {})}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center disabled:opacity-40"
              title="Limpar conversa"
              disabled={isStreaming}
              type="button"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-3 bg-black/20">
              {topicId
                ? 'Envie uma instrução para iniciar a conversa com o agente.'
                : 'Selecione um tópico para começar.'}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[92%] text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'ml-auto rounded-2xl border border-border bg-[#0a0a0a]/60 backdrop-blur-xl px-4 py-3 text-white'
                  : msg.role === 'assistant'
                    ? 'px-1 text-white/90'
                    : 'rounded-xl bg-black/50 px-3 py-2 text-muted-foreground'
              }`}
            >
              {msg.role === 'assistant' ? (
                <MessageResponse className="studio-agent-markdown text-[13px] leading-relaxed">
                  {normalizeAssistantMarkdown(msg.content)}
                </MessageResponse>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}

              {msg.mentions && msg.mentions.length > 0 && msg.role === 'user' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.mentions.map((mention, idx) => (
                    <span key={`${mention.path}_${idx}`} className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-white/80">
                      @{mention.path}
                    </span>
                  ))}
                </div>
              )}

              {renderMessageAttachments(msg.attachments)}
            </div>
          ))}

          {toolEvents.length > 0 && (
            <div className="text-[11px] text-muted-foreground border border-border/70 rounded-xl p-3 bg-black/30 space-y-1">
              {toolEvents.slice(-3).map((evt, idx) => (
                <div key={`${evt.type}_${idx}`}>
                  {evt.type === 'tool_started' && `Executando: ${String(evt.tool_name || '')}`}
                  {evt.type === 'tool_completed' && `Concluída: ${String(evt.tool_call_id || '')}`}
                  {evt.type === 'tool_failed' && `Falhou: ${String(evt.tool_call_id || '')}`}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border">
          {pendingInteraction && (
            <div className="mb-3 p-3 rounded-xl border border-border bg-black/40 space-y-2">
              <p className="text-xs font-medium text-white">{pendingInteraction.header || 'Pergunta'}</p>
              <p className="text-xs text-white/90">{pendingInteraction.question}</p>
              <div className="flex flex-wrap gap-2">
                {pendingInteraction.options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => answerInteraction({ optionId: opt.id }).catch(() => {})}
                    disabled={isStreaming}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-white/10 text-xs text-white hover:bg-white/20 disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={answerInputRef}
                  type="text"
                  className="flex-1 h-8 px-2.5 rounded-lg bg-white/5 border border-border text-xs text-white placeholder:text-muted-foreground outline-none"
                  placeholder="Complemento opcional"
                  disabled={isStreaming}
                />
                <button
                  onClick={() => {
                    const text = answerInputRef.current?.value?.trim() || '';
                    answerInteraction({ text }).catch(() => {});
                    if (answerInputRef.current) answerInputRef.current.value = '';
                  }}
                  disabled={isStreaming}
                  className="h-8 px-3 rounded-lg bg-white/15 text-xs text-white hover:bg-white/25 disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {renderDraftAttachments()}
          {renderComposer('sidebar')}
        </div>
      </aside>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-black/40 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-medium text-white">Modo Agente</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <button
          onClick={() => reset().catch(() => {})}
          className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center"
          title="Limpar conversa"
          disabled={isStreaming}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className={`${compact ? 'h-56' : 'h-72'} overflow-y-auto p-4 space-y-3`}>
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-3">
            {topicId
              ? 'Envie uma instrução para iniciar a conversa com o agente.'
              : 'Selecione um tópico para começar.'}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'ml-auto bg-white/20 text-white'
                : msg.role === 'assistant'
                  ? 'bg-white/10 text-white/90'
                  : 'bg-black/50 text-muted-foreground'
            }`}
          >
            {msg.role === 'assistant' ? (
              <MessageResponse className="studio-agent-markdown text-[12px] leading-relaxed">
                {normalizeAssistantMarkdown(msg.content)}
              </MessageResponse>
            ) : (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            )}

            {msg.mentions && msg.mentions.length > 0 && msg.role === 'user' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {msg.mentions.map((mention, idx) => (
                  <span key={`${mention.path}_${idx}`} className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-white/80">
                    @{mention.path}
                  </span>
                ))}
              </div>
            )}

            {renderMessageAttachments(msg.attachments)}
          </div>
        ))}

        {toolEvents.length > 0 && (
          <div className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-2 space-y-1">
            {toolEvents.slice(-3).map((evt, idx) => (
              <div key={`${evt.type}_${idx}`}>
                {evt.type === 'tool_started' && `Tool iniciada: ${String(evt.tool_name || '')}`}
                {evt.type === 'tool_completed' && `Tool concluída: ${String(evt.tool_call_id || '')}`}
                {evt.type === 'tool_failed' && `Tool falhou: ${String(evt.tool_call_id || '')}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingInteraction && (
        <div className="px-4 py-3 border-t border-border bg-black/50 space-y-2">
          <p className="text-xs font-medium text-white">{pendingInteraction.header || 'Pergunta'}</p>
          <p className="text-xs text-white/90">{pendingInteraction.question}</p>
          <div className="flex flex-wrap gap-2">
            {pendingInteraction.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => answerInteraction({ optionId: opt.id }).catch(() => {})}
                disabled={isStreaming}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-white/10 text-xs text-white hover:bg-white/20 disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={answerInputRef}
              type="text"
              className="flex-1 h-8 px-2.5 rounded-lg bg-white/5 border border-border text-xs text-white placeholder:text-muted-foreground outline-none"
              placeholder="Complemento opcional"
              disabled={isStreaming}
            />
            <button
              onClick={() => {
                const text = answerInputRef.current?.value?.trim() || '';
                answerInteraction({ text }).catch(() => {});
                if (answerInputRef.current) answerInputRef.current.value = '';
              }}
              disabled={isStreaming}
              className="h-8 px-3 rounded-lg bg-white/15 text-xs text-white hover:bg-white/25 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 border-t border-border text-xs text-red-300 bg-red-500/10">
          {error}
        </div>
      )}

      <div className="p-3 border-t border-border">
        {renderDraftAttachments()}
        {renderComposer('inline')}
      </div>
    </div>
  );
};

export default StudioAgentPanel;
