import type { DetectedLink } from "../ai/eventParser.js";

export type TelegramTextEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};

export type LinkExtractionSummary = {
  entityCount: number;
  rawCount: number;
  deduplicatedCount: number;
  types: string[];
  hosts: string[];
};

const rawUrlPattern = /https?:\/\/[^\s<>"')\]]+/gi;

function normalizeUrl(value: string) {
  return value.trim().replace(/[.,;:!?]+$/, "");
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function preserveHiddenLinksInText(input: {
  text: string;
  entities: TelegramTextEntity[];
}) {
  let preparedText = input.text;
  const textLinkEntities = input.entities
    .filter((entity) => entity.type === "text_link" && entity.url)
    .sort((left, right) => right.offset - left.offset);

  for (const entity of textLinkEntities) {
    const url = normalizeUrl(entity.url ?? "");

    if (!url || input.text.includes(url)) {
      continue;
    }

    const label = input.text.slice(entity.offset, entity.offset + entity.length);

    if (!label.trim() || label.includes(url)) {
      continue;
    }

    const insertionPoint = entity.offset + entity.length;

    preparedText = `${preparedText.slice(0, insertionPoint)} [${url}]${preparedText.slice(insertionPoint)}`;
  }

  return preparedText;
}

export function summarizeDetectedLinks(input: {
  entityCount: number;
  rawCount: number;
  links: DetectedLink[];
  types: string[];
}): LinkExtractionSummary {
  return {
    entityCount: input.entityCount,
    rawCount: input.rawCount,
    deduplicatedCount: input.links.length,
    types: [...new Set(input.types)].sort(),
    hosts: [...new Set(input.links.map((link) => getHostname(link.url)).filter((host): host is string => Boolean(host)))].sort(),
  };
}

export function extractLinksFromTextEntities(input: {
  text: string;
  entities: TelegramTextEntity[];
}) {
  const links: DetectedLink[] = [];
  const seen = new Set<string>();
  const types: string[] = [];

  const addLink = (text: string, url: string, type: string) => {
    const normalizedUrl = normalizeUrl(url);
    const label = text.trim() || normalizedUrl;

    if (!normalizedUrl) {
      return;
    }

    const key = `${label}\n${normalizedUrl}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    types.push(type);
    links.push({ text: label, url: normalizedUrl });
  };

  for (const entity of input.entities) {
    if (entity.type !== "url" && entity.type !== "text_link") {
      continue;
    }

    const label = input.text.slice(entity.offset, entity.offset + entity.length);
    const url = entity.type === "text_link" ? entity.url : label;

    if (url) {
      addLink(label, url, entity.type);
    }
  }

  const rawMatches = input.text.match(rawUrlPattern) ?? [];

  for (const rawUrl of rawMatches) {
    addLink(rawUrl, rawUrl, "raw_url");
  }

  return {
    links,
    summary: summarizeDetectedLinks({
      entityCount: input.entities.length,
      rawCount: rawMatches.length,
      links,
      types,
    }),
  };
}
