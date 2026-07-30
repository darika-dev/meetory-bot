export function getAppBaseUrl() {
  const appBaseUrl = process.env.APP_URL;

  if (!appBaseUrl) {
    throw new Error("APP_URL is required");
  }

  return appBaseUrl.replace(/\/$/, "");
}

export function getGoogleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI ?? `${getAppBaseUrl()}/google/callback`;
}

export function getCalendarInviteTtlDays() {
  const raw = process.env.CALENDAR_INVITE_TTL_DAYS;

  if (!raw) {
    return 7;
  }

  const value = Number(raw);

  return Number.isInteger(value) && value > 0 ? value : 7;
}

export function getConfiguredTelegramBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() || null;
}
