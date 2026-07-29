import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarDescription } from "../src/events/calendarDescription.js";
import { buildConfirmEventPayload, parseConfirmEventPayload } from "../src/events/eventDraft.js";
import type { ParsedEvent } from "../src/ai/eventParser.js";

const sourceText = [
  "В пятницу в деревне Агиос Теодорос под Ларнакой состоится 12й фестиваль «Вкусы пасты». Здесь можно будет попробовать традиционные макарошки с томатом под названием \"хондрофье\". Также будут:",
  "",
  "🍝 мастер-классы по приготовлению традиционной кипрской пасты \"склинитзья\" и \"три\" с молоком",
  "🎅 Ярмарка изделий",
  "🍢 Еда и напитки",
  "🎶 Танцевальные выступления и живая музыка, концерт Стефаноса Пелеканиса",
  "",
  "ℹ️ Подробности ТУТ",
  "",
  "Куда пойти на Кипре 🇨🇾",
  "📖📖📖📖📖📖",
  "#Кипр #события #афишакипр",
].join("\n");

function parsedEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    isEvent: true,
    scheduleType: "single",
    title: "12-й фестиваль «Вкусы пасты»",
    startDate: "2026-07-31",
    startTime: "19:00",
    endDate: null,
    endTime: null,
    isAllDay: false,
    location: "Агиос Теодорос",
    description: "12-й фестиваль «Вкусы пасты» в деревне Агиос Теодорос под Ларнакой. 31 июля, 19:00. Вход свободный.",
    eventUrl: "https://example.com/details",
    locationUrl: null,
    sourceUrl: "https://t.me/cyprus_events",
    confidence: 0.9,
    missingFields: [],
    ...overrides,
  };
}

function buildExampleDescription() {
  const detailsOffset = sourceText.indexOf("ТУТ");
  const footerOffset = sourceText.indexOf("Куда пойти на Кипре 🇨🇾");

  return buildCalendarDescription({
    sourceText,
    entities: [
      {
        type: "text_link",
        offset: detailsOffset,
        length: "ТУТ".length,
        url: "https://example.com/details",
      },
      {
        type: "text_link",
        offset: footerOffset,
        length: "Куда пойти на Кипре 🇨🇾".length,
        url: "https://t.me/cyprus_events",
      },
    ],
    parsedTitle: "12-й фестиваль «Вкусы пасты»",
    eventUrl: "https://example.com/details",
    locationUrl: null,
    sourceUrl: "https://t.me/cyprus_events",
    extractedLinks: [
      { text: "ТУТ", url: "https://example.com/details" },
      { text: "Куда пойти на Кипре 🇨🇾", url: "https://t.me/cyprus_events" },
    ],
  });
}

test("calendar description preserves emojis, paragraphs, and source wording", () => {
  const description = buildExampleDescription();

  for (const emoji of ["🍝", "🎅", "🍢", "🎶", "ℹ️"]) {
    assert.match(description, new RegExp(emoji, "u"));
  }

  assert.match(description, /Также будут:\n\n🍝 мастер-классы/);
  assert.match(description, /традиционные макарошки с томатом под названием "хондрофье"/);
});

test("calendar description preserves hidden link inline and removes footer", () => {
  const description = buildExampleDescription();

  assert.match(description, /ℹ️ Подробности ТУТ \[https:\/\/example\.com\/details\]/);
  assert.doesNotMatch(description, /Original event:/);
  assert.doesNotMatch(description, /Куда пойти на Кипре/);
  assert.doesNotMatch(description, /https:\/\/t\.me\/cyprus_events/);
  assert.doesNotMatch(description, /#Кипр|#события|#афишакипр/);
  assert.doesNotMatch(description, /📖📖📖/);
});

test("calendar description does not inject parsed metadata", () => {
  const description = buildExampleDescription();

  assert.doesNotMatch(description, /31 июля, 19:00/);
  assert.doesNotMatch(description, /Вход свободный/);
  assert.doesNotMatch(description, /12-й фестиваль «Вкусы пасты» в деревне/);
});

test("confirm_event lifecycle preserves source description separately from AI description", () => {
  const sourceDescription = buildExampleDescription();
  const payload = buildConfirmEventPayload(
    parsedEvent(),
    "42",
    "00000000-0000-4000-8000-000000000001",
    sourceDescription,
  );
  const restored = parseConfirmEventPayload(JSON.parse(JSON.stringify({
    ...payload,
    calendarId: "43",
  })));

  assert.ok(restored);
  assert.equal(restored.calendarId, "43");
  assert.equal(restored.description, parsedEvent().description);
  assert.equal(restored.sourceDescription, sourceDescription);
});
