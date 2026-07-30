import { Router } from "express";
import { bot, sendCalendarJoinPreview } from "../bot.js";
import {
  createGoogleAuthorizationUrl,
  createGoogleOAuthClient,
  getGoogleEmail,
  GOOGLE_OAUTH_SCOPES,
} from "../google/oauth.js";
import { checkCalendarAvailability, cleanupDeletedCalendar } from "../google/calendarService.js";
import { getLanguage, messages } from "../i18n/index.js";
import * as calendarsRepository from "../repositories/calendars.js";
import * as googleConnectionsRepository from "../repositories/googleConnections.js";
import * as pendingActionsRepository from "../repositories/pendingActions.js";
import * as usersRepository from "../repositories/users.js";
import { verifyOAuthState } from "../security/oauthState.js";
import { encryptToken } from "../security/tokenEncryption.js";
import {
  mainCalendarKeyboard,
  noCalendarsKeyboard,
  reconnectGoogleKeyboard,
  retryGoogleOAuthKeyboard,
} from "../telegramScreens.js";

export const googleRouter = Router();

function html(message: string) {
  const escapedMessage = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meetory</title>
  </head>
  <body>
    <p style="white-space: pre-line">${escapedMessage}</p>
  </body>
</html>`;
}

async function getActiveOrFirstCalendar(userId: string) {
  const activeCalendar = await calendarsRepository.findActiveForUser(userId);

  if (activeCalendar) {
    return activeCalendar;
  }

  const firstCalendar = await calendarsRepository.findFirstForUser(userId);

  if (firstCalendar) {
    await usersRepository.setActiveCalendar(userId, firstCalendar.id);
  }

  return firstCalendar;
}

async function getActiveOrFirstAvailableCalendar(userId: string) {
  const calendars = await calendarsRepository.findForUser(userId);
  const checkedCalendars = await Promise.all(calendars.map((calendar) => checkCalendarAvailability(calendar)));

  for (const checked of checkedCalendars) {
    if (checked.status === "available") {
      await usersRepository.setActiveCalendar(userId, checked.calendar.id);

      return checked;
    }

    if (checked.status === "calendar_not_found") {
      await cleanupDeletedCalendar(checked.calendar);
    }
  }

  return null;
}

function hasGrantedCalendarScope(scope?: string | null) {
  if (!scope) {
    return false;
  }

  return scope.split(/\s+/).includes(GOOGLE_OAUTH_SCOPES[0]);
}

function parseCalendarJoinPayload(payload: unknown) {
  const rawToken = typeof payload === "object" && payload !== null
    ? (payload as { rawToken?: unknown }).rawToken
    : null;

  return typeof rawToken === "string" && rawToken ? { rawToken } : null;
}

async function revokeGrantedToken(token?: string | null) {
  if (!token) {
    return;
  }

  try {
    const oauth2Client = createGoogleOAuthClient();

    await oauth2Client.revokeToken(token);
  } catch (error) {
    console.error("Google OAuth token revoke failed:", {
      operation: "revoke_partial_oauth_token",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

googleRouter.get("/oauth", (req, res) => {
  const state = String(req.query.state ?? "");

  if (!state) {
    return res.status(400).send(html("Missing OAuth state."));
  }

  try {
    verifyOAuthState(state);
  } catch {
    return res.status(400).send(html("Invalid or expired OAuth state."));
  }

  return res.redirect(createGoogleAuthorizationUrl(state));
});

googleRouter.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const oauthError = typeof req.query.error === "string" ? req.query.error : "";

  if (oauthError) {
    if (!state) {
      return res.status(400).send(html(messages.oauthInvalidStateBrowser("en")));
    }

    let payload: ReturnType<typeof verifyOAuthState>;

    try {
      payload = verifyOAuthState(state);
    } catch {
      return res.status(400).send(html(messages.oauthInvalidStateBrowser("en")));
    }

    const user = await usersRepository.findByTelegramId(payload.telegramUserId);

    if (!user) {
      return res.status(404).send(html(messages.oauthInvalidStateBrowser("en")));
    }

    const language = getLanguage(user.language);

    if (oauthError === "access_denied") {
      try {
        await bot?.api.sendMessage(user.telegram_id, messages.oauthAccessDeniedTelegram(language), {
          reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
        });
      } catch {
        // The browser callback should still succeed if Telegram delivery fails.
      }

      return res.status(400).send(html(messages.oauthAccessDeniedBrowser(language)));
    }

    console.error("Google OAuth callback error:", {
      operation: "google_oauth_callback_error",
      userId: user.id,
      errorCode: oauthError,
    });

    try {
      await bot?.api.sendMessage(user.telegram_id, messages.oauthGenericErrorTelegram(language), {
        reply_markup: retryGoogleOAuthKeyboard(user.telegram_id, language),
      });
    } catch {
      // The browser callback should still succeed if Telegram delivery fails.
    }

    return res.status(400).send(html(messages.oauthGenericErrorBrowser(language)));
  }

  if (!code || !state) {
    let language = getLanguage();

    if (state) {
      try {
        const payload = verifyOAuthState(state);
        const user = await usersRepository.findByTelegramId(payload.telegramUserId);

        language = getLanguage(user?.language);
      } catch {
        // Keep the fallback language for malformed or expired state.
      }
    }

    return res.status(400).send(html(messages.oauthIncompleteBrowser(language)));
  }

  try {
    const payload = verifyOAuthState(state);
    const user = await usersRepository.findByTelegramId(payload.telegramUserId);

    if (!user) {
      return res.status(404).send(html("Telegram user not found. Return to Telegram and send /start."));
    }

    const oauth2Client = createGoogleOAuthClient();
    const tokenResponse = await oauth2Client.getToken(code);
    const credentials = tokenResponse.tokens;

    if (!credentials.access_token) {
      return res.status(400).send(html("Google did not return an access token. Please try again."));
    }

    const language = getLanguage(user.language);

    if (!hasGrantedCalendarScope(credentials.scope)) {
      await revokeGrantedToken(credentials.refresh_token ?? credentials.access_token);

      try {
        await bot?.api.sendMessage(user.telegram_id, messages.oauthCalendarScopeMissingTelegram(language), {
          reply_markup: reconnectGoogleKeyboard(user.telegram_id, language),
        });
      } catch {
        // The browser callback should still succeed if Telegram delivery fails.
      }

      return res.status(400).send(html(messages.oauthCalendarScopeMissingBrowser(language)));
    }

    const googleEmail = await getGoogleEmail(credentials);

    if (!googleEmail) {
      return res.status(400).send(html("Could not read your Google email. Please try again."));
    }

    const existingConnection = await googleConnectionsRepository.findByUserId(user.id);

    if (credentials.refresh_token) {
      await googleConnectionsRepository.upsert({
        userId: user.id,
        googleEmail,
        encryptedRefreshToken: encryptToken(credentials.refresh_token),
      });
    } else if (existingConnection) {
      await googleConnectionsRepository.updateEmail(user.id, googleEmail);
    } else {
      return res.status(400).send(
        html("Google did not return a refresh token. Please reconnect Google Calendar and approve offline access."),
      );
    }

    const callbackMessage = language === "ru"
      ? `${messages.googleConnected(language)} Вернитесь в Telegram.`
      : `${messages.googleConnected(language)} Return to Telegram.`;

    try {
      const pendingJoinAction = await pendingActionsRepository.findByUserIdAndType(user.id, "calendar_join");
      const pendingJoin = pendingJoinAction && new Date(pendingJoinAction.expires_at).getTime() > Date.now()
        ? parseCalendarJoinPayload(pendingJoinAction.payload)
        : null;

      if (pendingJoin) {
        await sendCalendarJoinPreview({
          reply: async (text, options) => {
            if (!bot) {
              throw new Error("Telegram bot is not configured");
            }

            return bot.api.sendMessage(user.telegram_id, text, options);
          },
        }, user, pendingJoin.rawToken);

        return res.send(html(callbackMessage));
      }

      if (pendingJoinAction) {
        await pendingActionsRepository.deleteByUserIdAndType(user.id, "calendar_join");
      }

      const calendars = await calendarsRepository.findForUser(user.id);

      if (calendars.length === 0) {
        await bot?.api.sendMessage(user.telegram_id, [
          messages.googleConnected(language),
          "",
          messages.noCalendars(language),
        ].join("\n"), {
          reply_markup: noCalendarsKeyboard(language),
        });
      } else {
        const activeCalendar = await getActiveOrFirstCalendar(user.id);

        if (activeCalendar) {
          const checkedActiveCalendar = await checkCalendarAvailability(activeCalendar);
          const availableCalendar = checkedActiveCalendar.status === "available"
            ? checkedActiveCalendar
            : await getActiveOrFirstAvailableCalendar(user.id);

          if (!availableCalendar) {
            await bot?.api.sendMessage(user.telegram_id, messages.noCalendars(language), {
              reply_markup: noCalendarsKeyboard(language),
            });
          } else {
            await bot?.api.sendMessage(user.telegram_id, messages.welcomeBack(
              language,
              availableCalendar.metadata.summary,
            ), {
              reply_markup: mainCalendarKeyboard(language),
            });
          }
        } else {
          await bot?.api.sendMessage(user.telegram_id, messages.noCalendars(language), {
            reply_markup: noCalendarsKeyboard(language),
          });
        }
      }
    } catch {
      // The browser callback should still succeed if Telegram delivery fails.
    }

    return res.send(html(callbackMessage));
  } catch (error) {
    console.error("Google OAuth callback failed:", {
      operation: "google_oauth_callback_success_flow",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return res.status(400).send(html(messages.oauthGenericErrorBrowser("en")));
  }
});
