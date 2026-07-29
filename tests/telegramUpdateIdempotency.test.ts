import assert from "node:assert/strict";
import test from "node:test";
import type { Update } from "grammy/types";
import { processTelegramUpdateOnce, type TelegramUpdateStore } from "../src/telegram/updateIdempotency.js";

class InMemoryTelegramUpdateStore implements TelegramUpdateStore {
  private statuses = new Map<number, "processing" | "completed" | "failed">();

  async claimTelegramUpdate(input: {
    updateId: number;
    updateType: string;
    expiresAt?: Date;
  }) {
    if (this.statuses.has(input.updateId)) {
      return false;
    }

    this.statuses.set(input.updateId, "processing");

    return true;
  }

  async markTelegramUpdateCompleted(updateId: number) {
    this.statuses.set(updateId, "completed");
  }

  async markTelegramUpdateFailed(updateId: number) {
    this.statuses.set(updateId, "failed");
  }

  getStatus(updateId: number) {
    return this.statuses.get(updateId);
  }
}

function messageUpdate(updateId: number): Update {
  return {
    update_id: updateId,
    message: {
      message_id: 10,
      date: 1,
      from: {
        id: 30,
        is_bot: false,
        first_name: "Test",
      },
      chat: {
        id: 20,
        type: "private",
        first_name: "Test",
      },
      text: "1 августа, 20:00",
    },
  };
}

function meta() {
  return {
    deploymentId: "test-deployment",
    requestId: "test-request",
  };
}

test("same Telegram update is processed once sequentially", async () => {
  const store = new InMemoryTelegramUpdateStore();
  let handled = 0;

  const first = await processTelegramUpdateOnce({
    update: messageUpdate(100),
    meta: meta(),
    store,
    handleUpdate: async () => {
      handled += 1;
    },
  });
  const second = await processTelegramUpdateOnce({
    update: messageUpdate(100),
    meta: meta(),
    store,
    handleUpdate: async () => {
      handled += 1;
    },
  });

  assert.equal(first.status, "completed");
  assert.equal(second.status, "duplicate");
  assert.equal(handled, 1);
  assert.equal(store.getStatus(100), "completed");
});

test("same Telegram update is processed once under concurrent delivery", async () => {
  const store = new InMemoryTelegramUpdateStore();
  let handled = 0;

  const results = await Promise.all(Array.from({ length: 4 }, () =>
    processTelegramUpdateOnce({
      update: messageUpdate(101),
      meta: meta(),
      store,
      handleUpdate: async () => {
        handled += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    })
  ));

  assert.equal(handled, 1);
  assert.equal(results.filter((result) => result.status === "completed").length, 1);
  assert.equal(results.filter((result) => result.status === "duplicate").length, 3);
});

test("different Telegram update IDs are all processed", async () => {
  const store = new InMemoryTelegramUpdateStore();
  let handled = 0;

  const results = await Promise.all([201, 202, 203, 204].map((updateId) =>
    processTelegramUpdateOnce({
      update: messageUpdate(updateId),
      meta: meta(),
      store,
      handleUpdate: async () => {
        handled += 1;
      },
    })
  ));

  assert.equal(handled, 4);
  assert.equal(results.every((result) => result.status === "completed"), true);
});

test("duplicate Telegram update after failed does not retry hidden work", async () => {
  const store = new InMemoryTelegramUpdateStore();
  let handled = 0;

  const first = await processTelegramUpdateOnce({
    update: messageUpdate(300),
    meta: meta(),
    store,
    handleUpdate: async () => {
      handled += 1;
      throw new Error("controlled_failure");
    },
  });
  const second = await processTelegramUpdateOnce({
    update: messageUpdate(300),
    meta: meta(),
    store,
    handleUpdate: async () => {
      handled += 1;
    },
  });

  assert.equal(first.status, "failed");
  assert.equal(second.status, "duplicate");
  assert.equal(handled, 1);
  assert.equal(store.getStatus(300), "failed");
});
