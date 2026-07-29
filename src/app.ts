import "dotenv/config";
import type { RequestHandler } from "express";
import express from "express";
import { bot } from "./bot.js";
import { sql } from "./db/client.js";
import * as processedTelegramUpdatesRepository from "./repositories/processedTelegramUpdates.js";
import { googleRouter } from "./routes/google.js";
import { processTelegramUpdateOnce } from "./telegram/updateIdempotency.js";

export const app = express();

app.use(express.json());

let botInitPromise: Promise<void> | null = null;

async function ensureBotInitialized(telegramBot: NonNullable<typeof bot>) {
  if (!botInitPromise) {
    botInitPromise = telegramBot.init();
  }

  await botInitPromise;
}

const telegramWebhookSecretGuard: RequestHandler = (req, res, next) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return next();
  }

  if (req.header("X-Telegram-Bot-Api-Secret-Token") !== expectedSecret) {
    return res.sendStatus(401);
  }

  return next();
};

app.get("/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    return res.json({
      status: "ok",
      database: "ok",
    });
  } catch {
    return res.status(503).json({
      status: "error",
      database: "error",
    });
  }
});

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "meetory",
  });
});

app.post(
  "/telegram/webhook",
  telegramWebhookSecretGuard,
  async (req, res) => {
    const telegramBot = bot;

    if (!telegramBot) {
      return res.status(500).json({
        error: "TELEGRAM_API_TOKEN is not configured",
      });
    }

    const update = req.body;
    const requestId = req.header("x-vercel-id") ?? req.header("x-request-id") ?? null;
    const deploymentId = process.env.VERCEL_GIT_COMMIT_SHA
      ?? process.env.VERCEL_DEPLOYMENT_ID
      ?? process.env.VERCEL_URL
      ?? null;

    if (
      typeof update !== "object"
      || update === null
      || typeof update.update_id !== "number"
    ) {
      return res.status(400).json({
        error: "Invalid Telegram update",
      });
    }

    const result = await processTelegramUpdateOnce({
      update,
      meta: {
        deploymentId,
        requestId,
      },
      store: processedTelegramUpdatesRepository,
      handleUpdate: async () => {
        console.info("[telegram-update:handle-update-started]", {
          updateId: update.update_id,
          deploymentId,
          requestId,
        });

        await ensureBotInitialized(telegramBot);
        await telegramBot.handleUpdate(update);

        console.info("[telegram-update:handle-update-finished]", {
          updateId: update.update_id,
          deploymentId,
          requestId,
        });
      },
    });

    console.info("[telegram-webhook:responded]", {
      updateId: update.update_id,
      status: result.status,
      deploymentId,
      requestId,
      httpStatus: 200,
    });

    return res.sendStatus(200);
  },
);

app.use("/google", googleRouter);

export default app;
