import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dbInit = readFileSync(new URL("../../db/init.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../../src/repositories/calendarMembers.ts", import.meta.url), "utf8");
const calendarsRepository = readFileSync(new URL("../../src/repositories/calendars.ts", import.meta.url), "utf8");
const accessService = readFileSync(new URL("../../src/calendars/calendarAccess.ts", import.meta.url), "utf8");
const connectionResolver = readFileSync(new URL("../../src/calendars/calendarGoogleConnection.ts", import.meta.url), "utf8");
const calendarService = readFileSync(new URL("../../src/google/calendarService.ts", import.meta.url), "utf8");
const eventSourceClaims = readFileSync(new URL("../../src/repositories/eventSourceClaims.ts", import.meta.url), "utf8");

test("calendar_members migration has roles, created_at, owner backfill, and one-owner constraint", () => {
  assert.match(dbInit, /CREATE TABLE IF NOT EXISTS calendar_members/);
  assert.match(dbInit, /role TEXT NOT NULL CHECK \(role IN \('owner', 'member'\)\)/);
  assert.match(dbInit, /ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  assert.match(dbInit, /INSERT INTO calendar_members \(\s*calendar_id,\s*user_id,\s*role\s*\)/);
  assert.match(dbInit, /SELECT\s+calendars\.id,\s+calendars\.created_by_user_id,\s+'owner'/);
  assert.match(dbInit, /ON CONFLICT \(calendar_id, user_id\)\s*DO UPDATE SET role = 'owner'/);
  assert.match(dbInit, /calendar_members_one_owner_per_calendar_idx/);
  assert.match(dbInit, /WHERE role = 'owner'/);
});

test("calendar members repository exposes targeted membership operations", () => {
  for (const functionName of [
    "listCalendarMembers",
    "getCalendarMembership",
    "isCalendarMember",
    "isCalendarOwner",
    "addCalendarMember",
    "removeCalendarMember",
    "leaveCalendar",
    "removeMemberAndChooseFallback",
  ]) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\(`));
  }

  assert.match(repository, /DELETE FROM calendar_members/);
  assert.match(repository, /AND role = 'member'/);
});

test("calendar access checks are centralized and used by Google event operations", () => {
  assert.match(accessService, /export async function getCalendarAccess/);
  assert.match(accessService, /export async function assertCalendarMember/);
  assert.match(accessService, /export async function assertCalendarOwner/);
  assert.match(accessService, /getCalendarMembership\(calendarId, userId\)/);
  assert.match(calendarService, /assertCalendarMember\(input\.calendarId, input\.userId\)/);
});

test("shared Google operations resolve the owner connection centrally", () => {
  assert.match(connectionResolver, /export async function resolveCalendarGoogleConnection/);
  assert.match(connectionResolver, /calendar\.created_by_user_id/);
  assert.match(connectionResolver, /googleConnectionsRepository\.findByUserId\(calendar\.created_by_user_id\)/);
  assert.match(connectionResolver, /CalendarGoogleConnectionUnavailableError/);
  assert.match(calendarService, /resolveCalendarGoogleConnection\(input\.calendarId\)/);
  assert.match(calendarService, /resolveCalendarGoogleConnection\(calendarRecord\.id\)/);
});

test("event source dedupe is scoped to calendar and cleaned up on delete", () => {
  assert.match(eventSourceClaims, /calendar:\$\{input\.calendarId\}:telegram-message:/);
  assert.match(dbInit, /CREATE TABLE IF NOT EXISTS event_source_claims/);
  assert.match(calendarsRepository, /DELETE FROM event_source_claims/);
  assert.match(calendarsRepository, /idempotency_key LIKE \('calendar:' \|\|/);
});
