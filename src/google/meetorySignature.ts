export const MEETORY_SIGNATURE = "Saved with Meetory";

const signatureLinePattern = /^\s*Saved with Meetory\s*$/;

function normalizeDescriptionText(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendMeetorySignature(description?: string | null) {
  const lines = (description ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !signatureLinePattern.test(line));

  const normalized = normalizeDescriptionText(lines.join("\n"));

  return normalized
    ? `${normalized}\n\n${MEETORY_SIGNATURE}`
    : MEETORY_SIGNATURE;
}
