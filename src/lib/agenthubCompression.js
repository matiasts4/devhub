export const DEFAULT_COMPRESSION_KEEP_LAST_N = 3;
export const MIN_MESSAGES_FOR_COMPRESSION = DEFAULT_COMPRESSION_KEEP_LAST_N + 2;

export function estimateMessageTokens(content) {
  if (!content) return 0;
  return Math.ceil(String(content).length / 4);
}

export function normalizeKeepLastN(value, fallback = DEFAULT_COMPRESSION_KEEP_LAST_N) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function roundRatio(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number(value.toFixed(4));
}

export function buildCompressionStats({
  beforeMessages,
  afterMessages,
  beforeTokens,
  afterTokens,
}) {
  const messagesBefore = beforeMessages.length;
  const messagesAfter = afterMessages.length;
  const tokensBefore =
    beforeTokens ??
    beforeMessages.reduce((sum, message) => sum + estimateMessageTokens(message.content), 0);
  const tokensAfter =
    afterTokens ??
    afterMessages.reduce((sum, message) => sum + estimateMessageTokens(message.content), 0);

  return {
    messages_before: messagesBefore,
    messages_after: messagesAfter,
    tokens_before: tokensBefore,
    tokens_after: tokensAfter,
    messages_saved: Math.max(messagesBefore - messagesAfter, 0),
    tokens_saved: Math.max(tokensBefore - tokensAfter, 0),
    message_reduction_ratio:
      messagesBefore > 0 ? roundRatio((messagesBefore - messagesAfter) / messagesBefore) : 0,
    token_reduction_ratio:
      tokensBefore > 0 ? roundRatio((tokensBefore - tokensAfter) / tokensBefore) : 0,
  };
}

export function planMessageCompression(allMessages, keepLastN = DEFAULT_COMPRESSION_KEEP_LAST_N) {
  const normalizedKeepLastN = normalizeKeepLastN(keepLastN);
  const minimumMessages = normalizedKeepLastN + 2;
  const tokensBefore = allMessages.reduce(
    (sum, message) => sum + estimateMessageTokens(message.content),
    0
  );

  if (allMessages.length < minimumMessages) {
    return {
      canCompress: false,
      keep_last_n: normalizedKeepLastN,
      minimum_messages: minimumMessages,
      toCompress: [],
      keptMessages: [...allMessages],
      ...buildCompressionStats({
        beforeMessages: allMessages,
        afterMessages: allMessages,
        beforeTokens: tokensBefore,
        afterTokens: tokensBefore,
      }),
      reason: `No hay suficientes mensajes para comprimir (mínimo ${minimumMessages}, hay ${allMessages.length})`,
    };
  }

  const keepStart = allMessages.length - normalizedKeepLastN;
  const toCompress = allMessages.slice(0, keepStart);
  const keptMessages = allMessages.slice(keepStart);

  return {
    canCompress: true,
    keep_last_n: normalizedKeepLastN,
    minimum_messages: minimumMessages,
    toCompress,
    keptMessages,
    ...buildCompressionStats({
      beforeMessages: allMessages,
      afterMessages: keptMessages,
      beforeTokens: tokensBefore,
    }),
  };
}

export function formatCompressionResultMessage(result) {
  if (!result?.compressed) {
    return result?.reason || 'Todavía no hay suficiente historial para comprimir.';
  }

  const compressedCount = result.messages_compressed ?? 0;
  const savedTokens = result.tokens_saved ?? 0;
  const reductionPct = Math.round((result.token_reduction_ratio ?? 0) * 100);

  return `${compressedCount} mensajes resumidos · ${savedTokens} tokens ahorrados · ${reductionPct}% menos contexto`;
}
