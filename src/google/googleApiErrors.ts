export type GoogleApiErrorKind =
  | "calendar_not_found"
  | "calendar_access_denied"
  | "oauth_invalid"
  | "rate_limited"
  | "temporary_google_error"
  | "unknown";

function getStatus(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: {
      status?: unknown;
    };
  };
  const status = candidate.response?.status ?? candidate.status ?? candidate.code;

  return typeof status === "number" ? status : null;
}

function collectReasons(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return [];
  }

  const candidate = error as {
    errors?: Array<{ reason?: unknown }>;
    response?: {
      data?: {
        error?: string | {
          errors?: Array<{ reason?: unknown }>;
          status?: unknown;
        };
      };
    };
  };
  const reasons = [
    ...(candidate.errors ?? []),
    ...(
      typeof candidate.response?.data?.error === "object"
        ? candidate.response.data.error.errors ?? []
        : []
    ),
  ]
    .map((item) => item.reason)
    .filter((reason): reason is string => typeof reason === "string");
  const responseError = candidate.response?.data?.error;

  if (typeof responseError === "string") {
    reasons.push(responseError);
  }

  if (typeof responseError === "object" && typeof responseError.status === "string") {
    reasons.push(responseError.status);
  }

  return reasons.map((reason) => reason.toLowerCase());
}

function getMessage(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

export function classifyGoogleApiError(error: unknown): GoogleApiErrorKind {
  const status = getStatus(error);
  const reasons = collectReasons(error);
  const message = getMessage(error);
  const reasonText = reasons.join(" ");

  if (status === 404 || status === 410 || reasonText.includes("notfound") || reasonText.includes("gone")) {
    return "calendar_not_found";
  }

  if (
    reasonText.includes("invalid_grant")
    || message.includes("invalid_grant")
    || message.includes("invalid grant")
    || message.includes("token has been expired or revoked")
    || message.includes("google connection not found")
    || message.includes("google connection is disconnected")
  ) {
    return "oauth_invalid";
  }

  if (status === 429 || reasonText.includes("ratelimit") || reasonText.includes("rate_limit")) {
    return "rate_limited";
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return "temporary_google_error";
  }

  if (
    status === 403
    || reasonText.includes("forbidden")
    || reasonText.includes("insufficientpermissions")
    || reasonText.includes("accessnotconfigured")
    || reasonText.includes("access_not_configured")
  ) {
    return "calendar_access_denied";
  }

  return "unknown";
}
