import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  telegramUserId: string;
  expiresAt: number;
  nonce: string;
};

function getStateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET;

  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET is required");
  }

  return secret;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(telegramUserId: string) {
  const payload: OAuthStatePayload = {
    telegramUserId,
    expiresAt: Date.now() + STATE_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const [encodedPayload, signature] = state.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;

  if (!payload.telegramUserId || !payload.expiresAt || !payload.nonce) {
    throw new Error("Invalid OAuth state payload");
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error("Expired OAuth state");
  }

  return payload;
}
