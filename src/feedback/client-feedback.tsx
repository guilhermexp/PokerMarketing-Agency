import React, { useState, useCallback, useRef } from 'react';
import { Agentation, loadAnnotations, saveAnnotations } from 'agentation';
import { generateMarkdown, downloadMarkdown, copyMarkdownToClipboard } from './generate-markdown';
import { FeedbackPanel } from './feedback-panel';
import { useFeedbackStore } from '../stores/feedbackStore';
import { getCsrfToken } from '../services/apiClient';

interface Annotation {
  id: string;
  comment: string;
  element: string;
  elementPath: string;
  x: number;
  y: number;
  timestamp: number;
  selectedText?: string;
  intent?: 'fix' | 'change' | 'question' | 'approve';
  severity?: 'blocking' | 'important' | 'suggestion';
}

interface ClientFeedbackProps {
  title?: string;
  includeMetadata?: boolean;
}

export function ClientFeedback({
  title = 'Client Feedback',
  includeMetadata = true,
}: ClientFeedbackProps) {
  const enabled = useFeedbackStore((s) => s.enabled);
  const [isActive, setIsActive] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadAnnotations<Annotation>(window.location.pathname);
  });
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const persist = useCallback((anns: Annotation[]) => {
    saveAnnotations(window.location.pathname, anns);
  }, []);

  const handleAnnotationAdd = useCallback(
    (annotation: Annotation) => {
      setAnnotations((prev) => {
        const next = [...prev, annotation];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const handleAnnotationUpdate = useCallback(
    (annotation: Annotation) => {
      setAnnotations((prev) => {
        const next = prev.map((a) => (a.id === annotation.id ? annotation : a));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const handleAnnotationDelete = useCallback(
    (annotation: Annotation) => {
      setAnnotations((prev) => {
        const next = prev.filter((a) => a.id !== annotation.id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const handleAnnotationsClear = useCallback(() => {
    setAnnotations([]);
    persist([]);
  }, [persist]);

  const handleDeleteFromPanel = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const next = prev.filter((a) => a.id !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const handleExport = useCallback(() => {
    downloadMarkdown(annotations, { title, includeMetadata });
  }, [annotations, title, includeMetadata]);

  const handleCopy = useCallback(async () => {
    await copyMarkdownToClipboard(annotations, { title, includeMetadata });
    setCopyFeedback(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopyFeedback(false), 2000);
  }, [annotations, title, includeMetadata]);

  const handleSend = useCallback(async () => {
    if (annotations.length === 0) return;

    setIsSending(true);
    setSendStatus('idle');

    try {
      const markdown = generateMarkdown(annotations, { title, includeMetadata });
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          markdown,
          pageUrl: window.location.href,
          annotations,
        }),
      });

      if (response.ok) {
        setSendStatus('success');
        setAnnotations([]);
        persist([]);
        if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = setTimeout(() => setSendStatus('idle'), 3000);
      } else {
        setSendStatus('error');
      }
    } catch {
      setSendStatus('error');
    } finally {
      setIsSending(false);
    }
  }, [annotations, title, includeMetadata, persist]);

  const handleToggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={handleToggle}
        style={{ ...styles.toggleBtn, background: isActive ? '#7c83ff' : '#1a1a2e' }}
        title={isActive ? 'Desativar feedback' : 'Ativar feedback'}
      >
        <span style={styles.toggleIcon}>{isActive ? '\u25CF' : '\u25CB'}</span>
        <span>Feedback</span>
        {annotations.length > 0 && <span style={styles.badge}>{annotations.length}</span>}
      </button>

      {annotations.length > 0 && (
        <button
          onClick={() => setIsPanelOpen((prev) => !prev)}
          style={styles.panelToggleBtn}
          title="Ver anotacoes"
        >
          {isPanelOpen ? 'X' : `${annotations.length}`}
        </button>
      )}

      {isPanelOpen && (
        <FeedbackPanel
          annotations={annotations}
          onExport={handleExport}
          onCopy={handleCopy}
          onClear={handleAnnotationsClear}
          onClose={() => setIsPanelOpen(false)}
          onDeleteAnnotation={handleDeleteFromPanel}
          onSend={handleSend}
          isSending={isSending}
          sendStatus={sendStatus}
        />
      )}

      {copyFeedback && <div style={styles.toast}>Copiado para a area de transferencia!</div>}

      {isActive && (
        <Agentation
          copyToClipboard={false}
          onAnnotationAdd={handleAnnotationAdd}
          onAnnotationUpdate={handleAnnotationUpdate}
          onAnnotationDelete={handleAnnotationDelete}
          onAnnotationsClear={handleAnnotationsClear}
        />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toggleBtn: { position: 'fixed', bottom: '20px', right: '20px', zIndex: 99998, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1px solid #333', borderRadius: '50px', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', transition: 'all 0.2s ease' },
  toggleIcon: { fontSize: '10px' },
  badge: { background: '#ff6b6b', color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 },
  panelToggleBtn: { position: 'fixed', bottom: '80px', right: '20px', zIndex: 99998, padding: '8px 14px', background: '#1a1a2e', border: '1px solid #333', borderRadius: '50px', color: '#fff', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  toast: { position: 'fixed', bottom: '80px', right: '100px', zIndex: 99999, background: '#2ecc71', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
};
