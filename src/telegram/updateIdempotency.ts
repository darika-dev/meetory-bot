import type { Update } from "grammy/types";

export type TelegramUpdateStore = {
  claimTelegramUpdate(input: {
    updateId: number;
    updateType: string;
    expiresAt?: Date;
  }): Promise<boolean>;
  markTelegramUpdateCompleted(updateId: number): Promise<void>;
  markTelegramUpdateFailed(updateId: number, errorCode: string): Promise<void>;
};

export type TelegramRequestMeta = {
  deploymentId: string | null;
  requestId: string | null;
};

const UPDATE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function getUpdateType(update: Update) {
  for (const key of Object.keys(update)) {
    if (key !== "update_id") {
      return key;
    }
  }

  return "unknown";
}

function getMessage(update: Update) {
  return "message" in update
    ? update.message
    : "edited_message" in update
      ? update.edited_message
      : "channel_post" in update
        ? update.channel_post
        : "edited_channel_post" in update
          ? update.edited_channel_post
          : undefined;
}

export function getTelegramUpdateLogContext(update: Update, meta: TelegramRequestMeta) {
  const message = getMessage(update);
  const callbackQuery = "callback_query" in update ? update.callback_query : undefined;

  return {
    updateId: update.update_id,
    updateType: getUpdateType(update),
    chatId: message?.chat.id ?? callbackQuery?.message?.chat.id ?? null,
    messageId: message?.message_id ?? callbackQuery?.message?.message_id ?? null,
    callbackQueryId: callbackQuery?.id ?? null,
    deploymentId: meta.deploymentId,
    requestId: meta.requestId,
  };
}

function getErrorCode(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

export async function processTelegramUpdateOnce(input: {
  update: Update;
  meta: TelegramRequestMeta;
  store: TelegramUpdateStore;
  handleUpdate(): Promise<void>;
}) {
  const context = getTelegramUpdateLogContext(input.update, input.meta);

  console.info("[telegram-update:received]", {
    ...context,
    timestamp: new Date().toISOString(),
  });

  const claimed = await input.store.claimTelegramUpdate({
    updateId: input.update.update_id,
    updateType: context.updateType,
    expiresAt: new Date(Date.now() + UPDATE_RETENTION_MS),
  });

  console.info("[telegram-update:claim-result]", {
    ...context,
    claimed,
    reason: claimed ? "inserted" : "conflict",
  });

  if (!claimed) {
    console.info("[telegram-update:duplicate]", context);

    return {
      status: "duplicate" as const,
    };
  }

  console.info("[telegram-update:claimed]", context);

  try {
    await input.handleUpdate();
    await input.store.markTelegramUpdateCompleted(input.update.update_id);
    console.info("[telegram-update:completed]", context);

    return {
      status: "completed" as const,
    };
  } catch (error) {
    const errorCode = getErrorCode(error);

    await input.store.markTelegramUpdateFailed(input.update.update_id, errorCode);
    console.error("[telegram-update:failed]", {
      ...context,
      errorCode,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return {
      status: "failed" as const,
      error,
    };
  }
}
