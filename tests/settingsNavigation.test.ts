import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const botSource = readFileSync(new URL("../../src/bot.ts", import.meta.url), "utf8");

function callbackHandlerBody(start: string) {
  const startIndex = botSource.indexOf(start);

  assert.notEqual(startIndex, -1, `Missing callback handler: ${start}`);

  const nextIndex = botSource.indexOf("\nbot?.callbackQuery", startIndex + start.length);

  return botSource.slice(startIndex, nextIndex === -1 ? undefined : nextIndex);
}

for (const callbackStart of [
  'bot?.callbackQuery("settings:digest:tomorrow:toggle"',
  "bot?.callbackQuery(/^settings:digest:tomorrow:time:/",
  'bot?.callbackQuery("settings:digest:weekend:toggle"',
  "bot?.callbackQuery(/^settings:digest:weekend:time:/",
  "bot?.callbackQuery(/^settings:digest:weekend:day:/",
]) {
  test(`${callbackStart} returns to Settings after successful update`, () => {
    const body = callbackHandlerBody(callbackStart);

    assert.match(body, /settingsSaved/);
    assert.match(body, /return showSettingsMenu\(ctx, user\)/);
    assert.doesNotMatch(body, /return showTomorrowDigestSettings\(ctx, user\)/);
    assert.doesNotMatch(body, /return showWeekendDigestSettings\(ctx, user\)/);
  });
}
