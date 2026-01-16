/**
 * MessageResponse - Componente de renderização progressiva de markdown
 *
 * Usa Streamdown para renderizar markdown rico durante o streaming,
 * permitindo que o conteúdo apareça em tempo real enquanto a IA escreve.
 *
 * Features:
 * - ✅ Renderização progressiva durante streaming
 * - ✅ Syntax highlighting automático em code blocks
 * - ✅ Suporte completo a markdown (tabelas, listas, blockquotes, etc)
 * - ✅ Memoizado para performance
 * - ✅ Copy button em code blocks
 */

'use client';

import { type ComponentProps, memo } from 'react';
import { Streamdown } from 'streamdown';

/**
 * Props do MessageResponse (herda do Streamdown)
 */
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Helper para merge de classes
 */
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

/**
 * MessageResponse Component
 *
 * Wrapper memoizado do Streamdown com estilos customizados para mensagens do chat.
 *
 * @example
 * ```tsx
 * <MessageResponse className="prose dark:prose-invert">
 *   {message.content}
 * </MessageResponse>
 * ```
 */
export const MessageResponse = memo(
  ({ className, children, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        // Base styles
        'size-full',
        // Remove margens extras no primeiro e último elemento
        '[&>*:first-child]:mt-0',
        '[&>*:last-child]:mb-0',
        // Código inline e blocks
        '[&_code]:whitespace-pre-wrap',
        '[&_code]:break-words',
        '[&_pre]:max-w-full',
        '[&_pre]:overflow-x-auto',
        // Custom class
        className
      )}
      {...props}
    >
      {children}
    </Streamdown>
  ),
  // ⚡ Memoização: só re-renderiza se o conteúdo mudar
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = 'MessageResponse';
