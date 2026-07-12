import { Bot, type Context } from "grammy";
import * as calendarsRepository from "./repositories/calendars.js";
import * as calendarMembersRepository from "./repositories/calendarMembers.js";
import * as googleConnectionsRepository from "./repositories/googleConnections.js";
import * as pendingActionsRepository from "./repositories/pendingActions.js";
import * as usersRepository from "./repositories/users.js";
import {
  checkCalendarAvailability,
  cleanupDeletedCalendar,
  createCalendarForUser,
  deleteRegistryGoogleCalendar,
  deleteCalendarForUser,
  getCalendarMetadata,
  listMeetoryCalendarsForUser,
  renameGoogleCalendar,
} from "./google/calendarService.js";
import { classifyGoogleApiError } from "./google/googleApiErrors.js";
import { revokeGoogleConnectionRefreshToken } from "./google/oauth.js";
import { getLanguage, getTelegramLanguage, messages } from "./i18n.js";
import {
  calendarCardKeyboard,
  calendarDeleteConfirmKeyboard,
  calendarsListKeyboard,
  connectGoogleKeyboard,
  createCalendarCancelKeyboard,
  emptyCalendarsKeyboard,
  googleDisconnectConfirmKeyboard,
  mainCalendarKeyboard,
  noCalendarsKeyboard,
  reconnectGoogleKeyboard,
  renameCalendarCancelKeyboard,
} from "./telegramScreens.js";

const CREATE_CALENDAR_TTL_MS = 15 * 60 * 1000;
const token = process.env.TELEGRAM_API_TOKEN?.trim();

function createBot() {
  if (!token) {
    return null;
  }

  try {
    return new Bot(token);
  } catch {
    return null;
  }
}

type ReplyTarget = {
  reply: Context["reply"];
};

type ResolvedCalendarList = Awaited<ReturnType<typeof resolveCalendarsForUser>>;

type RenameCalendarPayload = {
  calendarId: string;
};

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

  if (resolved.temporaryFailureCount > 0) {
    lines.push(messages.googleCalendarTemporaryUnavailable(language));
  }

  return lines;
}

function getCalendarIdFromCallback(data: string, prefix: string) {
  return data.startsWith(prefix) ? data.slice(prefix.length) : "";
}

function parseRenameCalendarPayload(payload: unknown): RenameCalendarPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const calendarId = (payload as { calendarId?: unknown }).calendarId;

  return typeof calendarId === "string" && calendarId ? { calendarId } : null;
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
  const isMember = await calendarMembersRepository.isMember(userId, calendarId);

  if (!isMember) {
    return null;
  }

  return calendarsRepository.findById(calendarId);
}

async function replyCalendarProblem(target: ReplyTarget, user: usersRepository.User, status: string) {
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
  const calendar = await getMemberCalendar(user.id, calendarId);

  if (!calendar) {
    return target.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return target.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(target, user, checked.status);
  }

  return target.reply(messages.calendarCard(
    language,
    checked.metadata.summary,
    user.active_calendar_id === calendar.id,
  ), {
    reply_markup: calendarCardKeyboard({
      language,
      calendarId: calendar.id,
      isActive: user.active_calendar_id === calendar.id,
    }),
  });
}

async function showHome(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    return target.reply(messages.welcome(language), {
      reply_markup: connectGoogleKeyboard(user.telegram_id, language),
    });
  }

  const calendarRecords = await calendarsRepository.findForUser(user.id);

  if (calendarRecords.length === 0) {
    return target.reply(messages.noCalendars(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  const resolved = await resolveCalendarsForUser(user);
  const activeCalendar = resolved.available.find((calendar) => calendar.id === resolved.activeCalendarId);
  const notices = recoveryMessages(language, resolved);

  if (activeCalendar) {
    return target.reply([
      ...notices,
      notices.length > 0 ? "" : null,
      messages.welcomeBack(language, activeCalendar.summary),
    ].filter((line): line is string => line !== null).join("\n"), {
      reply_markup: mainCalendarKeyboard(language),
    });
  }

  if (resolved.oauthInvalidCount > 0 || resolved.accessDeniedCount > 0) {
    return target.reply(notices.join("\n\n"), {
      reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
    });
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
    resolved.accessDeniedCount + resolved.oauthInvalidCount + resolved.temporaryFailureCount > 0
      ? messages.inaccessibleCalendarsNotice(
        language,
        resolved.accessDeniedCount + resolved.oauthInvalidCount + resolved.temporaryFailureCount,
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

  await clearRenamePendingAction(user.id);

  return showHome(ctx, user);
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

  return ctx.reply(messages.creationCancelled(getLanguage(user.language)));
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

  return showHome(ctx, user);
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
    return replyCalendarProblem(ctx, user, checked.status);
  }

  if (user.active_calendar_id === calendar.id) {
    return ctx.reply(messages.calendarAlreadyActive(language), {
      reply_markup: calendarCardKeyboard({
        language,
        calendarId: calendar.id,
        isActive: true,
      }),
    });
  }

  await usersRepository.setActiveCalendar(user.id, calendar.id);

  return ctx.reply(messages.activeCalendarChanged(language, checked.metadata.summary), {
    reply_markup: mainCalendarKeyboard(language),
  });
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
  const calendar = await getMemberCalendar(user.id, calendarId);

  if (!calendar) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const role = await calendarMembersRepository.getRole(user.id, calendar.id);

  if (role !== "owner") {
    return ctx.reply(messages.renameOwnerOnly(language));
  }

  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return ctx.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(ctx, user, checked.status);
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
  const calendar = await getMemberCalendar(user.id, calendarId);

  if (!calendar) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const role = await calendarMembersRepository.getRole(user.id, calendar.id);

  if (role !== "owner") {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const checked = await checkCalendarAvailability(calendar);

  if (checked.status === "calendar_not_found") {
    await cleanupDeletedCalendar(calendar);

    return ctx.reply(messages.calendarDeletedInGoogle(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  if (checked.status !== "available") {
    return replyCalendarProblem(ctx, user, checked.status);
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
  const calendar = await getMemberCalendar(user.id, calendarId);

  if (!calendar) {
    return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
  }

  const role = await calendarMembersRepository.getRole(user.id, calendar.id);

  if (role !== "owner") {
    return ctx.reply(messages.deleteOwnerOnly(language));
  }

  const wasActive = user.active_calendar_id === calendar.id;

  try {
    await deleteRegistryGoogleCalendar(calendar);
  } catch (error) {
    const kind = classifyGoogleApiError(error);

    if (kind !== "calendar_not_found") {
      return replyCalendarProblem(ctx, user, kind);
    }
  }

  await cleanupDeletedCalendar(calendar);

  const refreshedUser = await usersRepository.findById(user.id) ?? user;

  if (!wasActive) {
    return replyCalendarsList(ctx, refreshedUser, messages.deleteCalendarSuccess(language));
  }

  return replyCalendarsList(ctx, refreshedUser, messages.deleteCalendarSuccess(language));
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

bot?.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith("/")) {
    return;
  }

  const from = ctx.from;

  if (!from) {
    return;
  }

  const user = await usersRepository.findByTelegramId(String(from.id));

  if (!user) {
    return;
  }

  const language = getLanguage(user.language);
  const pendingAction = await pendingActionsRepository.findByUserId(user.id);

  if (!pendingAction) {
    return;
  }

  if (new Date(pendingAction.expires_at).getTime() <= Date.now()) {
    await pendingActionsRepository.deleteByUserId(user.id);

    return ctx.reply(messages.createCalendarExpired(language));
  }

  const name = validateCalendarName(text);

  if (pendingAction.type === "rename_calendar") {
    const payload = parseRenameCalendarPayload(pendingAction.payload);

    if (!payload) {
      await pendingActionsRepository.deleteByUserId(user.id);

      return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
    }

    const calendar = await getMemberCalendar(user.id, payload.calendarId);

    if (!calendar) {
      await pendingActionsRepository.deleteByUserId(user.id);

      return ctx.reply(messages.calendarNotFoundOrAccessDenied(language));
    }

    const role = await calendarMembersRepository.getRole(user.id, calendar.id);

    if (role !== "owner") {
      await pendingActionsRepository.deleteByUserId(user.id);

      return ctx.reply(messages.renameOwnerOnly(language));
    }

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
      return replyCalendarProblem(ctx, user, checked.status);
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

      return replyCalendarProblem(ctx, user, kind);
    }
  }

  if (pendingAction.type !== "create_calendar") {
    return;
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

  if (!hadCalendarsBeforeCreate) {
    return ctx.reply(messages.firstCalendarHint(language));
  }
});
