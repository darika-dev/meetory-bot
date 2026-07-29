export type TelegramSender = {
  id?: number | string;
  is_bot?: boolean;
};

export function getBotIdFromToken(token: string | undefined) {
  const rawId = token?.split(":", 1)[0];

  if (!rawId || !/^\d+$/.test(rawId)) {
    return null;
  }

  return rawId;
}

function sameTelegramId(left: number | string | undefined, right: number | string | null | undefined) {
  return left !== undefined && right !== undefined && right !== null && String(left) === String(right);
}

export function shouldIgnoreBotAuthoredMessage(input: {
  ctxFrom?: TelegramSender | null;
  messageFrom?: TelegramSender | null;
  botId?: string | number | null;
}) {
  return Boolean(
    input.ctxFrom?.is_bot
    || input.messageFrom?.is_bot
    || sameTelegramId(input.ctxFrom?.id, input.botId)
    || sameTelegramId(input.messageFrom?.id, input.botId)
  );
}
