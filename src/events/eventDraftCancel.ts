import type { ConfirmEventPayload } from "./eventDraft.js";

export type DiscardEventDraftInput = {
  draft: ConfirmEventPayload | null;
  discardedMessage: string;
  clearDraft: () => Promise<void>;
  deletePreview: (chatId: string, messageId: number) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  logPreviewDeleteError?: (error: unknown) => void;
};

export async function discardEventDraft(input: DiscardEventDraftInput) {
  if (input.draft?.previewChatId && input.draft.previewMessageId) {
    try {
      await input.deletePreview(input.draft.previewChatId, Number(input.draft.previewMessageId));
    } catch (error) {
      input.logPreviewDeleteError?.(error);
    }
  }

  await input.clearDraft();
  await input.sendMessage(input.discardedMessage);
}
