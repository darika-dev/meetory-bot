import "dotenv/config";
import type { RequestHandler } from "express";
import express from "express";
import { webhookCallback } from "grammy";
import { bot } from "./bot.ts";
import { sql } from "./db/client.ts";
import { googleRouter } from "./routes/google.ts";

export const app = express();

app.use(express.json());

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

app.post("/telegram/webhook", telegramWebhookSecretGuard, webhookCallback(bot, "express"));

app.use("/google", googleRouter);

export default app;
