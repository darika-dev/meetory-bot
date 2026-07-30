import { createHash, randomBytes } from "crypto";

export function generateCalendarInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCalendarInviteToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isValidCalendarInviteTokenShape(rawToken: string) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(rawToken);
}
