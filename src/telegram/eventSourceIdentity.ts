export type TelegramEventSourceIdentity = {
  chatId: string | null;
  messageId: string | null;
  updateId: string | null;
};

function stringFromTelegramId(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? String(value) : null;
}

function getForwardedChannelSource(message: Record<string, unknown>) {
  const origin = message.forward_origin;

  if (typeof origin === "object" && origin !== null) {
    const candidate = origin as {
      type?: unknown;
      chat?: { id?: unknown };
      message_id?: unknown;
    };

    if (candidate.type === "channel") {
      const chatId = stringFromTelegramId(candidate.chat?.id);
      const messageId = stringFromTelegramId(candidate.message_id);

      if (chatId && messageId) {
        return { chatId, messageId };
      }
    }
  }

  const legacyChat = message.forward_from_chat as { id?: unknown } | undefined;
  const legacyMessageId = message.forward_from_message_id;
  const legacyChatId = stringFromTelegramId(legacyChat?.id);
  const legacySourceMessageId = stringFromTelegramId(legacyMessageId);

  return legacyChatId && legacySourceMessageId
    ? { chatId: legacyChatId, messageId: legacySourceMessageId }
    : null;
}

export function getTelegramEventSourceIdentity(input: {
  message?: unknown;
  updateId?: unknown;
}): TelegramEventSourceIdentity {
  const message = typeof input.message === "object" && input.message !== null
    ? input.message as Record<string, unknown>
    : null;
  const forwardedSource = message ? getForwardedChannelSource(message) : null;
  const chat = message?.chat as { id?: unknown } | undefined;

  return {
    chatId: forwardedSource?.chatId ?? stringFromTelegramId(chat?.id),
    messageId: forwardedSource?.messageId ?? stringFromTelegramId(message?.message_id),
    updateId: stringFromTelegramId(input.updateId),
  };
}

