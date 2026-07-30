import assert from "node:assert/strict";
import test from "node:test";
import { getLanguage, messages, t } from "../src/i18n/index.js";

test("returns English dictionary strings", () => {
  assert.equal(t("en").buttons.saveEvent, "💾 Save");
  assert.equal(messages.eventDraftTitle("en"), "I found an event:");
});

test("returns Russian dictionary strings", () => {
  assert.equal(t("ru").buttons.saveEvent, "💾 Сохранить");
  assert.equal(messages.eventDraftTitle("ru"), "Я нашёл мероприятие:");
});

test("formats variables without eval", () => {
  assert.equal(
    t("en").format("calendar.created", {
      calendarName: "Family",
    }),
    "✅ Calendar \"Family\" created.\n\nIt is now your active calendar.",
  );
  assert.equal(
    messages.dailyRangeEventsWillBeCreated("ru", 3),
    "Будет создано событий: 3.",
  );
});

test("normalizes unsupported language to English", () => {
  assert.equal(getLanguage("de"), "en");
  assert.equal(t("de").buttons.cancel, "✖️ Cancel");
});

test("missing translation key throws a predictable error", () => {
  assert.throws(
    () => t("en").format("calendar.missing" as Parameters<ReturnType<typeof t>["format"]>[0]),
    /Missing i18n key: calendar\.missing/,
  );
});
