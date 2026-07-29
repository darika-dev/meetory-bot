import type { DetectedLink, ParsedEvent } from "./eventParser.js";

const eventLabelPattern = /\b(тут|here|подробнее|details|tickets?|register|registration|event|программа|информация)\b/i;
const sourceLabelPattern = /\b(source|footer|aggregator|cyproplan|telegram|channel|канал|источник)\b/i;
const eventContextPattern = /\b(информация|подробнее|программа|tickets?|register|registration|event|details)\b/i;

function getUrlHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isMapLink(link: DetectedLink) {
  const host = getUrlHost(link.url);

  return [
    "maps.app.goo.gl",
    "google.com",
    "www.google.com",
    "maps.google.com",
    "apple.com",
    "maps.apple.com",
    "mapy.cz",
    "www.mapy.cz",
    "openstreetmap.org",
    "www.openstreetmap.org",
  ].some((mapHost) => host === mapHost || host.endsWith(`.${mapHost}`));
}

function isEventLink(link: DetectedLink) {
  return eventLabelPattern.test(link.text) || eventContextPattern.test(link.text);
}

function isSourceLink(link: DetectedLink) {
  return sourceLabelPattern.test(link.text) || sourceLabelPattern.test(getUrlHost(link.url));
}

export function getUrlHostForLog(value: string | null) {
  return value ? getUrlHost(value) || undefined : undefined;
}

export function applyLinkFallback(parsed: ParsedEvent, detectedLinks: DetectedLink[]) {
  if (
    detectedLinks.length === 0 ||
    parsed.eventUrl ||
    parsed.locationUrl ||
    parsed.sourceUrl
  ) {
    return parsed;
  }

  let eventUrl: string | null = null;
  let locationUrl: string | null = null;
  let sourceUrl: string | null = null;
  const unclassified: DetectedLink[] = [];

  for (const link of detectedLinks) {
    if (!locationUrl && isMapLink(link)) {
      locationUrl = link.url;
      continue;
    }

    if (!eventUrl && isEventLink(link)) {
      eventUrl = link.url;
      continue;
    }

    if (!sourceUrl && isSourceLink(link)) {
      sourceUrl = link.url;
      continue;
    }

    unclassified.push(link);
  }

  if (!eventUrl && unclassified.length === 1) {
    eventUrl = unclassified[0].url;
  }

  if (!eventUrl && unclassified.length > 1) {
    eventUrl = unclassified[0].url;
  }

  if (!sourceUrl && unclassified.length > 1) {
    sourceUrl = unclassified[unclassified.length - 1].url;
  }

  return {
    ...parsed,
    eventUrl,
    locationUrl,
    sourceUrl,
  } satisfies ParsedEvent;
}
