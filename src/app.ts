import "dotenv/config";
import express from "express";
import { webhookCallback } from "grammy";
import { bot } from "./bot.ts";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/telegram/webhook", webhookCallback(bot, "express"));

app.get("/google/oauth", (_req, res) => {
  res.status(501).json({
    error: "Google OAuth is not implemented yet.",
  });
});

app.get("/google/callback", (_req, res) => {
  res.status(501).json({
    error: "Google OAuth callback is not implemented yet.",
  });
});

export default app;
