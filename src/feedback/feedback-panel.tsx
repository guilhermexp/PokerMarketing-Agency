import React from 'react';

interface Annotation {
  id: string;
  comment: string;
  element: string;
  elementPath: string;
  x: number;
  y: number;
  timestamp: number;
  selectedText?: string;
  intent?: string;
  severity?: string;
}

interface FeedbackPanelProps {
  annotations: Annotation[];
  onExport: () => void;
  onCopy: () => void;
  onClear: () => void;
  onClose: () => void;
  onDeleteAnnotation: (id: string) => void;
  onSend: () => Promise<void>;
  isSending?: boolean;
  sendStatus?: 'idle' | 'success' | 'error';
}

export function FeedbackPanel({
  annotations,
  onExport,
  onCopy,
  onClear,
  onClose,
  onDeleteAnnotation,
  onSend,
  isSending = false,
  sendStatus = 'idle',
}: FeedbackPanelProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Feedback ({annotations.length})</span>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>

        <div style={styles.list}>
          {annotations.length === 0 ? (
            <p style={styles.empty}>
              Nenhuma anotacao ainda. Clique em elementos da pagina para adicionar feedback.
            </p>
          ) : (
            annotations.map((ann, i) => (
              <div key={ann.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <span style={styles.cardNum}>#{i + 1}</span>
                  <code style={styles.cardElement}>{ann.element}</code>
                  <button
                    onClick={() => onDeleteAnnotation(ann.id)}
                    style={styles.deleteBtn}
                    title="Remover anotacao"
                  >
                    X
                  </button>
                </div>
                <p style={styles.cardComment}>{ann.comment}</p>
                {ann.selectedText && (
                  <p style={styles.cardSelected}>&ldquo;{ann.selectedText}&rdquo;</p>
                )}
                <div style={styles.cardMeta}>
                  <code style={styles.cardPath}>{ann.elementPath}</code>
                </div>
              </div>
            ))
          )}
        </div>

        {annotations.length > 0 && (
          <div style={styles.actions}>
            <button
              onClick={onSend}
              style={{
                ...styles.sendBtn,
                opacity: isSending ? 0.7 : 1,
                cursor: isSending ? 'not-allowed' : 'pointer',
              }}
              disabled={isSending}
            >
              {isSending ? 'Enviando...' : sendStatus === 'success' ? 'Enviado!' : 'Enviar'}
            </button>
            <button onClick={onExport} style={styles.exportBtn}>.md</button>
            <button onClick={onCopy} style={styles.copyBtn}>Copiar</button>
            <button onClick={onClear} style={styles.clearBtn}>Limpar</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px', zIndex: 99998, pointerEvents: 'auto' },
  panel: { height: '100%', background: '#1a1a2e', color: '#e0e0e0', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.3)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '14px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #2a2a4a', flexShrink: 0 },
  title: { fontWeight: 700, fontSize: '16px' },
  closeBtn: { background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' },
  list: { flex: 1, overflowY: 'auto', padding: '12px 16px' },
  empty: { color: '#666', textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 },
  card: { background: '#16213e', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', border: '1px solid #2a2a4a' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  cardNum: { color: '#7c83ff', fontWeight: 700, fontSize: '13px', flexShrink: 0 },
  cardElement: { background: '#0f3460', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', color: '#a0c4ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deleteBtn: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 },
  cardComment: { margin: '0 0 6px', lineHeight: 1.5 },
  cardSelected: { margin: '0 0 6px', color: '#888', fontStyle: 'italic', fontSize: '13px' },
  cardMeta: { marginTop: '4px' },
  cardPath: { fontSize: '11px', color: '#555', wordBreak: 'break-all' },
  actions: { display: 'flex', gap: '8px', padding: '16px 20px', borderTop: '1px solid #2a2a4a', flexShrink: 0 },
  sendBtn: { flex: 2, padding: '10px', background: '#2ecc71', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  exportBtn: { flex: 1, padding: '10px', background: '#7c83ff', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  copyBtn: { padding: '10px 16px', background: '#2a2a4a', color: '#e0e0e0', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  clearBtn: { padding: '10px 16px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b33', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
};
