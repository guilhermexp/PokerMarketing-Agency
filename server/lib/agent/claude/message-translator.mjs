function stripMcpPrefix(toolName = '') {
  if (typeof toolName !== 'string') return toolName;
  return toolName.replace(/^mcp__[^_]+__/, '');
}

function safeString(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function translateSdkMessage(message) {
  const events = [];

  if (!message || typeof message !== 'object') {
    return events;
  }

  const sessionId = message.session_id || null;

  if (message.type === 'stream_event') {
    const evt = message.event;
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

  if (message.type === 'assistant') {
    const contentBlocks = Array.isArray(message.message?.content)
      ? message.message.content
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

      if (block?.type === 'tool_result') {
        events.push({
          type: block.is_error ? 'tool_failed' : 'tool_completed',
          tool_call_id: block.tool_use_id,
          content: safeString(block.content),
          sessionId,
        });
      }
    }

    return events;
  }

  if (message.type === 'tool_progress') {
    events.push({
      type: 'status',
      status: 'tool_progress',
      tool_call_id: message.tool_use_id,
      tool_name: stripMcpPrefix(message.tool_name),
      elapsed_seconds: message.elapsed_time_seconds,
      sessionId,
    });
    return events;
  }

  if (message.type === 'system' && message.subtype === 'status') {
    events.push({ type: 'status', status: message.status, sessionId });
    return events;
  }

  if (message.type === 'result') {
    events.push({
      type: 'response_end',
      is_error: Boolean(message.is_error),
      subtype: message.subtype,
      result: message.result || null,
      errors: message.errors || null,
      usage: message.usage || null,
      sessionId,
    });
    return events;
  }

  if (message.type === 'auth_status' && message.error) {
    events.push({ type: 'error', error: message.error, sessionId });
  }

  return events;
}
