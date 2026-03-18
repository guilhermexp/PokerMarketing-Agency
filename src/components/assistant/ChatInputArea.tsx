/**
 * ChatInputArea - Área de input do chat
 *
 * Inclui: campo de texto, botões de ação, upload de arquivo,
 * drag-and-drop, preview de imagem de referência, toggle de logo,
 * e tool approvals pendentes acima do input.
 */

import React, { memo, useState, useCallback, useRef } from 'react';
import type { CreateUIMessage, UIMessage } from 'ai';
import type { ChatReferenceImage, BrandProfile } from '../../types';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { ToolResultViewer } from './ToolResultViewer';
import { uploadDataUrlToBlob } from '../../services/blobService';

// Helper: converter File para base64
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

interface ChatInputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSendFileMessage: (message: CreateUIMessage<UIMessage>) => Promise<void>;
  isLoading: boolean;
  isSending: boolean;
  referenceImage: ChatReferenceImage | null;
  onClearReference: () => void;
  brandProfile?: BrandProfile;
  includeBrandLogo: boolean;
  onToggleBrandLogo: () => void;
  onError: (message: string) => void;
  pendingApprovals: UIMessage['parts'];
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = memo(function ChatInputArea({
  input,
  onInputChange,
  onSubmit,
  onSendFileMessage,
  isLoading,
  isSending,
  referenceImage,
  onClearReference,
  brandProfile,
  includeBrandLogo,
  onToggleBrandLogo,
  onError,
  pendingApprovals,
  onApprove,
  onDeny,
  inputRef,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploadedUrl = await uploadDataUrlToBlob(dataUrl);
      onInputChange('');
      await onSendFileMessage({
        role: 'user',
        parts: [
          { type: 'text', text: 'Carreguei esta referência para usarmos.' },
          { type: 'file', mediaType: file.type || 'image/png', filename: file.name, url: uploadedUrl }
        ]
      });
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Falha ao enviar a imagem. Tente novamente.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onSendFileMessage, onInputChange, onError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      onError('Apenas imagens são suportadas');
      return;
    }

    const file = imageFiles[0];
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploadedUrl = await uploadDataUrlToBlob(dataUrl);
      onInputChange('');
      await onSendFileMessage({
        role: 'user',
        parts: [
          { type: 'text', text: `Carreguei esta imagem via drag-and-drop: ${file.name}` },
          { type: 'file', mediaType: file.type || 'image/png', filename: file.name, url: uploadedUrl }
        ]
      });
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Falha ao enviar a imagem. Tente novamente.');
    }
  }, [onSendFileMessage, onInputChange, onError]);

  return (
    <div className="flex-shrink-0 p-4">
      {/* Pending Tool Approvals */}
      <ToolResultViewer
        pendingApprovals={pendingApprovals}
        onApprove={onApprove}
        onDeny={onDeny}
      />

      {referenceImage && (
        <div className="relative mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3 animate-fade-in-up">
          <img
            src={referenceImage.src}
            alt="Reference"
            className="w-10 h-10 object-cover rounded-md border border-border"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-primary">
              📎 Imagem anexada
            </p>
            <p className="text-[9px] text-muted-foreground">
              Será enviada junto com a mensagem
            </p>
          </div>
          <button
            onClick={onClearReference}
            className="w-6 h-6 rounded-lg bg-black/40 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all flex items-center justify-center"
            title="Remover anexo"
          >
            <Icon name="x" className="w-3 h-3" />
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="relative">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*"
        />

        <div
          className="bg-[#0a0a0a]/60 backdrop-blur-xl border border-border rounded-xl overflow-hidden focus-within:border-white/30 transition-colors relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm z-50 rounded-xl flex items-center justify-center border-2 border-primary border-dashed">
              <div className="text-center">
                <Icon name="upload" className="w-12 h-12 text-primary mx-auto mb-2" />
                <p className="text-sm text-primary font-medium">Solte a imagem para anexar</p>
              </div>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder="Pergunte, pesquise ou converse..."
            className="w-full bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder:text-muted-foreground outline-none resize-none min-h-[80px] max-h-[200px] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            disabled={isLoading || isSending}
            rows={2}
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 rounded-lg text-muted-foreground hover:text-white/60 hover:bg-white/5 transition-all flex items-center justify-center"
              >
                <Icon name="plus" className="w-4 h-4" />
              </button>
              {brandProfile?.logo && (
                <button
                  type="button"
                  onClick={onToggleBrandLogo}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 ${
                    includeBrandLogo
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-white/5 text-muted-foreground border border-border'
                  }`}
                  title={includeBrandLogo ? 'Logo será incluído nas imagens' : 'Logo não será incluído'}
                >
                  <Icon name="image" className="w-3 h-3" />
                  Logo {includeBrandLogo ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
            <button
              type="submit"
              className={`w-7 h-7 rounded-lg transition-all flex items-center justify-center ${
                (isLoading || isSending)
                  ? 'bg-primary/20 text-primary/60 cursor-not-allowed'
                  : input.trim() || referenceImage
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'text-muted-foreground hover:text-white/60 disabled:text-white/10'
              }`}
              disabled={(isLoading || isSending) || (!input.trim() && !referenceImage)}
              title={(isLoading || isSending) ? 'Aguardando resposta...' : 'Enviar mensagem'}
            >
              {(isLoading || isSending) ? (
                <Loader size={16} className="text-muted-foreground" />
              ) : (
                <Icon name="arrow-up" className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
});
