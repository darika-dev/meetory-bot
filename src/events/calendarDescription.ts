import type { DetectedLink } from "../ai/eventParser.js";
import { preserveHiddenLinksInText, type TelegramTextEntity } from "../telegram/linkExtraction.js";

const hashtagLinePattern = /^(\s*#[^\s#]+\s*)+$/u;
const footerLinePattern = /(куда пойти|cyproplan|telegram|канал|подписывайтесь|подписаться|source|aggregator)/i;
const informativeCharacterPattern = /[\p{L}\p{N}]/u;
const urlPattern = /https?:\/\/\S+/i;

function normalizeForComparison(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^["'«»\s]+|["'«»\s]+$/g, "")
    .trim()
    .toLowerCase();
}

function isDecorativeLine(line: string) {
  const trimmed = line.trim();

  return Boolean(trimmed)
    && !urlPattern.test(trimmed)
    && !informativeCharacterPattern.test(trimmed)
    && trimmed.length <= 40;
}

function isFooterLine(line: string) {
  const trimmed = line.trim();

  return hashtagLinePattern.test(trimmed)
    || footerLinePattern.test(trimmed)
    || isDecorativeLine(trimmed);
}

function trimEmptyEdges(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start].trim()) {
    start += 1;
  }

  while (end > start && !lines[end - 1].trim()) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function removeTrailingFooter(lines: string[]) {
  const result = [...lines];

  while (result.length > 0) {
    const lastLine = result[result.length - 1];

    if (!lastLine.trim() || isFooterLine(lastLine)) {
      result.pop();
      continue;
    }

    break;
  }

  return result;
}

function removeStandaloneTitleLine(lines: string[], parsedTitle: string | null) {
  if (!parsedTitle) {
    return lines;
  }

  const title = normalizeForComparison(parsedTitle);
  const firstContentIndex = lines.findIndex((line) => Boolean(line.trim()));

  if (firstContentIndex === -1) {
    return lines;
  }

  const firstLine = normalizeForComparison(lines[firstContentIndex]);

  if (firstLine && firstLine === title) {
    return [
      ...lines.slice(0, firstContentIndex),
      ...lines.slice(firstContentIndex + 1),
    ];
  }

  return lines;
}

function descriptionContainsUrl(description: string, url: string | null) {
  return Boolean(url && description.includes(url));
}

function findDetectedLink(links: DetectedLink[], url: string | null) {
  return url ? links.find((link) => link.url === url) ?? null : null;
}

function isFooterDetectedLink(link: DetectedLink | null) {
  return Boolean(link && footerLinePattern.test(link.text));
}

export function cleanSourceDescription(input: {
  sourceTextWithLinks: string;
  parsedTitle: string | null;
}) {
  const withoutFooter = removeTrailingFooter(input.sourceTextWithLinks.split(/\r?\n/));
  const withoutTitle = removeStandaloneTitleLine(withoutFooter, input.parsedTitle);

  return trimEmptyEdges(withoutTitle).join("\n").trim();
}

export function buildCalendarDescription(input: {
  sourceText: string;
  entities?: TelegramTextEntity[];
  parsedTitle: string | null;
  eventUrl: string | null;
  locationUrl: string | null;
  sourceUrl: string | null;
  extractedLinks: DetectedLink[];
}) {
  const sourceTextWithLinks = preserveHiddenLinksInText({
    text: input.sourceText,
    entities: input.entities ?? [],
  });
  const cleaned = cleanSourceDescription({
    sourceTextWithLinks,
    parsedTitle: input.parsedTitle,
  });
  const parts = cleaned ? [cleaned] : [];

  if (input.eventUrl && !descriptionContainsUrl(cleaned, input.eventUrl)) {
    parts.push(`Original event:\n${input.eventUrl}`);
  }

  if (input.locationUrl && !descriptionContainsUrl(cleaned, input.locationUrl)) {
    parts.push(`Map:\n${input.locationUrl}`);
  }

  const sourceLink = findDetectedLink(input.extractedLinks, input.sourceUrl);

  if (
    input.sourceUrl
    && !descriptionContainsUrl(cleaned, input.sourceUrl)
    && !isFooterDetectedLink(sourceLink)
  ) {
    parts.push(`Source:\n${input.sourceUrl}`);
  }

  return parts.join("\n\n");
}
