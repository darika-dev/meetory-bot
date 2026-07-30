import { randomUUID } from "crypto";
import { Bot, type Context } from "grammy";
import { parseEvent, type DetectedLink, type ParsedEvent } from "./ai/eventParser.js";
import { applyLinkFallback, getUrlHostForLog } from "./ai/eventLinkFallback.js";
import { classifyOpenAIError } from "./ai/openaiErrors.js";
import {
  buildConfirmEventPayload,
  parseConfirmEventPayload,
  type ConfirmEventSourceIdentity,
  type ConfirmEventPayload,
} from "./events/eventDraft.js";
import { buildCalendarDescription } from "./events/calendarDescription.js";
import {
  isEventEditField,
  parseEditEventFieldPayload,
  updateDraftField,
} from "./events/eventDraftEditing.js";
import { discardEventDraft } from "./events/eventDraftCancel.js";
import { getCalendarAccess, assertCalendarOwner } from "./calendars/calendarAccess.js";
import { CalendarGoogleConnectionUnavailableError } from "./calendars/calendarGoogleConnection.js";
import {
  createCalendarInviteLink,
  getInvitePreviewByRawToken,
  joinCalendarByRawToken,
  parseCalendarJoinStartPayload,
} from "./calendars/calendarInvites.js";
import { getCalendarInviteTtlDays, getConfiguredTelegramBotUsername } from "./config.js";
import { formatCalendarEventGroupMessages } from "./events/calendarEvents.js";
import {
  getTodayRange,
  getNextSevenDaysRange,
  getTomorrowRange,
  getWeekendRange,
  type EventRangeKind,
} from "./events/eventRanges.js";
import { getEventsFromUserCalendars } from "./events/userCalendarEvents.js";
import { parseEventWaitingForCalendarPayload } from "./events/eventWaitingForCalendar.js";
import {
  extractLinksFromTextEntities,
  preserveHiddenLinksInText,
  type TelegramTextEntity,
} from "./telegram/linkExtraction.js";
import { getBotIdFromToken, shouldIgnoreBotAuthoredMessage } from "./telegram/messageGuards.js";
import { getTelegramEventSourceIdentity } from "./telegram/eventSourceIdentity.js";
import * as calendarsRepository from "./repositories/calendars.js";
import * as calendarMembersRepository from "./repositories/calendarMembers.js";
import * as googleConnectionsRepository from "./repositories/googleConnections.js";
import * as pendingActionsRepository from "./repositories/pendingActions.js";
import * as eventSourceClaimsRepository from "./repositories/eventSourceClaims.js";
import * as userSettingsRepository from "./repositories/userSettings.js";
import * as usersRepository from "./repositories/users.js";
import {
  checkCalendarAvailability,
  cleanupDeletedCalendar,
  createCalendarForUser,
  createGoogleCalendarEvent,
  getGoogleAccountTimeZoneForUser,
  GoogleEventBatchPartialFailureError,
  deleteRegistryGoogleCalendar,
  deleteCalendarForUser,
  getCalendarMetadata,
  listMeetoryCalendarsForUser,
  renameGoogleCalendar,
} from "./google/calendarService.js";
import { classifyGoogleApiError } from "./google/googleApiErrors.js";
import { revokeGoogleConnectionRefreshToken } from "./google/oauth.js";
import { getLanguage, getTelegramLanguage, messages } from "./i18n/index.js";
import {
  calendarCardKeyboard,
  calendarDeleteConfirmKeyboard,
  calendarLeaveConfirmKeyboard,
  calendarInviteReplyOptions,
  calendarMemberRemoveConfirmKeyboard,
  calendarMemberRemoveListKeyboard,
  calendarMembersKeyboard,
  alreadyCalendarMemberKeyboard,
  calendarsListKeyboard,
  connectGoogleKeyboard,
  createCalendarCancelKeyboard,
  emptyCalendarsKeyboard,
  calendarEventsReplyOptions,
  eventCalendarSelectionKeyboard,
  eventDraftKeyboard,
  eventEditFieldKeyboard,
  eventEditMenuKeyboard,
  eventsMenuKeyboard,
  eventSavedKeyboard,
  formatCalendarInviteMessage,
  formatCalendarJoinPreview,
  formatCalendarMembers,
  formatMainMenuMessage,
  formatSettingsMessage,
  formatTomorrowDigestSettings,
  formatWeekendDigestSettings,
  googleDisconnectConfirmKeyboard,
  languageSettingsKeyboard,
  mainCalendarKeyboard,
  noCalendarsKeyboard,
  reconnectGoogleKeyboard,
  renameCalendarCancelKeyboard,
  settingsKeyboard,
  calendarJoinPreviewKeyboard,
  calendarJoinedKeyboard,
  tomorrowDigestSettingsKeyboard,
  weekendDigestSettingsKeyboard,
  type CalendarMemberListItem,
  type MainMenuMode,
} from "./telegramScreens.js";

const CREATE_CALENDAR_TTL_MS = 15 * 60 * 1000;
const EVENT_DRAFT_TTL_MS = 30 * 60 * 1000;
const token = process.env.TELEGRAM_API_TOKEN?.trim();
const configuredBotId = getBotIdFromToken(token);

function createBot() {
  if (!token) {
    console.error("[startup] bot not created", {
      reason: "missing_telegram_token",
    });

    return null;
  }

  try {
    const telegramBot = new Bot(token);

    console.info("[startup] bot created", {
      botIdFromToken: configuredBotId,
    });

    return telegramBot;
  } catch (error) {
    console.error("[startup] bot not created", {
      reason: "bot_constructor_failed",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

export type ReplyTarget = {
  reply: Context["reply"];
};

type ProcessingMessage = {
  chatId: number | string;
  messageId: number;
};

type ResolvedCalendarList = Awaited<ReturnType<typeof resolveCalendarsForUser>>;

type RenameCalendarPayload = {
  calendarId: string;
};

type ResolvedEventCalendar = {
  id: string;
  summary: string;
  timeZone: string;
};

function getEventSourceIdentity(ctx: Context): ConfirmEventSourceIdentity {
  return getTelegramEventSourceIdentity({
    message: ctx.message,
    updateId: ctx.update.update_id,
  });
}

function getRawMessageTextForLog(ctx: Context) {
  const message = ctx.message;
  const text = message && "text" in message && typeof message.text === "string" ? message.text : null;
  const caption = message && "caption" in message && typeof message.caption === "string" ? message.caption : null;
  const source = text ?? caption ?? "";

  return source.replace(/\s+/g, " ").trim().slice(0, 80) || null;
}

function getForwardOriginType(ctx: Context) {
  const message = ctx.message as ({ forward_origin?: { type?: string } } | undefined);

  return message?.forward_origin?.type ?? null;
}

function getMessageHandlerLogContext(ctx: Context, handlerName: string) {
  const message = ctx.message;
  const messageWithExtras = message as ({
    via_bot?: { id?: number | string };
    sender_chat?: { id?: number | string };
    from?: { id?: number | string; is_bot?: boolean };
  } | undefined);

  return {
    updateId: ctx.update.update_id,
    chatId: message?.chat.id ?? null,
    messageId: message?.message_id ?? null,
    fromId: ctx.from?.id ?? messageWithExtras?.from?.id ?? null,
    fromIsBot: ctx.from?.is_bot ?? messageWithExtras?.from?.is_bot ?? null,
    viaBotId: messageWithExtras?.via_bot?.id ?? null,
    senderChatId: messageWithExtras?.sender_chat?.id ?? null,
    textPreview: getRawMessageTextForLog(ctx),
    forwardOriginType: getForwardOriginType(ctx),
    handlerName,
  };
}

function logEventAnalysisIgnored(ctx: Context, reason: string, handlerName: string) {
  const message = ctx.message;

  console.info("[event-analysis:ignored]", {
    updateId: ctx.update.update_id,
    chatId: message?.chat.id ?? null,
    messageId: message?.message_id ?? null,
    reason,
    handlerName,
  });
}

function logEventAnalysisAccepted(ctx: Context, handlerName: string) {
  const message = ctx.message;
  const messageWithExtras = message as ({ from?: { id?: number | string; is_bot?: boolean } } | undefined);

  console.info("[event-analysis:accepted]", {
    updateId: ctx.update.update_id,
    chatId: message?.chat.id ?? null,
    messageId: message?.message_id ?? null,
    fromId: ctx.from?.id ?? messageWithExtras?.from?.id ?? null,
    fromIsBot: ctx.from?.is_bot ?? messageWithExtras?.from?.is_bot ?? null,
    handlerName,
  });
}

export const bot = createBot();

bot?.catch((error) => {
  console.error("Telegram bot error:", {
    operation: "telegram_update",
    errorName: error.error instanceof Error ? error.error.name : typeof error.error,
    errorMessage: error.error instanceof Error ? error.error.message : String(error.error),
  });
});

async function upsertTelegramUser(ctx: Context) {
  const from = ctx.from;

  if (!from) {
    return null;
  }

  return usersRepository.upsertTelegramUser({
    telegramId: String(from.id),
    telegramUsername: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    language: getTelegramLanguage(from.language_code),
  });
}

async function resolveCalendarsForUser(user: usersRepository.User) {
  const checkedCalendars = await listMeetoryCalendarsForUser(user.id);
  const available = checkedCalendars
    .filter((result) => result.status === "available")
    .map((result) => ({
      id: result.calendar.id,
      summary: result.metadata.summary,
    }));
  const deleted = checkedCalendars.filter((result) => result.status === "calendar_not_found");
  const accessDenied = checkedCalendars.filter((result) => result.status === "calendar_access_denied");
  const oauthInvalid = checkedCalendars.filter((result) => result.status === "oauth_invalid");
  const ownerGoogleUnavailable = checkedCalendars.filter((result) => result.status === "owner_google_unavailable");
  const ownedOwnerGoogleUnavailable = ownerGoogleUnavailable.filter((result) => result.calendar.created_by_user_id === user.id);
  const temporaryFailures = checkedCalendars.filter((result) =>
    result.status === "rate_limited" || result.status === "temporary_google_error" || result.status === "unknown"
  );

  for (const deletedCalendar of deleted) {
    await cleanupDeletedCalendar(deletedCalendar.calendar);
  }

  let activeCalendarId = user.active_calendar_id;

  if (activeCalendarId && !available.some((calendar) => calendar.id === activeCalendarId)) {
    activeCalendarId = null;
  }

  if (!activeCalendarId && available[0]) {
    await usersRepository.setActiveCalendar(user.id, available[0].id);
    activeCalendarId = available[0].id;
  }

  return {
    available,
    activeCalendarId,
    deletedCount: deleted.length,
    accessDeniedCount: accessDenied.length,
    oauthInvalidCount: oauthInvalid.length,
    ownerGoogleUnavailableCount: ownerGoogleUnavailable.length,
    ownedOwnerGoogleUnavailableCount: ownedOwnerGoogleUnavailable.length,
    temporaryFailureCount: temporaryFailures.length,
  };
}

function recoveryMessages(language: ReturnType<typeof getLanguage>, resolved: ResolvedCalendarList) {
  const lines: string[] = [];

  if (resolved.deletedCount > 0) {
    lines.push(messages.calendarDeletedInGoogle(language));
  }

  if (resolved.accessDeniedCount > 0) {
    lines.push(messages.calendarAccessLost(language));
  }

  if (resolved.oauthInvalidCount > 0) {
    lines.push(messages.googleConnectionExpired(language));
  }

  if (resolved.ownerGoogleUnavailableCount > 0) {
    lines.push(messages.ownerGoogleUnavailable(language));
  }

  if (resolved.temporaryFailureCount > 0) {
    lines.push(messages.googleCalendarTemporaryUnavailable(language));
  }

  return lines;
}

function getCalendarIdFromCallback(data: string, prefix: string) {
  return data.startsWith(prefix) ? data.slice(prefix.length) : "";
}

function parseCalendarMemberCallback(data: string, prefix: string) {
  if (!data.startsWith(prefix)) {
    return null;
  }

  const [calendarId, userId] = data.slice(prefix.length).split(":");

  if (!calendarId || !userId) {
    return null;
  }

  return { calendarId, userId };
}

function parseRenameCalendarPayload(payload: unknown): RenameCalendarPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const calendarId = (payload as { calendarId?: unknown }).calendarId;

  return typeof calendarId === "string" && calendarId ? { calendarId } : null;
}

function formatMemberDisplayName(member: usersRepository.User, language: ReturnType<typeof getLanguage>) {
  const name = [member.first_name, member.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  if (name) {
    return name;
  }

  if (member.telegram_username) {
    return `@${member.telegram_username}`;
  }

  return messages.calendarMemberFallbackName(language);
}

function formatInviteSenderName(user: usersRepository.User, language: ReturnType<typeof getLanguage>) {
  const name = [user.first_name, user.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  if (name) {
    return name;
  }

  if (user.first_name?.trim()) {
    return user.first_name.trim();
  }

  if (user.telegram_username) {
    return `@${user.telegram_username}`;
  }

  return messages.calendarInviteInviterFallback(language);
}

function parseCalendarJoinPayload(payload: unknown) {
  const rawToken = typeof payload === "object" && payload !== null
    ? (payload as { rawToken?: unknown }).rawToken
    : null;

  return typeof rawToken === "string" && rawToken ? { rawToken } : null;
}

async function getTelegramBotUsername() {
  const configured = getConfiguredTelegramBotUsername();

  if (configured) {
    return configured;
  }

  const me = await bot?.api.getMe();

  if (!me?.username) {
    throw new Error("Telegram bot username is unavailable");
  }

  return me.username;
}

export async function sendCalendarJoinPreview(target: ReplyTarget, user: usersRepository.User, rawToken: string) {
  const language = getLanguage(user.language);
  const preview = await getInvitePreviewByRawToken(rawToken, user.id);

  if (!preview) {
    await pendingActionsRepository.deleteByUserIdAndType(user.id, "calendar_join");

    return target.reply(messages.invalidCalendarInvite(language));
  }

  const ownerName = preview.owner
    ? formatMemberDisplayName(preview.owner, language)
    : messages.calendarMemberFallbackName(language);

  await pendingActionsRepository.deleteByUserIdAndType(user.id, "calendar_join");

  if (preview.alreadyMember) {
    return target.reply(messages.alreadyCalendarMember(language, preview.calendar.name), {
      reply_markup: alreadyCalendarMemberKeyboard({
        language,
        calendarId: preview.calendar.id,
      }),
    });
  }

  return target.reply(formatCalendarJoinPreview({
    language,
    calendarName: preview.calendar.name,
    ownerName,
    memberCount: preview.memberCount,
  }), {
    reply_markup: calendarJoinPreviewKeyboard({
      language,
      rawToken,
    }),
  });
}

async function startCalendarJoinFlow(target: ReplyTarget, user: usersRepository.User, rawToken: string) {
  const language = getLanguage(user.language);
  const preview = await getInvitePreviewByRawToken(rawToken, user.id);

  if (!preview) {
    return target.reply(messages.invalidCalendarInvite(language));
  }

  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    await pendingActionsRepository.upsertCalendarJoinAction(
      user.id,
      { rawToken },
      new Date(Date.now() + getCalendarInviteTtlDays() * 24 * 60 * 60 * 1000),
    );

    return target.reply(messages.welcome(language), {
      reply_markup: connectGoogleKeyboard(user.telegram_id, language),
    });
  }

  await pendingActionsRepository.deleteByUserIdAndType(user.id, "calendar_join");

  return sendCalendarJoinPreview(target, user, rawToken);
}

async function showCalendarInvite(target: ReplyTarget, user: usersRepository.User, calendarId: string) {
  const language = getLanguage(user.language);
  const access = await getCalendarAccess(calendarId, user.id);

  if (!access) {
    return target.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  if (!access.isOwner) {
    return target.reply(messages.deleteOwnerOnly(language));
  }

  const checked = await checkCalendarAvailability(access.calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(access.calendar);

    return target.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(target, user, checked.status, access.calendar);
  }

  const created = await createCalendarInviteLink({
    calendarId: access.calendar.id,
    ownerUserId: user.id,
    botUsername: await getTelegramBotUsername(),
  });

  return target.reply(formatCalendarInviteMessage({
    language,
    calendarName: checked.metadata.summary,
    inviteLink: created.inviteLink,
    ttlDays: created.ttlDays,
  }), calendarInviteReplyOptions({
    language,
    calendarId: access.calendar.id,
    calendarName: checked.metadata.summary,
    inviteLink: created.inviteLink,
    inviterName: formatInviteSenderName(user, language),
  }));
}

function formatDateForLanguage(date: string, language: ReturnType<typeof getLanguage>) {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function compareIsoDates(left: string, right: string) {
  return left.localeCompare(right);
}

function addDaysToIsoDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);

  return parsed.toISOString().slice(0, 10);
}

function countInclusiveDates(startDate: string, endDate: string) {
  let count = 0;
  let current = startDate;

  while (compareIsoDates(current, endDate) <= 0) {
    count += 1;

    if (count > 31) {
      return count;
    }

    current = addDaysToIsoDate(current, 1);
  }

  return count;
}

function formatDateRangeForLanguage(startDate: string, endDate: string, language: ReturnType<typeof getLanguage>) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const locale = language === "ru" ? "ru-RU" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).formatRange(start, end);
}

function formatEventTime(draft: ConfirmEventPayload, language: ReturnType<typeof getLanguage>) {
  if (draft.scheduleType === "daily_range" && draft.startTime && draft.endTime) {
    return messages.eventDailyTime(language, `${draft.startTime}–${draft.endTime}`);
  }

  if (draft.isAllDay) {
    return messages.eventAllDay(language);
  }

  if (!draft.startTime) {
    return messages.eventTimeNotSpecified(language);
  }

  return draft.endTime
    ? `${draft.startTime}–${draft.endTime}`
    : draft.startTime;
}

async function sendProcessingMessage(ctx: Context, language: ReturnType<typeof getLanguage>) {
  try {
    await ctx.replyWithChatAction("typing");
  } catch (error) {
    console.error("Telegram chat action failed:", {
      operation: "send_event_processing_chat_action",
      userId: ctx.from?.id ? String(ctx.from.id) : null,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const message = await ctx.reply(messages.eventProcessing(language));

    return {
      chatId: message.chat.id,
      messageId: message.message_id,
    } satisfies ProcessingMessage;
  } catch (error) {
    console.error("Telegram processing message failed:", {
      operation: "send_event_processing_message",
      userId: ctx.from?.id ? String(ctx.from.id) : null,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

async function removeProcessingMessage(ctx: Context, processingMessage: ProcessingMessage | null) {
  if (!processingMessage) {
    return;
  }

  try {
    await ctx.api.deleteMessage(processingMessage.chatId, processingMessage.messageId);
  } catch (error) {
    console.error("Telegram processing message delete failed:", {
      operation: "delete_event_processing_message",
      userId: ctx.from?.id ? String(ctx.from.id) : null,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function editProcessingMessage(
  ctx: Context,
  processingMessage: ProcessingMessage | null,
  text: string,
  options?: Parameters<Context["api"]["editMessageText"]>[3],
) {
  if (!processingMessage) {
    const message = await ctx.reply(text, options as Parameters<Context["reply"]>[1]);

    return {
      chatId: message.chat.id,
      messageId: message.message_id,
    } satisfies ProcessingMessage;
  }

  try {
    await ctx.api.editMessageText(processingMessage.chatId, processingMessage.messageId, text, options);

    return processingMessage;
  } catch (error) {
    console.error("Telegram processing message edit failed:", {
      operation: "edit_event_processing_message",
      userId: ctx.from?.id ? String(ctx.from.id) : null,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    await removeProcessingMessage(ctx, processingMessage);

    const message = await ctx.reply(text, options as Parameters<Context["reply"]>[1]);

    return {
      chatId: message.chat.id,
      messageId: message.message_id,
    } satisfies ProcessingMessage;
  }
}

function getLocalDateTimeInTimeZone(timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function extractMessageText(ctx: Context) {
  const input = getMessageTextAndEntities(ctx);

  if (!input?.text.trim()) {
    return null;
  }

  return preserveHiddenLinksInText(input);
}

function getMessageTextAndEntities(ctx: Context) {
  const message = ctx.message;
  const text = message && "text" in message && typeof message.text === "string" ? message.text : null;
  const caption = message && "caption" in message && typeof message.caption === "string" ? message.caption : null;

  if (text) {
    return {
      text,
      entities: message && "entities" in message && Array.isArray(message.entities)
        ? message.entities as TelegramTextEntity[]
        : [],
    };
  }

  if (caption) {
    return {
      text: caption,
      entities: message && "caption_entities" in message && Array.isArray(message.caption_entities)
        ? message.caption_entities as TelegramTextEntity[]
        : [],
    };
  }

  return null;
}

function extractDetectedLinks(ctx: Context): DetectedLink[] {
  const input = getMessageTextAndEntities(ctx);

  if (!input) {
    return [];
  }

  const result = extractLinksFromTextEntities(input);

  console.info("[links:extracted]", result.summary);

  return result.links;
}

function getForwardContext(ctx: Context) {
  const message = ctx.message as { forward_origin?: unknown } | undefined;

  if (!message?.forward_origin || typeof message.forward_origin !== "object") {
    return null;
  }

  const origin = message.forward_origin as { type?: unknown };

  return typeof origin.type === "string" ? `forward_origin:${origin.type}` : "forwarded";
}

async function getUserFromCallback(ctx: Context) {
  return ctx.from
    ? usersRepository.findByTelegramId(String(ctx.from.id))
    : null;
}

async function clearRenamePendingAction(userId: string) {
  await pendingActionsRepository.deleteByUserIdAndType(userId, "rename_calendar");
}

async function getMemberCalendar(userId: string, calendarId: string) {
  return (await getCalendarAccess(calendarId, userId))?.calendar ?? null;
}

async function resolveEventCalendarsForUser(user: usersRepository.User) {
  const checkedCalendars = await listMeetoryCalendarsForUser(user.id);
  const available = checkedCalendars
    .filter((result) => result.status === "available")
    .map((result) => ({
      id: result.calendar.id,
      summary: result.metadata.summary,
      timeZone: result.metadata.timeZone ?? "UTC",
    }));

  for (const deletedCalendar of checkedCalendars.filter((result) => result.status === "calendar_not_found")) {
    await cleanupDeletedCalendar(deletedCalendar.calendar);
  }

  let selected = user.active_calendar_id
    ? available.find((calendar) => calendar.id === user.active_calendar_id) ?? null
    : null;

  if (!selected && available[0]) {
    selected = available[0];
    await usersRepository.setActiveCalendar(user.id, selected.id);
  }

  return {
    available,
    selected,
    hasOauthProblem: checkedCalendars.some((result) => result.status === "oauth_invalid"),
    hasOwnerGoogleProblem: checkedCalendars.some((result) => result.status === "owner_google_unavailable"),
    hasAccessProblem: checkedCalendars.some((result) => result.status === "calendar_access_denied"),
    hasTemporaryProblem: checkedCalendars.some((result) =>
      result.status === "rate_limited" || result.status === "temporary_google_error" || result.status === "unknown"
    ),
  };
}

async function getSelectedEventCalendar(user: usersRepository.User, calendarId: string) {
  const calendar = await getMemberCalendar(user.id, calendarId);

  if (!calendar) {
    return null;
  }

  const checked = await checkCalendarAvailability(calendar);

  if (checked.status !== "available") {
    return null;
  }

  return {
    id: calendar.id,
    summary: checked.metadata.summary,
    timeZone: checked.metadata.timeZone ?? "UTC",
  } satisfies ResolvedEventCalendar;
}

type EventsRangeType = EventRangeKind;

function computeEventsRange(kind: EventsRangeType, timeZone: string, now = new Date()) {
  if (kind === "today") {
    return getTodayRange({ now, timeZone });
  }

  if (kind === "tomorrow") {
    return getTomorrowRange({ now, timeZone });
  }

  if (kind === "weekend") {
    return getWeekendRange({ now, timeZone });
  }

  return getNextSevenDaysRange({ now, timeZone });
}

async function replyEventsForRange(
  target: ReplyTarget,
  user: usersRepository.User,
  kind: EventsRangeType,
) {
  const language = getLanguage(user.language);
  const calendarRecords = await calendarsRepository.findForUser(user.id);

  if (calendarRecords.length === 0) {
    return target.reply(messages.noCalendars(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  const now = new Date();
  const timeZone = await getGoogleAccountTimeZoneForUser(user.id) ?? "UTC";
  const range = computeEventsRange(kind, timeZone, now);
  const result = await getEventsFromUserCalendars({
    userId: user.id,
    range,
    now,
    timeZone,
  });

  if (result.groups.length === 0 && result.errors.length === result.totalCalendars && result.totalCalendars > 0) {
    return target.reply(messages.allCalendarEventsLoadFailed(language), {
      reply_markup: eventsMenuKeyboard(language),
    });
  }

  if (result.groups.length === 0) {
    return target.reply(messages.emptyEventsForAllCalendars(language, kind), {
      reply_markup: eventsMenuKeyboard(language),
    });
  }

  const chunks = formatCalendarEventGroupMessages({
    periodTitle: messages.eventsPeriodTitle(language, kind),
    groups: result.groups,
    errorCalendarNames: result.errors.map((error) => error.calendar.name),
    language,
    timeZone,
  });

  for (const [index, chunk] of chunks.entries()) {
    await target.reply(chunk.text, calendarEventsReplyOptions({
      language,
      includeNavigation: index === chunks.length - 1,
    }));
  }
}

async function showEventsMenu(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);

  return target.reply(messages.eventsMenuTitle(language), {
    reply_markup: eventsMenuKeyboard(language),
  });
}

async function handleEventsRange(target: ReplyTarget, user: usersRepository.User, kind: EventsRangeType) {
  return replyEventsForRange(target, user, kind);
}

async function getSettingsTimeZone(userId: string) {
  return await getGoogleAccountTimeZoneForUser(userId) ?? "UTC";
}

async function showSettingsMenu(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const settings = await userSettingsRepository.getOrCreate(user.id);
  const timeZone = await getSettingsTimeZone(user.id);

  return target.reply(formatSettingsMessage({
    language,
    selectedLanguage: language,
    tomorrowDigestEnabled: settings.tomorrow_digest_enabled,
    tomorrowDigestTime: settings.tomorrow_digest_time,
    weekendDigestEnabled: settings.weekend_digest_enabled,
    weekendDigestWeekday: settings.weekend_digest_weekday,
    weekendDigestTime: settings.weekend_digest_time,
    timeZone,
  }), {
    reply_markup: settingsKeyboard(language),
  });
}

async function showLanguageSettings(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);

  return target.reply(messages.settingsChooseLanguage(language), {
    reply_markup: languageSettingsKeyboard(language, language),
  });
}

async function showTomorrowDigestSettings(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const settings = await userSettingsRepository.getOrCreate(user.id);

  return target.reply(formatTomorrowDigestSettings({
    language,
    enabled: settings.tomorrow_digest_enabled,
    time: settings.tomorrow_digest_time,
  }), {
    reply_markup: tomorrowDigestSettingsKeyboard({
      language,
      enabled: settings.tomorrow_digest_enabled,
      time: settings.tomorrow_digest_time,
    }),
  });
}

async function showWeekendDigestSettings(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const settings = await userSettingsRepository.getOrCreate(user.id);

  return target.reply(formatWeekendDigestSettings({
    language,
    enabled: settings.weekend_digest_enabled,
    weekday: settings.weekend_digest_weekday,
    time: settings.weekend_digest_time,
  }), {
    reply_markup: weekendDigestSettingsKeyboard({
      language,
      enabled: settings.weekend_digest_enabled,
      weekday: settings.weekend_digest_weekday,
      time: settings.weekend_digest_time,
    }),
  });
}

function formatEventDraftMessage(
  language: ReturnType<typeof getLanguage>,
  draft: ConfirmEventPayload,
  calendarName: string,
) {
  const linkLines = formatEventLinkLines(draft);

  if ((draft.scheduleType === "daily_range" || draft.scheduleType === "all_day_range") && draft.endDate) {
    const eventCount = countInclusiveDates(draft.startDate, draft.endDate);

    const lines = [
      messages.multiDayEventDraftTitle(language),
      "",
      `🎫 ${draft.title}`,
      `📅 ${formatDateRangeForLanguage(draft.startDate, draft.endDate, language)}`,
      `🕒 ${formatEventTime(draft, language)}`,
      `📍 ${draft.location ?? messages.eventLocationNotSpecified(language)}`,
      draft.price ? `💰 ${draft.price}` : null,
      ...linkLines,
      "",
    ].filter((line): line is string => line !== null);

    if (draft.scheduleType === "daily_range") {
      lines.push(messages.dailyRangeEventsWillBeCreated(language, eventCount), "");
    }

    lines.push(messages.eventSaveTo(language), `📅 ${calendarName}`);

    return lines.join("\n");
  }

  return [
    messages.eventDraftTitle(language),
    "",
    `🎫 ${draft.title}`,
    `📅 ${formatDateForLanguage(draft.startDate, language)}`,
    `🕒 ${formatEventTime(draft, language)}`,
    `📍 ${draft.location ?? messages.eventLocationNotSpecified(language)}`,
    draft.price ? `💰 ${draft.price}` : null,
    ...linkLines,
    "",
    messages.eventSaveTo(language),
    `📅 ${calendarName}`,
  ].filter((line): line is string => line !== null).join("\n");
}

function formatEventLinkLines(draft: Pick<ConfirmEventPayload, "eventUrl" | "locationUrl" | "sourceUrl">) {
  return [
    draft.eventUrl ? `🔗 Event: ${draft.eventUrl}` : null,
    draft.locationUrl ? `📍 Map: ${draft.locationUrl}` : null,
    draft.sourceUrl ? `↗️ Source: ${draft.sourceUrl}` : null,
  ].filter((line): line is string => Boolean(line));
}

function validateParsedEventSchedule(parsed: ParsedEvent, language: ReturnType<typeof getLanguage>) {
  if (parsed.scheduleType !== "daily_range" && parsed.scheduleType !== "all_day_range") {
    return null;
  }

  if (!parsed.startDate || !parsed.endDate) {
    return messages.eventMissingDate(language);
  }

  if (compareIsoDates(parsed.endDate, parsed.startDate) < 0) {
    return messages.eventMissingDate(language);
  }

  if (parsed.scheduleType === "daily_range" && (!parsed.startTime || !parsed.endTime)) {
    return messages.eventMissingDate(language);
  }

  if (parsed.scheduleType === "daily_range" && countInclusiveDates(parsed.startDate, parsed.endDate) > 31) {
    return messages.eventRangeTooLong(language);
  }

  return null;
}

function formatEventSavedDate(draft: ConfirmEventPayload, language: ReturnType<typeof getLanguage>) {
  return draft.scheduleType === "daily_range" && draft.endDate
    ? formatDateRangeForLanguage(draft.startDate, draft.endDate, language)
    : draft.scheduleType === "all_day_range" && draft.endDate
      ? formatDateRangeForLanguage(draft.startDate, draft.endDate, language)
    : formatDateForLanguage(draft.startDate, language);
}

function formatEventSavedTime(draft: ConfirmEventPayload, language: ReturnType<typeof getLanguage>) {
  return draft.scheduleType === "daily_range" ? formatEventTime(draft, language) : null;
}

async function replyEventDraft(
  target: Context,
  user: usersRepository.User,
  draft: ConfirmEventPayload,
  processingMessage: ProcessingMessage | null = null,
) {
  const language = getLanguage(user.language);
  const selectedCalendar = await getSelectedEventCalendar(user, draft.calendarId);

  if (!selectedCalendar) {
    return editProcessingMessage(target, processingMessage, messages.calendarNotFoundOrAccessDenied(language));
  }

  return editProcessingMessage(target, processingMessage, formatEventDraftMessage(language, draft, selectedCalendar.summary), {
    reply_markup: eventDraftKeyboard(language, selectedCalendar.summary, draft.draftId),
  });
}

async function showUpdatedEventDraft(ctx: Context, user: usersRepository.User, draft: ConfirmEventPayload) {
  const language = getLanguage(user.language);
  const selectedCalendar = await getSelectedEventCalendar(user, draft.calendarId);

  if (!selectedCalendar) {
    const message = await ctx.reply(messages.calendarNotFoundOrAccessDenied(language));

    return {
      ...draft,
      previewChatId: String(message.chat.id),
      previewMessageId: String(message.message_id),
    };
  }

  const text = formatEventDraftMessage(language, draft, selectedCalendar.summary);
  const replyMarkup = eventDraftKeyboard(language, selectedCalendar.summary, draft.draftId);

  if (draft.previewChatId && draft.previewMessageId) {
    try {
      await ctx.api.deleteMessage(draft.previewChatId, Number(draft.previewMessageId));
    } catch (error) {
      console.error("Event preview delete failed:", {
        operation: "delete_old_event_preview",
        userId: user.id,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const message = await ctx.reply(text, {
    reply_markup: replyMarkup,
  });

  return {
    ...draft,
    previewChatId: String(message.chat.id),
    previewMessageId: String(message.message_id),
  };
}

async function discardCurrentEventDraft(ctx: Context, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const pendingAction = await pendingActionsRepository.findByUserIdAndType(user.id, "confirm_event");
  const draft = pendingAction ? parseConfirmEventPayload(pendingAction.payload) : null;

  return discardEventDraft({
    draft,
    discardedMessage: messages.eventDraftDiscarded(language),
    clearDraft: () => pendingActionsRepository.deleteByUserId(user.id),
    deletePreview: (chatId, messageId) => ctx.api.deleteMessage(chatId, messageId).then(() => undefined),
    sendMessage: (text) => ctx.reply(text).then(() => undefined),
    logPreviewDeleteError: (error) => {
      console.error("Event preview delete failed:", {
        operation: "discard_event_draft_preview",
        userId: user.id,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

async function parseMessageAsEvent(
  ctx: Context,
  user: usersRepository.User,
  text: string,
  forwardContext: string | null,
  detectedLinks: DetectedLink[],
  sourceIdentity: ConfirmEventSourceIdentity,
) {
  const eventTraceId = randomUUID();
  const language = getLanguage(user.language);

  const processingMessage = await sendProcessingMessage(ctx, language);

  try {
    const eventCalendars = await resolveEventCalendarsForUser(user);

    if (!eventCalendars.selected) {
      if (eventCalendars.hasOauthProblem) {
        return editProcessingMessage(ctx, processingMessage, messages.googleConnectionExpired(language), {
          reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
        });
      }

      if (eventCalendars.hasOwnerGoogleProblem) {
        return editProcessingMessage(ctx, processingMessage, messages.ownerGoogleUnavailable(language));
      }

      if (eventCalendars.hasAccessProblem) {
        return editProcessingMessage(ctx, processingMessage, messages.calendarAccessLost(language), {
          reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
        });
      }

      if (eventCalendars.hasTemporaryProblem) {
        return editProcessingMessage(ctx, processingMessage, messages.googleCalendarTemporaryUnavailable(language));
      }

      await pendingActionsRepository.upsertEventWaitingForCalendarAction(
        user.id,
        {
          text,
          forwardContext,
          detectedLinks,
          sourceIdentity,
        },
        new Date(Date.now() + EVENT_DRAFT_TTL_MS),
      );

      return editProcessingMessage(ctx, processingMessage, messages.createCalendarBeforeEvents(language), {
        reply_markup: emptyCalendarsKeyboard(language),
      });
    }

    const now = getLocalDateTimeInTimeZone(eventCalendars.selected.timeZone);
    let parsed: ParsedEvent;

    try {
      console.info("[event-parse:started]", {
        traceId: eventTraceId,
        sourceTelegramChatId: sourceIdentity.chatId,
        sourceTelegramMessageId: sourceIdentity.messageId,
        sourceTelegramUpdateId: sourceIdentity.updateId,
      });

      parsed = await parseEvent({
        text,
        language,
        currentDate: now.date,
        currentLocalTime: now.time,
        timeZone: eventCalendars.selected.timeZone,
        forwardContext,
        detectedLinks,
      });
      parsed = applyLinkFallback(parsed, detectedLinks);

      console.info("[event-parse:finished]", {
        traceId: eventTraceId,
        sourceTelegramChatId: sourceIdentity.chatId,
        sourceTelegramMessageId: sourceIdentity.messageId,
        sourceTelegramUpdateId: sourceIdentity.updateId,
        isEvent: parsed.isEvent,
        scheduleType: parsed.scheduleType,
      });

      console.info("[event-time:parsed]", {
        traceId: eventTraceId,
        startDate: parsed.startDate,
        startTime: parsed.startTime,
        endDate: parsed.endDate,
        endTime: parsed.endTime,
        scheduleType: parsed.scheduleType,
      });

      console.info("[event-parser:links]", {
        traceId: eventTraceId,
        hasEventUrl: Boolean(parsed.eventUrl),
        hasLocationUrl: Boolean(parsed.locationUrl),
        hasSourceUrl: Boolean(parsed.sourceUrl),
        eventUrlHost: getUrlHostForLog(parsed.eventUrl),
        locationUrlHost: getUrlHostForLog(parsed.locationUrl),
        sourceUrlHost: getUrlHostForLog(parsed.sourceUrl),
      });
    } catch (error) {
      const errorKind = classifyOpenAIError(error);

      console.error("OpenAI event parsing failed:", {
        operation: "parse_event",
        userId: user.id,
        provider: "openai",
        errorKind,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      if (errorKind === "missing_api_key") {
        return editProcessingMessage(ctx, processingMessage, messages.eventParserNotConfigured(language));
      }

      if (errorKind === "insufficient_quota") {
        return editProcessingMessage(ctx, processingMessage, messages.eventParserBillingUnavailable(language));
      }

      if (errorKind === "rate_limited") {
        return editProcessingMessage(ctx, processingMessage, messages.eventParserRateLimited(language));
      }

      return editProcessingMessage(ctx, processingMessage, messages.eventParseTemporaryError(language));
    }

    if (!parsed.isEvent) {
      return editProcessingMessage(ctx, processingMessage, messages.eventNotFound(language));
    }

    if (!parsed.title) {
      return editProcessingMessage(ctx, processingMessage, messages.eventMissingTitle(language));
    }

    if (!parsed.startDate) {
      return editProcessingMessage(ctx, processingMessage, messages.eventMissingDate(language));
    }

    const scheduleValidationError = validateParsedEventSchedule(parsed, language);

    if (scheduleValidationError) {
      return editProcessingMessage(ctx, processingMessage, scheduleValidationError);
    }

    const sourceDescription = buildCalendarDescription({
      sourceText: text,
      parsedTitle: parsed.title,
      eventUrl: parsed.eventUrl,
      locationUrl: parsed.locationUrl,
      sourceUrl: parsed.sourceUrl,
      extractedLinks: detectedLinks,
    });
    const draft = buildConfirmEventPayload(
      parsed,
      eventCalendars.selected.id,
      eventTraceId,
      sourceDescription,
      sourceIdentity,
    );

    await pendingActionsRepository.upsertConfirmEventAction(
      user.id,
      draft,
      new Date(Date.now() + EVENT_DRAFT_TTL_MS),
    );

    console.info("[event-time:draft-written]", {
      traceId: draft.eventTraceId,
      payloadVersion: draft.payloadVersion,
      startDate: draft.startDate,
      startTime: draft.startTime,
      endDate: draft.endDate,
      endTime: draft.endTime,
    });

    const previewMessage = await replyEventDraft(ctx, user, draft, processingMessage);
    const draftWithPreview = previewMessage
      ? {
        ...draft,
        previewChatId: String(previewMessage.chatId),
        previewMessageId: String(previewMessage.messageId),
      }
      : draft;

    if (previewMessage) {
      await pendingActionsRepository.updateConfirmEventPayload(user.id, draftWithPreview);
    }

    console.info("[event-preview:sent]", {
      traceId: eventTraceId,
      sourceTelegramChatId: sourceIdentity.chatId,
      sourceTelegramMessageId: sourceIdentity.messageId,
      sourceTelegramUpdateId: sourceIdentity.updateId,
    });

    return;
  } catch (error) {
    console.error("Event message processing failed:", {
      operation: "process_event_message",
      userId: user.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return editProcessingMessage(ctx, processingMessage, messages.eventAnalyseFailed(language));
  }
}

async function replyCalendarProblem(
  target: ReplyTarget,
  user: usersRepository.User,
  status: string,
  calendar?: calendarsRepository.Calendar,
) {
  const language = getLanguage(user.language);

  if (status === "calendar_not_found") {
    return target.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (status === "calendar_access_denied") {
    return target.reply(messages.calendarAccessLost(language), {
      reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
    });
  }

  if (status === "oauth_invalid") {
    return target.reply(messages.googleConnectionExpired(language), {
      reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
    });
  }

  if (status === "owner_google_unavailable") {
    return target.reply(messages.ownerGoogleUnavailable(language), calendar?.created_by_user_id === user.id
      ? { reply_markup: reconnectGoogleKeyboard(user.telegram_id, language) }
      : undefined);
  }

  if (status === "rate_limited" || status === "temporary_google_error") {
    return target.reply(messages.googleCalendarTemporaryUnavailable(language));
  }

  if (status === "primary_calendar") {
    return target.reply(messages.primaryCalendarDeleteDenied(language));
  }

  return target.reply(messages.genericCreateError(language));
}

async function openCalendarCard(target: ReplyTarget, user: usersRepository.User, calendarId: string) {
  const language = getLanguage(user.language);
  const access = await getCalendarAccess(calendarId, user.id);

  if (!access) {
    return target.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const calendar = access.calendar;
  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return target.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(target, user, checked.status, calendar);
  }

  const members = await calendarMembersRepository.listCalendarMembers(calendar.id);
  const owner = members.find((member) => member.role === "owner");
  const ownerName = owner
    ? formatMemberDisplayName(owner, language)
    : messages.calendarMemberFallbackName(language);

  return target.reply(messages.calendarCard(language, {
    calendarName: checked.metadata.summary,
    ownerName,
    memberCount: members.length,
    isActive: user.active_calendar_id === calendar.id,
  }), {
    reply_markup: calendarCardKeyboard({
      language,
      calendarId: calendar.id,
      isActive: user.active_calendar_id === calendar.id,
      canManage: access.isOwner,
      canLeave: !access.isOwner,
    }),
  });
}

async function showCalendarMembers(target: ReplyTarget, user: usersRepository.User, calendarId: string) {
  const language = getLanguage(user.language);
  const access = await getCalendarAccess(calendarId, user.id);

  if (!access) {
    return target.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const checked = await checkCalendarAvailability(access.calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(access.calendar);

    return target.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(target, user, checked.status, access.calendar);
  }

  const members = await calendarMembersRepository.listCalendarMembers(access.calendar.id);
  const memberItems: CalendarMemberListItem[] = members.map((member) => ({
    userId: member.id,
    displayName: formatMemberDisplayName(member, language),
    role: member.role,
  }));

  return target.reply(formatCalendarMembers({
    language,
    calendarName: checked.metadata.summary,
    members: memberItems,
  }), {
    reply_markup: calendarMembersKeyboard({
      language,
      calendarId: access.calendar.id,
      canManage: access.isOwner,
      canLeave: !access.isOwner,
      members: memberItems,
    }),
  });
}

async function showHome(target: ReplyTarget, user: usersRepository.User, mode: MainMenuMode = "welcome") {
  const language = getLanguage(user.language);
  const calendarRecords = await calendarsRepository.findForUser(user.id);

  if (calendarRecords.length === 0) {
    const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

    if (!googleConnection) {
      return target.reply(messages.welcome(language), {
        reply_markup: connectGoogleKeyboard(user.telegram_id, language),
      });
    }

    return target.reply(messages.noCalendars(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  const resolved = await resolveCalendarsForUser(user);
  const activeCalendar = resolved.available.find((calendar) => calendar.id === resolved.activeCalendarId);
  const notices = recoveryMessages(language, resolved);

  if (activeCalendar) {
    return target.reply(formatMainMenuMessage({
      language,
      calendarName: activeCalendar.summary,
      mode,
      notices,
    }), {
      reply_markup: mainCalendarKeyboard(language),
    });
  }

  if (resolved.oauthInvalidCount > 0 || resolved.accessDeniedCount > 0) {
    return target.reply(notices.join("\n\n"), {
      reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
    });
  }

  if (resolved.ownerGoogleUnavailableCount > 0) {
    return target.reply(notices.join("\n\n"), resolved.ownedOwnerGoogleUnavailableCount > 0
      ? { reply_markup: reconnectGoogleKeyboard(user.telegram_id, language) }
      : undefined);
  }

  if (resolved.temporaryFailureCount > 0) {
    return target.reply(notices.join("\n\n"));
  }

  if (resolved.deletedCount > 0) {
    return target.reply([
      ...notices,
      "",
      messages.noCalendars(language),
    ].join("\n"), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  return target.reply(messages.noCalendars(language), {
    reply_markup: noCalendarsKeyboard(language),
  });
}

async function replyCalendarsList(target: ReplyTarget, user: usersRepository.User, prefix?: string) {
  const language = getLanguage(user.language);
  const calendarRecords = await calendarsRepository.findForUser(user.id);

  if (calendarRecords.length === 0) {
    return target.reply([
      prefix ?? null,
      prefix ? "" : null,
      messages.emptyCalendarsList(language),
    ].filter((line): line is string => line !== null).join("\n"), {
      reply_markup: emptyCalendarsKeyboard(language),
    });
  }

  const resolved = await resolveCalendarsForUser(user);
  const notices = recoveryMessages(language, resolved);

  if (resolved.available.length === 0) {
    if (resolved.oauthInvalidCount > 0 || resolved.accessDeniedCount > 0) {
      return target.reply(notices.join("\n\n"), {
        reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
      });
    }

    if (resolved.ownerGoogleUnavailableCount > 0) {
      return target.reply(notices.join("\n\n"), resolved.ownedOwnerGoogleUnavailableCount > 0
        ? { reply_markup: reconnectGoogleKeyboard(user.telegram_id, language) }
        : undefined);
    }

    if (resolved.temporaryFailureCount > 0) {
      return target.reply(notices.join("\n\n"));
    }

    if (resolved.deletedCount > 0) {
      return target.reply([
        prefix ?? null,
        prefix ? "" : null,
        ...notices,
        "",
        messages.emptyCalendarsList(language),
      ].join("\n"), {
        reply_markup: emptyCalendarsKeyboard(language),
      });
    }

    return target.reply(messages.noCalendars(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  return target.reply([
    prefix ?? null,
    prefix ? "" : null,
    ...notices,
    notices.length > 0 ? "" : null,
    messages.calendarsTitle(language),
    resolved.accessDeniedCount + resolved.oauthInvalidCount + resolved.ownerGoogleUnavailableCount + resolved.temporaryFailureCount > 0
      ? messages.inaccessibleCalendarsNotice(
        language,
        resolved.accessDeniedCount + resolved.oauthInvalidCount + resolved.ownerGoogleUnavailableCount + resolved.temporaryFailureCount,
      )
      : null,
  ].filter((line): line is string => line !== null).join("\n"), {
    reply_markup: calendarsListKeyboard({
      language,
      calendars: resolved.available,
      activeCalendarId: resolved.activeCalendarId,
    }),
  });
}

async function startCreateCalendarFlow(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    return target.reply(messages.welcome(language), {
      reply_markup: connectGoogleKeyboard(user.telegram_id, language),
    });
  }

  await pendingActionsRepository.upsertCreateCalendarAction(
    user.id,
    new Date(Date.now() + CREATE_CALENDAR_TTL_MS),
  );

  return target.reply(messages.createCalendarPrompt(language), {
    reply_markup: createCalendarCancelKeyboard(language),
  });
}

async function startDisconnectGoogleFlow(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    return target.reply(messages.disconnectNotConnected(language));
  }

  const ownedCalendars = await calendarsRepository.findOwnedByUser(user.id);

  return target.reply(messages.disconnectConfirm(language, ownedCalendars.length > 0), {
    reply_markup: googleDisconnectConfirmKeyboard(language),
  });
}

function validateCalendarName(text: string) {
  const name = text.trim();

  if (name.length < 1 || name.length > 100) {
    return null;
  }

  return name;
}

bot?.command("start", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  const joinToken = parseCalendarJoinStartPayload(ctx.message?.text);

  if (joinToken) {
    return startCalendarJoinFlow(ctx, user, joinToken);
  }

  await clearRenamePendingAction(user.id);

  return showHome(ctx, user, "welcome");
});

bot?.command("newcalendar", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  await clearRenamePendingAction(user.id);

  return startCreateCalendarFlow(ctx, user);
});

bot?.command("calendars", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  await clearRenamePendingAction(user.id);

  return replyCalendarsList(ctx, user);
});

bot?.command("events", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  await clearRenamePendingAction(user.id);

  return showEventsMenu(ctx, user);
});

bot?.command("help", async (ctx) => {
  const user = await upsertTelegramUser(ctx);
  const language = getLanguage(user?.language);

  return ctx.reply(messages.help(language));
});

bot?.command("disconnect", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  return startDisconnectGoogleFlow(ctx, user);
});

bot?.on("callback_query:data", async (ctx, next) => {
  console.info("[callback:received]", {
    callbackData: ctx.callbackQuery.data,
    fromId: ctx.from?.id ?? null,
    messageId: ctx.callbackQuery.message?.message_id ?? null,
  });

  return next();
});

bot?.callbackQuery("calendar:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return;
  }

  await clearRenamePendingAction(user.id);

  return startCreateCalendarFlow(ctx, user);
});

bot?.callbackQuery("calendar:create:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;

  if (!user) {
    return;
  }

  await pendingActionsRepository.deleteByUserId(user.id);

  return replyCalendarsList(ctx, user, messages.creationCancelled(getLanguage(user.language)));
});

bot?.callbackQuery("calendar:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;

  if (!user) {
    return;
  }

  await clearRenamePendingAction(user.id);

  return replyCalendarsList(ctx, user);
});

bot?.callbackQuery("main:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  await clearRenamePendingAction(user.id);

  return showHome(ctx, user, "navigation");
});

bot?.callbackQuery("events:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  await clearRenamePendingAction(user.id);

  return showEventsMenu(ctx, user);
});

bot?.callbackQuery("events:today", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return handleEventsRange(ctx, user, "today");
});

bot?.callbackQuery("events:tomorrow", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return handleEventsRange(ctx, user, "tomorrow");
});

bot?.callbackQuery("events:weekend", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return handleEventsRange(ctx, user, "weekend");
});

bot?.callbackQuery("events:7d", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return handleEventsRange(ctx, user, "next7days");
});

bot?.callbackQuery("settings:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  await clearRenamePendingAction(user.id);

  return showSettingsMenu(ctx, user);
});

bot?.callbackQuery("settings:language", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return showLanguageSettings(ctx, user);
});

bot?.callbackQuery(["settings:language:en", "settings:language:ru"], async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = ctx.callbackQuery.data.endsWith(":ru") ? "ru" : "en";
  const updated = await usersRepository.setLanguage(user.id, language);
  const nextUser = updated ?? { ...user, language };

  await ctx.reply(messages.settingsLanguageSaved(language));

  return showSettingsMenu(ctx, nextUser);
});

bot?.callbackQuery("settings:digest:tomorrow", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return showTomorrowDigestSettings(ctx, user);
});

bot?.callbackQuery("settings:digest:tomorrow:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  const settings = await userSettingsRepository.getOrCreate(user.id);

  await userSettingsRepository.updateTomorrowDigest({
    userId: user.id,
    enabled: !settings.tomorrow_digest_enabled,
  });

  await ctx.reply(messages.settingsSaved(getLanguage(user.language)));

  return showSettingsMenu(ctx, user);
});

bot?.callbackQuery(/^settings:digest:tomorrow:time:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const time = ctx.callbackQuery.data.replace("settings:digest:tomorrow:time:", "");

  await userSettingsRepository.updateTomorrowDigest({
    userId: user.id,
    enabled: true,
    time,
  });

  await ctx.reply(messages.settingsSaved(getLanguage(user.language)));

  return showSettingsMenu(ctx, user);
});

bot?.callbackQuery("settings:digest:weekend", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return showWeekendDigestSettings(ctx, user);
});

bot?.callbackQuery("settings:digest:weekend:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  const settings = await userSettingsRepository.getOrCreate(user.id);

  await userSettingsRepository.updateWeekendDigest({
    userId: user.id,
    enabled: !settings.weekend_digest_enabled,
  });

  await ctx.reply(messages.settingsSaved(getLanguage(user.language)));

  return showSettingsMenu(ctx, user);
});

bot?.callbackQuery(/^settings:digest:weekend:time:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const time = ctx.callbackQuery.data.replace("settings:digest:weekend:time:", "");

  await userSettingsRepository.updateWeekendDigest({
    userId: user.id,
    enabled: true,
    time,
  });

  await ctx.reply(messages.settingsSaved(getLanguage(user.language)));

  return showSettingsMenu(ctx, user);
});

bot?.callbackQuery(/^settings:digest:weekend:day:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const weekday = Number(ctx.callbackQuery.data.replace("settings:digest:weekend:day:", ""));

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return;
  }

  await userSettingsRepository.updateWeekendDigest({
    userId: user.id,
    enabled: true,
    weekday,
  });

  await ctx.reply(messages.settingsSaved(getLanguage(user.language)));

  return showSettingsMenu(ctx, user);
});

bot?.callbackQuery(/^calendar:open:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  return openCalendarCard(ctx, user, getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:open:"));
});

bot?.callbackQuery(/^calendar:activate:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:activate:");
  const calendar = await getMemberCalendar(user.id, calendarId);

  if (!calendar) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return ctx.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(ctx, user, checked.status, calendar);
  }

  const access = await getCalendarAccess(calendar.id, user.id);

  if (user.active_calendar_id === calendar.id) {
    return ctx.reply(messages.calendarAlreadyActive(language), {
      reply_markup: calendarCardKeyboard({
        language,
        calendarId: calendar.id,
        isActive: true,
        canManage: access?.isOwner === true,
        canLeave: access?.isOwner === false,
      }),
    });
  }

  await usersRepository.setActiveCalendar(user.id, calendar.id);

  return ctx.reply(messages.activeCalendarChanged(language, checked.metadata.summary), {
    reply_markup: mainCalendarKeyboard(language),
  });
});

bot?.callbackQuery(/^calendar:members:/, async (ctx, next) => {
  const data = ctx.callbackQuery.data ?? "";

  if (data.startsWith("calendar:members:remove:") ||
    data.startsWith("calendar:members:remove-select:") ||
    data.startsWith("calendar:members:remove-confirm:")) {
    return next();
  }

  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  return showCalendarMembers(ctx, user, getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:members:"));
});

bot?.callbackQuery(/^calendar:members:remove:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:members:remove:");
  const access = await getCalendarAccess(calendarId, user.id);

  if (!access) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  if (!access.isOwner) {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const members = await calendarMembersRepository.listCalendarMembers(access.calendar.id);
  const memberItems: CalendarMemberListItem[] = members.map((member) => ({
    userId: member.id,
    displayName: formatMemberDisplayName(member, language),
    role: member.role,
  }));

  return ctx.reply(messages.chooseCalendarMemberToRemove(language), {
    reply_markup: calendarMemberRemoveListKeyboard({
      language,
      calendarId: access.calendar.id,
      members: memberItems,
    }),
  });
});

bot?.callbackQuery(/^calendar:invite:/, async (ctx, next) => {
  if ((ctx.callbackQuery.data ?? "").startsWith("calendar:invite:regenerate:")) {
    return next();
  }

  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:invite:");

  return showCalendarInvite(ctx, user, calendarId);
});

bot?.callbackQuery(/^calendar:invite:regenerate:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:invite:regenerate:");

  return showCalendarInvite(ctx, user, calendarId);
});

bot?.callbackQuery(/^calendar:join:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const rawToken = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:join:");
  const joined = await joinCalendarByRawToken({
    rawToken,
    userId: user.id,
  });

  await pendingActionsRepository.deleteByUserIdAndType(user.id, "calendar_join");

  if (!joined) {
    return ctx.reply(messages.invalidCalendarInvite(language));
  }

  if (joined.wasAlreadyMember) {
    return ctx.reply(messages.alreadyCalendarMember(language, joined.calendar.name), {
      reply_markup: alreadyCalendarMemberKeyboard({
        language,
        calendarId: joined.calendar.id,
      }),
    });
  }

  await usersRepository.setActiveCalendar(user.id, joined.calendar.id);

  return ctx.reply(messages.calendarJoinedSuccessfully(language, joined.calendar.name), {
    reply_markup: calendarJoinedKeyboard({
      language,
      calendarId: joined.calendar.id,
    }),
  });
});

bot?.callbackQuery(/^calendar:members:remove-select:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const parsed = parseCalendarMemberCallback(ctx.callbackQuery.data, "calendar:members:remove-select:");

  if (!parsed) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const access = await getCalendarAccess(parsed.calendarId, user.id);

  if (!access) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  if (!access.isOwner) {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const targetMembership = await calendarMembersRepository.getCalendarMembership(access.calendar.id, parsed.userId);

  if (!targetMembership) {
    return ctx.reply(messages.calendarMemberNotFound(language));
  }

  if (targetMembership.role === "owner") {
    return ctx.reply(messages.calendarMemberRemoveOwnerDenied(language));
  }

  const checked = await checkCalendarAvailability(access.calendar);
  const members = await calendarMembersRepository.listCalendarMembers(access.calendar.id);
  const target = members.find((member) => member.id === parsed.userId);
  const memberName = target ? formatMemberDisplayName(target, language) : messages.calendarMemberFallbackName(language);
  const calendarName = checked.status === "available" ? checked.metadata.summary : access.calendar.name;

  return ctx.reply(messages.removeCalendarMemberConfirm(language, memberName, calendarName), {
    reply_markup: calendarMemberRemoveConfirmKeyboard({
      language,
      calendarId: access.calendar.id,
      userId: parsed.userId,
    }),
  });
});

bot?.callbackQuery(/^calendar:members:remove-confirm:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const parsed = parseCalendarMemberCallback(ctx.callbackQuery.data, "calendar:members:remove-confirm:");

  if (!parsed) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  let access: Awaited<ReturnType<typeof assertCalendarOwner>>;

  try {
    access = await assertCalendarOwner(parsed.calendarId, user.id);
  } catch {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const targetMembership = await calendarMembersRepository.getCalendarMembership(access.calendar.id, parsed.userId);

  if (!targetMembership) {
    return ctx.reply(messages.calendarMemberNotFound(language));
  }

  if (targetMembership.role === "owner") {
    return ctx.reply(messages.calendarMemberRemoveOwnerDenied(language));
  }

  await calendarMembersRepository.removeMemberAndChooseFallback({
    calendarId: access.calendar.id,
    userId: parsed.userId,
  });

  await ctx.reply(messages.calendarMemberRemoved(language));

  return showCalendarMembers(ctx, user, access.calendar.id);
});

bot?.callbackQuery(/^calendar:leave:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:leave:");
  const access = await getCalendarAccess(calendarId, user.id);

  if (!access) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  if (access.isOwner) {
    return ctx.reply(messages.ownerLeaveDenied(language));
  }

  const checked = await checkCalendarAvailability(access.calendar);
  const calendarName = checked.status === "available" ? checked.metadata.summary : access.calendar.name;

  return ctx.reply(messages.leaveCalendarConfirm(language, calendarName), {
    reply_markup: calendarLeaveConfirmKeyboard(language, access.calendar.id),
  });
});

bot?.callbackQuery(/^calendar:leave-confirm:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:leave-confirm:");
  const access = await getCalendarAccess(calendarId, user.id);

  if (!access) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  if (access.isOwner) {
    return ctx.reply(messages.ownerLeaveDenied(language));
  }

  await calendarMembersRepository.removeMemberAndChooseFallback({
    calendarId: access.calendar.id,
    userId: user.id,
  });

  const refreshedUser = await usersRepository.findById(user.id) ?? user;

  return replyCalendarsList(ctx, refreshedUser, messages.leftCalendar(language));
});

bot?.callbackQuery(/^calendar:rename:/, async (ctx, next) => {
  if (ctx.callbackQuery.data === "calendar:rename:cancel") {
    return next();
  }

  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:rename:");
  let access: Awaited<ReturnType<typeof assertCalendarOwner>>;

  try {
    access = await assertCalendarOwner(calendarId, user.id);
  } catch {
    return ctx.reply(messages.renameOwnerOnly(language));
  }

  const calendar = access.calendar;
  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return ctx.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(ctx, user, checked.status, calendar);
  }

  await pendingActionsRepository.upsertRenameCalendarAction(
    user.id,
    calendar.id,
    new Date(Date.now() + CREATE_CALENDAR_TTL_MS),
  );

  return ctx.reply(messages.renameCalendarPrompt(language, checked.metadata.summary), {
    reply_markup: renameCalendarCancelKeyboard(language),
  });
});

bot?.callbackQuery("calendar:rename:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  await pendingActionsRepository.deleteByUserId(user.id);

  return ctx.reply(messages.renameCalendarCancelled(getLanguage(user.language)));
});

bot?.callbackQuery(/^calendar:delete:/, async (ctx, next) => {
  const data = ctx.callbackQuery.data ?? "";

  if (data.startsWith("calendar:delete:confirm:") || data.startsWith("calendar:delete:cancel:")) {
    return next();
  }

  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(data, "calendar:delete:");
  let access: Awaited<ReturnType<typeof assertCalendarOwner>>;

  try {
    access = await assertCalendarOwner(calendarId, user.id);
  } catch {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const calendar = access.calendar;
  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return ctx.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(ctx, user, checked.status, calendar);
  }

  return ctx.reply(messages.deleteCalendarConfirm(language, checked.metadata.summary), {
    reply_markup: calendarDeleteConfirmKeyboard(language, calendar.id),
  });
});

bot?.callbackQuery(/^calendar:delete:cancel:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  return ctx.reply(messages.deleteCalendarCancelled(getLanguage(user.language)));
});

bot?.callbackQuery(/^calendar:delete:confirm:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "calendar:delete:confirm:");
  let access: Awaited<ReturnType<typeof assertCalendarOwner>>;

  try {
    access = await assertCalendarOwner(calendarId, user.id);
  } catch {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const calendar = access.calendar;
  const wasActive = user.active_calendar_id === calendar.id;

  try {
    await deleteRegistryGoogleCalendar(calendar);
  } catch (error) {
    const kind = classifyGoogleApiError(error);

    if (kind !== "calendar_not_found") {
      return replyCalendarProblem(ctx, user, kind, calendar);
    }
  }

  await cleanupDeletedCalendar(calendar);

  const refreshedUser = await usersRepository.findById(user.id) ?? user;

  if (!wasActive) {
    return replyCalendarsList(ctx, refreshedUser, messages.deleteCalendarSuccess(language));
  }

  return replyCalendarsList(ctx, refreshedUser, messages.deleteCalendarSuccess(language));
});

bot?.callbackQuery("event:calendar", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  const language = getLanguage(user.language);
  const pendingAction = await pendingActionsRepository.findByUserId(user.id);
  const draft = pendingAction?.type === "confirm_event"
    ? parseConfirmEventPayload(pendingAction.payload)
    : null;

  if (!draft || new Date(pendingAction.expires_at).getTime() <= Date.now()) {
    await pendingActionsRepository.deleteByUserId(user.id);

    return ctx.reply(messages.eventAlreadySavedOrExpired(language));
  }

  const eventCalendars = await resolveEventCalendarsForUser(user);

  if (eventCalendars.available.length === 0) {
    return ctx.reply(messages.createCalendarBeforeEvents(language), {
      reply_markup: emptyCalendarsKeyboard(language),
    });
  }

  return ctx.reply(messages.chooseEventCalendar(language), {
    reply_markup: eventCalendarSelectionKeyboard({
      language,
      calendars: eventCalendars.available,
      selectedCalendarId: draft.calendarId,
    }),
  });
});

bot?.callbackQuery(/^event:calendar:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const calendarId = getCalendarIdFromCallback(ctx.callbackQuery.data, "event:calendar:");
  const pendingAction = await pendingActionsRepository.findByUserId(user.id);
  const draft = pendingAction?.type === "confirm_event"
    ? parseConfirmEventPayload(pendingAction.payload)
    : null;

  if (!draft || new Date(pendingAction.expires_at).getTime() <= Date.now()) {
    await pendingActionsRepository.deleteByUserId(user.id);

    return ctx.reply(messages.eventAlreadySavedOrExpired(language));
  }

  const selectedCalendar = await getSelectedEventCalendar(user, calendarId);

  if (!selectedCalendar) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const updatedDraft = {
    ...draft,
    status: "ready" as const,
    calendarId: selectedCalendar.id,
  };

  await pendingActionsRepository.updateConfirmEventPayload(user.id, updatedDraft);

  return replyEventDraft(ctx, user, updatedDraft);
});

bot?.callbackQuery("event:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  const pendingAction = await pendingActionsRepository.findByUserId(user.id);
  const draft = pendingAction?.type === "confirm_event"
    ? parseConfirmEventPayload(pendingAction.payload)
    : null;

  if (!draft) {
    return ctx.reply(messages.eventAlreadySavedOrExpired(getLanguage(user.language)));
  }

  return replyEventDraft(ctx, user, draft);
});

bot?.callbackQuery("event:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  const language = getLanguage(user.language);
  const pendingAction = await pendingActionsRepository.findByUserIdAndType(user.id, "confirm_event");
  const draft = pendingAction ? parseConfirmEventPayload(pendingAction.payload) : null;

  if (!draft) {
    return ctx.reply(messages.eventDraftNoLongerAvailable(language));
  }

  return ctx.reply(messages.eventEditMenu(language), {
    reply_markup: eventEditMenuKeyboard(language),
  });
});

bot?.callbackQuery(/^event:edit:/, async (ctx, next) => {
  if (ctx.callbackQuery.data === "event:edit:cancel") {
    return next();
  }

  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const field = ctx.callbackQuery.data.slice("event:edit:".length);

  if (!isEventEditField(field)) {
    return ctx.reply(messages.eventEditMenu(language), {
      reply_markup: eventEditMenuKeyboard(language),
    });
  }

  const pendingAction = await pendingActionsRepository.findByUserIdAndType(user.id, "confirm_event");
  const draft = pendingAction ? parseConfirmEventPayload(pendingAction.payload) : null;

  if (!draft) {
    return ctx.reply(messages.eventDraftNoLongerAvailable(language));
  }

  await pendingActionsRepository.upsertEditEventFieldAction(
    user.id,
    {
      draftId: draft.draftId,
      field,
    },
    new Date(Date.now() + EVENT_DRAFT_TTL_MS),
  );

  return ctx.reply(messages.eventEditFieldPrompt(language, field), {
    reply_markup: eventEditFieldKeyboard(language),
  });
});

bot?.callbackQuery("event:edit:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  await pendingActionsRepository.deleteByUserIdAndType(user.id, "edit_event_field");

  return ctx.reply(messages.eventDraftCancelled(getLanguage(user.language)));
});

bot?.callbackQuery("event:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return discardCurrentEventDraft(ctx, user);
});

bot?.callbackQuery("event:save", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user) {
    return;
  }

  return ctx.reply(messages.eventDraftNoLongerAvailable(getLanguage(user.language)));
});

bot?.callbackQuery(/^event:save:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getUserFromCallback(ctx);

  if (!user || !ctx.callbackQuery.data) {
    return;
  }

  const language = getLanguage(user.language);
  const draftId = ctx.callbackQuery.data.slice("event:save:".length);
  const processingAction = draftId
    ? await pendingActionsRepository.markConfirmEventProcessing(user.id, draftId)
    : null;
  const draft = processingAction ? parseConfirmEventPayload(processingAction.payload) : null;

  if (!draft) {
    if (processingAction) {
      console.info("[event-time:draft-read]", {
        traceId: null,
        payloadVersion: null,
        draftId,
        payloadReadable: false,
      });

      await pendingActionsRepository.deleteByUserIdAndType(user.id, "confirm_event");
    }

    return ctx.reply(messages.eventDraftNoLongerAvailable(language));
  }

  console.info("[event-time:draft-read]", {
    traceId: draft.eventTraceId,
    payloadVersion: draft.payloadVersion,
    startDate: draft.startDate,
    startTime: draft.startTime,
    endDate: draft.endDate,
    endTime: draft.endTime,
  });

  const selectedCalendar = await getSelectedEventCalendar(user, draft.calendarId);

  if (!selectedCalendar) {
    await pendingActionsRepository.resetConfirmEventProcessing(user.id, draft.draftId);

    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const sourceIdempotencyKey = draft.sourceTelegramChatId && draft.sourceTelegramMessageId
    ? eventSourceClaimsRepository.buildEventSourceIdempotencyKey({
      calendarId: draft.calendarId,
      chatId: draft.sourceTelegramChatId,
      messageId: draft.sourceTelegramMessageId,
    })
    : null;
  let sourceClaimed = false;

  try {
    if (sourceIdempotencyKey) {
      sourceClaimed = await eventSourceClaimsRepository.claimEventSource({
        idempotencyKey: sourceIdempotencyKey,
        userId: user.id,
      });

      if (!sourceClaimed) {
        console.info("[event-save:duplicate-source]", {
          traceId: draft.eventTraceId,
          calendarId: draft.calendarId,
          sourceTelegramChatId: draft.sourceTelegramChatId,
          sourceTelegramMessageId: draft.sourceTelegramMessageId,
          sourceTelegramUpdateId: draft.sourceTelegramUpdateId,
        });

        await pendingActionsRepository.deleteConfirmEventByDraftId(user.id, draft.draftId);

        return ctx.reply(messages.eventAlreadyAdded(language));
      }
    }

    const created = await createGoogleCalendarEvent({
      userId: user.id,
      calendarId: draft.calendarId,
      draft,
    });

    if (sourceIdempotencyKey) {
      await eventSourceClaimsRepository.markEventSourceCompleted(sourceIdempotencyKey);
    }

    await pendingActionsRepository.deleteConfirmEventByDraftId(user.id, draft.draftId);

    const savedMessage = draft.scheduleType === "daily_range"
      ? messages.dailyRangeEventsSaved(
        language,
        created.count,
        draft.title,
        formatEventSavedDate(draft, language),
        formatEventSavedTime(draft, language) ?? "",
        selectedCalendar.summary,
      )
      : messages.eventSaved(
        language,
        draft.title,
        formatEventSavedDate(draft, language),
        selectedCalendar.summary,
      );

    return ctx.reply(savedMessage, {
      reply_markup: eventSavedKeyboard({
        language,
        htmlLink: created.htmlLink,
      }),
    });
  } catch (error) {
    if (error instanceof GoogleEventBatchPartialFailureError) {
      console.error("Google Calendar event batch rollback failed:", {
        operation: "create_event_batch",
        userId: user.id,
        calendarId: draft.calendarId,
        provider: "google",
        errorCategory: classifyGoogleApiError(error.cause),
        createdCount: error.createdCount,
      });

      await pendingActionsRepository.deleteConfirmEventByDraftId(user.id, draft.draftId);

      return ctx.reply(messages.eventBatchPartialFailure(language));
    }

    if (sourceIdempotencyKey && sourceClaimed) {
      await eventSourceClaimsRepository.releaseEventSourceClaim(sourceIdempotencyKey);
    }

    const kind = error instanceof CalendarGoogleConnectionUnavailableError
      ? "owner_google_unavailable"
      : classifyGoogleApiError(error);

    await pendingActionsRepository.resetConfirmEventProcessing(user.id, draft.draftId);

    if (kind === "calendar_not_found") {
      const calendar = await calendarsRepository.findById(draft.calendarId);

      if (calendar) {
        await cleanupDeletedCalendar(calendar);
      }
    }

    const calendar = await calendarsRepository.findById(draft.calendarId);

    return replyCalendarProblem(ctx, user, kind, calendar ?? undefined);
  }
});

bot?.callbackQuery("invite:unavailable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;
  const language = getLanguage(user?.language);

  return ctx.reply(messages.inviteUnavailable(language));
});

bot?.callbackQuery("google:disconnect:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;
  const language = getLanguage(user?.language);

  return ctx.reply(messages.disconnectCancelled(language));
});

bot?.callbackQuery("google:disconnect:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;

  if (!user) {
    return;
  }

  const language = getLanguage(user.language);
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    return ctx.reply(messages.disconnectNotConnected(language));
  }

  try {
    try {
      await revokeGoogleConnectionRefreshToken(googleConnection);
    } catch (revokeError) {
      console.error("Google token revoke failed:", {
        operation: "revoke_google_refresh_token",
        userId: user.id,
        errorName: revokeError instanceof Error ? revokeError.name : typeof revokeError,
        errorMessage: revokeError instanceof Error ? revokeError.message : String(revokeError),
      });
    }

    await googleConnectionsRepository.markDisconnected(googleConnection.id);

    return ctx.reply(messages.disconnectSuccess(language), {
      reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
    });
  } catch (error) {
    console.error("Google disconnect failed:", {
      operation: "disconnect_google_connection",
      userId: user.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return ctx.reply(messages.disconnectError(language));
  }
});

bot?.on("message", async (ctx) => {
  const handlerName = "bot.on(message):event-router";
  const handlerContext = getMessageHandlerLogContext(ctx, handlerName);

  console.info("[message-handler:entered]", handlerContext);

  if (shouldIgnoreBotAuthoredMessage({
    ctxFrom: ctx.from,
    messageFrom: ctx.message?.from,
    botId: configuredBotId,
  })) {
    logEventAnalysisIgnored(ctx, "bot_authored_message", handlerName);

    return;
  }

  const text = extractMessageText(ctx);

  if (ctx.message.text?.startsWith("/")) {
    logEventAnalysisIgnored(ctx, "command", handlerName);

    return;
  }

  const from = ctx.from;

  if (!from) {
    logEventAnalysisIgnored(ctx, "missing_sender", handlerName);

    return;
  }

  const user = await upsertTelegramUser(ctx);

  if (!user) {
    logEventAnalysisIgnored(ctx, "user_upsert_failed", handlerName);

    return;
  }

  const language = getLanguage(user.language);
  const pendingAction = await pendingActionsRepository.findByUserId(user.id);

  if (!text) {
    if (pendingAction?.type === "create_calendar" || pendingAction?.type === "rename_calendar") {
      return ctx.reply(messages.invalidCalendarName(language));
    }

    logEventAnalysisIgnored(ctx, "no_text_or_caption", handlerName);

    return ctx.reply(messages.textOnlyEventInput(language));
  }

  if (!pendingAction) {
    logEventAnalysisAccepted(ctx, handlerName);

    return parseMessageAsEvent(ctx, user, text, getForwardContext(ctx), extractDetectedLinks(ctx), getEventSourceIdentity(ctx));
  }

  if (pendingAction.type === "edit_event_field") {
    if (new Date(pendingAction.expires_at).getTime() <= Date.now()) {
      await pendingActionsRepository.deleteByUserIdAndType(user.id, "edit_event_field");

      return ctx.reply(messages.eventAlreadySavedOrExpired(language));
    }

    const editPayload = parseEditEventFieldPayload(pendingAction.payload);
    const confirmAction = await pendingActionsRepository.findByUserIdAndType(user.id, "confirm_event");
    const draft = confirmAction ? parseConfirmEventPayload(confirmAction.payload) : null;

    if (!editPayload || !draft || editPayload.draftId !== draft.draftId) {
      await pendingActionsRepository.deleteByUserIdAndType(user.id, "edit_event_field");

      return ctx.reply(messages.eventDraftNoLongerAvailable(language));
    }

    const updatedDraft = updateDraftField(draft, editPayload.field, text);

    const draftWithPreview = await showUpdatedEventDraft(ctx, user, {
      ...updatedDraft,
      status: "ready",
    });

    await pendingActionsRepository.updateConfirmEventPayload(user.id, draftWithPreview);
    await pendingActionsRepository.deleteByUserIdAndType(user.id, "edit_event_field");

    logEventAnalysisIgnored(ctx, "edit_event_field_handled", handlerName);

    return;
  }

  if (pendingAction.type === "confirm_event") {
    await pendingActionsRepository.deleteByUserIdAndType(user.id, "confirm_event");

    logEventAnalysisAccepted(ctx, handlerName);

    return parseMessageAsEvent(ctx, user, text, getForwardContext(ctx), extractDetectedLinks(ctx), getEventSourceIdentity(ctx));
  }

  if (pendingAction.type === "event_waiting_for_calendar") {
    await pendingActionsRepository.deleteByUserIdAndType(user.id, "event_waiting_for_calendar");

    logEventAnalysisAccepted(ctx, handlerName);

    return parseMessageAsEvent(ctx, user, text, getForwardContext(ctx), extractDetectedLinks(ctx), getEventSourceIdentity(ctx));
  }

  if (new Date(pendingAction.expires_at).getTime() <= Date.now()) {
    await pendingActionsRepository.deleteByUserId(user.id);

    if (pendingAction.type === "edit_event") {
      return ctx.reply(messages.eventAlreadySavedOrExpired(language));
    }

    return ctx.reply(messages.createCalendarExpired(language));
  }

  const name = validateCalendarName(text);

  if (pendingAction.type === "edit_event") {
    logEventAnalysisAccepted(ctx, handlerName);

    return parseMessageAsEvent(ctx, user, text, getForwardContext(ctx), extractDetectedLinks(ctx), getEventSourceIdentity(ctx));
  }

  if (pendingAction.type === "rename_calendar") {
    const payload = parseRenameCalendarPayload(pendingAction.payload);

    if (!payload) {
      await pendingActionsRepository.deleteByUserId(user.id);

      return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
    }

    let access: Awaited<ReturnType<typeof assertCalendarOwner>>;

    try {
      access = await assertCalendarOwner(payload.calendarId, user.id);
    } catch {
      await pendingActionsRepository.deleteByUserId(user.id);

      return ctx.reply(messages.renameOwnerOnly(language));
    }

    const calendar = access.calendar;

    if (!name) {
      return ctx.reply(messages.invalidCalendarName(language));
    }

    const checked = await checkCalendarAvailability(calendar);

    if (checked.status === "calendar_not_found") {
      await pendingActionsRepository.deleteByUserId(user.id);
      await cleanupDeletedCalendar(calendar);

      return ctx.reply(messages.calendarDeletedInGoogle(language), {
        reply_markup: noCalendarsKeyboard(language),
      });
    }

    if (checked.status !== "available") {
      return replyCalendarProblem(ctx, user, checked.status, calendar);
    }

    try {
      const renamed = await renameGoogleCalendar({
        calendarRecord: calendar,
        name,
      });

      await pendingActionsRepository.deleteByUserId(user.id);

      try {
        await calendarsRepository.updateLegacyName(calendar.id, renamed.summary);
      } catch {
        // Google Calendar remains the source of truth; legacy cache update is best effort.
      }

      const refreshedUser = await usersRepository.findById(user.id) ?? user;

      return openCalendarCard(ctx, refreshedUser, calendar.id);
    } catch (error) {
      const kind = classifyGoogleApiError(error);

      if (kind === "calendar_not_found") {
        await pendingActionsRepository.deleteByUserId(user.id);
        await cleanupDeletedCalendar(calendar);

        return ctx.reply(messages.calendarDeletedInGoogle(language), {
          reply_markup: noCalendarsKeyboard(language),
        });
      }

      return replyCalendarProblem(ctx, user, kind, calendar);
    }
  }

  if (pendingAction.type !== "create_calendar") {
    logEventAnalysisAccepted(ctx, handlerName);

    return parseMessageAsEvent(ctx, user, text, getForwardContext(ctx), extractDetectedLinks(ctx), getEventSourceIdentity(ctx));
  }

  if (!name) {
    return ctx.reply(messages.invalidCalendarName(language));
  }

  let created: Awaited<ReturnType<typeof createCalendarForUser>>;

  try {
    created = await createCalendarForUser({
      userId: user.id,
      name,
    });
  } catch (error) {
    console.error("Calendar creation failed:", {
      operation: "create_google_calendar",
      userId: user.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return ctx.reply(messages.genericCreateError(language));
  }

  let calendar: calendarsRepository.Calendar;
  const hadCalendarsBeforeCreate = (await calendarsRepository.findForUser(user.id)).length > 0;

  try {
    calendar = await calendarsRepository.createOwnedCalendarAndActivate({
      name: created.calendar.name,
      googleCalendarId: created.calendar.googleCalendarId,
      googleConnectionId: created.connection.id,
      createdByUserId: user.id,
      ownerUserId: user.id,
    });
  } catch (error) {
    try {
      await deleteCalendarForUser({
        connection: created.connection,
        googleCalendarId: created.calendar.googleCalendarId,
      });
    } catch (compensationError) {
      console.error("Calendar creation compensation failed:", {
        operation: "delete_google_calendar_after_db_error",
        userId: user.id,
        errorName: compensationError instanceof Error ? compensationError.name : typeof compensationError,
        errorMessage: compensationError instanceof Error ? compensationError.message : String(compensationError),
      });
    }

    console.error("Calendar creation failed:", {
      operation: "save_created_calendar",
      userId: user.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return ctx.reply(messages.genericCreateError(language));
  }

  await ctx.reply(messages.creationSuccess(language, created.calendar.name), {
    reply_markup: mainCalendarKeyboard(language),
  });

  await pendingActionsRepository.deleteByUserIdAndType(user.id, "create_calendar");

  const waitingEventAction = await pendingActionsRepository.findByUserIdAndType(user.id, "event_waiting_for_calendar");

  if (waitingEventAction) {
    const waitingPayload = parseEventWaitingForCalendarPayload(waitingEventAction.payload);

    await pendingActionsRepository.deleteByUserIdAndType(user.id, "event_waiting_for_calendar");

    if (
      !waitingPayload
      || new Date(waitingEventAction.expires_at).getTime() <= Date.now()
    ) {
      return ctx.reply(messages.calendarCreatedForwardEventAgain(language));
    }

    logEventAnalysisAccepted(ctx, handlerName);

    return parseMessageAsEvent(
      ctx,
      user,
      waitingPayload.text,
      waitingPayload.forwardContext,
      waitingPayload.detectedLinks,
      waitingPayload.sourceIdentity,
    );
  }

  if (!hadCalendarsBeforeCreate) {
    return ctx.reply(messages.firstCalendarHint(language));
  }
});

console.info("[startup] middleware registered", {
  botCreated: Boolean(bot),
});
