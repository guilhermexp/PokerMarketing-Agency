/**
 * Data Stream Provider - Vercel AI SDK
 *
 * Context provider para gerenciar dataStream de eventos customizados
 */

import { createContext, useContext, ReactNode } from 'react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tipos de eventos customizados que podem ser enviados no dataStream
 */
export type DataUIPart =
  | { type: 'data-imageGenerating'; data: { status: string; description: string; aspectRatio?: string } }
  | { type: 'data-imageCreated'; data: { id: string | null; url: string; aspectRatio?: string; prompt: string } }
  | { type: 'data-imageEditing'; data: { status: string; prompt: string; referenceImageId: string } }
  | { type: 'data-imageEdited'; data: { id: string | null; url: string; prompt: string } }
  | { type: 'data-logoGenerating'; data: { status: string; prompt: string } }
  | { type: 'data-logoCreated'; data: { id: string | null; url: string; prompt: string } }
  | { type: 'data-imageError'; data: { error: string } }
  | { type: 'data-logoError'; data: { error: string } };

/**
 * Context value
 */
type DataStreamContextValue = {
  dataStream: DataUIPart[];
  setDataStream: React.Dispatch<React.SetStateAction<DataUIPart[]>>;
};

// ============================================================================
// CONTEXT
// ============================================================================

const DataStreamContext = createContext<DataStreamContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface DataStreamProviderProps {
  children: ReactNode;
  dataStream: DataUIPart[];
  setDataStream: React.Dispatch<React.SetStateAction<DataUIPart[]>>;
}

/**
 * Provider que gerencia o dataStream de eventos customizados
 *
 * @example
 * const [dataStream, setDataStream] = useState<DataUIPart[]>([]);
 * <DataStreamProvider dataStream={dataStream} setDataStream={setDataStream}>
 *   <YourComponent />
 * </DataStreamProvider>
 */
export function DataStreamProvider({
  children,
  dataStream,
  setDataStream
}: DataStreamProviderProps) {
  return (
    <DataStreamContext.Provider value={{ dataStream, setDataStream }}>
      {children}
    </DataStreamContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook para acessar o dataStream context
 *
 * @example
 * const { dataStream, setDataStream } = useDataStream();
 */
export function useDataStream(): DataStreamContextValue {
  const context = useContext(DataStreamContext);
  if (!context) {
    throw new Error('useDataStream must be used within DataStreamProvider');
  }
  return context;
}
