import assert from "node:assert/strict";
import test from "node:test";
import { applyLinkFallback } from "../src/ai/eventLinkFallback.js";
import { validateParsedEvent, type ParsedEvent } from "../src/ai/eventParser.js";
import { buildConfirmEventPayload, parseConfirmEventPayload } from "../src/events/eventDraft.js";
import { buildBaseEventRequestBody, type GoogleEventDraft } from "../src/google/calendarService.js";
import { extractLinksFromTextEntities, preserveHiddenLinksInText } from "../src/telegram/linkExtraction.js";

function parsedEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    isEvent: true,
    scheduleType: "single",
    title: "Festival",
    startDate: "2026-08-01",
    startTime: "20:00",
    endDate: "2026-08-01",
    endTime: "23:00",
    isAllDay: false,
    location: "Missing persons square",
    price: null,
    description: "Description",
    eventUrl: null,
    locationUrl: null,
    sourceUrl: null,
    confidence: 0.9,
    missingFields: [],
    ...overrides,
  };
}

function googleDraft(scheduleType: GoogleEventDraft["scheduleType"]): GoogleEventDraft {
  return {
    scheduleType,
    title: "Festival",
    startDate: "2026-08-01",
    startTime: scheduleType === "all_day_range" ? null : "20:00",
    endDate: scheduleType === "all_day_range" ? "2026-08-03" : "2026-08-01",
    endTime: scheduleType === "all_day_range" ? null : "23:00",
    isAllDay: scheduleType === "all_day_range",
    location: "Missing persons square",
    price: null,
    description: "Description",
    eventUrl: "https://www.checkincyprus.com/article/88255/example/",
    locationUrl: "https://maps.app.goo.gl/example",
    sourceUrl: "https://cyproplan.com",
  };
}

test("extracts visible URLs, map URLs, and Telegram text_link URLs", () => {
  const text = [
    "Информация:",
    "https://www.checkincyprus.com/article/88255/example/",
    "",
    "📍 Missing persons square",
    "https://maps.app.goo.gl/example",
    "",
    "Все мероприятия на сайте Cyproplan",
  ].join("\n");
  const labelOffset = text.indexOf("Cyproplan");
  const result = extractLinksFromTextEntities({
    text,
    entities: [
      {
        type: "text_link",
        offset: labelOffset,
        length: "Cyproplan".length,
        url: "https://cyproplan.com",
      },
    ],
  });

  assert.equal(result.links.length, 3);
  assert.deepEqual(result.links.map((link) => link.url), [
    "https://cyproplan.com",
    "https://www.checkincyprus.com/article/88255/example/",
    "https://maps.app.goo.gl/example",
  ]);
  assert.equal(result.summary.entityCount, 1);
  assert.equal(result.summary.rawCount, 2);
  assert.equal(result.summary.deduplicatedCount, 3);
});

test("preserves hidden Telegram text_link URLs next to original link text", () => {
  const text = "ℹ️ Программа и подробности ТУТ";
  const offset = text.indexOf("ТУТ");

  assert.equal(
    preserveHiddenLinksInText({
      text,
      entities: [{
        type: "text_link",
        offset,
        length: "ТУТ".length,
        url: "https://example.com/program",
      }],
    }),
    "ℹ️ Программа и подробности ТУТ [https://example.com/program]",
  );
});

test("preserves whole-line Telegram text_link URLs inline", () => {
  const text = "📍двор начальной школы деревни Друша";

  assert.equal(
    preserveHiddenLinksInText({
      text,
      entities: [{
        type: "text_link",
        offset: 0,
        length: text.length,
        url: "https://maps.app.goo.gl/droushia",
      }],
    }),
    "📍двор начальной школы деревни Друша [https://maps.app.goo.gl/droushia]",
  );
});

test("does not duplicate hidden link URL when URL is already visible", () => {
  const text = "Все мероприятия доступны в Cyproplan https://cyproplan.com";
  const offset = text.indexOf("Cyproplan");

  assert.equal(
    preserveHiddenLinksInText({
      text,
      entities: [{
        type: "text_link",
        offset,
        length: "Cyproplan".length,
        url: "https://cyproplan.com",
      }],
    }),
    text,
  );
});

test("OpenAI runtime validator preserves URL fields", () => {
  const parsed = validateParsedEvent({
    ...parsedEvent(),
    eventUrl: "https://event.example/details",
    locationUrl: "https://maps.app.goo.gl/example",
    sourceUrl: "https://source.example",
  });

  assert.equal(parsed.eventUrl, "https://event.example/details");
  assert.equal(parsed.locationUrl, "https://maps.app.goo.gl/example");
  assert.equal(parsed.sourceUrl, "https://source.example");
});

test("confirm_event payload serialization preserves URL fields", () => {
  const payload = buildConfirmEventPayload(parsedEvent({
    eventUrl: "https://event.example/details",
    locationUrl: "https://maps.app.goo.gl/example",
    sourceUrl: "https://source.example",
  }), "42");
  const parsedPayload = parseConfirmEventPayload(JSON.parse(JSON.stringify(payload)));

  assert.equal(parsedPayload?.eventUrl, "https://event.example/details");
  assert.equal(parsedPayload?.locationUrl, "https://maps.app.goo.gl/example");
  assert.equal(parsedPayload?.sourceUrl, "https://source.example");
});

test("calendar selection payload merge does not drop URL fields", () => {
  const payload = buildConfirmEventPayload(parsedEvent({
    eventUrl: "https://event.example/details",
    locationUrl: "https://maps.app.goo.gl/example",
    sourceUrl: "https://source.example",
  }), "42");
  const updatedPayload = {
    ...payload,
    status: "ready" as const,
    calendarId: "43",
  };

  assert.equal(updatedPayload.eventUrl, "https://event.example/details");
  assert.equal(updatedPayload.locationUrl, "https://maps.app.goo.gl/example");
  assert.equal(updatedPayload.sourceUrl, "https://source.example");
});

test("Google description appends detached event and map links for every schedule type", () => {
  for (const scheduleType of ["single", "daily_range", "all_day_range"] as const) {
    const requestBody = buildBaseEventRequestBody(googleDraft(scheduleType));

    assert.equal(typeof requestBody.description, "string");
    assert.match(requestBody.description as string, /Original event:\nhttps:\/\/www\.checkincyprus\.com\/article\/88255\/example\//);
    assert.match(requestBody.description as string, /Map:\nhttps:\/\/maps\.app\.goo\.gl\/example/);
    assert.doesNotMatch(requestBody.description as string, /Source:\nhttps:\/\/cyproplan\.com/);
    assert.doesNotMatch(requestBody.description as string, /null|undefined/);
  }
});

test("Google description keeps embedded text_link URLs and does not add detached blocks", () => {
  const requestBody = buildBaseEventRequestBody({
    ...googleDraft("single"),
    description: [
      "📍двор начальной школы деревни Друша [https://maps.app.goo.gl/droushia]",
      "ℹ️ Подробности ТУТ [https://www.checkincyprus.com/article/88255/example/]",
    ].join("\n"),
    eventUrl: "https://www.checkincyprus.com/article/88255/example/",
    locationUrl: "https://maps.app.goo.gl/droushia",
    sourceUrl: "https://cyproplan.com",
  });

  assert.equal(typeof requestBody.description, "string");
  assert.match(requestBody.description as string, /📍двор начальной школы деревни Друша \[https:\/\/maps\.app\.goo\.gl\/droushia\]/);
  assert.match(requestBody.description as string, /ℹ️ Подробности ТУТ \[https:\/\/www\.checkincyprus\.com\/article\/88255\/example\/\]/);
  assert.doesNotMatch(requestBody.description as string, /Original event:/);
  assert.doesNotMatch(requestBody.description as string, /Map:\n/);
  assert.doesNotMatch(requestBody.description as string, /Source:/);
  assert.doesNotMatch(requestBody.description as string, /https:\/\/cyproplan\.com/);
});

test("link fallback fills event and map URLs when OpenAI returns URL fields null", () => {
  const parsed = applyLinkFallback(parsedEvent(), [
    { text: "Информация", url: "https://www.checkincyprus.com/article/88255/example/" },
    { text: "Google Maps", url: "https://maps.app.goo.gl/example" },
  ]);

  assert.equal(parsed.eventUrl, "https://www.checkincyprus.com/article/88255/example/");
  assert.equal(parsed.locationUrl, "https://maps.app.goo.gl/example");
});
