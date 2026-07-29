export type OpenAIErrorKind =
  | "missing_api_key"
  | "insufficient_quota"
  | "rate_limited"
  | "temporary_openai_error"
  | "unknown";

function getStatus(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as {
    status?: unknown;
    code?: unknown;
  };
  const status = candidate.status ?? candidate.code;

  return typeof status === "number" ? status : null;
}

function getCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return "";
  }

  const candidate = error as {
    code?: unknown;
    error?: {
      code?: unknown;
      type?: unknown;
    };
  };
  const code = candidate.error?.code ?? candidate.error?.type ?? candidate.code;

  return typeof code === "string" ? code.toLowerCase() : "";
}

function getMessage(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

export function classifyOpenAIError(error: unknown): OpenAIErrorKind {
  const status = getStatus(error);
  const code = getCode(error);
  const message = getMessage(error);

  if (message.includes("openai_api_key is required")) {
    return "missing_api_key";
  }

  if (
    code.includes("insufficient_quota")
    || code.includes("billing")
    || message.includes("insufficient_quota")
    || message.includes("billing")
    || message.includes("quota")
  ) {
    return "insufficient_quota";
  }

  if (status === 429 || code.includes("rate_limit")) {
    return "rate_limited";
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return "temporary_openai_error";
  }

  return "unknown";
}
