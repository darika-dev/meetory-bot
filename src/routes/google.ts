import { Router } from "express";
import { bot } from "../bot.js";
import { createGoogleAuthorizationUrl, createGoogleOAuthClient, getGoogleEmail } from "../google/oauth.js";
import { getLanguage, messages } from "../i18n.js";
import * as calendarsRepository from "../repositories/calendars.js";
import * as googleConnectionsRepository from "../repositories/googleConnections.js";
import * as usersRepository from "../repositories/users.js";
import { verifyOAuthState } from "../security/oauthState.js";
import { encryptToken } from "../security/tokenEncryption.js";
import { mainCalendarKeyboard, noCalendarsKeyboard } from "../telegramScreens.js";

export const googleRouter = Router();

function html(message: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meetory</title>
  </head>
  <body>
    <p>${message}</p>
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

  if (!code || !state) {
    return res.status(400).send(html("Missing OAuth code or state."));
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

    const googleEmail = await getGoogleEmail(credentials.access_token);

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

    const language = getLanguage(user.language);
    const callbackMessage = language === "ru"
      ? `${messages.googleConnected(language)} Вернитесь в Telegram.`
      : `${messages.googleConnected(language)} Return to Telegram.`;

    try {
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
          await bot?.api.sendMessage(user.telegram_id, messages.welcomeBack(language, activeCalendar.name), {
            reply_markup: mainCalendarKeyboard(language),
          });
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
  } catch {
    return res.status(400).send(html("Google Calendar connection failed. Please try again."));
  }
});
