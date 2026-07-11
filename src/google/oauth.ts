import { google } from "googleapis";
import { getGoogleRedirectUri } from "../config.js";
import type { GoogleConnection } from "../repositories/googleConnections.js";
import { decryptToken } from "../security/tokenEncryption.js";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is required");
  }

  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is required");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: getGoogleRedirectUri(),
  };
}

export function createGoogleOAuthClient() {
  const config = getGoogleOAuthConfig();

  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export function createGoogleAuthorizationUrl(state: string) {
  const oauth2Client = createGoogleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  });
}

export async function getGoogleEmail(accessToken: string) {
  const oauth2Client = createGoogleOAuthClient();

  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: "v2",
  });
  const response = await oauth2.userinfo.get();

  return response.data.email ?? null;
}

export async function revokeGoogleConnectionRefreshToken(connection: GoogleConnection) {
  const oauth2Client = createGoogleOAuthClient();

  await oauth2Client.revokeToken(decryptToken(connection.encrypted_refresh_token));
}
