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
