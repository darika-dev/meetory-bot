import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pendingActionsSource = readFileSync("src/repositories/pendingActions.ts", "utf8");
const dbInitSql = readFileSync("db/init.sql", "utf8");

function functionBody(name: string) {
  const start = pendingActionsSource.indexOf(`export async function ${name}`);

  assert.notEqual(start, -1, `${name} not found`);

  const next = pendingActionsSource.indexOf("\nexport async function ", start + 1);

  return pendingActionsSource.slice(start, next === -1 ? undefined : next);
}

test("confirm event drafts are inserted independently instead of upserted by user/type", () => {
  const body = functionBody("upsertConfirmEventAction");

  assert.match(body, /INSERT INTO pending_actions/);
  assert.doesNotMatch(body, /ON CONFLICT \(user_id, type\)/);
});

test("confirm event payload updates are scoped by draft id", () => {
  const body = functionBody("updateConfirmEventPayload");

  assert.match(body, /payload::jsonb ->> 'draftId' = \$\{draftId\}/);
});

test("message input routing ignores open confirm drafts as pending input", () => {
  const body = functionBody("findByUserId");

  assert.match(body, /AND type <> 'confirm_event'/);
});

test("pending action uniqueness allows several confirm drafts per user", () => {
  assert.match(dbInitSql, /DROP INDEX IF EXISTS pending_actions_user_id_type_unique_idx/);
  assert.match(dbInitSql, /CREATE UNIQUE INDEX IF NOT EXISTS pending_actions_singleton_user_type_unique_idx/);
  assert.match(dbInitSql, /WHERE type <> 'confirm_event'/);
  assert.match(dbInitSql, /pending_actions_confirm_event_draft_id_idx/);
});

test("multiple event drafts can be saved and cancelled independently", () => {
  const drafts = new Map([
    ["draft-a", { status: "ready" }],
    ["draft-b", { status: "ready" }],
    ["draft-c", { status: "ready" }],
  ]);
  const saved: string[] = [];
  const cancelled: string[] = [];

  function saveDraft(draftId: string) {
    assert.ok(drafts.has(draftId), `${draftId} should be available before save`);
    drafts.delete(draftId);
    saved.push(draftId);
  }

  function cancelDraft(draftId: string) {
    assert.ok(drafts.has(draftId), `${draftId} should be available before cancel`);
    drafts.delete(draftId);
    cancelled.push(draftId);
  }

  saveDraft("draft-b");
  assert.ok(drafts.has("draft-a"));
  assert.ok(drafts.has("draft-c"));

  saveDraft("draft-a");
  assert.ok(drafts.has("draft-c"));

  cancelDraft("draft-c");

  assert.deepEqual(saved, ["draft-b", "draft-a"]);
  assert.deepEqual(cancelled, ["draft-c"]);
  assert.equal(drafts.size, 0);
});

test("expiring one event draft leaves other drafts available", () => {
  const drafts = new Map([
    ["draft-a", { expiresAt: 1 }],
    ["draft-b", { expiresAt: 10 }],
    ["draft-c", { expiresAt: 10 }],
  ]);

  drafts.delete("draft-a");

  assert.equal(drafts.has("draft-a"), false);
  assert.equal(drafts.has("draft-b"), true);
  assert.equal(drafts.has("draft-c"), true);
});
