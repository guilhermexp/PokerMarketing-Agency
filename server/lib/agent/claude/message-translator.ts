type SdkToolUseBlock = {
  id?: string;
  input?: Record<string, unknown>;
  name?: string;
  type?: string;
};

type SdkStreamEvent = {
  content_block?: SdkToolUseBlock;
  delta?: {
    text?: string;
    type?: string;
  };
  type?: string;
};

type SdkMessage = {
  error?: string;
  errors?: unknown;
  event?: SdkStreamEvent;
  is_error?: boolean;
  message?: {
    content?: SdkToolUseBlock[];
  };
  result?: unknown;
  session_id?: string | null;
  status?: string;
  subtype?: string;
  tool_name?: string;
  tool_use_id?: string;
  type?: string;
  usage?: unknown;
};

export type StudioEvent =
  | { type: 'text_delta'; content: string; sessionId: string | null }
  | { type: 'tool_started'; tool_call_id?: string; tool_name: string; arguments: Record<string, unknown>; sessionId: string | null }
  | { type: 'tool_completed'; tool_call_id?: string; tool_name?: string; sessionId: string | null }
  | { type: 'tool_failed'; tool_call_id?: string; tool_name?: string; error?: string; sessionId: string | null }
  | { type: 'status'; status?: string; tool_call_id?: string; tool_name?: string; elapsed_seconds?: number; sessionId: string | null }
  | { type: 'response_end'; is_error: boolean; subtype?: string; result: unknown; errors: unknown; usage: unknown; sessionId: string | null }
  | { type: 'error'; error: string; sessionId: string | null };

function stripMcpPrefix(toolName = ''): string {
  if (typeof toolName !== 'string') return '';
  return toolName.replace(/^mcp__[^_]+__/, '');
}

export function translateSdkMessage(message: unknown): StudioEvent[] {
  const events: StudioEvent[] = [];

  if (!message || typeof message !== 'object') {
    return events;
  }

  const sdkMessage = message as SdkMessage;

  const sessionId = sdkMessage.session_id || null;

  if (sdkMessage.type === 'stream_event') {
    const evt = sdkMessage.event;
    const evtType = evt?.type;

    if (evtType === 'content_block_delta' && evt?.delta?.type === 'text_delta') {
      events.push({ type: 'text_delta', content: evt.delta.text || '', sessionId });
    }

    if (evtType === 'content_block_start' && evt?.content_block?.type === 'tool_use') {
      const toolName = stripMcpPrefix(evt.content_block.name || '');
      events.push({
        type: 'tool_started',
        tool_call_id: evt.content_block.id,
        tool_name: toolName,
        arguments: evt.content_block.input || {},
        sessionId,
      });

    }

    return events;
  }

  if (sdkMessage.type === 'assistant') {
    const contentBlocks = Array.isArray(sdkMessage.message?.content)
      ? sdkMessage.message.content
      : [];

    for (const block of contentBlocks) {
      if (block?.type === 'tool_use') {
        const toolName = stripMcpPrefix(block.name || '');
        events.push({
          type: 'tool_started',
          tool_call_id: block.id,
          tool_name: toolName,
          arguments: block.input || {},
          sessionId,
        });

      }

    }

    return events;
  }

  if (sdkMessage.type === 'tool_progress') {
    events.push({
      type: 'status',
      status: 'tool_progress',
      tool_call_id: sdkMessage.tool_use_id,
      tool_name: stripMcpPrefix(sdkMessage.tool_name),
      elapsed_seconds: typeof (sdkMessage as Record<string, unknown>).elapsed_time_seconds === 'number'
        ? ((sdkMessage as Record<string, unknown>).elapsed_time_seconds as number)
        : undefined,
      sessionId,
    });
    return events;
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'status') {
    events.push({ type: 'status', status: sdkMessage.status, sessionId });
    return events;
  }

  if (sdkMessage.type === 'result') {
    events.push({
      type: 'response_end',
      is_error: Boolean(sdkMessage.is_error),
      subtype: sdkMessage.subtype,
      result: sdkMessage.result || null,
      errors: sdkMessage.errors || null,
      usage: sdkMessage.usage || null,
      sessionId,
    });
    return events;
  }

  if (sdkMessage.type === 'auth_status' && sdkMessage.error) {
    events.push({ type: 'error', error: sdkMessage.error, sessionId });
  }

  return events;
}
